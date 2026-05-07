import type { SupabaseClient } from '@supabase/supabase-js'

export type RangeKey = 'day' | '7d' | '15d' | 'month' | 'semester' | 'year'

export type AdminMetrics = {
  range: RangeKey
  totals: {
    reservations: number
    centers: number
    pending: number
    confirmed: number
    cancelled: number
    selfConfirmed: number
    confirmRate: number
  }
  byType: {
    rival: number
    players: number
    open: number
    reserve_only: number
  }
  topVenues: Array<{ venueId: string; venueName: string; reservations: number }>
  details: Array<{
    id: string
    startsAt: string
    createdAt: string
    status: 'pending' | 'confirmed' | 'cancelled'
    paymentStatus: 'unpaid' | 'deposit_paid' | 'paid' | null
    confirmationSource: 'venue_owner' | 'booker_self' | 'admin' | null
    venueId: string | null
    venueName: string
    courtName: string
    matchId: string | null
    matchType: 'rival' | 'players' | 'open' | 'reserve_only'
    matchTitle: string
    bookerName: string
  }>
}

type ReservationStatus = 'pending' | 'confirmed' | 'cancelled'
type MatchType = 'rival' | 'players' | 'open'

export function buildAdminRangeFrom(range: RangeKey): Date {
  const now = new Date()
  const d = new Date(now)
  switch (range) {
    case 'day':
      d.setHours(0, 0, 0, 0)
      return d
    case '7d':
      d.setDate(d.getDate() - 7)
      return d
    case '15d':
      d.setDate(d.getDate() - 15)
      return d
    case 'month':
      d.setMonth(d.getMonth() - 1)
      return d
    case 'semester':
      d.setMonth(d.getMonth() - 6)
      return d
    case 'year':
      d.setFullYear(d.getFullYear() - 1)
      return d
    default:
      d.setMonth(d.getMonth() - 1)
      return d
  }
}

/**
 * Métricas admin (misma lógica que `app/api/admin/metrics` del Next).
 * Requiere políticas RLS que permitan al usuario admin leer las tablas implicadas,
 * o usar el panel en un entorno con esas políticas.
 */
