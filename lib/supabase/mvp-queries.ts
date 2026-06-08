import type { SupabaseClient } from '@supabase/supabase-js'

/** Partidos donde el jugador fue MVP ganador (más votos en reseñas). */
export async function fetchPlayerMvpWinsCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data, error } = await supabase.rpc('player_mvp_wins_count', {
    p_user_id: userId,
  })

  if (error) {
    console.warn('[mvp] count failed', error.message)
    return 0
  }

  return typeof data === 'number' ? data : 0
}
