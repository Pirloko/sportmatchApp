import Constants from 'expo-constants'
import { usePathname } from 'expo-router'
import { useEffect, useRef } from 'react'

import { useApp } from '../app-provider'
import { createClient, isSupabaseConfigured } from '../supabase/client'
import { trackCrash, trackEvent } from './client'

type GlobalLike = {
  ErrorUtils?: {
    getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined
    setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void
  }
}

export function TelemetryBootstrap() {
  const { currentUser } = useApp()
  const pathname = usePathname()
  const startedRef = useRef(false)
  const prevPathRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    if (startedRef.current) return
    startedRef.current = true
    const supabase = createClient()
    void trackEvent(supabase, {
      userId: currentUser?.id ?? null,
      eventName: 'app_started',
      metadata: {
        appVersion: Constants.expoConfig?.version ?? 'unknown',
        runtimeVersion: Constants.expoRuntimeVersion ?? 'unknown',
      },
    })
  }, [currentUser?.id])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    if (!pathname) return
    if (prevPathRef.current === pathname) return
    prevPathRef.current = pathname
    const supabase = createClient()
    void trackEvent(supabase, {
      userId: currentUser?.id ?? null,
      eventName: 'screen_view',
      metadata: { pathname },
    })
  }, [pathname, currentUser?.id])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const g = globalThis as unknown as GlobalLike
    const errorUtils = g.ErrorUtils
    const original = errorUtils?.getGlobalHandler?.()
    if (!errorUtils?.setGlobalHandler) return

    errorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      const supabase = createClient()
      void trackCrash(supabase, {
        userId: currentUser?.id ?? null,
        message: error?.message || 'Unknown error',
        stack: error?.stack ?? null,
        metadata: { isFatal: Boolean(isFatal), pathname: prevPathRef.current },
      })
      if (original) original(error, isFatal)
    })

    return () => {
      if (original && errorUtils?.setGlobalHandler) {
        errorUtils.setGlobalHandler(original)
      }
    }
  }, [currentUser?.id])

  return null
}
