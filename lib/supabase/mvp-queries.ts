import type { SupabaseClient } from '@supabase/supabase-js'

/** Partidos donde el jugador fue MVP (más votos; en empate, cada empatado suma 1). */
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

/** Conteo MVP para varios jugadores (p. ej. top del ranking). */
export async function fetchPlayerMvpWinsCountsBatch(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, number>> {
  const unique = [...new Set(userIds.filter(Boolean))]
  const map = new Map<string, number>()
  if (unique.length === 0) return map

  await Promise.all(
    unique.map(async (userId) => {
      const count = await fetchPlayerMvpWinsCount(supabase, userId)
      map.set(userId, count)
    })
  )

  return map
}
