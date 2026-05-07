import type { SupabaseClient } from '@supabase/supabase-js'

export type MatchOpportunityRatingRow = {
  id: string
  opportunity_id: string
  rater_id: string
  organizer_rating: number | null
  match_rating: number
  level_rating: number
  comment: string | null
  created_at: string
}

export type RatingSummary = {
  opportunityId: string
  count: number
  avgOrganizer: number | null
  avgMatch: number | null
  avgLevel: number | null
  avgOverall: number | null
}

export async function fetchMyRatingForOpportunity(
  supabase: SupabaseClient,
  opportunityId: string,
  userId: string
): Promise<MatchOpportunityRatingRow | null> {
  const { data, error } = await supabase
    .from('match_opportunity_ratings')
    .select('*')
    .eq('opportunity_id', opportunityId)
    .eq('rater_id', userId)
    .maybeSingle()

  if (error || !data) return null
  return data as MatchOpportunityRatingRow
}

/** Ventana de 48 h desde finalized_at (solo UI). */
export function getRatingDeadline(finalizedAt: Date): Date {
  return new Date(finalizedAt.getTime() + 48 * 60 * 60 * 1000)
}

export function isRatingWindowOpen(finalizedAt: Date | undefined): boolean {
  if (!finalizedAt) return false
  return Date.now() <= getRatingDeadline(finalizedAt).getTime()
}

/**
 * ¿Se pueden enviar mensajes en el chat del partido?
 * - Partidos no finalizados: sí.
 * - Cancelados: no.
 * - Finalizados: solo durante las mismas 48 h posteriores a `finalizedAt` que las reseñas.
 */
export function isMatchChatMessagingOpen(opp: {
  status: string
  finalizedAt?: Date
}): boolean {
  if (opp.status === 'cancelled') return false
  if (opp.status !== 'completed') return true
  const fa = opp.finalizedAt
  if (!fa) return true
  return isRatingWindowOpen(fa)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function buildSummary(
  opportunityId: string,
  rows: MatchOpportunityRatingRow[]
): RatingSummary {
  const count = rows.length
  if (count === 0) {
    return {
      opportunityId,
      count: 0,
      avgOrganizer: null,
      avgMatch: null,
      avgLevel: null,
      avgOverall: null,
    }
  }

  const organizerVals = rows
    .map((r) => r.organizer_rating)
    .filter((v): v is number => typeof v === 'number')
  const matchVals = rows.map((r) => r.match_rating)
  const levelVals = rows.map((r) => r.level_rating)
  const overallVals = rows.flatMap((r) =>
    r.organizer_rating == null
      ? [r.match_rating, r.level_rating]
      : [r.organizer_rating, r.match_rating, r.level_rating]
  )

  const avg = (vals: number[]) =>
    vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null

  return {
    opportunityId,
    count,
    avgOrganizer: avg(organizerVals),
    avgMatch: avg(matchVals),
    avgLevel: avg(levelVals),
    avgOverall: avg(overallVals),
  }
}

export async function fetchRatingSummaryForOpportunity(
  supabase: SupabaseClient,
  opportunityId: string
): Promise<RatingSummary> {
  const { data, error } = await supabase
    .from('match_opportunity_ratings')
    .select('*')
    .eq('opportunity_id', opportunityId)

  const rows = error || !data ? [] : (data as MatchOpportunityRatingRow[])
  return buildSummary(opportunityId, rows)
}

export async function fetchRatingSummariesForOpportunities(
  supabase: SupabaseClient,
  opportunityIds: string[]
): Promise<Map<string, RatingSummary>> {
  const out = new Map<string, RatingSummary>()
  if (opportunityIds.length === 0) return out

  const { data, error } = await supabase
    .from('match_opportunity_ratings')
    .select('*')
    .in('opportunity_id', opportunityIds)

  const rows = error || !data ? [] : (data as MatchOpportunityRatingRow[])
  const grouped = new Map<string, MatchOpportunityRatingRow[]>()
  for (const id of opportunityIds) grouped.set(id, [])
  for (const r of rows) {
    const oid = r.opportunity_id
    const list = grouped.get(oid)
    if (list) list.push(r)
  }

  for (const [oid, list] of grouped) {
    out.set(oid, buildSummary(oid, list))
  }
  return out
}

export async function fetchRecentRatingCommentsForOpportunity(
  supabase: SupabaseClient,
  opportunityId: string,
  limit = 4
): Promise<Array<{ comment: string; createdAt: Date }>> {
  const { data, error } = await supabase
    .from('match_opportunity_ratings')
    .select('comment, created_at')
    .eq('opportunity_id', opportunityId)
    .not('comment', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data
    .filter((r) => !!r.comment)
    .map((r) => ({
      comment: r.comment as string,
      createdAt: new Date(r.created_at as string),
    }))
}
