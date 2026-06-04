import { useCallback, useEffect, useState } from 'react'

import { getSupabase, isSupabaseConfigured } from '../supabase/client'
import { fetchUnreadNotificationsCount } from '../supabase/notification-queries'

export function useUnreadNotificationsCount(userId: string | null | undefined) {
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!userId || !isSupabaseConfigured()) {
      setCount(0)
      return
    }
    const supabase = getSupabase()
    const n = await fetchUnreadNotificationsCount(supabase, userId)
    setCount(n)
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!userId || !isSupabaseConfigured()) return

    const supabase = getSupabase()
    const channel = supabase
      .channel(`notifications-badge-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void refresh()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, refresh])

  return { count, refresh }
}
