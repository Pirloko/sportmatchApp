import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { Platform } from 'react-native'

import { oauthRedirectHasCredentials } from '../oauth-redirect'
import { authLog } from './auth-debug'
import { consumePendingOAuthUrl } from './oauth-callback-handler'
import { releaseOAuthLock, tryAcquireOAuthLock } from './oauth-session-lock'

const OAUTH_TIMEOUT_MS = 120_000
const DISMISS_GRACE_MS = 12_000

export class OAuthSessionError extends Error {
  constructor(
    message: string,
    readonly code: 'cancelled' | 'timeout' | 'no_callback' | 'busy' = 'no_callback'
  ) {
    super(message)
    this.name = 'OAuthSessionError'
  }
}

/**
 * Abre Custom Tabs / ASWebAuthenticationSession y resuelve la URL con credenciales OAuth.
 * Android: combina WebBrowser + Linking (Custom Tabs a veces hace dismiss sin URL).
 */
export async function openOAuthAndResolveCallbackUrl(
  oauthBrowserUrl: string,
  redirectTo: string
): Promise<string> {
  if (!tryAcquireOAuthLock()) {
    authLog('OAuth', 'flujo rechazado: ya hay OAuth en curso')
    throw new OAuthSessionError(
      'Ya hay un inicio de sesión en curso. Espera un momento e inténtalo de nuevo.',
      'busy'
    )
  }

  try {
    if (Platform.OS === 'web') {
      authLog('OAuth', 'abriendo sesión web', { redirectTo })
      const authResult = await WebBrowser.openAuthSessionAsync(
        oauthBrowserUrl,
        redirectTo
      )
      if (authResult.type === 'success' && authResult.url) {
        authLog('OAuth', 'callback web OK')
        return authResult.url
      }
      throw new OAuthSessionError(
        authResult.type === 'cancel'
          ? 'Inicio con Google cancelado.'
          : 'No se completó el inicio de sesión con Google.',
        authResult.type === 'cancel' ? 'cancelled' : 'no_callback'
      )
    }

    try {
      await WebBrowser.warmUpAsync()
    } catch {
      /* opcional */
    }

    authLog('OAuth', 'abriendo sesión nativa', { redirectTo })

    return await new Promise<string>((resolve, reject) => {
      let settled = false
      let dismissGraceTimer: ReturnType<typeof setTimeout> | undefined
      let timeoutId: ReturnType<typeof setTimeout>

      const fail = (err: OAuthSessionError) => {
        if (settled) return
        settled = true
        cleanup()
        authLog('OAuth', err.message, { code: err.code })
        reject(err)
      }

      const succeed = (url: string, source: 'webbrowser' | 'linking') => {
        if (settled || !oauthRedirectHasCredentials(url)) {
          if (!oauthRedirectHasCredentials(url)) {
            authLog('DeepLink', 'URL ignorada (sin code/tokens)', {
              source,
              preview: url.slice(0, 120),
            })
          }
          return
        }
        settled = true
        cleanup()
        authLog('DeepLink', 'callback OAuth resuelto', {
          source,
          has_code: url.includes('code='),
        })
        resolve(url)
      }

      const cleanup = () => {
        subscription.remove()
        clearTimeout(timeoutId)
        if (dismissGraceTimer) clearTimeout(dismissGraceTimer)
      }

      const subscription = Linking.addEventListener('url', ({ url }) => {
        succeed(url, 'linking')
      })

      timeoutId = setTimeout(() => {
        fail(
          new OAuthSessionError(
            'Tiempo agotado al iniciar sesión con Google.',
            'timeout'
          )
        )
      }, OAUTH_TIMEOUT_MS)

      const scheduleDismissGrace = () => {
        if (dismissGraceTimer) clearTimeout(dismissGraceTimer)
        dismissGraceTimer = setTimeout(() => {
          const pending = consumePendingOAuthUrl()
          if (pending) {
            authLog('DeepLink', 'callback desde cola pending (post dismiss)', {
              preview: pending.slice(0, 120),
            })
            succeed(pending, 'linking')
            return
          }
          fail(
            new OAuthSessionError(
              'No se recibió la respuesta del login en la app. Si cancelaste el navegador, inténtalo de nuevo.',
              'no_callback'
            )
          )
        }, DISMISS_GRACE_MS)
      }

      void WebBrowser.openAuthSessionAsync(oauthBrowserUrl, redirectTo)
        .then((authResult) => {
          if (settled) return
          authLog('OAuth', 'WebBrowser resultado', {
            type: authResult.type,
            has_url: Boolean(
              authResult.type === 'success' && 'url' in authResult && authResult.url
            ),
          })
          if (authResult.type === 'success' && authResult.url) {
            succeed(authResult.url, 'webbrowser')
            return
          }
          if (authResult.type === 'cancel') {
            fail(
              new OAuthSessionError('Inicio con Google cancelado.', 'cancelled')
            )
            return
          }
          scheduleDismissGrace()
        })
        .catch((e) => {
          authLog('OAuth', 'WebBrowser error', {
            error: e instanceof Error ? e.message : String(e),
          })
          if (!settled) scheduleDismissGrace()
        })
    })
  } finally {
    if (Platform.OS !== 'web') {
      try {
        await WebBrowser.coolDownAsync()
      } catch {
        /* opcional */
      }
    }
    releaseOAuthLock()
  }
}