export async function fetchAdminMetrics(
  supabase: SupabaseClient,
  range: RangeKey
): Promise<AdminMetrics> {
  const from = buildAdminRangeFrom(range)

  const [
    { data: reservations, error: resErr },
    { data: courts, error: courtsErr },
    { data: venues, error: venuesErr },
  ] = await Promise.all([
    supabase
      .from('venue_reservations')
      .select(
        'id, status, starts_at, created_at, match_opportunity_id, court_id, confirmation_source, payment_status, booker_user_id'
      )
      .gte('starts_at', from.toISOString()),
    supabase.from('venue_courts').select('id, venue_id, name'),
    supabase.from('sports_venues').select('id, name'),
  ])

  if (resErr) {
    throw new Error(
      resErr.message ||
        'No se pudieron leer las reservas (¿RLS?). El panel admin en Expo requiere políticas que permitan leer venue_reservations al rol autenticado con account_type admin.'
    )
  }
  if (courtsErr) {
    throw new Error(courtsErr.message)
  }
  if (venuesErr) {
    throw new Error(venuesErr.message)
  }

  const reservationRows =
    (reservations as Array<{
      id: string
      status: ReservationStatus
      starts_at: string
      created_at: string
      match_opportunity_id: string | null
      court_id: string
      confirmation_source: string | null
      payment_status: 'unpaid' | 'deposit_paid' | 'paid' | null
      booker_user_id: string | null
    }>) ?? []
  const courtRows =
    (courts as Array<{ id: string; venue_id: string; name?: string }> | null) ??
    []
  const venueRows =
    (venues as Array<{ id: string; name: string }> | null) ?? []

  const courtToVenue = new Map(courtRows.map((c) => [c.id, c.venue_id]))
  const courtNameById = new Map(courtRows.map((c) => [c.id, c.name ?? 'Cancha']))
  const venueNameById = new Map(venueRows.map((v) => [v.id, v.name]))

  const statusCount: Record<ReservationStatus, number> = {
    pending: 0,
    confirmed: 0,
    cancelled: 0,
  }
  const byVenue = new Map<string, number>()

  const matchIds = [
    ...new Set(
      reservationRows.map((r) => r.match_opportunity_id).filter(Boolean)
    ),
  ] as string[]

  const matchTypeById = new Map<string, MatchType>()
  const matchTitleById = new Map<string, string>()
  if (matchIds.length > 0) {
    const { data: matches, error: matchErr } = await supabase
      .from('match_opportunities')
      .select('id, type, title')
      .in('id', matchIds)
    if (matchErr) {
      throw new Error(matchErr.message)
    }
    for (const m of matches ?? []) {
      matchTypeById.set(m.id as string, m.type as MatchType)
      matchTitleById.set(m.id as string, (m.title as string) ?? 'Partido')
    }
  }

  const bookerIds = [
    ...new Set(reservationRows.map((r) => r.booker_user_id).filter(Boolean)),
  ] as string[]
  const bookerNameById = new Map<string, string>()
  if (bookerIds.length > 0) {
    const { data: bookers, error: bookErr } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', bookerIds)
    if (bookErr) {
      throw new Error(bookErr.message)
    }
    for (const b of bookers ?? []) {
      bookerNameById.set(b.id as string, (b.name as string) ?? 'Jugador')
    }
  }

  const byType: Record<MatchType | 'reserve_only', number> = {
    rival: 0,
    players: 0,
    open: 0,
    reserve_only: 0,
  }
  let selfConfirmed = 0

  for (const r of reservationRows) {
    statusCount[r.status] += 1
    if (r.confirmation_source === 'booker_self') selfConfirmed += 1

    const venueId = courtToVenue.get(r.court_id)
    if (venueId) byVenue.set(venueId, (byVenue.get(venueId) ?? 0) + 1)

    if (!r.match_opportunity_id) {
      byType.reserve_only += 1
    } else {
      const t = matchTypeById.get(r.match_opportunity_id)
      if (t) byType[t] += 1
    }
  }

  const total = reservationRows.length
  const topVenues = [...byVenue.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([venueId, count]) => ({
      venueId,
      venueName: venueNameById.get(venueId) ?? 'Centro',
      reservations: count,
    }))

  const details = reservationRows
    .map((r) => {
      const venueId = courtToVenue.get(r.court_id) ?? null
      const matchType = r.match_opportunity_id
        ? matchTypeById.get(r.match_opportunity_id) ?? null
        : null
      const resolvedType: AdminMetrics['details'][number]['matchType'] =
        matchType ?? 'reserve_only'
      return {
        id: r.id,
        startsAt: r.starts_at,
        createdAt: r.created_at,
        status: r.status,
        paymentStatus: r.payment_status ?? null,
        confirmationSource: (r.confirmation_source ?? null) as
          | 'venue_owner'
          | 'booker_self'
          | 'admin'
          | null,
        venueId,
        venueName: venueId ? venueNameById.get(venueId) ?? 'Centro' : 'Centro',
        courtName: courtNameById.get(r.court_id) ?? 'Cancha',
        matchId: r.match_opportunity_id,
        matchType: resolvedType,
        matchTitle: r.match_opportunity_id
          ? matchTitleById.get(r.match_opportunity_id) ?? 'Partido'
          : 'Reserva directa',
        bookerName: r.booker_user_id
          ? bookerNameById.get(r.booker_user_id) ?? 'Jugador'
          : 'Jugador',
      }
    })
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .slice(0, 200)

  return {
    range,
    totals: {
      reservations: total,
      centers: venueRows.length,
      pending: statusCount.pending,
      confirmed: statusCount.confirmed,
      cancelled: statusCount.cancelled,
      selfConfirmed,
      confirmRate:
        total > 0 ? Math.round((statusCount.confirmed / total) * 100) : 0,
    },
    byType,
    topVenues,
    details,
  }
}
