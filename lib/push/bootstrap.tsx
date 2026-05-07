import { useEffect, useRef } from 'react'
import { router } from 'expo-router'
// Importar submódulos evita cargar DevicePushTokenAutoRegistration.fx (rompe Expo Go Android SDK 53+).
import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
} from 'expo-notifications/build/NotificationsEmitter'
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler'

import { useApp } from '../app-provider'
import { createClient, isSupabaseConfigured } from '../supabase/client'
import { registerDevicePushToken } from './register-device'
import { ProductEventNames, trackProductEvent } from '../telemetry/product-analytics'

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
        trackProductEvent(ProductEventNames.pushTokenRegistered, {
          userId: currentUser.id,
          supabase,
        })
      } else {
        trackProductEvent(ProductEventNames.pushTokenFailed, {
          userId: currentUser.id,
          metadata: { reason: res.reason },
          supabase,
        })
      }
    })()
  }, [currentUser?.id])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const supabase = createClient()
    const subReceived = addNotificationReceivedListener((notification) => {
      const data = (notification.request.content.data || {}) as NotificationData
      trackProductEvent(ProductEventNames.pushReceived, {
        userId: currentUser?.id ?? null,
        metadata: {
          type: data.type,
          opportunity_id: data.opportunityId,
          route: data.route,
        },
        supabase,
      })
    })
    return () => subReceived.remove()
  }, [currentUser?.id])

  useEffect(() => {
    const sub = addNotificationResponseReceivedListener((resp) => {
      const data = (resp.notification.request.content.data || {}) as NotificationData
      const target = resolveTarget(data)
      if (isSupabaseConfigured()) {
        const supabase = createClient()
        trackProductEvent(ProductEventNames.pushOpened, {
          userId: currentUser?.id ?? null,
          metadata: {
            target,
            type: data.type,
            opportunity_id: data.opportunityId,
            route: data.route,
          },
          supabase,
        })
      }
      if (target) router.push(target)
    })
    return () => {
      sub.remove()
    }
  }, [currentUser?.id])

  return null
}
