import type { SupabaseClient } from '@supabase/supabase-js'

import type { TeamPickRole, TeamPickTeam } from '../types'

export type RivalLineupActionResult =
  | { ok: true }
  | { ok: false; error: string }

function mapError(code: string): string {
  switch (code) {
    case 'not_team_member':
      return 'Solo puedes usar cupos de tu equipo.'
    case 'slot_taken':
      return 'Ese cupo ya está ocupado.'
    case 'side_full':
      return 'Tu equipo ya no tiene cupos libres.'
    case 'team_needs_goalkeeper':
      return 'Tu equipo debe tener siempre un arquero. Ocupa el cupo de arquero antes de cambiar de posición.'
    case 'not_participant':
      return 'No estás inscrito en este encuentro.'
    case 'not_open':
      return 'Este encuentro ya no admite cambios.'
    case 'past':
      return 'Este partido ya pasó.'
    default:
      return 'No se pudo actualizar la plantilla.'
  }
}

function parseRpc(
  data: unknown,
  err: { message: string } | null
): RivalLineupActionResult {
  if (!err && data && typeof data === 'object' && (data as { ok?: boolean }).ok === true) {
    return { ok: true }
  }
  const code =
    data &&
    typeof data === 'object' &&
    typeof (data as { error?: string }).error === 'string'
      ? (data as { error: string }).error
      : null
  if (code) return { ok: false, error: mapError(code) }
  if (err?.message?.includes('Could not find the function')) {
    return {
      ok: false,
      error:
        'Falta aplicar la migración rival en Supabase (scripts/rival-lineup-join-migration.sql).',
    }
  }
  return { ok: false, error: err?.message ?? 'Error de servidor.' }
}

export async function joinRivalMatchLineupSlot(
  supabase: SupabaseClient,
  opportunityId: string,
  pickTeam: TeamPickTeam,
  lineupSlot: string,
  encounterRole: TeamPickRole
): Promise<RivalLineupActionResult> {
  const { data, error } = await supabase.rpc('join_rival_match_opportunity', {
    p_opportunity_id: opportunityId,
    p_pick_team: pickTeam,
    p_lineup_slot: lineupSlot,
    p_encounter_lineup_role: encounterRole,
  })
  return parseRpc(data, error)
}

export async function moveRivalMatchLineupSlot(
  supabase: SupabaseClient,
  opportunityId: string,
  lineupSlot: string,
  encounterRole: TeamPickRole
): Promise<RivalLineupActionResult> {
  const { data, error } = await supabase.rpc('move_rival_match_lineup_slot', {
    p_opportunity_id: opportunityId,
    p_lineup_slot: lineupSlot,
    p_encounter_lineup_role: encounterRole,
  })
  return parseRpc(data, error)
}

export async function leaveRivalMatchOpportunity(
  supabase: SupabaseClient,
  opportunityId: string
): Promise<RivalLineupActionResult> {
  const { data, error } = await supabase.rpc('leave_rival_match_opportunity', {
    p_opportunity_id: opportunityId,
  })
  return parseRpc(data, error)
}

/** Inscripción inicial del capitán (equipo A local o B visita). */
export async function insertRivalCreatorParticipant(
  supabase: SupabaseClient,
  opportunityId: string,
  userId: string,
  encounterRole: TeamPickRole = 'gk',
  lineupSlot: string = 'gk',
  pickTeam: TeamPickTeam = 'A'
): Promise<RivalLineupActionResult> {
  const { error } = await supabase.from('match_opportunity_participants').upsert(
    {
      opportunity_id: opportunityId,
      user_id: userId,
      status: 'confirmed',
      is_goalkeeper: encounterRole === 'gk',
      pick_team: pickTeam,
      encounter_lineup_role: encounterRole,
      lineup_slot: lineupSlot,
    },
    { onConflict: 'opportunity_id,user_id' }
  )
  if (error) {
    if (error.message.includes('lineup_slot')) {
      return {
        ok: false,
        error:
          'Falta la columna lineup_slot en Supabase. Ejecuta scripts/rival-lineup-join-migration.sql',
      }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
