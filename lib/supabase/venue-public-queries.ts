import type { SupabaseClient } from '@supabase/supabase-js'

import { isValidTeamInviteId } from '../team-invite-url'
import type {
  SportsVenue,
  VenueCourt,
  VenueReservationRow,
  VenueWeeklyHour,
} from '../types'

function mapVenueRow(r: Record<string, unknown>): SportsVenue {
  return {
    id: r.id as string,
    ownerId: r.owner_id as string,
    name: r.name as string,
    address: (r.address as string) ?? '',
    mapsUrl: (r.maps_url as string | null) ?? null,
    phone: (r.phone as string) ?? '',
    city: (r.city as string) ?? 'Rancagua',
    slotDurationMinutes: (r.slot_duration_minutes as number) ?? 60,
    createdAt: new Date(r.created_at as string),
  }
}

export type PublicVenuePageData = {
  venue: SportsVenue
  courts: VenueCourt[]
  weeklyHours: VenueWeeklyHour[]
}

/** Datos públicos del centro (SELECT con anon; políticas RLS públicas). */
export async function fetchPublicVenuePageData(
  supabase: SupabaseClient,
  venueId: string
): Promise<PublicVenuePageData | null> {
  if (!isValidTeamInviteId(venueId)) return null

  const { data: row, error: vErr } = await supabase
    .from('sports_venues')
    .select('*')
    .eq('id', venueId)
    .maybeSingle()

  if (vErr || !row) return null

  const venue = mapVenueRow(row as Record<string, unknown>)

  const [courts, weeklyHours] = await Promise.all([
    fetchVenueCourts(supabase, venueId),
    fetchVenueWeeklyHours(supabase, venueId),
  ])

  return { venue, courts, weeklyHours }
}

export async function fetchVenueCourts(
  supabase: SupabaseClient,
  venueId: string
): Promise<VenueCourt[]> {
  const { data, error } = await supabase
    .from('venue_courts')
    .select('*')
    .eq('venue_id', venueId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error || !data) return []
  return data.map((r) => ({
    id: r.id as string,
    venueId: r.venue_id as string,
    name: r.name as string,
    sortOrder: (r.sort_order as number) ?? 0,
  }))
}

export async function fetchVenueWeeklyHours(
  supabase: SupabaseClient,
  venueId: string
): Promise<VenueWeeklyHour[]> {
  const { data, error } = await supabase
    .from('venue_weekly_hours')
    .select('*')
    .eq('venue_id', venueId)
    .order('day_of_week', { ascending: true })
  if (error || !data) return []
  return data.map((r) => ({
    id: r.id as string,
    venueId: r.venue_id as string,
    dayOfWeek: r.day_of_week as number,
    openTime: (r.open_time as string).slice(0, 5),
    closeTime: (r.close_time as string).slice(0, 5),
  }))
}

export async function fetchVenueReservationsRange(
  supabase: SupabaseClient,
  venueId: string,
  fromIso: string,
  toIso: string
): Promise<VenueReservationRow[]> {
  const courts = await fetchVenueCourts(supabase, venueId)
  if (!courts.length) return []
  const courtIds = courts.map((c) => c.id)
  const { data, error } = await supabase
    .from('venue_reservations')
    .select('*')
    .in('court_id', courtIds)
    .lt('starts_at', toIso)
    .gt('ends_at', fromIso)
    .order('starts_at', { ascending: true })
  if (error || !data) return []
  return data.map((r) => ({
    id: r.id as string,
    courtId: r.court_id as string,
    startsAt: new Date(r.starts_at as string),
    endsAt: new Date(r.ends_at as string),
    bookerUserId: (r.booker_user_id as string | null) ?? null,
    matchOpportunityId: (r.match_opportunity_id as string | null) ?? null,
    status: r.status as VenueReservationRow['status'],
    paymentStatus:
      (r.payment_status as VenueReservationRow['paymentStatus']) ?? undefined,
    pricePerHour: (r.price_per_hour as number | null) ?? undefined,
    currency: (r.currency as string | null) ?? undefined,
    depositAmount: (r.deposit_amount as number | null) ?? undefined,
    paidAmount: (r.paid_amount as number | null) ?? undefined,
    confirmedAt: r.confirmed_at ? new Date(r.confirmed_at as string) : null,
    cancelledAt: r.cancelled_at ? new Date(r.cancelled_at as string) : null,
    cancelledReason: (r.cancelled_reason as string | null) ?? null,
    confirmedByUserId: (r.confirmed_by_user_id as string | null) ?? null,
    confirmationSource:
      (r.confirmation_source as VenueReservationRow['confirmationSource']) ??
      null,
    confirmationNote: (r.confirmation_note as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  }))
}
