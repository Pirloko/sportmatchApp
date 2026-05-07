import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_AVATAR } from './mappers'

export async function fetchParticipatingOpportunityIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data: parts } = await supabase
    .from('match_opportunity_participants')
    .select('opportunity_id')
    .eq('user_id', userId)

  return [
    ...new Set(
      (parts ?? []).map((p) => p.opportunity_id as string)
    ),
  ]
}

export async function fetchInvitedOpportunityIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data: parts } = await supabase
    .from('match_opportunity_participants')
    .select('opportunity_id')
    .eq('user_id', userId)
    .eq('status', 'invited')

  return [...new Set((parts ?? []).map((p) => p.opportunity_id as string))]
}

export type ChatMessageRow = {
  id: string
  senderId: string
  content: string
  createdAt: Date
  senderName: string
  senderPhoto: string
}

export async function fetchMessagesForOpportunity(
  supabase: SupabaseClient,
  opportunityId: string
): Promise<ChatMessageRow[]> {
  const { data: msgs, error } = await supabase
    .from('messages')
    .select('id, sender_id, content, created_at')
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: true })

  if (error || !msgs?.length) return []

  const senderIds = [...new Set(msgs.map((m) => m.sender_id as string))]
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, name, photo_url')
    .in('id', senderIds)

  const pmap = new Map(
    (profs ?? []).map((p) => [p.id as string, p] as const)
  )

  return msgs.map((m) => {
    const p = pmap.get(m.sender_id as string)
    return {
      id: m.id as string,
      senderId: m.sender_id as string,
      content: m.content as string,
      createdAt: new Date(m.created_at as string),
      senderName: p?.name ?? 'Jugador',
      senderPhoto: p?.photo_url || DEFAULT_AVATAR,
    }
  })
}

export type LastMessagePreview = {
  opportunityId: string
  content: string
  createdAt: Date
}

export async function fetchLastMessagesForOpportunities(
  supabase: SupabaseClient,
  opportunityIds: string[]
): Promise<Map<string, LastMessagePreview>> {
  const map = new Map<string, LastMessagePreview>()
  if (opportunityIds.length === 0) return map

  const { data: rows, error } = await supabase
    .from('messages')
    .select('opportunity_id, content, created_at')
    .in('opportunity_id', opportunityIds)
    .order('created_at', { ascending: false })

  if (error || !rows) return map

  for (const r of rows) {
    const oid = r.opportunity_id as string
    if (map.has(oid)) continue
    map.set(oid, {
      opportunityId: oid,
      content: r.content as string,
      createdAt: new Date(r.created_at as string),
    })
  }

  return map
}

export type OpportunityParticipantRow = {
  id: string
  name: string
  photo: string
  status: 'creator' | 'confirmed' | 'pending' | 'invited' | 'cancelled'
  isGoalkeeper?: boolean
}

export async function fetchParticipantsForOpportunity(
  supabase: SupabaseClient,
  opportunityId: string
): Promise<OpportunityParticipantRow[]> {
  const { data: opp } = await supabase
    .from('match_opportunities')
    .select('creator_id')
    .eq('id', opportunityId)
    .maybeSingle()

  const creatorId = opp?.creator_id as string | undefined

  const { data: parts } = await supabase
    .from('match_opportunity_participants')
    .select('user_id, status, is_goalkeeper')
    .eq('opportunity_id', opportunityId)

  const userIds = new Set<string>()
  if (creatorId) userIds.add(creatorId)
  for (const p of parts ?? []) userIds.add(p.user_id as string)

  if (userIds.size === 0) return []

  const { data: profs } = await supabase
    .from('profiles')
    .select('id, name, photo_url')
    .in('id', [...userIds])

  const byId = new Map((profs ?? []).map((r) => [r.id as string, r] as const))

  const partByUser = new Map(
    (parts ?? []).map((p) => [p.user_id as string, p] as const)
  )
  const creatorPart = creatorId ? partByUser.get(creatorId) : undefined

  const out: OpportunityParticipantRow[] = []
  if (creatorId) {
    const c = byId.get(creatorId)
    out.push({
      id: creatorId,
      name: (c?.name as string) || 'Organizador',
      photo: (c?.photo_url as string) || DEFAULT_AVATAR,
      status: 'creator',
      isGoalkeeper: creatorPart ? creatorPart.is_goalkeeper === true : false,
    })
  }

  for (const p of parts ?? []) {
    const uid = p.user_id as string
    if (uid === creatorId) continue
    const u = byId.get(uid)
    out.push({
      id: uid,
      name: (u?.name as string) || 'Jugador',
      photo: (u?.photo_url as string) || DEFAULT_AVATAR,
      status: (p.status as OpportunityParticipantRow['status']) || 'pending',
      isGoalkeeper: p.is_goalkeeper === true,
    })
  }

  return out
}
