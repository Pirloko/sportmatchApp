import type { SupabaseClient } from '@supabase/supabase-js'

import type { Level, Position } from '../types'
import { DEFAULT_AVATAR } from './mappers'

export type PublicPlayerProfile = {
  id: string
  name: string
  photo: string
  city: string
  level: Level
  position: Position
  availability: string[]
  statsPlayerWins: number
  statsPlayerDraws: number
  statsPlayerLosses: number
  statsOrganizedCompleted: number
  statsOrganizerWins: number
  modYellowCards: number
  modRedCards: number
}

type RpcRow = {
  id: string
  name: string
  photo_url: string | null
  city: string | null
  level: Level
  position: Position
  availability: string[] | null
  stats_player_wins: number
  stats_player_draws: number
  stats_player_losses: number
  stats_organized_completed: number
  stats_organizer_wins: number
  mod_yellow_cards: number
  mod_red_cards: number
}

function mapRow(row: RpcRow): PublicPlayerProfile {
  return {
    id: row.id,
    name: row.name,
    photo: row.photo_url?.trim() || DEFAULT_AVATAR,
    city: row.city?.trim() || 'Sin ciudad',
    level: row.level,
    position: row.position,
    availability: row.availability ?? [],
    statsPlayerWins: row.stats_player_wins ?? 0,
    statsPlayerDraws: row.stats_player_draws ?? 0,
    statsPlayerLosses: row.stats_player_losses ?? 0,
    statsOrganizedCompleted: row.stats_organized_completed ?? 0,
    statsOrganizerWins: row.stats_organizer_wins ?? 0,
    modYellowCards: row.mod_yellow_cards ?? 0,
    modRedCards: row.mod_red_cards ?? 0,
  }
}

export async function fetchPublicPlayerProfile(
  client: SupabaseClient,
  userId: string
): Promise<{ profile: PublicPlayerProfile | null; error?: string }> {
  const { data, error } = await client.rpc('fetch_public_player_profile', {
    p_user_id: userId,
  })

  if (error) {
    return { profile: null, error: error.message }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) {
    return { profile: null, error: 'Jugador no encontrado.' }
  }

  return { profile: mapRow(row as RpcRow) }
}

export const PLAYER_REPORT_CATEGORIES = [
  { id: 'conducta', label: 'Conducta' },
  { id: 'spam', label: 'Spam' },
  { id: 'suplantacion', label: 'Suplantación' },
  { id: 'otro', label: 'Otro' },
] as const

export type PlayerReportCategoryId = (typeof PLAYER_REPORT_CATEGORIES)[number]['id']

export function playerReportCategoryLabel(categoryId: PlayerReportCategoryId): string {
  return PLAYER_REPORT_CATEGORIES.find((c) => c.id === categoryId)?.label ?? categoryId
}

export async function submitPlayerReport(
  client: SupabaseClient,
  input: {
    reporterId: string
    reportedUserId: string
    category: PlayerReportCategoryId
    contextType?: string
    contextId?: string
    details?: string
  }
): Promise<{ ok: boolean; error?: string }> {
  const reason = playerReportCategoryLabel(input.category)
  const details = input.details?.trim() || null

  const { error } = await client.from('player_reports').insert({
    reporter_id: input.reporterId,
    reported_user_id: input.reportedUserId,
    context_type: input.contextType ?? 'match',
    context_id: input.contextId ?? null,
    reason,
    details,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true }
}
