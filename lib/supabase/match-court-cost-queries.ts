import type { SupabaseClient } from '@supabase/supabase-js'

import {
  computeCourtCostFromHourly,
  type MatchCourtCost,
} from '../match-court-cost'
import type { MatchOpportunity } from '../types'

type ReservationCostRow = {
  price_per_hour: number | null
  starts_at: string
  ends_at: string
}

async function fetchReservationCostRow(
  supabase: SupabaseClient,
  opp: Pick<MatchOpportunity, 'id' | 'venueReservationId'>
): Promise<ReservationCostRow | null> {
  if (opp.venueReservationId) {
    const { data } = await supabase
      .from('venue_reservations')
      .select('price_per_hour, starts_at, ends_at')
      .eq('id', opp.venueReservationId)
      .maybeSingle()
    if (data?.price_per_hour != null && data.price_per_hour > 0) {
      return data as ReservationCostRow
    }
  }

  const { data } = await supabase
    .from('venue_reservations')
    .select('price_per_hour, starts_at, ends_at')
    .eq('match_opportunity_id', opp.id)
    .maybeSingle()

  if (data?.price_per_hour != null && data.price_per_hour > 0) {
    return data as ReservationCostRow
  }
  return null
}

/**
 * Costo de cancha desde la reserva vinculada o, en su defecto, la tarifa del
 * centro deportivo seleccionado (`sports_venue_id`).
 */
export async function fetchMatchCourtCost(
  supabase: SupabaseClient,
  opp: Pick<
    MatchOpportunity,
    | 'id'
    | 'sportsVenueId'
    | 'venueReservationId'
    | 'playersNeeded'
    | 'creatorName'
  >
): Promise<MatchCourtCost | null> {
  const playersNeeded = opp.playersNeeded ?? 0
  if (playersNeeded <= 0) return null

  const reservation = await fetchReservationCostRow(supabase, opp)
  if (reservation?.price_per_hour) {
    const durationMinutes =
      (new Date(reservation.ends_at).getTime() -
        new Date(reservation.starts_at).getTime()) /
      60_000
    return computeCourtCostFromHourly(
      reservation.price_per_hour,
      durationMinutes > 0 ? durationMinutes : 60,
      playersNeeded
    )
  }

  if (!opp.sportsVenueId) return null

  const [{ data: venueRow }, { data: courts }] = await Promise.all([
    supabase
      .from('sports_venues')
      .select('slot_duration_minutes')
      .eq('id', opp.sportsVenueId)
      .maybeSingle(),
    supabase
      .from('venue_courts')
      .select('price_per_hour, sort_order, name')
      .eq('venue_id', opp.sportsVenueId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
  ])

  const court = (courts ?? []).find(
    (c) =>
      typeof c.price_per_hour === 'number' && (c.price_per_hour as number) > 0
  )
  if (!court || typeof court.price_per_hour !== 'number') return null

  const durationMinutes =
    (venueRow?.slot_duration_minutes as number | null) ?? 60

  return computeCourtCostFromHourly(
    court.price_per_hour,
    durationMinutes,
    playersNeeded
  )
}

type OppCostInput = Pick<
  MatchOpportunity,
  'id' | 'type' | 'sportsVenueId' | 'venueReservationId' | 'playersNeeded'
>

function costFromReservationRow(
  row: ReservationCostRow,
  playersNeeded: number
): MatchCourtCost | null {
  if (row.price_per_hour == null || row.price_per_hour <= 0) return null
  const durationMinutes =
    (new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) /
    60_000
  return computeCourtCostFromHourly(
    row.price_per_hour,
    durationMinutes > 0 ? durationMinutes : 60,
    playersNeeded
  )
}

/** Varias oportunidades en una sola ronda de consultas (listas / home). */
export async function fetchMatchCourtCostsBatch(
  supabase: SupabaseClient,
  opportunities: OppCostInput[]
): Promise<Map<string, MatchCourtCost>> {
  const out = new Map<string, MatchCourtCost>()
  const eligible = opportunities.filter(
    (o) =>
      o.type !== 'rival' &&
      (o.sportsVenueId || o.venueReservationId) &&
      (o.playersNeeded ?? 0) > 0
  )
  if (!eligible.length) return out

  const oppIds = eligible.map((o) => o.id)
  const reservationIds = [
    ...new Set(
      eligible
        .map((o) => o.venueReservationId)
        .filter((id): id is string => Boolean(id))
    ),
  ]
  const venueIds = [
    ...new Set(
      eligible
        .map((o) => o.sportsVenueId)
        .filter((id): id is string => Boolean(id))
    ),
  ]

  const [byOppRes, byIdRes, venuesRes, courtsRes] = await Promise.all([
    supabase
      .from('venue_reservations')
      .select('match_opportunity_id, price_per_hour, starts_at, ends_at')
      .in('match_opportunity_id', oppIds),
    reservationIds.length
      ? supabase
          .from('venue_reservations')
          .select('id, price_per_hour, starts_at, ends_at')
          .in('id', reservationIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    venueIds.length
      ? supabase
          .from('sports_venues')
          .select('id, slot_duration_minutes')
          .in('id', venueIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    venueIds.length
      ? supabase
          .from('venue_courts')
          .select('venue_id, price_per_hour, sort_order, name')
          .in('venue_id', venueIds)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true })
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])

  const resByOppId = new Map<string, ReservationCostRow>()
  for (const row of byOppRes.data ?? []) {
    const oppId = row.match_opportunity_id as string | null
    if (!oppId) continue
    resByOppId.set(oppId, row as ReservationCostRow)
  }

  const resById = new Map<string, ReservationCostRow>()
  for (const row of byIdRes.data ?? []) {
    resById.set(row.id as string, row as ReservationCostRow)
  }

  const durationByVenue = new Map<string, number>()
  for (const row of venuesRes.data ?? []) {
    durationByVenue.set(
      row.id as string,
      (row.slot_duration_minutes as number | null) ?? 60
    )
  }

  const priceByVenue = new Map<string, number>()
  for (const row of courtsRes.data ?? []) {
    const venueId = row.venue_id as string
    if (priceByVenue.has(venueId)) continue
    const price = row.price_per_hour as number | null
    if (typeof price === 'number' && price > 0) {
      priceByVenue.set(venueId, price)
    }
  }

  for (const opp of eligible) {
    const playersNeeded = opp.playersNeeded!
    let cost: MatchCourtCost | null = null

    if (opp.venueReservationId) {
      const row = resById.get(opp.venueReservationId)
      if (row) cost = costFromReservationRow(row, playersNeeded)
    }
    if (!cost) {
      const row = resByOppId.get(opp.id)
      if (row) cost = costFromReservationRow(row, playersNeeded)
    }
    if (!cost && opp.sportsVenueId) {
      const price = priceByVenue.get(opp.sportsVenueId)
      if (price) {
        cost = computeCourtCostFromHourly(
          price,
          durationByVenue.get(opp.sportsVenueId) ?? 60,
          playersNeeded
        )
      }
    }
    if (cost) out.set(opp.id, cost)
  }

  return out
}
