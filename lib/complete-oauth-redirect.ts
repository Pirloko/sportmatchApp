import type { SupabaseClient } from '@supabase/supabase-js'

import { authLog } from './auth/auth-debug'
import { getSupabaseOrNull } from './supabase/client'

let exchangeInFlight: Promise<{ ok: true } | { ok: false; error: string }> | null =
  null
let lastExchangedCode: string | null = null

function extractTokensFromRedirect(url: string): {
  accessToken: string | null
  refreshToken: string | null
} {
  const hashIdx = url.indexOf('#')
  const queryIdx = url.indexOf('?')
  let payload = ''
  if (hashIdx >= 0) {
    payload = url.slice(hashIdx + 1)
  } else if (queryIdx >= 0) {
    payload = url.slice(queryIdx + 1).split('#')[0] ?? ''
  }
  if (!payload) {
    return { accessToken: null, refreshToken: null }
  }
  const params = new URLSearchParams(payload)
  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
  }
}

function extractAuthCodeFromRedirect(url: string): string | null {
  try {
    const u = new URL(url)
    const code = u.searchParams.get('code')
    if (code) return code
  } catch {
    /* sportmatch:// */
  }
  const m = url.match(/[?&#]code=([^&#]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

async function logAfterExchange(supabase: SupabaseClient): Promise<void> {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession()
  authLog('Session', 'after exchange getSession', {
    error: sessionError?.message ?? null,
    session: sessionData.session
      ? {
          user_id: sessionData.session.user.id,
          expires_at: sessionData.session.expires_at,
        }
      : null,
  })

  const { data: userData, error: userError } = await supabase.auth.getUser()
  authLog('User', 'after exchange getUser', {
    error: userError?.message ?? null,
    user: userData.user
      ? { id: userData.user.id, email: userData.user.email ?? null }
      : null,
  })
}

/**
 * Aplica tokens (implicit) o código PKCE de la URL de retorno OAuth.
 */
export async function completeOAuthFromRedirectUrl(
  url: string,
  supabaseClient?: SupabaseClient
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = supabaseClient ?? getSupabaseOrNull()
  if (!supabase) {
    return { ok: false, error: 'Supabase no configurado.' }
  }

  const code = extractAuthCodeFromRedirect(url)
  if (code && code === lastExchangedCode) {
    authLog('Exchange', 'code ya canjeado, omitiendo', { code })
    return { ok: true }
  }

  if (exchangeInFlight) {
    authLog('Exchange', 'esperando canje en curso')
    return exchangeInFlight
  }

  exchangeInFlight = completeOAuthFromRedirectUrlInner(url, supabase).finally(
    () => {
      exchangeInFlight = null
    }
  )
  return exchangeInFlight
}

async function completeOAuthFromRedirectUrlInner(
  url: string,
  supabase: SupabaseClient
): Promise<{ ok: true } | { ok: false; error: string }> {

  authLog('Exchange', 'starting', {
    has_code: url.includes('code='),
    has_tokens: url.includes('access_token='),
  })

  const { accessToken, refreshToken } = extractTokensFromRedirect(url)
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    authLog('Exchange', 'setSession result', {
      error: error?.message ?? null,
      session: data.session
        ? { user_id: data.session.user.id }
        : null,
      user: data.user ? { id: data.user.id } : null,
    })
    if (error) {
      return { ok: false, error: error.message }
    }
    authLog('Exchange', 'success', { mode: 'tokens' })
    await logAfterExchange(supabase)
    return { ok: true }
  }

  const code = extractAuthCodeFromRedirect(url)
  if (!code) {
    authLog('Exchange', 'error', { message: 'sin code ni tokens' })
    return {
      ok: false,
      error: 'No se recibieron credenciales del login (falta código o tokens en la URL).',
    }
  }

  authLog('Exchange', 'exchangeCodeForSession', { code })

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  authLog('Exchange', 'result', {
    error: error?.message ?? null,
    error_name: error?.name ?? null,
    session: data?.session
      ? {
          user_id: data.session.user.id,
          expires_at: data.session.expires_at,
        }
      : null,
    user: data?.user ? { id: data.user.id, email: data.user.email } : null,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  if (!data?.session) {
    authLog('Exchange', 'error', {
      message: 'exchange OK pero data.session es null',
    })
    return {
      ok: false,
      error: 'El canje del código no devolvió sesión. Inténtalo de nuevo.',
    }
  }

  authLog('Exchange', 'success', { mode: 'pkce' })
  if (code) lastExchangedCode = code
  await logAfterExchange(supabase)
  return { ok: true }
}
