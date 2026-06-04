import type { SupabaseClient } from '@supabase/supabase-js'

import { parseRevueltaLineup } from '../revuelta-lineup'

function matchPlayedAt(
  dateTime: string,
  finalizedAt: string | null | undefined
): Date {
  if (finalizedAt) return new Date(finalizedAt)
  return new Date(dateTime)
}

function bump(map: Map<string, Date>, id: string, at: Date) {
  const prev = map.get(id)
  if (!prev || at.getTime() > prev.getTime()) {
    map.set(id, at)
  }
}

export type LastPlayedMaps = {
  playerLastAt: Map<string, Date>
  teamLastAt: Map<string, Date>
}

/** Última fecha de partido completado por jugador y por equipo (rival). */
export async function fetchLastPlayedMaps(
  supabase: SupabaseClient
): Promise<LastPlayedMaps> {
  const playerLastAt = new Map<string, Date>()
  const teamLastAt = new Map<string, Date>()

  const { data: opps, error: oppErr } = await supabase
    .from('match_opportunities')
    .select('id, date_time, finalized_at, creator_id, revuelta_lineup, type, status')
    .eq('status', 'completed')

  if (oppErr || !opps?.length) {
    return { playerLastAt, teamLastAt }
  }

  const oppIds = opps.map((o) => o.id as string)
  const atByOpp = new Map(
    opps.map((o) => [
      o.id as string,
      matchPlayedAt(
        o.date_time as string,
        o.finalized_at as string | null | undefined
      ),
    ])
  )

  const { data: parts } = await supabase
    .from('match_opportunity_participants')
    .select('opportunity_id, user_id, status')
    .in('opportunity_id', oppIds)

  for (const p of parts ?? []) {
    const status = p.status as string
    if (status !== 'confirmed' && status !== 'pending') continue
    const at = atByOpp.get(p.opportunity_id as string)
    if (!at) continue
    bump(playerLastAt, p.user_id as string, at)
  }

  for (const o of opps) {
    const at = atByOpp.get(o.id as string)
    if (!at) continue
    bump(playerLastAt, o.creator_id as string, at)

    const lineup = parseRevueltaLineup(o.revuelta_lineup)
    if (lineup) {
      for (const uid of [...lineup.teamA.userIds, ...lineup.teamB.userIds]) {
        bump(playerLastAt, uid, at)
      }
    }
  }

  const rivalOppIds = opps
    .filter((o) => (o.type as string) === 'rival')
    .map((o) => o.id as string)

  if (rivalOppIds.length > 0) {
    const { data: rivals } = await supabase
      .from('rival_challenges')
      .select('opportunity_id, challenger_team_id, accepted_team_id')
      .in('opportunity_id', rivalOppIds)

    for (const r of rivals ?? []) {
      const at = atByOpp.get(r.opportunity_id as string)
      if (!at) continue
      const challenger = r.challenger_team_id as string | null
      const accepted = r.accepted_team_id as string | null
      if (challenger) bump(teamLastAt, challenger, at)
      if (accepted) bump(teamLastAt, accepted, at)
    }
  }

  return { playerLastAt, teamLastAt }
}
