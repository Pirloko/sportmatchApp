#!/usr/bin/env node
/**
 * Cron de notificaciones (servidor / CI / Supabase scheduled).
 *
 * 1) Genera recordatorios match_upcoming_2h (RPC service_role).
 * 2) Envía push Expo pendientes (notifications.push_sent_at IS NULL).
 * 3) Marca push_sent_at.
 *
 * Uso:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/notifications-cron-dispatch.mjs
 *
 * Programar cada 5–15 min (GitHub Actions, Vercel Cron, Supabase pg_cron + http, etc.).
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'Faltan SUPABASE_URL (o EXPO_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY'
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const BATCH_SIZE = 50
const PENDING_LIMIT = 200

function notificationTypeToCategory(type) {
  switch (type) {
    case 'chat_message':
      return 'chat'
    case 'match_finished_review_pending':
      return 'reviews'
    default:
      return 'matches'
  }
}

function isPushAllowedForType(type, prefs) {
  if (!prefs) return true
  const category = notificationTypeToCategory(type)
  if (category === 'chat') return prefs.push_chat !== false
  if (category === 'reviews') return prefs.push_reviews !== false
  return prefs.push_matches !== false
}

function buildExpoPushData(type, payload) {
  const p = payload && typeof payload === 'object' ? payload : {}
  const matchId = p.matchId || p.chatId || ''
  const data = { notificationType: String(type) }
  if (matchId) {
    data.matchId = String(matchId)
    data.opportunityId = String(matchId)
  }
  if (p.targetTab) {
    data.targetTab = String(p.targetTab)
    data.tab = String(p.targetTab)
  }
  if (p.route) data.route = String(p.route)
  return data
}

async function runUpcoming2h() {
  const { data, error } = await supabase.rpc('create_match_upcoming_2h_notifications')
  if (error) {
    console.warn('[cron] create_match_upcoming_2h_notifications:', error.message)
    return 0
  }
  const n = typeof data === 'number' ? data : 0
  if (n > 0) console.log(`[cron] recordatorios 2h creados: ${n}`)
  return n
}

async function fetchPendingNotifications() {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, type, title, body, payload')
    .is('push_sent_at', null)
    .order('created_at', { ascending: true })
    .limit(PENDING_LIMIT)

  if (error) throw new Error(`fetch pending: ${error.message}`)
  return data ?? []
}

async function fetchActiveTokens(userIds) {
  if (userIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('mobile_push_subscriptions')
    .select('user_id, token')
    .in('user_id', userIds)
    .eq('is_active', true)

  if (error) {
    if (error.message.includes('mobile_push_subscriptions')) {
      console.warn(
        '[cron] Tabla mobile_push_subscriptions no existe. Ejecuta scripts/mobile-push-subscriptions-migration.sql'
      )
      return new Map()
    }
    throw new Error(`fetch tokens: ${error.message}`)
  }

  const map = new Map()
  for (const row of data ?? []) {
    const list = map.get(row.user_id) ?? []
    list.push(row.token)
    map.set(row.user_id, list)
  }
  return map
}

async function fetchNotificationPreferences(userIds) {
  if (userIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('user_id, push_matches, push_chat, push_reviews')
    .in('user_id', userIds)

  if (error) {
    if (error.message.includes('notification_preferences')) {
      console.warn(
        '[cron] Tabla notification_preferences no existe. Ejecuta scripts/notification-preferences-migration.sql'
      )
      return new Map()
    }
    throw new Error(`fetch preferences: ${error.message}`)
  }

  const map = new Map()
  for (const row of data ?? []) {
    map.set(row.user_id, row)
  }
  return map
}

async function sendExpoBatch(messages) {
  if (messages.length === 0) return { ok: true, tickets: [] }

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Expo push HTTP ${res.status}: ${text.slice(0, 300)}`)
  }

  const json = await res.json()
  const tickets = Array.isArray(json.data) ? json.data : [json.data]
  return { ok: true, tickets }
}

async function markPushSent(ids) {
  if (ids.length === 0) return
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('notifications')
    .update({ push_sent_at: now })
    .in('id', ids)

  if (error) throw new Error(`mark push_sent_at: ${error.message}`)
}

async function main() {
  await runUpcoming2h()

  const pending = await fetchPendingNotifications()
  if (pending.length === 0) {
    console.log('[cron] Sin notificaciones push pendientes')
    return
  }

  const userIds = [...new Set(pending.map((n) => n.user_id))]
  const [tokensByUser, prefsByUser] = await Promise.all([
    fetchActiveTokens(userIds),
    fetchNotificationPreferences(userIds),
  ])

  const messages = []
  const notificationIdsToMark = []
  let skippedByPreference = 0

  for (const n of pending) {
    notificationIdsToMark.push(n.id)
    const prefs = prefsByUser.get(n.user_id)
    if (!isPushAllowedForType(n.type, prefs)) {
      skippedByPreference += 1
      continue
    }

    const tokens = tokensByUser.get(n.user_id) ?? []
    const data = buildExpoPushData(n.type, n.payload)

    for (const token of tokens) {
      if (!token || !String(token).startsWith('ExponentPushToken')) continue
      messages.push({
        to: token,
        title: n.title,
        body: n.body || '',
        data,
        sound: 'default',
        priority: 'high',
        channelId: 'default',
      })
    }
  }

  let sent = 0
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE)
    await sendExpoBatch(chunk)
    sent += chunk.length
  }

  await markPushSent(notificationIdsToMark)

  console.log(
    `[cron] Procesadas ${pending.length} notificaciones in-app; push omitidos por preferencia: ${skippedByPreference}; push Expo enviados: ${sent}; marcadas push_sent_at: ${notificationIdsToMark.length}`
  )
}

main().catch((err) => {
  console.error('[cron] Error:', err.message || err)
  process.exit(1)
})
