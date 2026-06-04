import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveTeamLogoDisplayUrl } from './team-logos'

export type RivalTeamSide = {
  teamId: string
  name: string
  logoUrl: string
}

export type RivalEncounterDetail = {
  home: RivalTeamSide
  away: RivalTeamSide | null
  mode: 'direct' | 'open'
  challengeStatus: 'pending' | 'accepted' | 'declined' | 'cancelled'
  perSideMax: number
  awaitingRival: boolean
}

function parseVsTitle(title: string): { home: string; away: string } | null {
  const parts = title.split(/\s+vs\s+/i)
  if (parts.length !== 2) return null
  const home = parts[0]?.trim()
  const away = parts[1]?.trim()
  if (!home || !away) return null
  return { home, away }
}

function mapTeamRow(
  supabase: SupabaseClient,
  row: Record<string, unknown>
): RivalTeamSide {
  const teamId = row.id as string
  return {
    teamId,
    name: (row.name as string) || 'Equipo',
    logoUrl: resolveTeamLogoDisplayUrl(
      supabase,
      teamId,
      row.logo_url as string | null | undefined
    ),
  }
}

function mapRpcTeamSide(
  supabase: SupabaseClient,
  raw: { teamId?: string; name?: string; logoUrl?: string | null }
): RivalTeamSide {
  const teamId = raw.teamId ?? 'unknown'
  return {
    teamId,
    name: raw.name?.trim() || 'Equipo',
    logoUrl: resolveTeamLogoDisplayUrl(supabase, teamId, raw.logoUrl),
  }
}

async function fetchRivalEncounterViaRpc(
  supabase: SupabaseClient,
  opportunityId: string
): Promise<RivalEncounterDetail | null> {
  const { data, error } = await supabase.rpc('get_rival_encounter_display', {
    p_opportunity_id: opportunityId,
  })
  if (error || !data || typeof data !== 'object') return null
  const payload = data as {
    ok?: boolean
    home?: { teamId?: string; name?: string; logoUrl?: string | null }
    away?: { teamId?: string; name?: string; logoUrl?: string | null } | null
    mode?: string
    challengeStatus?: string
    awaitingRival?: boolean
    perSideMax?: number
  }
  if (payload.ok !== true || !payload.home?.teamId) return null

  const away =
    payload.away?.teamId != null ? mapRpcTeamSide(supabase, payload.away) : null

  return {
    home: mapRpcTeamSide(supabase, payload.home),
    away,
    mode: payload.mode === 'open' ? 'open' : 'direct',
    challengeStatus: (payload.challengeStatus ??
      'pending') as RivalEncounterDetail['challengeStatus'],
    perSideMax: Math.max(1, payload.perSideMax ?? 9),
    awaitingRival: payload.awaitingRival === true,
  }
}

function sideFromChallengeTeamId(
  supabase: SupabaseClient,
  teamId: string,
  name: string
): RivalTeamSide {
  return {
    teamId,
    name,
    logoUrl: resolveTeamLogoDisplayUrl(supabase, teamId, null),
  }
}

export async function fetchRivalEncounterDetail(
  supabase: SupabaseClient,
  opportunityId: string,
  fallbackTitle: string,
  playersNeeded?: number | null
): Promise<RivalEncounterDetail> {
  const perSideMax = Math.max(
    1,
    Math.floor((playersNeeded ?? 18) / 2) || 9
  )

  const viaRpc = await fetchRivalEncounterViaRpc(supabase, opportunityId)
  if (viaRpc) return viaRpc

  const { data: challenge } = await supabase
    .from('rival_challenges')
    .select(
      'mode, status, challenger_team_id, challenged_team_id, accepted_team_id'
    )
    .eq('opportunity_id', opportunityId)
    .maybeSingle()

  const parsed = parseVsTitle(fallbackTitle)

  if (!challenge) {
    const homeName = parsed?.home ?? fallbackTitle
    const awayName = parsed?.away ?? 'Rival por confirmar'
    return {
      home: {
        teamId: 'unknown-home',
        name: homeName,
        logoUrl: '',
      },
      away: {
        teamId: 'unknown-away',
        name: awayName,
        logoUrl: '',
      },
      mode: 'open',
      challengeStatus: 'pending',
      perSideMax,
      awaitingRival: true,
    }
  }

  const awayTeamId =
    (challenge.accepted_team_id as string | null) ??
    (challenge.challenged_team_id as string | null)

  const teamIds = [
    challenge.challenger_team_id as string,
    awayTeamId,
  ].filter(Boolean) as string[]

  const { data: teamRows } = await supabase
    .from('teams')
    .select('id, name, logo_url')
    .in('id', teamIds)

  const byId = new Map(
    (teamRows ?? []).map((t) => [
      t.id as string,
      mapTeamRow(supabase, t as Record<string, unknown>),
    ])
  )

  const challengerId = challenge.challenger_team_id as string
  const home =
    byId.get(challengerId) ??
    sideFromChallengeTeamId(supabase, challengerId, parsed?.home ?? 'Equipo local')

  const status = challenge.status as RivalEncounterDetail['challengeStatus']
  const awaitingRival = status === 'pending' && !challenge.accepted_team_id

  let away: RivalTeamSide | null = null
  if (awayTeamId && byId.has(awayTeamId)) {
    away = byId.get(awayTeamId) ?? null
  } else if (awayTeamId) {
    away = sideFromChallengeTeamId(
      supabase,
      awayTeamId,
      parsed?.away ?? 'Equipo visita'
    )
  } else if (parsed?.away) {
    away = {
      teamId: 'unknown-away',
      name: parsed.away,
      logoUrl: '',
    }
  } else if (!awaitingRival) {
    away = {
      teamId: 'unknown-away',
      name: 'Rival',
      logoUrl: '',
    }
  }

  return {
    home,
    away,
    mode: challenge.mode as 'direct' | 'open',
    challengeStatus: status,
    perSideMax,
    awaitingRival,
  }
}

/** Asigna participantes a local o visita según pertenencia al equipo. */
export async function fetchRivalParticipantTeamIds(
  supabase: SupabaseClient,
  homeTeamId: string,
  awayTeamId: string | null
): Promise<Map<string, 'home' | 'away'>> {
  const map = new Map<string, 'home' | 'away'>()
  if (homeTeamId.startsWith('unknown')) return map

  const teamIds = [homeTeamId, awayTeamId].filter(
    (id): id is string => !!id && !id.startsWith('unknown')
  )
  if (teamIds.length === 0) return map

  const { data: members } = await supabase
    .from('team_members')
    .select('team_id, user_id, status')
    .in('team_id', teamIds)
    .in('status', ['confirmed', 'pending', 'invited'])

  for (const m of members ?? []) {
    const uid = m.user_id as string
    const tid = m.team_id as string
    if (tid === homeTeamId) map.set(uid, 'home')
    else if (awayTeamId && tid === awayTeamId) map.set(uid, 'away')
  }
  return map
}
