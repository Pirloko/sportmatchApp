import Constants from 'expo-constants'
import type { SupabaseClient } from '@supabase/supabase-js'

const MAX_MESSAGE_LENGTH = 4000

export function resolveAppVersionForFeedback(): string | null {
  return Constants.expoConfig?.version ?? null
}

export async function submitAppUserFeedback(
  supabase: SupabaseClient,
  userId: string,
  message: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = message.trim()
  if (!trimmed) {
    return { ok: false, error: 'Escribe un mensaje antes de enviar.' }
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `El mensaje no puede superar ${MAX_MESSAGE_LENGTH} caracteres.`,
    }
  }

  const { error } = await supabase.from('app_user_feedback').insert({
    user_id: userId,
    message: trimmed,
    app_version: resolveAppVersionForFeedback(),
  })

  if (error) {
    const hint = error.message.includes('app_user_feedback')
      ? ' La tabla de comentarios no está disponible en el servidor.'
      : ''
    return { ok: false, error: `${error.message}${hint}` }
  }

  return { ok: true }
}

export const APP_FEEDBACK_MAX_LENGTH = MAX_MESSAGE_LENGTH
