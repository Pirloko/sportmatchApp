import { TIME_SLOT_OPTIONS } from './time-slot-options'
import type { VenueReservationRow, VenueWeeklyHour } from './types'

/** 0 = domingo … 6 = sábado. */
export const WEEKDAY_SHORT_ES = [
  'Dom',
  'Lun',
  'Mar',
  'Mié',
  'Jue',
  'Vie',
  'Sáb',
] as const

export type ComputedSlot = {
  start: Date
  end: Date
  freeCourtIds: string[]
  totalCourts: number
}

function atLocalDayTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const x = new Date(day)
  x.setHours(h, m, 0, 0)
  return x
}

/** Huecos del día según horario semanal, duración y reservas confirmadas (página pública centro). */
export function computeDaySlots(
  day: Date,
  weekly: VenueWeeklyHour[],
  courtIds: string[],
  reservations: VenueReservationRow[],
  slotMinutes: number
): ComputedSlot[] {
  if (!courtIds.length || !weekly.length) return []

  const dow = day.getDay()
  const wh = weekly.find((w) => w.dayOfWeek === dow)
  if (!wh) return []

  const open = atLocalDayTime(day, wh.openTime)
  const close = atLocalDayTime(day, wh.closeTime)
  if (!(open < close)) return []

  const slots: ComputedSlot[] = []
  let cursor = open.getTime()
  const closeMs = close.getTime()
  const step = slotMinutes * 60 * 1000

  const activeRes = reservations.filter((r) => r.status === 'confirmed')

  while (cursor + step <= closeMs) {
    const start = new Date(cursor)
    const end = new Date(cursor + step)
    const busyCourts = new Set<string>()
    for (const r of activeRes) {
      if (r.startsAt < end && r.endsAt > start) {
        busyCourts.add(r.courtId)
      }
    }
    const freeCourtIds = courtIds.filter((id) => !busyCourts.has(id))
    slots.push({
      start,
      end,
      freeCourtIds,
      totalCourts: courtIds.length,
    })
    cursor += step
  }

  return slots
}

export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map((n) => Number(n))
  return h * 60 + m
}

export function minutesToHm(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  return `${hh}:${mm}`
}

export function labelForHm(hm: string): string {
  const byPreset = TIME_SLOT_OPTIONS.find((t) => t.value === hm)
  if (byPreset) return byPreset.label
  const [hhRaw, mmRaw] = hm.split(':')
  const hh = Number(hhRaw)
  const mm = Number(mmRaw)
  const suffix = hh >= 12 ? 'p. m.' : 'a. m.'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${suffix}`
}

export function computeVenueAvailableSlots({
  dayStart,
  openTime,
  closeTime,
  slotDurationMinutes,
  courtsCount,
  reservations,
}: {
  dayStart: Date
  openTime: string
  closeTime: string
  slotDurationMinutes: number
  courtsCount: number
  reservations: Pick<VenueReservationRow, 'courtId' | 'startsAt' | 'endsAt'>[]
}): Array<{ value: string; label: string }> {
  if (courtsCount <= 0) return []
  const openMin = hmToMinutes(openTime)
  const closeMin = hmToMinutes(closeTime)
  if (openMin >= closeMin) return []

  const out: Array<{ value: string; label: string }> = []
  for (
    let startMin = openMin;
    startMin + slotDurationMinutes <= closeMin;
    startMin += slotDurationMinutes
  ) {
    const slotStart = new Date(dayStart)
    slotStart.setHours(0, startMin, 0, 0)
    const slotEnd = new Date(slotStart.getTime() + slotDurationMinutes * 60000)

    const busyCourts = new Set<string>()
    for (const r of reservations) {
      if (r.startsAt < slotEnd && r.endsAt > slotStart) {
        busyCourts.add(r.courtId)
      }
    }
    if (busyCourts.size < courtsCount) {
      const hm = minutesToHm(startMin)
      out.push({ value: hm, label: labelForHm(hm) })
    }
  }
  return out
}
