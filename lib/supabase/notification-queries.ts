import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  AppNotification,
  AppNotificationType,
  NotificationPayload,
} from '../notifications/types'

const NOTIFICATION_LIMIT = 30

function mapRow(row: {
  id: string
  type: string
  title: string
  body: string
  payload: unknown
  is_read: boolean
  created_at: string
}): AppNotification {
  const payload =
    row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? (row.payload as NotificationPayload)
      : {}

  return {
    id: row.id,
    type: row.type as AppNotificationType,
    title: row.title,
    body: row.body ?? '',
    payload,
    isRead: row.is_read,
    createdAt: new Date(row.created_at),
  }
}

export async function fetchNotifications(
  supabase: SupabaseClient,
  userId: string,
  limit = NOTIFICATION_LIMIT
): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, payload, is_read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.warn('[notifications] fetch failed', error.message)
    return []
  }

  return (data ?? []).map(mapRow)
}

export async function fetchUnreadNotificationsCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) {
    console.warn('[notifications] unread count failed', error.message)
    return 0
  }

  return count ?? 0
}

export async function markNotificationRead(
  supabase: SupabaseClient,
  notificationId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId)

  if (error) {
    console.warn('[notifications] mark read failed', error.message)
    return false
  }

  return true
}

export async function markAllNotificationsRead(
  supabase: SupabaseClient
): Promise<number> {
  const { data, error } = await supabase.rpc('mark_all_notifications_read')
  if (error) {
    console.warn('[notifications] mark all read failed', error.message)
    return 0
  }
  return typeof data === 'number' ? data : 0
}
