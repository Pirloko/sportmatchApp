import type { SupabaseClient } from '@supabase/supabase-js'

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationCategory,
  type NotificationPreferences,
} from '../notifications/categories'

type Row = {
  push_matches: boolean
  push_chat: boolean
  push_reviews: boolean
}

function rowToPrefs(row: Row): NotificationPreferences {
  return {
    pushMatches: row.push_matches,
    pushChat: row.push_chat,
    pushReviews: row.push_reviews,
  }
}

function prefsToRow(prefs: Partial<NotificationPreferences>): Partial<Row> {
  const patch: Partial<Row> = {}
  if (typeof prefs.pushMatches === 'boolean') patch.push_matches = prefs.pushMatches
  if (typeof prefs.pushChat === 'boolean') patch.push_chat = prefs.pushChat
  if (typeof prefs.pushReviews === 'boolean') patch.push_reviews = prefs.pushReviews
  return patch
}

export async function fetchNotificationPreferences(
  supabase: SupabaseClient,
  userId: string
): Promise<NotificationPreferences> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('push_matches, push_chat, push_reviews')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (error.message.includes('notification_preferences')) {
      return { ...DEFAULT_NOTIFICATION_PREFERENCES }
    }
    throw error
  }

  if (!data) return { ...DEFAULT_NOTIFICATION_PREFERENCES }
  return rowToPrefs(data as Row)
}

export async function upsertNotificationPreferences(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  const current = await fetchNotificationPreferences(supabase, userId)
  const next: NotificationPreferences = { ...current, ...patch }

  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert(
      {
        user_id: userId,
        ...prefsToRow(next),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('push_matches, push_chat, push_reviews')
    .single()

  if (error) {
    const hint = error.message.includes('notification_preferences')
      ? ' Ejecuta scripts/notification-preferences-migration.sql en Supabase.'
      : ''
    throw new Error(`${error.message}${hint}`)
  }

  return rowToPrefs(data as Row)
}

export function preferenceKeyForCategory(
  category: NotificationCategory
): keyof NotificationPreferences {
  switch (category) {
    case 'chat':
      return 'pushChat'
    case 'reviews':
      return 'pushReviews'
    default:
      return 'pushMatches'
  }
}
