import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Gender,
  Level,
  Position,
  Team,
  TeamInvite,
  TeamJoinRequest,
  TeamMember,
  TeamPrivateSettings,
} from '../types'
import { DEFAULT_AVATAR } from './mappers'

export async function fetchTeamsWithMembers(
  supabase: SupabaseClient
): Promise<Team[]> {
  const { data: teamRows, error } = await supabase
    .from('teams')
    .select(
      `
      *,
      geo_cities:city_id (
        region_id
      )
    `
    )
    .order('created_at', { ascending: false })

  if (error || !teamRows?.length) return []

  const teamIds = teamRows.map((t) => t.id as string)

  const { data: memberRows } = await supabase
    .from('team_members')
    .select('team_id, user_id, position, photo_url, status')
    .in('team_id', teamIds)

  const userIds = [...new Set((memberRows ?? []).map((m) => m.user_id as string))]
  if (userIds.length === 0) {
    return teamRows.map((t) => mapTeamRow(t, []))
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, photo_url')
    .in('id', userIds)

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p] as const)
  )

  const membersByTeam = new Map<string, TeamMember[]>()
  for (const m of memberRows ?? []) {
    const uid = m.user_id as string
    const tid = m.team_id as string
    const p = profileById.get(uid)
    const tm: TeamMember = {
      id: uid,
      name: p?.name ?? 'Jugador',
      position: m.position as Position,
      photo: (m.photo_url as string) || p?.photo_url || DEFAULT_AVATAR,
      status: m.status as TeamMember['status'],
    }
    const list = membersByTeam.get(tid) ?? []
    list.push(tm)
    membersByTeam.set(tid, list)
  }

  return teamRows.map((t) => mapTeamRow(t, membersByTeam.get(t.id as string) ?? []))
}

function mapTeamRow(
  t: Record<string, unknown>,
  members: TeamMember[]
): Team {
  const geoRaw = t.geo_cities as
    | { region_id?: string }
    | { region_id?: string }[]
    | null
    | undefined
  let homeRegionId: string | null = null
  if (geoRaw) {
    const g = Array.isArray(geoRaw) ? geoRaw[0] : geoRaw
    homeRegionId = g?.region_id ?? null
  }
  return {
    id: t.id as string,
    name: t.name as string,
    logo: (t.logo_url as string | null) ?? undefined,
    level: t.level as Level,
    captainId: t.captain_id as string,
    viceCaptainId: (t.vice_captain_id as string | null) ?? null,
    members,
    city: t.city as string,
    gender: t.gender as Gender,
    description: (t.description as string | null) ?? undefined,
    createdAt: new Date(t.created_at as string),
    cityId: (t.city_id as string | null) ?? null,
    homeRegionId,
    statsWins: Number(t.stats_wins ?? 0),
    statsDraws: Number(t.stats_draws ?? 0),
    statsLosses: Number(t.stats_losses ?? 0),
    statsWinStreak: Number(t.stats_win_streak ?? 0),
    statsLossStreak: Number(t.stats_loss_streak ?? 0),
  }
}

export async function fetchTeamInvitesForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<TeamInvite[]> {
  const { data: invs, error } = await supabase
    .from('team_invites')
    .select('*')
    .or(`invitee_id.eq.${userId},inviter_id.eq.${userId}`)
    .order('created_at', { ascending: false })

  if (error || !invs?.length) return []

  const teamIds = [...new Set(invs.map((i) => i.team_id as string))]
  const inviterIds = [...new Set(invs.map((i) => i.inviter_id as string))]

  const [{ data: teamRows }, { data: profs }] = await Promise.all([
    supabase.from('teams').select('id, name').in('id', teamIds),
    supabase.from('profiles').select('id, name').in('id', inviterIds),
  ])

  const teamName = new Map(
    (teamRows ?? []).map((t) => [t.id as string, t.name as string])
  )
  const inviterName = new Map(
    (profs ?? []).map((p) => [p.id as string, p.name as string])
  )

  return invs.map((i) => ({
    id: i.id as string,
    teamId: i.team_id as string,
    teamName: teamName.get(i.team_id as string) ?? 'Equipo',
    inviterId: i.inviter_id as string,
    inviterName: inviterName.get(i.inviter_id as string) ?? '',
    inviteeId: i.invitee_id as string,
    status: i.status as TeamInvite['status'],
    createdAt: new Date(i.created_at as string),
  }))
}

export async function fetchTeamJoinRequestsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<TeamJoinRequest[]> {
  const { data: captainTeams } = await supabase
    .from('teams')
    .select('id')
    .eq('captain_id', userId)

  const captainTeamIds = (captainTeams ?? []).map((t) => t.id as string)

  let query = supabase
    .from('team_join_requests')
    .select('*')
    .order('created_at', { ascending: false })

  if (captainTeamIds.length > 0) {
    query = query.or(
      `requester_id.eq.${userId},team_id.in.(${captainTeamIds.join(',')})`
    )
  } else {
    query = query.eq('requester_id', userId)
  }

  const { data: rows, error } = await query
  if (error || !rows?.length) return []

  const teamIds = [...new Set(rows.map((r) => r.team_id as string))]
  const requesterIds = [...new Set(rows.map((r) => r.requester_id as string))]

  const [{ data: teamRows }, { data: profs }] = await Promise.all([
    supabase.from('teams').select('id, name').in('id', teamIds),
    supabase.from('profiles').select('id, name, photo_url').in('id', requesterIds),
  ])

  const teamName = new Map(
    (teamRows ?? []).map((t) => [t.id as string, t.name as string])
  )
  const requesterMeta = new Map(
    (profs ?? []).map((p) => [
      p.id as string,
      { name: p.name as string, photo: (p.photo_url as string) || DEFAULT_AVATAR },
    ])
  )

  return rows.map((r) => {
    const rid = r.requester_id as string
    const meta = requesterMeta.get(rid)
    return {
      id: r.id as string,
      teamId: r.team_id as string,
      teamName: teamName.get(r.team_id as string) ?? 'Equipo',
      requesterId: rid,
      requesterName: meta?.name ?? 'Jugador',
      requesterPhoto: meta?.photo ?? DEFAULT_AVATAR,
      status: r.status as TeamJoinRequest['status'],
      createdAt: new Date(r.created_at as string),
    }
  })
}

export async function fetchTeamPrivateSettings(
  supabase: SupabaseClient,
  teamId: string
): Promise<TeamPrivateSettings | null> {
  const { data, error } = await supabase
    .from('team_private_settings')
    .select('team_id, whatsapp_invite_url, rules_text')
    .eq('team_id', teamId)
    .maybeSingle()

  if (error || !data) return null
  return {
    teamId: data.team_id as string,
    whatsappInviteUrl: (data.whatsapp_invite_url as string | null)?.trim() || null,
    rulesText: (data.rules_text as string | null)?.trim() || null,
  }
}
