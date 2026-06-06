import * as Linking from 'expo-linking'
import { Redirect, router, useGlobalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'

import { AuthProfileLoadingScreen } from '../../components/auth-profile-loading-screen'
import { useApp } from '../../lib/app-provider'
import { authLog } from '../../lib/auth/auth-debug'
import { recoverOAuthCallbackFromAllSources } from '../../lib/auth/oauth-callback-handler'

/**
 * Deep link sportmatch://auth/callback?code=…
 * Canje PKCE + hydrate vía AppProvider.
 */
export default function AuthCallbackScreen() {
  const params = useGlobalSearchParams<{
    code?: string | string[]
    access_token?: string | string[]
    refresh_token?: string | string[]
    error?: string | string[]
    error_description?: string | string[]
  }>()
  const linkingUrl = Linking.useURL()
  const { authLoading, isAuthenticated, currentUser, profileHydrating, syncAuthFromSession } =
    useApp()
  const [exchangeError, setExchangeError] = useState<string | null>(null)
  const [exchangeDone, setExchangeDone] = useState(false)
  const recoveryStartedRef = useRef(false)

  const codeParam =
    typeof params.code === 'string'
      ? params.code
      : Array.isArray(params.code)
        ? params.code[0]
        : null

  useEffect(() => {
    if (recoveryStartedRef.current) return
    recoveryStartedRef.current = true

    authLog('AuthCallback', 'mounted', {
      code_param: Boolean(codeParam),
      linking_url: linkingUrl?.slice(0, 120) ?? null,
    })

    let cancelled = false

    const finishRecovery = async (
      res: { ok: boolean; error?: string },
      hadCredentials: boolean
    ) => {
      if (cancelled) return
      setExchangeDone(true)
      authLog('AuthCallback', 'recovery finished', {
        ok: res.ok,
        error: res.error,
      })
      if (!res.ok) {
        if (hadCredentials) {
          setExchangeError(
            res.error ??
              'No se pudo completar el inicio de sesión desde el enlace. Vuelve a intentar con Google.'
          )
        }
        return
      }
      await syncAuthFromSession()
    }

    void recoverOAuthCallbackFromAllSources(params, linkingUrl).then((res) =>
      finishRecovery(res, Boolean(codeParam || linkingUrl))
    )

    const sub = Linking.addEventListener('url', ({ url }) => {
      authLog('AuthCallback', 'Linking url while on callback', {
        preview: url.slice(0, 120),
      })
      void recoverOAuthCallbackFromAllSources(undefined, url).then((res) =>
        finishRecovery(res, true)
      )
    })

    return () => {
      cancelled = true
      sub.remove()
    }
  }, [codeParam, linkingUrl, params, syncAuthFromSession])

  useEffect(() => {
    if (authLoading) return
    if (isAuthenticated) return
    if (!exchangeDone) return
    const t = setTimeout(() => {
      authLog('Navigation', 'AuthCallback timeout → / (sin currentUser)', {
        exchangeError,
      })
      router.replace('/')
    }, 12000)
    return () => clearTimeout(t)
  }, [authLoading, isAuthenticated, exchangeDone, exchangeError])

  useEffect(() => {
    if (isAuthenticated) {
      authLog('Navigation', 'AuthCallback → Redirect /', {
        user_id: currentUser?.id,
      })
    }
  }, [isAuthenticated, currentUser])

  if (isAuthenticated && !profileHydrating) {
    return <Redirect href="/" />
  }

  if (profileHydrating) {
    return null
  }

  return (
    <AuthProfileLoadingScreen
      message={
        exchangeError
          ? exchangeError
          : 'Completando inicio de sesión…'
      }
    />
  )
}
