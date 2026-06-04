import type { SupabaseClient } from '@supabase/supabase-js'
import { authLog } from '../auth/auth-debug'
import type { Gender } from '../types'
import type { MatchOpportunity, User } from '../types'
import {
  mapMatchOpportunityFromDb,
  profileRowToUser,
  type CreatorSnippet,
  type MatchOpportunityRow,
  type ProfileRow,
} from './mappers'

export async function fetchProfileForUser(
  supabase: SupabaseClient,
  userId: string,
  email: string
): Promise<User | null> {
  authLog('Hydrate', 'fetchProfileForUser SQL', {
    table: 'profiles',
    user_id: userId,
  })

  const { data, error } = await supabase
    .from('profiles')
    .select(
      `
      *,
      geo_cities:city_id (
        region_id
      )
    `
    )
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    authLog('Hydrate', 'fetchProfileForUser error', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
    return null
  }

  if (!data) {
    authLog('Hydrate', 'fetchProfileForUser no row (maybeSingle null)', {
      user_id: userId,
    })
    return null
  }

  authLog('Hydrate', 'fetchProfileForUser OK', { user_id: userId })
  return profileRowToUser(data as ProfileRow, email)
}

export async function fetchMatchOpportunities(
  supabase: SupabaseClient
): Promise<MatchOpportunity[]> {
  const { data: opps, error } = await supabase
    .from('match_opportunities')
    .select('*')
    .order('date_time', { ascending: true })

  if (error || !opps?.length) return []

  const rows = opps as MatchOpportunityRow[]
  const opportunityIds = rows.map((r) => r.id)
  const creatorIds = [...new Set(rows.map((r) => r.creator_id))]
  const { data: creators } = await supabase
    .from('profiles')
    .select('id, name, photo_url, account_type')
    .in('id', creatorIds)

  const { data: parts } = await supabase
    .from('match_opportunity_participants')
    .select('opportunity_id, status')
    .in('opportunity_id', opportunityIds)

  const byId = new Map(
    (creators ?? []).map((c) => {
      const isAdmin = (c as { account_type?: string | null }).account_type === 'admin'
      const snippet: CreatorSnippet = {
        id: c.id as string,
        name: isAdmin ? 'SportMatch' : ((c.name as string) || 'Jugador'),
        photo_url: (c.photo_url as string) || '',
      }
      return [c.id, snippet] as const
    })
  )
  const joinedByOpportunity = new Map<string, number>()
  for (const p of parts ?? []) {
    const oid = p.opportunity_id as string
    const status = p.status as string
    if (status !== 'pending' && status !== 'confirmed') continue
    joinedByOpportunity.set(oid, (joinedByOpportunity.get(oid) ?? 0) + 1)
  }

  return rows.map((row) => {
    const joined = joinedByOpportunity.get(row.id)
    const withSafeJoined: MatchOpportunityRow =
      joined === undefined ? row : { ...row, players_joined: joined }
    return mapMatchOpportunityFromDb(
      withSafeJoined,
      byId.get(row.creator_id) ?? null
    )
  })
}

function placeholderEmail(id: string) {
  return `jugador-${id.slice(0, 8)}@pichanga.local`
}

export async function fetchOtherProfiles(
  supabase: SupabaseClient,
  currentUserId: string,
  gender: Gender
): Promise<User[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      `
      *,
      geo_cities:city_id (
        region_id
      )
    `
    )
    .eq('gender', gender)
    .eq('account_type', 'player')
    .neq('id', currentUserId)

  if (error || !data) return []

  const rows = data as ProfileRow[]
  return rows.map((row) => profileRowToUser(row, placeholderEmail(row.id)))
}
