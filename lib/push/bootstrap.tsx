import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import { router } from 'expo-router'
// Importar submódulos evita cargar DevicePushTokenAutoRegistration.fx (rompe Expo Go Android SDK 53+).
import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
} from 'expo-notifications/build/NotificationsEmitter'
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler'

import { useApp } from '../app-provider'
import { useUnreadNotificationsCount } from '../hooks/use-unread-notifications'
import { getSupabase, isSupabaseConfigured } from '../supabase/client'
import { resolvePushNotificationRoute } from '../notifications/resolve-route'
import { registerDevicePushToken } from './register-device'
import { ProductEventNames, trackProductEvent } from '../telemetry/product-analytics'

type NotificationData = {
  route?: string
  tab?: string
  opportunityId?: string
  matchId?: string
  type?: string
  notificationType?: string
  targetTab?: string
}

function resolveTarget(data: NotificationData): string | null {
  return resolvePushNotificationRoute(data)
}

export function PushBootstrap() {
  const { currentUser } = useApp()
  const didRegisterRef = useRef<string | null>(null)
  const { count: unreadCount } = useUnreadNotificationsCount(currentUser?.id)

  useEffect(() => {
    setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    })
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'android') return
    void (async () => {
      const { default: setNotificationChannelAsync } = await import(
        'expo-notifications/build/setNotificationChannelAsync'
      )
      const { AndroidImportance } = await import(
        'expo-notifications/build/NotificationChannelManager.types'
      )
      await setNotificationChannelAsync('default', {
        name: 'SportMatch',
        importance: AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#22c55e',
      })
    })()
  }, [])

  useEffect(() => {
    if (Platform.OS === 'web' || !currentUser) return
    void (async () => {
      const { default: setBadgeCountAsync } = await import(
        'expo-notifications/build/setBadgeCountAsync'
      )
      await setBadgeCountAsync(unreadCount)
    })()
  }, [currentUser?.id, unreadCount])

  useEffect(() => {
    if (!currentUser || !isSupabaseConfigured()) return
    if (didRegisterRef.current === currentUser.id) return
    didRegisterRef.current = currentUser.id

    const supabase = getSupabase()
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
    const supabase = getSupabase()
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
        const supabase = getSupabase()
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
