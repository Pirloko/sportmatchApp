import Constants from 'expo-constants'
import { makeRedirectUri } from 'expo-auth-session'
import { Platform } from 'react-native'

import { getExpoAppScheme, nativeAuthCallbackUrl } from './app-linking'

/**
 * URI que deben compartir Supabase `redirectTo` y `WebBrowser.openAuthSessionAsync`.
 * En APK suele ser `sportmatch://auth/callback`; en Expo Go puede ser `exp://…`.
 * Añade en Supabase Redirect URLs la salida de `getOAuthRedirectUri()` en tu entorno.
 */
export function getOAuthRedirectUri(): string {
  if (Platform.OS === 'web') {
    return makeRedirectUri({
      path: 'auth/callback',
      preferLocalhost: false,
    })
  }

  // Expo Go necesita el redirect dinámico exp://…
  if (Constants.appOwnership === 'expo') {
    return makeRedirectUri({
      scheme: getExpoAppScheme(),
      path: 'auth/callback',
      preferLocalhost: false,
    })
  }

  // APK/IPA: solo deep link nativo (evita quedar en sportmatch.cl dentro del navegador).
  return nativeAuthCallbackUrl()
}

/** URLs de retorno OAuth válidas (deep link o callback web con credenciales). */
export function isOAuthReturnUrl(url: string): boolean {
  if (!oauthRedirectHasCredentials(url)) return false

  try {
    const u = new URL(url)
    const scheme = getExpoAppScheme()
    if (u.protocol === `${scheme}:`) return true
    if (u.protocol === 'exp:') return true
    if (u.hostname === 'sportmatch.cl' || u.hostname === 'www.sportmatch.cl') {
      return true
    }
  } catch {
    return true
  }

  return false
}

/** Solo URLs que ya traen credenciales OAuth (evita falsos positivos `…/auth/callback` vacíos). */
export function oauthRedirectHasCredentials(url: string): boolean {
  return (
    url.includes('access_token=') ||
    url.includes('refresh_token=') ||
    /[?&#]code=/.test(url)
  )
}
