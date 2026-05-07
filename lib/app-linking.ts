import Constants from 'expo-constants'

/**
 * Esquema URL de la app (expo.scheme en app.json).
 * Evita desalineación entre OAuth, invitaciones y enlaces nativos.
 */
export function getExpoAppScheme(): string {
  const s = Constants.expoConfig?.scheme
  if (typeof s === 'string' && s.trim()) return s.trim()
  if (Array.isArray(s)) {
    const first = s.find((x) => typeof x === 'string' && x.trim())
    if (first) return first.trim()
  }
  return 'sportmatch'
}

/** Redirect URI nativa acordada con Supabase Auth (Additional Redirect URLs). */
export function nativeAuthCallbackUrl(): string {
  return `${getExpoAppScheme()}://auth/callback`
}

/** Deep link interno cuando no hay `EXPO_PUBLIC_SITE_URL` (HTTPS público). */
export function teamInviteDeepLinkFallback(teamId: string): string {
  return `${getExpoAppScheme()}://equipo/${teamId}`
}
