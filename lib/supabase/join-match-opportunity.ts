import type { SupabaseClient } from '@supabase/supabase-js'
import {
  joinRivalMatchLineupSlot,
  moveRivalMatchLineupSlot,
} from './rival-lineup-actions'
import type {
  MatchOpportunity,
  TeamPickRole,
  TeamPickTeam,
  User,
} from '../types'
import { playersJoinRules } from '../players-seek-profile'

function isTeamPickType(type: MatchOpportunity['type']): boolean {
  return (
    type === 'team_pick' ||
    type === 'team_pick_public' ||
    type === 'team_pick_private'
  )
}

export type JoinMatchResult =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; kind: 'info'; message: string }

/**
 * Misma validación e inserción que la app web (`joinMatchOpportunity` en app-context).
 */
export async function joinMatchOpportunityAction(
  supabase: SupabaseClient,
  currentUser: User,
  opp: MatchOpportunity,
  participatingOpportunityIds: string[],
  options?: {
    isGoalkeeper?: boolean
    teamPickTeam?: TeamPickTeam
    teamPickRole?: TeamPickRole
    teamPickJoinCode?: string
    /** Partido rival: bando A (local) o B (visita) + cupo visual. */
    rivalPickTeam?: TeamPickTeam
    rivalLineupSlot?: string
    rivalEncounterRole?: TeamPickRole
  }
): Promise<JoinMatchResult> {
  if (opp.type !== 'rival' && opp.creatorId === currentUser.id) {
    return { ok: false, kind: 'info', message: 'Eres el organizador de este partido.' }
  }
  if (opp.type !== 'rival' && participatingOpportunityIds.includes(opp.id)) {
    return { ok: false, kind: 'info', message: 'Ya estás en este partido.' }
  }

  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  if (opp.dateTime.getTime() < midnight.getTime()) {
    return { ok: false, error: 'Este partido ya pasó. Ya no se puede unir.' }
  }

  const cap = opp.playersNeeded ?? 0
  const isGkProvided = typeof options?.isGoalkeeper === 'boolean'
  const isGkRequest = options?.isGoalkeeper === true
  let insertAsGk = false

  if (opp.type === 'open') {
    const { data: partRows, error: partQErr } = await supabase
      .from('match_opportunity_participants')
      .select('is_goalkeeper, status')
      .eq('opportunity_id', opp.id)
    if (partQErr) {
      return { ok: false, error: partQErr.message }
    }
    let gkCount = 0
    let fieldCount = 0
    let joinedDb = 0
    for (const p of partRows ?? []) {
      const st = p.status as string
      if (st !== 'pending' && st !== 'confirmed') continue
      joinedDb++
      if (p.is_goalkeeper === true) gkCount++
      else fieldCount++
    }

    if (cap > 0 && joinedDb >= cap) {
      return { ok: false, error: 'No quedan cupos en este partido.' }
    }

    const gkLeft = Math.max(0, 2 - gkCount)
    const fieldCap = Math.max(0, cap - 2)
    const fieldLeft = Math.max(0, fieldCap - fieldCount)

    insertAsGk = isGkRequest
    if (insertAsGk) {
      if (gkLeft <= 0) {
        return { ok: false, error: 'Solo quedan cupos de jugadores.' }
      }
    } else {
      if (fieldLeft <= 0 && gkLeft > 0) {
        return { ok: false, error: 'Solo quedan cupos de arquero.' }
      }
      if (fieldLeft <= 0) {
        return { ok: false, error: 'No quedan cupos en este partido.' }
      }
    }
  } else if (opp.type === 'players') {
    const { data: partRows, error: partQErr } = await supabase
      .from('match_opportunity_participants')
      .select('is_goalkeeper, status')
      .eq('opportunity_id', opp.id)
    if (partQErr) {
      return { ok: false, error: partQErr.message }
    }
    let gkCount = 0
    let fieldCount = 0
    let joinedDb = 0
    for (const p of partRows ?? []) {
      const st = p.status as string
      if (st !== 'pending' && st !== 'confirmed') continue
      joinedDb++
      if (p.is_goalkeeper === true) gkCount++
      else fieldCount++
    }
    if (cap > 0 && joinedDb >= cap) {
      return { ok: false, error: 'No quedan cupos en este partido.' }
    }
    const rules = playersJoinRules(opp)
    if (rules.kind === 'legacy') {
      insertAsGk = false
    } else if (rules.kind === 'gk_only') {
      if (!isGkRequest) {
        return { ok: false, error: 'Esta búsqueda solo admite arqueros.' }
      }
      if (gkCount >= rules.max) {
        return { ok: false, error: 'Ya no quedan cupos de arquero.' }
      }
      insertAsGk = true
    } else if (rules.kind === 'field_only') {
      if (isGkRequest) {
        return { ok: false, error: 'Solo buscan jugadores de campo.' }
      }
      if (fieldCount >= rules.max) {
        return { ok: false, error: 'No quedan cupos de jugador de campo.' }
      }
      insertAsGk = false
    } else {
      const maxField = rules.maxField
      if (isGkRequest) {
        if (gkCount >= 1) {
          return {
            ok: false,
            error: 'Ya hay un arquero; en esta búsqueda solo cabe uno.',
          }
        }
        insertAsGk = true
      } else {
        if (fieldCount >= maxField) {
          return { ok: false, error: 'No quedan cupos de jugador de campo.' }
        }
        insertAsGk = false
      }
    }
  } else if (isTeamPickType(opp.type)) {
    // Con contrato vigente team_pick_* debe unirse por RPC dedicada.
    const pickTeam = options?.teamPickTeam
    const encounterRole = options?.teamPickRole
    const joinCode = options?.teamPickJoinCode?.trim() ?? ''
    if (!pickTeam || !encounterRole) {
      return {
        ok: false,
        error:
          'Debes elegir equipo (A/B) y rol para unirte a esta selección de equipos.',
      }
    }
    if (opp.type === 'team_pick_private' && !/^[0-9]{4}$/.test(joinCode)) {
      return {
        ok: false,
        error: 'Este partido es privado. Ingresa el código de 4 dígitos.',
      }
    }
    const { data: teamPickJoinData, error: teamPickJoinErr } = await supabase.rpc(
      'join_team_pick_match_opportunity',
      {
        p_opportunity_id: opp.id,
        p_pick_team: pickTeam,
        p_encounter_lineup_role: encounterRole,
        p_join_code: opp.type === 'team_pick_private' ? joinCode : null,
      }
    )
    if (teamPickJoinErr) {
      return { ok: false, error: teamPickJoinErr.message }
    }
    if (
      teamPickJoinData &&
      typeof teamPickJoinData === 'object' &&
      (teamPickJoinData as { ok?: boolean }).ok === true
    ) {
      return { ok: true }
    }
    const rpcError =
      teamPickJoinData &&
      typeof teamPickJoinData === 'object' &&
      typeof (teamPickJoinData as { error?: string }).error === 'string'
        ? (teamPickJoinData as { error: string }).error
        : 'No se pudo unir al partido de selección de equipos.'
    return { ok: false, error: rpcError }
  } else if (opp.type === 'rival') {
    const lineupSlot = options?.rivalLineupSlot?.trim()
    const encounterRole = options?.rivalEncounterRole
    if (!lineupSlot || !encounterRole) {
      return {
        ok: false,
        error: 'Elige un cupo libre de tu equipo en la plantilla.',
      }
    }

    const alreadyIn = participatingOpportunityIds.includes(opp.id)
    if (!alreadyIn && !options?.rivalPickTeam) {
      return { ok: false, error: 'No se pudo determinar tu equipo en este encuentro.' }
    }
    const result = alreadyIn
      ? await moveRivalMatchLineupSlot(supabase, opp.id, lineupSlot, encounterRole)
      : await joinRivalMatchLineupSlot(
          supabase,
          opp.id,
          options!.rivalPickTeam!,
          lineupSlot,
          encounterRole
        )

    if (result.ok) return { ok: true }
    return { ok: false, error: result.error }
  } else {
    if (cap > 0 && (opp.playersJoined ?? 0) >= cap) {
      return { ok: false, error: 'No quedan cupos en este partido.' }
    }
  }

  const { error } = await supabase.from('match_opportunity_participants').upsert(
    {
      opportunity_id: opp.id,
      user_id: currentUser.id,
      status: 'confirmed',
      is_goalkeeper: insertAsGk,
      cancelled_at: null,
      cancelled_reason: null,
    },
    { onConflict: 'opportunity_id,user_id' }
  )
  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true }
}

