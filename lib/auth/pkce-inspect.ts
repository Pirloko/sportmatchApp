import { authLog } from './auth-debug'

/** Inspecciona la URL de authorize generada por Supabase auth-js (PKCE). */
export function inspectAuthorizeUrl(authorizeUrl: string): void {
  try {
    const u = new URL(authorizeUrl)
    const method = u.searchParams.get('code_challenge_method')
    const hasChallenge = u.searchParams.has('code_challenge')
    const redirect = u.searchParams.get('redirect_to')
    const subtle =
      typeof globalThis.crypto !== 'undefined' &&
      typeof globalThis.crypto.subtle !== 'undefined'

    authLog('PKCE', 'authorize URL inspeccionada', {
      method: method ?? '(ausente)',
      has_challenge: hasChallenge,
      redirect,
      crypto_subtle: subtle,
      provider: u.searchParams.get('provider'),
      skip_http_redirect: u.searchParams.get('skip_http_redirect'),
    })

    if (hasChallenge && method !== 's256') {
      authLog('PKCE', 'ADVERTENCIA: se esperaba code_challenge_method=s256', {
        actual: method,
        crypto_subtle: subtle,
      })
    }
  } catch (e) {
    authLog('PKCE', 'No se pudo parsear authorize URL', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

export function logPkceRuntimeState(): void {
  authLog('PKCE', 'runtime crypto', {
    crypto_subtle:
      typeof globalThis.crypto !== 'undefined' &&
      typeof globalThis.crypto.subtle !== 'undefined',
    has_getRandomValues:
      typeof globalThis.crypto !== 'undefined' &&
      typeof globalThis.crypto.getRandomValues === 'function',
  })
}
