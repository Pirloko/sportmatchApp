import type { SupabaseClient } from '@supabase/supabase-js'

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

/** Aplica tokens o código PKCE de la URL de retorno OAuth. */
export async function completeOAuthFromRedirectUrl(
  supabase: SupabaseClient,
  url: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { accessToken, refreshToken } = extractTokensFromRedirect(url)
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  const code = extractAuthCodeFromRedirect(url)
  if (!code) {
    return {
      ok: false,
      error: 'No se recibieron credenciales del login (falta código o tokens en la URL).',
    }
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
