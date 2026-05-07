import { useEffect, useRef } from 'react'
import { router } from 'expo-router'
// Importar submódulos evita cargar DevicePushTokenAutoRegistration.fx (rompe Expo Go Android SDK 53+).
import { addNotificationResponseReceivedListener } from 'expo-notifications/build/NotificationsEmitter'
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler'

import { useApp } from '../app-provider'
import { createClient, isSupabaseConfigured } from '../supabase/client'
import { registerDevicePushToken } from './register-device'
import { trackEvent } from '../telemetry/client'

type NotificationData = {
  route?: string
  tab?: string
  opportunityId?: string
  type?: string
}

function resolveTarget(data: NotificationData): string | null {
  if (data.route && typeof data.route === 'string') return data.route
  if (data.type === 'chat' && data.opportunityId) {
    return `/partidos/chat/${data.opportunityId}`
  }
  if (data.type === 'invitacion' || data.type === 'invitation') {
    return '/partidos?tab=invitaciones'
  }
  if (data.type === 'finalizado' && data.opportunityId) {
    return `/partidos/${data.opportunityId}`
  }
  if (data.tab === 'chats') return '/partidos?tab=chats'
  return null
}

export function PushBootstrap() {
  const { currentUser } = useApp()
  const didRegisterRef = useRef<string | null>(null)

  useEffect(() => {
    setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    })
  }, [])

  useEffect(() => {
    if (!currentUser || !isSupabaseConfigured()) return
    if (didRegisterRef.current === currentUser.id) return
    didRegisterRef.current = currentUser.id

    const supabase = createClient()
    void (async () => {
      const res = await registerDevicePushToken(supabase, currentUser.id)
      if (res.ok) {
        await trackEvent(supabase, {
          userId: currentUser.id,
          eventName: 'push_token_registered',
        })
      } else {
        await trackEvent(supabase, {
          userId: currentUser.id,
          eventName: 'push_token_failed',
          metadata: { reason: res.reason },
        })
      }
    })()
  }, [currentUser?.id])

  useEffect(() => {
    const sub = addNotificationResponseReceivedListener((resp) => {
      const data = (resp.notification.request.content.data || {}) as NotificationData
      const target = resolveTarget(data)
      if (target) router.push(target)
    })
    return () => {
      sub.remove()
    }
  }, [])

  return null
}
