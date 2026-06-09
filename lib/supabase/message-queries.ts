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
    .in('status', ['pending', 'confirmed'])

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

/** Tamaño por defecto de página del hilo (últimos N mensajes y “cargar anteriores”). */
export const CHAT_MESSAGES_PAGE_SIZE = 40

/** Cursor keyset: mensaje más antiguo ya cargado (orden cronológico ascendente en UI). */
export type ChatMessagePageCursor = {
  createdAtIso: string
  id: string
}

type RawMessageRow = {
  id: string
  sender_id: string
  content: string
  created_at: string
}

async function mapRawMessagesToChatRows(
  supabase: SupabaseClient,
  msgs: RawMessageRow[]
): Promise<ChatMessageRow[]> {
  if (!msgs.length) return []

  const senderIds = [...new Set(msgs.map((m) => m.sender_id))]
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, name, photo_url')
    .in('id', senderIds)

  const pmap = new Map(
    (profs ?? []).map((p) => [p.id as string, p] as const)
  )

  return msgs.map((m) => {
    const p = pmap.get(m.sender_id)
    return {
      id: m.id,
      senderId: m.sender_id,
      content: m.content,
      createdAt: new Date(m.created_at),
      senderName: (p?.name as string) ?? 'Jugador',
      senderPhoto: (p?.photo_url as string) || DEFAULT_AVATAR,
    }
  })
}

/**
 * Página del hilo: orden interno de consulta descendente (más recientes primero),
 * devuelve `rows` en orden cronológico ascendente (antiguo → reciente) para la UI.
 */
export async function fetchChatMessagesPage(
  supabase: SupabaseClient,
  opportunityId: string,
  before: ChatMessagePageCursor | null,
  limit: number
): Promise<{ rows: ChatMessageRow[]; hasMore: boolean }> {
  const pageSize = Math.max(1, limit)
  const fetchLimit = pageSize + 1

  let q = supabase
    .from('messages')
    .select('id, sender_id, content, created_at')
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(fetchLimit)

  if (before) {
    const iso = before.createdAtIso
    const id = before.id
    q = q.or(`created_at.lt."${iso}",and(created_at.eq."${iso}",id.lt."${id}")`)
  }

  const { data: raw, error } = await q
  if (error || !raw?.length) {
    return { rows: [], hasMore: false }
  }

  const hasMore = raw.length > pageSize
  const slice = (hasMore ? raw.slice(0, pageSize) : raw) as RawMessageRow[]
  const chronological = slice.slice().reverse()
  const rows = await mapRawMessagesToChatRows(supabase, chronological)
  return { rows, hasMore }
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

  return mapRawMessagesToChatRows(supabase, msgs as RawMessageRow[])
}

/**
 * Convierte un registro INSERT de realtime (o `.select()` tras insert) en `ChatMessageRow`.
 * Evita refetch completo del hilo al llegar un mensaje nuevo.
 */
export async function hydrateChatMessageFromInsert(
  supabase: SupabaseClient,
  raw: unknown
): Promise<ChatMessageRow | null> {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = r.id
  const senderId = r.sender_id
  const content = r.content
  const createdAt = r.created_at
  if (
    typeof id !== 'string' ||
    typeof senderId !== 'string' ||
    typeof content !== 'string' ||
    typeof createdAt !== 'string'
  ) {
    return null
  }

  const { data: p } = await supabase
    .from('profiles')
    .select('name, photo_url')
    .eq('id', senderId)
    .maybeSingle()

  return {
    id,
    senderId,
    content,
    createdAt: new Date(createdAt),
    senderName: (p?.name as string) ?? 'Jugador',
    senderPhoto: (p?.photo_url as string) || DEFAULT_AVATAR,
  }
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
  /** Posición de perfil (fallback si no hay encounter_lineup_role). */
  position?: string
  status: 'creator' | 'confirmed' | 'pending' | 'invited' | 'cancelled'
  isGoalkeeper?: boolean
  pickTeam?: 'A' | 'B'
  encounterRole?: 'gk' | 'defensa' | 'mediocampista' | 'delantero'
  /** Cupo visual en partidos rival (`gk`, `def_0`, `bench_0`, …). */
  lineupSlot?: string
}

function parseEncounterRole(
  raw: unknown
): OpportunityParticipantRow['encounterRole'] | undefined {
  if (
    raw === 'gk' ||
    raw === 'defensa' ||
    raw === 'mediocampista' ||
    raw === 'delantero'
  ) {
    return raw
  }
  return undefined
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
    .select(
      'user_id, status, is_goalkeeper, pick_team, encounter_lineup_role, lineup_slot'
    )
    .eq('opportunity_id', opportunityId)

  const userIds = new Set<string>()
  if (creatorId) userIds.add(creatorId)
  for (const p of parts ?? []) userIds.add(p.user_id as string)

  if (userIds.size === 0) return []

  const { data: profs } = await supabase
    .from('profiles')
    .select('id, name, photo_url, position')
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
      position: (c?.position as string) || undefined,
      status: 'creator',
      isGoalkeeper: creatorPart ? creatorPart.is_goalkeeper === true : false,
      pickTeam:
        creatorPart?.pick_team === 'A' || creatorPart?.pick_team === 'B'
          ? creatorPart.pick_team
          : undefined,
      encounterRole: parseEncounterRole(creatorPart?.encounter_lineup_role),
      lineupSlot: (creatorPart?.lineup_slot as string | null) ?? undefined,
    })
  }

  for (const p of parts ?? []) {
    const uid = p.user_id as string
    if (uid === creatorId) continue
    const partStatus = (p.status as string) || 'pending'
    if (partStatus === 'cancelled' || partStatus === 'rejected') continue
    const u = byId.get(uid)
    out.push({
      id: uid,
      name: (u?.name as string) || 'Jugador',
      photo: (u?.photo_url as string) || DEFAULT_AVATAR,
      position: (u?.position as string) || undefined,
      status: (p.status as OpportunityParticipantRow['status']) || 'pending',
      isGoalkeeper: p.is_goalkeeper === true,
      pickTeam:
        p.pick_team === 'A' || p.pick_team === 'B' ? p.pick_team : undefined,
      encounterRole: parseEncounterRole(p.encounter_lineup_role),
      lineupSlot: (p.lineup_slot as string | null) ?? undefined,
    })
  }

  return out
}
