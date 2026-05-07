import type { SupabaseClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/react-native'

import { createClient, isSupabaseConfigured } from '../supabase/client'
import { trackEvent as trackEventDb } from './client'

/** Nombres canónicos Fase 1 (alineados con mejoras.md). */
export const ProductEventNames = {
  appStarted: 'app_started',
  screenView: 'screen_view',
  loginSuccess: 'login_success',
  loginFailed: 'login_failed',
  signupSuccess: 'signup_success',
  matchCreateSuccess: 'match_create_success',
  matchJoinSuccess: 'match_join_success',
  chatMessageSent: 'chat_message_sent',
  bookingSuccess: 'booking_success',
  pushReceived: 'push_received',
  pushOpened: 'push_opened',
  pushTokenRegistered: 'push_token_registered',
  pushTokenFailed: 'push_token_failed',
} as const

export type ProductEventName =
  (typeof ProductEventNames)[keyof typeof ProductEventNames]

/**
 * Capa única producto → Sentry (breadcrumb) + Supabase (`app_events` / fallback).
 * Fire-and-forget: no bloquea UI; errores de red se ignoran en telemetría.
 */
export function trackProductEvent(
  eventName: ProductEventName | string,
  options?: {
    userId?: string | null
    metadata?: Record<string, unknown>
    supabase?: SupabaseClient | null
  }
): void {
  const { userId, metadata, supabase: clientOverride } = options ?? {}
  try {
    Sentry.addBreadcrumb({
      category: 'product',
      message: eventName,
      level: 'info',
      data: {
        ...metadata,
        user_id: userId ?? undefined,
      },
    })
  } catch {
    /* Sentry no inicializado o no disponible */
  }

  if (!isSupabaseConfigured()) return
  try {
    const supabase = clientOverride ?? createClient()
    void trackEventDb(supabase, {
      userId: userId ?? null,
      eventName,
      metadata: metadata ?? {},
    })
  } catch {
    /* no romper flujo por analytics */
  }
}

export function setAnalyticsUser(user: { id: string; email?: string } | null): void {
  try {
    if (user) {
      Sentry.setUser({ id: user.id, email: user.email })
    } else {
      Sentry.setUser(null)
    }
  } catch {
    /* noop */
  }
}

export function captureProductException(
  error: unknown,
  context?: { tags?: Record<string, string>; extra?: Record<string, unknown> }
): void {
  try {
    if (context?.tags) {
      Sentry.setTags(context.tags)
    }
    if (error instanceof Error) {
      Sentry.captureException(error, { extra: context?.extra })
    } else {
      Sentry.captureMessage(String(error), { level: 'error', extra: context?.extra })
    }
  } catch {
    /* noop */
  }
}
