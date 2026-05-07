import 'react-native-url-polyfill/auto'

import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'

const storageKey = 'pichanga-auth'

/** Quita comillas típicas si alguien pegó el .env con "..." */
function stripEnvQuotes(raw: string): string {
  const t = raw.trim()
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1).trim()
  }
  return t
}

function normalizeSupabaseProjectUrl(url: string): string {
  const t = stripEnvQuotes(url.trim())
  if (!t) return ''
  if (/^https?:\/\//i.test(t)) return t
  // Ej: xxx.supabase.co sin protocolo
  if (/^[a-z0-9][\w.-]*\.supabase\.co\/?$/i.test(t)) {
    return `https://${t.replace(/\/$/, '')}`
  }
  return t
}

function resolvedUrl(): string {
  const fromExpo = process.env.EXPO_PUBLIC_SUPABASE_URL
  const fromNext = process.env.NEXT_PUBLIC_SUPABASE_URL
  const raw = (fromExpo ?? fromNext ?? '').toString()
  return normalizeSupabaseProjectUrl(raw)
}

function resolvedAnonKey(): string {
  const fromExpo = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  const fromNext = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const raw = (fromExpo ?? fromNext ?? '').toString()
  return stripEnvQuotes(raw)
}

function isValidHttpUrl(url: string): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function isSupabaseConfigured(): boolean {
  const url = resolvedUrl()
  const key = resolvedAnonKey()
  return isValidHttpUrl(url) && key.length >= 20
}

/**
 * Cliente Supabase para Expo (nativo + web): sesión en AsyncStorage,
 * mismo storageKey que la web para coherencia si compartes builds de prueba.
 */
export function createClient(): SupabaseClient {
  const url = resolvedUrl()
  const key = resolvedAnonKey()
  if (!isValidHttpUrl(url) || !key) {
    throw new Error(
      'Configura URL (https://…supabase.co) y anon key: EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY (o NEXT_PUBLIC_* en .env).'
    )
  }
  return createSupabaseClient(url, key, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: Platform.OS === 'web',
      storageKey,
    },
  })
}
