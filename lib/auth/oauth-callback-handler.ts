import * as Linking from 'expo-linking'

import { nativeAuthCallbackUrl } from '../app-linking'
import { completeOAuthFromRedirectUrl } from '../complete-oauth-redirect'
import { oauthRedirectHasCredentials } from '../oauth-redirect'
import { getSupabaseOrNull } from '../supabase/client'
import { authLog } from './auth-debug'

let lastProcessedCode: string | null = null
let pendingOAuthUrl: string | null = null
let globalCaptureStarted = false

function extractCode(url: string): string | null {
  try {
    const u = new URL(url)
    const c = u.searchParams.get('code')
    if (c) return c
  } catch {
    /* custom scheme */
  }
  const m = url.match(/[?&#]code=([^&#]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

function paramValue(v: string | string[] | undefined): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (Array.isArray(v) && typeof v[0] === 'string' && v[0].trim()) return v[0].trim()
  return null
}

/** Guarda URL OAuth si llega antes de montar /auth/callback (race Android). */
export function capturePendingOAuthUrl(url: string | null | undefined): void {
  if (!url || !oauthRedirectHasCredentials(url)) return
  pendingOAuthUrl = url
  authLog('DeepLink', 'URL OAuth en cola (pending)', {
    preview: url.slice(0, 120),
    has_code: url.includes('code='),
  })
}

export function consumePendingOAuthUrl(): string | null {
  const url = pendingOAuthUrl
  pendingOAuthUrl = null
  return url
}

/**
 * Escucha Linking desde el arranque de la app para no perder el deep link con ?code=.
 */
export function startGlobalOAuthCallbackCapture(): () => void {
  if (globalCaptureStarted) {
    return () => undefined
  }
  globalCaptureStarted = true
  authLog('AuthCallback', 'global Linking capture started')

  const onUrl = ({ url }: { url: string }) => capturePendingOAuthUrl(url)
  const sub = Linking.addEventListener('url', onUrl)
  void Linking.getInitialURL().then((initial) => capturePendingOAuthUrl(initial))

  return () => {
    sub.remove()
    globalCaptureStarted = false
  }
}

/** Construye URL de callback a partir de query params de Expo Router. */
export function buildOAuthCallbackUrlFromParams(params: {
  code?: string | string[]
  access_token?: string | string[]
  refresh_token?: string | string[]
}): string | null {
  const code = paramValue(params.code)
  if (code) {
    return `${nativeAuthCallbackUrl()}?code=${encodeURIComponent(code)}`
  }
  const accessToken = paramValue(params.access_token)
  const refreshToken = paramValue(params.refresh_token)
  if (accessToken && refreshToken) {
    return `${nativeAuthCallbackUrl()}#access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`
  }
  return null
}

/**
 * Canje PKCE desde deep link (p. ej. ruta /auth/callback).
 * Idempotente: no reprocesa el mismo `code`.
 */
export async function tryCompleteOAuthFromUrl(
  url: string | null | undefined
): Promise<boolean> {
  if (!url || !oauthRedirectHasCredentials(url)) {
    return false
  }

  const code = extractCode(url)
  if (code && code === lastProcessedCode) {
    authLog('AuthCallback', 'code ya procesado, omitiendo', {
      code,
    })
    return true
  }

  authLog('AuthCallback', 'intentando exchange desde URL', {
    has_code: Boolean(code),
    preview: url.slice(0, 100),
  })

  const result = await completeOAuthFromRedirectUrl(url)
  if (!result.ok) {
    authLog('AuthCallback', 'exchange falló en callback route', {
      error: result.error,
    })
    return false
  }

  if (code) lastProcessedCode = code

  const supabase = getSupabaseOrNull()
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession()
    authLog('Session', 'tras exchange en callback route', {
      has_session: Boolean(session),
      user_id: session?.user?.id ?? null,
    })
  }

  return true
}

/** Intenta canje desde cola, params de ruta o URL de Linking. */
export async function recoverOAuthCallbackFromAllSources(
  routeParams?: {
    code?: string | string[]
    access_token?: string | string[]
    refresh_token?: string | string[]
    error?: string | string[]
    error_description?: string | string[]
  },
  linkingUrl?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const oauthError = paramValue(routeParams?.error)
  if (oauthError) {
    const desc = paramValue(routeParams?.error_description)
    return {
      ok: false,
      error: desc || oauthError,
    }
  }

  const candidates: string[] = []
  const fromParams = routeParams
    ? buildOAuthCallbackUrlFromParams(routeParams)
    : null
  if (fromParams) candidates.push(fromParams)
  const pending = consumePendingOAuthUrl()
  if (pending) candidates.push(pending)
  if (linkingUrl && oauthRedirectHasCredentials(linkingUrl)) {
    candidates.push(linkingUrl)
  }

  authLog('AuthCallback', 'recovery sources', {
    from_params: Boolean(fromParams),
    pending: Boolean(pending),
    linking: Boolean(linkingUrl && oauthRedirectHasCredentials(linkingUrl)),
    count: candidates.length,
  })

  for (const url of candidates) {
    const ok = await tryCompleteOAuthFromUrl(url)
    if (ok) return { ok: true }
  }

  const supabase = getSupabaseOrNull()
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      authLog('AuthCallback', 'recovery: sesión ya existía sin exchange', {
        user_id: session.user.id,
      })
      return { ok: true }
    }
  }

  return {
    ok: false,
    error: 'No se recibió el código de Google en la app.',
  }
}

/** Suscribe Linking y procesa URL inicial (solo en pantalla callback / bootstrap OAuth). */
export function subscribeOAuthCallbackUrls(
  onDone?: (ok: boolean, error?: string) => void
): () => void {
  const handle = (url: string) => {
    capturePendingOAuthUrl(url)
    void recoverOAuthCallbackFromAllSources(undefined, url).then((res) =>
      onDone?.(res.ok, res.error)
    )
  }

  const sub = Linking.addEventListener('url', ({ url }) => handle(url))

  void Linking.getInitialURL().then((initial) => {
    if (initial) handle(initial)
  })

  return () => sub.remove()
}
