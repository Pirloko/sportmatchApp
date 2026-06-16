import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Device from 'expo-device'
import { Linking, Platform } from 'react-native'
import type { SupabaseClient } from '@supabase/supabase-js'

import { registerDevicePushToken } from './register-device'

const PUSH_ENABLED_KEY = 'sportmatch-push-enabled'

export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable'

export async function isPushEnabledLocally(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(PUSH_ENABLED_KEY)
    return v !== 'false'
  } catch {
    return true
  }
}

export async function setPushEnabledLocally(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(PUSH_ENABLED_KEY, enabled ? 'true' : 'false')
  } catch {
    // ignore
  }
}

export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unavailable'
  try {
    const { getPermissionsAsync } = await import(
      'expo-notifications/build/NotificationPermissions'
    )
    const { status } = await getPermissionsAsync()
    if (status === 'granted') return 'granted'
    if (status === 'denied') return 'denied'
    return 'undetermined'
  } catch {
    return 'unavailable'
  }
}

export async function deactivateUserPushTokens(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase
    .from('mobile_push_subscriptions')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
}

export async function enablePushForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await setPushEnabledLocally(true)
  const res = await registerDevicePushToken(supabase, userId)
  if (!res.ok) return { ok: false, error: res.reason }
  return { ok: true }
}

export async function disablePushForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await setPushEnabledLocally(false)
  await deactivateUserPushTokens(supabase, userId)
}

export function openSystemNotificationSettings(): void {
  void Linking.openSettings()
}

export function pushPermissionLabel(status: PushPermissionStatus): string {
  switch (status) {
    case 'granted':
      return 'Permitidas en el dispositivo'
    case 'denied':
      return 'Bloqueadas en el sistema'
    case 'undetermined':
      return 'Sin permiso aún'
    default:
      return 'No disponible en este entorno'
  }
}
