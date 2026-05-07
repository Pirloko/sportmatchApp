import type { SupabaseClient } from '@supabase/supabase-js'

type JsonMap = Record<string, unknown>

export async function trackEvent(
  supabase: SupabaseClient,
  payload: {
    userId?: string | null
    eventName: string
    metadata?: JsonMap
  }
): Promise<void> {
  const row = {
    user_id: payload.userId ?? null,
    event_name: payload.eventName,
    metadata: payload.metadata ?? {},
    created_at: new Date().toISOString(),
  }

  const main = await supabase.from('app_events').insert(row)
  if (!main.error) return
  await supabase.from('telemetry_events').insert(row)
}

export async function trackCrash(
  supabase: SupabaseClient,
  payload: {
    userId?: string | null
    message: string
    stack?: string | null
    metadata?: JsonMap
  }
): Promise<void> {
  const row = {
    user_id: payload.userId ?? null,
    message: payload.message.slice(0, 4000),
    stack: (payload.stack ?? '').slice(0, 8000),
    metadata: payload.metadata ?? {},
    created_at: new Date().toISOString(),
  }

  const main = await supabase.from('app_crash_logs').insert(row)
  if (!main.error) return
  await supabase.from('telemetry_crashes').insert(row)
}
