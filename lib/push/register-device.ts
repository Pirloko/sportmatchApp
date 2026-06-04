import { isRunningInExpoGo } from 'expo'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Expo Go en Android no soporta push remota desde SDK 53; evitar importar módulos que ejecutan auto-registro al cargar. */
function isAndroidExpoGoPushUnavailable(): boolean {
  return isRunningInExpoGo() && Platform.OS === 'android'
}

type RegisterResult =
  | { ok: true; token: string }
  | { ok: false; reason: string }

function resolveProjectId(): string | null {
  const fromEas = Constants?.expoConfig?.extra?.eas?.projectId
  const fromLegacy = Constants?.easConfig?.projectId
  return (fromEas || fromLegacy || null) as string | null
}

async function getExpoPushToken(): Promise<RegisterResult> {
  if (isAndroidExpoGoPushUnavailable()) {
    return {
      ok: false,
      reason:
        'Expo Go (Android): push remota no disponible en SDK 53+. Usa un development build para registrar el token.',
    }
  }

  if (!Device.isDevice) {
    return { ok: false, reason: 'Push requiere dispositivo físico.' }
  }

  const { getPermissionsAsync, requestPermissionsAsync } = await import(
    'expo-notifications/build/NotificationPermissions'
  )
  const { default: getExpoPushTokenAsync } = await import(
    'expo-notifications/build/getExpoPushTokenAsync'
  )

  const { status: existingStatus } = await getPermissionsAsync()
  let finalStatus = existingStatus
  if (existingStatus !== 'granted') {
    const { status } = await requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== 'granted') {
    return { ok: false, reason: 'Permiso de notificaciones denegado.' }
  }

  const projectId = resolveProjectId()
  if (!projectId) {
    return {
      ok: false,
      reason: 'Falta EAS projectId para obtener expoPushToken.',
    }
  }

  const token = await getExpoPushTokenAsync({ projectId })
  return { ok: true, token: token.data }
}

export async function registerDevicePushToken(
  supabase: SupabaseClient,
  userId: string
): Promise<RegisterResult> {
  const tokenRes = await getExpoPushToken()
  if (!tokenRes.ok) return tokenRes

  const token = tokenRes.token
  const deviceName =
    Device.modelName || Device.deviceName || Device.osName || 'unknown-device'
  const payload = {
    user_id: userId,
    token,
    provider: 'expo',
    platform: Device.osName?.toLowerCase() || 'unknown',
    device_name: String(deviceName),
    is_active: true,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('mobile_push_subscriptions').upsert(payload, {
    onConflict: 'user_id,token',
  })
  if (!error) return { ok: true, token }

  const hint = error.message.includes('mobile_push_subscriptions')
    ? ' Ejecuta scripts/mobile-push-subscriptions-migration.sql en Supabase.'
    : ''

  return {
    ok: false,
    reason: `${error.message || 'No se pudo guardar token push.'}${hint}`,
  }
}
