import type { SlotRole } from './match-lineup-slots'
import type { OpportunityParticipantRow } from './supabase/message-queries'
import type { RivalEncounterDetail } from './supabase/rival-match-detail'
import type { Position, Team, TeamPickRole } from './types'

export function profilePositionToEncounterRole(position: Position): TeamPickRole {
  if (position === 'portero') return 'gk'
  if (position === 'defensa') return 'defensa'
  if (position === 'delantero') return 'delantero'
  return 'mediocampista'
}

export function defaultCaptainLineupSlot(role: TeamPickRole): string {
  if (role === 'gk') return 'gk'
  if (role === 'defensa') return 'def_0'
  if (role === 'delantero') return 'del'
  return 'med_0'
}

/** Cupos visuales por bando en partidos rival (6 cancha + 3 costado). */
export const RIVAL_PITCH_SLOT_DEFS: Array<{
  slot: string
  role: SlotRole
  slotIndex: number
}> = [
  { slot: 'gk', role: 'gk', slotIndex: 0 },
  { slot: 'def_0', role: 'defensa', slotIndex: 1 },
  { slot: 'def_1', role: 'defensa', slotIndex: 2 },
  { slot: 'med_0', role: 'mediocampista', slotIndex: 3 },
  { slot: 'med_1', role: 'mediocampista', slotIndex: 4 },
  { slot: 'del', role: 'delantero', slotIndex: 5 },
]

export const RIVAL_BENCH_SLOT_DEFS = ['bench_0', 'bench_1', 'bench_2'] as const

export type RivalPickTeam = 'A' | 'B'

export type RivalSlotPick = {
  pickTeam: RivalPickTeam
  lineupSlot: string
  role: SlotRole
  isBench: boolean
}

export function rivalRoleForLineupSlot(lineupSlot: string): SlotRole | null {
  const pitch = RIVAL_PITCH_SLOT_DEFS.find((s) => s.slot === lineupSlot)
  if (pitch) return pitch.role
  if (RIVAL_BENCH_SLOT_DEFS.includes(lineupSlot as (typeof RIVAL_BENCH_SLOT_DEFS)[number])) {
    return 'mediocampista'
  }
  return null
}

export function rivalSlotPickFromPress(
  pickTeam: RivalPickTeam,
  lineupSlot: string
): RivalSlotPick | null {
  const pitch = RIVAL_PITCH_SLOT_DEFS.find((s) => s.slot === lineupSlot)
  if (pitch) {
    return {
      pickTeam,
      lineupSlot,
      role: pitch.role,
      isBench: false,
    }
  }
  if (RIVAL_BENCH_SLOT_DEFS.includes(lineupSlot as (typeof RIVAL_BENCH_SLOT_DEFS)[number])) {
    return {
      pickTeam,
      lineupSlot,
      role: 'mediocampista',
      isBench: true,
    }
  }
  return null
}

/** Local = A (arriba), visita = B (abajo). */
export function resolveUserRivalPickTeam(
  userId: string,
  encounter: RivalEncounterDetail,
  myTeams: Team[]
): RivalPickTeam | null {
  const homeId = encounter.home.teamId
  const awayId = encounter.away?.teamId
  const inHome =
    !!homeId &&
    !homeId.startsWith('unknown') &&
    myTeams.some(
      (t) =>
        t.id === homeId &&
        (t.captainId === userId || t.members.some((m) => m.id === userId))
    )
  const inAway =
    !!awayId &&
    !awayId.startsWith('unknown') &&
    myTeams.some(
      (t) =>
        t.id === awayId &&
        (t.captainId === userId || t.members.some((m) => m.id === userId))
    )
  if (inHome && !inAway) return 'A'
  if (inAway && !inHome) return 'B'
  return null
}

export function participantRivalPickTeam(
  p: OpportunityParticipantRow,
  sideByUserId: Map<string, 'home' | 'away'>
): RivalPickTeam | null {
  if (p.pickTeam === 'A' || p.pickTeam === 'B') return p.pickTeam
  const side = sideByUserId.get(p.id)
  if (side === 'home') return 'A'
  if (side === 'away') return 'B'
  return null
}

export function countRivalTeamParticipants(
  participants: OpportunityParticipantRow[],
  pickTeam: RivalPickTeam,
  sideByUserId: Map<string, 'home' | 'away'>
): number {
  return participants.filter((p) => {
    if (p.status !== 'creator' && p.status !== 'confirmed' && p.status !== 'pending') {
      return false
    }
    return participantRivalPickTeam(p, sideByUserId) === pickTeam
  }).length
}

export function participantOwnsLineupSlot(
  userId: string,
  pick: RivalSlotPick,
  participants: OpportunityParticipantRow[]
): boolean {
  const row = participants.find((p) => p.id === userId)
  return row?.lineupSlot === pick.lineupSlot
}

export function isLineupSlotTaken(
  participants: OpportunityParticipantRow[],
  pickTeam: RivalPickTeam,
  lineupSlot: string,
  sideByUserId: Map<string, 'home' | 'away'>
): boolean {
  return participants.some((p) => {
    if (p.status !== 'creator' && p.status !== 'confirmed' && p.status !== 'pending') {
      return false
    }
    const team = participantRivalPickTeam(p, sideByUserId)
    if (team !== pickTeam) return false
    if (p.lineupSlot === lineupSlot) return true
    return false
  })
}
