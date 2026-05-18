import { makeRedirectUri } from 'expo-auth-session'

import { getExpoAppScheme } from './app-linking'

/**
 * URI que deben compartir Supabase `redirectTo` y `WebBrowser.openAuthSessionAsync`.
 * En APK suele ser `sportmatch://auth/callback`; en Expo Go puede ser `exp://…`.
 * Añade en Supabase Redirect URLs la salida de `getOAuthRedirectUri()` en tu entorno.
 */
export function getOAuthRedirectUri(): string {
  return makeRedirectUri({
    scheme: getExpoAppScheme(),
    path: 'auth/callback',
    preferLocalhost: false,
  })
}

/** Solo URLs que ya traen credenciales OAuth (evita falsos positivos `…/auth/callback` vacíos). */
export function oauthRedirectHasCredentials(url: string): boolean {
  return (
    url.includes('access_token=') ||
    url.includes('refresh_token=') ||
    /[?&#]code=/.test(url)
  )
}
