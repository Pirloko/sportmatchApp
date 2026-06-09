import type { SupabaseClient } from '@supabase/supabase-js'

export type MatchOpportunityRatingRow = {
  id: string
  opportunity_id: string
  rater_id: string
  /** Legacy: reseñas anteriores a la unificación. */
  organizer_rating?: number | null
  venue_rating: number | null
  match_rating: number
  level_rating: number
  mvp_user_id: string | null
  comment: string | null
  created_at: string
}

export type RatingSummary = {
  opportunityId: string
  count: number
  avgVenue: number | null
  avgMatch: number | null
  avgLevel: number | null
  avgOverall: number | null
  mvpTally: { userId: string; votes: number }[]
}

export type SubmitMatchReviewPayload = {
  venueRating: number
  matchRating: number
  levelRating: number
  mvpUserId: string
  comment?: string
}

export type MatchDetailRatingsBundle = {
  ratingRows: Array<{
    opportunity_id: string
    venue_rating: number | null
    match_rating: number
    level_rating: number
    mvp_user_id: string | null
    organizer_rating?: number | null
  }>
  comments: Array<{ comment: string; created_at: string }>
  myRating: MatchOpportunityRatingRow | null
}

/** Ventana post-partido (reseñas + chat): 24 h desde finalized_at. */
export const MATCH_POST_FINALIZE_WINDOW_MS = 24 * 60 * 60 * 1000

export function getRatingDeadline(finalizedAt: Date): Date {
  return new Date(finalizedAt.getTime() + MATCH_POST_FINALIZE_WINDOW_MS)
}

export function isRatingWindowOpen(finalizedAt: Date | undefined): boolean {
  if (!finalizedAt) return false
  return Date.now() <= getRatingDeadline(finalizedAt).getTime()
}

/**
 * ¿Se pueden enviar mensajes en el chat del partido?
 * - Partidos no finalizados: sí.
 * - Cancelados: no.
 * - Finalizados: solo durante 24 h posteriores a `finalizedAt`.
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

function venueValue(row: MatchOpportunityRatingRow): number | null {
  if (typeof row.venue_rating === 'number') return row.venue_rating
  if (typeof row.organizer_rating === 'number') return row.organizer_rating
  return null
}

export function tallyMvpVotes(
  mvpUserIds: (string | null | undefined)[]
): { userId: string; votes: number }[] {
  const counts = new Map<string, number>()
  for (const id of mvpUserIds) {
    if (!id) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([userId, votes]) => ({ userId, votes }))
    .sort((a, b) => b.votes - a.votes)
}

/** MVP(s) del partido: todos los que empatan en el máximo de votos. */
export function getMvpWinnersFromTally(
  tally: { userId: string; votes: number }[]
): { userId: string; votes: number }[] {
  if (tally.length === 0) return []
  const maxVotes = tally[0].votes
  return tally.filter((entry) => entry.votes === maxVotes)
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
      avgVenue: null,
      avgMatch: null,
      avgLevel: null,
      avgOverall: null,
      mvpTally: [],
    }
  }

  const venueVals = rows
    .map(venueValue)
    .filter((v): v is number => typeof v === 'number')
  const matchVals = rows.map((r) => r.match_rating)
  const levelVals = rows.map((r) => r.level_rating)
  const overallVals = rows.flatMap((r) => {
    const venue = venueValue(r)
    return venue != null
      ? [venue, r.match_rating, r.level_rating]
      : [r.match_rating, r.level_rating]
  })

  const avg = (vals: number[]) =>
    vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null

  return {
    opportunityId,
    count,
    avgVenue: avg(venueVals),
    avgMatch: avg(matchVals),
    avgLevel: avg(levelVals),
    avgOverall: avg(overallVals),
    mvpTally: tallyMvpVotes(rows.map((r) => r.mvp_user_id)),
  }
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

export async function fetchMatchDetailRatingsBundle(
  supabase: SupabaseClient,
  opportunityId: string
): Promise<MatchDetailRatingsBundle> {
  const { data, error } = await supabase.rpc('match_detail_ratings_bundle', {
    p_opportunity_id: opportunityId,
  })

  if (error || !data || typeof data !== 'object') {
    return { ratingRows: [], comments: [], myRating: null }
  }

  const bundle = data as {
    rating_rows?: MatchDetailRatingsBundle['ratingRows']
    comments?: MatchDetailRatingsBundle['comments']
    my_rating?: MatchOpportunityRatingRow | null
  }

  return {
    ratingRows: bundle.rating_rows ?? [],
    comments: bundle.comments ?? [],
    myRating: bundle.my_rating ?? null,
  }
}
