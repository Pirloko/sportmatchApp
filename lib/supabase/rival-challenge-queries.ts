import type { SupabaseClient } from '@supabase/supabase-js'
import type { RivalChallenge } from '../types'

type RivalChallengeRow = {
  id: string
  opportunity_id: string
  challenger_team_id: string
  challenger_captain_id: string
  challenged_team_id: string | null
  challenged_captain_id: string | null
  accepted_team_id: string | null
  accepted_captain_id: string | null
  mode: 'direct' | 'open'
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  created_at: string
  responded_at: string | null
}

export async function fetchRivalChallengesForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<RivalChallenge[]> {
  const { data: captainTeams } = await supabase
    .from('teams')
    .select('id')
    .eq('captain_id', userId)
  const myTeamIds = (captainTeams ?? []).map((t) => t.id as string)

  const { data: directRows } = await supabase
    .from('rival_challenges')
    .select('*')
    .or(`challenger_captain_id.eq.${userId},challenged_captain_id.eq.${userId}`)
    .order('created_at', { ascending: false })

  const { data: openRows } = await supabase
    .from('rival_challenges')
    .select('*')
    .eq('mode', 'open')
    .eq('status', 'pending')
    .neq('challenger_captain_id', userId)
    .order('created_at', { ascending: false })

  const all = [
    ...(directRows ?? []),
    ...(openRows ?? []).filter(
      (r) => !myTeamIds.includes(r.challenger_team_id as string)
    ),
  ] as RivalChallengeRow[]
  if (all.length === 0) return []

  const teamIds = [...new Set(
    all.flatMap((r) => [
      r.challenger_team_id,
      r.challenged_team_id,
      r.accepted_team_id,
    ]).filter(Boolean) as string[]
  )]
  const oppIds = [...new Set(all.map((r) => r.opportunity_id))]

  const [{ data: teams }, { data: opps }] = await Promise.all([
    supabase.from('teams').select('id, name, captain_id').in('id', teamIds),
    supabase.from('match_opportunities').select('id, title').in('id', oppIds),
  ])

  const teamById = new Map(
    (teams ?? []).map((t) => [t.id as string, t] as const)
  )
  const oppById = new Map(
    (opps ?? []).map((o) => [o.id as string, o.title as string] as const)
  )

  return all.map((r) => ({
    id: r.id,
    opportunityId: r.opportunity_id,
    opportunityTitle: oppById.get(r.opportunity_id) ?? 'Desafío',
    mode: r.mode,
    status: r.status,
    challengerTeamId: r.challenger_team_id,
    challengerTeamName:
      (teamById.get(r.challenger_team_id)?.name as string) ?? 'Equipo',
    challengerCaptainId:
      (teamById.get(r.challenger_team_id)?.captain_id as string) ??
      r.challenger_captain_id,
    challengedTeamId: r.challenged_team_id ?? undefined,
    challengedTeamName: r.challenged_team_id
      ? ((teamById.get(r.challenged_team_id)?.name as string) ?? 'Equipo')
      : undefined,
    challengedCaptainId: r.challenged_captain_id ?? undefined,
    acceptedTeamId: r.accepted_team_id ?? undefined,
    acceptedTeamName: r.accepted_team_id
      ? ((teamById.get(r.accepted_team_id)?.name as string) ?? 'Equipo')
      : undefined,
    acceptedCaptainId: r.accepted_captain_id ?? undefined,
    createdAt: new Date(r.created_at),
    respondedAt: r.responded_at ? new Date(r.responded_at) : undefined,
  }))
}
