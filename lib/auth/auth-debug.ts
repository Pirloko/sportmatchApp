/**
 * Logs OAuth/PKCE/auth (dev o EXPO_PUBLIC_AUTH_DEBUG=1).
 *
 * adb logcat | grep -E '\[OAuth\]|\[PKCE\]|\[DeepLink\]|\[Exchange\]|\[AuthState\]|\[Session\]|\[AuthCallback\]|\[Navigation\]'
 */
const AUTH_DEBUG =
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  process.env.EXPO_PUBLIC_AUTH_DEBUG === '1'

export type AuthLogTag =
  | 'OAuth'
  | 'PKCE'
  | 'DeepLink'
  | 'AuthCallback'
  | 'Exchange'
  | 'AuthState'
  | 'Session'
  | 'Navigation'
  | 'Hydrate'
  | 'User'
  | 'CurrentUser'
  | 'AuthLoading'

function ts(): string {
  return new Date().toISOString().slice(11, 23)
}

function safeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (k.toLowerCase().includes('token') || k.toLowerCase().includes('secret')) {
      out[k] = '[redacted]'
    } else if (k === 'code' && typeof v === 'string') {
      out[k] = `${v.slice(0, 8)}…(${v.length})`
    } else if (typeof v === 'string' && v.length > 200) {
      out[k] = `${v.slice(0, 200)}…`
    } else {
      out[k] = v
    }
  }
  return out
}

export function authLog(
  tag: AuthLogTag,
  message: string,
  meta?: Record<string, unknown>
): void {
  if (!AUTH_DEBUG) return
  const m = safeMeta(meta)
  const prefix = `[${tag}] ${ts()}`
  if (m) {
    console.log(`${prefix} ${message}`, m)
  } else {
    console.log(`${prefix} ${message}`)
  }
}

export function isAuthDebugEnabled(): boolean {
  return AUTH_DEBUG
}
