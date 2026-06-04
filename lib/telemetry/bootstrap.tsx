import Constants from 'expo-constants'
import { usePathname } from 'expo-router'
import { useEffect, useRef } from 'react'

import { useApp } from '../app-provider'
import { getSupabase, isSupabaseConfigured } from '../supabase/client'
import { trackCrash } from './client'
import {
  captureProductException,
  ProductEventNames,
  trackProductEvent,
} from './product-analytics'

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
    const supabase = getSupabase()
    trackProductEvent(ProductEventNames.appStarted, {
      userId: currentUser?.id ?? null,
      metadata: {
        appVersion: Constants.expoConfig?.version ?? 'unknown',
        runtimeVersion: Constants.expoRuntimeVersion ?? 'unknown',
      },
      supabase,
    })
  }, [currentUser?.id])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    if (!pathname) return
    if (prevPathRef.current === pathname) return
    prevPathRef.current = pathname
    const supabase = getSupabase()
    trackProductEvent(ProductEventNames.screenView, {
      userId: currentUser?.id ?? null,
      metadata: { pathname },
      supabase,
    })
  }, [pathname, currentUser?.id])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const g = globalThis as unknown as GlobalLike
    const errorUtils = g.ErrorUtils
    const original = errorUtils?.getGlobalHandler?.()
    if (!errorUtils?.setGlobalHandler) return

    errorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      captureProductException(error, {
        extra: { isFatal: Boolean(isFatal), pathname: prevPathRef.current },
      })
      const supabase = getSupabase()
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
