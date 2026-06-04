import {
  RIVAL_BENCH_SLOT_DEFS,
  RIVAL_PITCH_SLOT_DEFS,
  participantRivalPickTeam,
  type RivalPickTeam,
} from './rival-lineup-slot'
import { DEFAULT_AVATAR } from './supabase/mappers'
import type { OpportunityParticipantRow } from './supabase/message-queries'
import type { MatchOpportunity } from './types'

export type RivalBenchSlot = {
  lineupSlot: string
  benchIndex: number
  player: OpportunityParticipantRow | null
}

/** Formación fija 1-2-2-1 por equipo. */
export type SlotRole = 'gk' | 'defensa' | 'mediocampista' | 'delantero'

export const FORMATION_121: SlotRole[] = [
  'gk',
  'defensa',
  'defensa',
  'mediocampista',
  'mediocampista',
  'delantero',
]

export const FORMATION_121_LABEL = '1-2-2-1'

const ROLE_LABEL: Record<SlotRole, string> = {
  gk: 'ARQ',
  defensa: 'DEF',
  mediocampista: 'MED',
  delantero: 'DEL',
}

export type LineupSlot = {
  team: 'A' | 'B'
  slotIndex: number
  role: SlotRole
  player: OpportunityParticipantRow | null
}

/** standard6: cancha team pick / revuelta. rival6Bench: rival con 6 titulares + suplentes al costado. */
export type LineupPositionSet = 'standard6' | 'rival6Bench'

export type MatchLineupLayout = {
  mode: 'dual' | 'single'
  slotsPerTeam: number
  teamA: LineupSlot[]
  teamB: LineupSlot[]
  teamALabel: string
  teamBLabel: string
  teamALogoUrl?: string
  teamBLogoUrl?: string
  /** Suplentes local (arriba); solo modo rival con más de 6 cupos por bando. */
  benchA?: RivalBenchSlot[]
  /** Suplentes visita (abajo). */
  benchB?: RivalBenchSlot[]
  pendingLineup: boolean
  positionSet?: LineupPositionSet
  /** Etiqueta de formación (p. ej. rival en cancha). */
  formationLabel?: string
}

export function slotRoleLabel(role: SlotRole): string {
  return ROLE_LABEL[role]
}

export function lineupRoleLabel(
  player: OpportunityParticipantRow | null
): string | null {
  if (!player) return null
  if (player.encounterRole) return ROLE_LABEL[player.encounterRole]
  if (player.isGoalkeeper) return ROLE_LABEL.gk
  return null
}

function isTeamPickType(type: MatchOpportunity['type']): boolean {
  return (
    type === 'team_pick' ||
    type === 'team_pick_public' ||
    type === 'team_pick_private'
  )
}

function activeParticipants(
  participants: OpportunityParticipantRow[]
): OpportunityParticipantRow[]
{
  return participants.filter(
    (p) =>
      p.status === 'creator' ||
      p.status === 'confirmed' ||
      p.status === 'pending'
  )
}

function inferPlayerRole(p: OpportunityParticipantRow): SlotRole | null {
  if (p.encounterRole) return p.encounterRole
  if (p.isGoalkeeper) return 'gk'
  return null
}

/** Coloca cada jugador en el cupo que corresponde a su rol (1 ARQ · 2 DEF · 2 MED · 1 DEL). */
function fillTeamFormationSlots(
  team: 'A' | 'B',
  players: OpportunityParticipantRow[],
  roles: SlotRole[] = FORMATION_121
): LineupSlot[] {
  const slots: LineupSlot[] = roles.map((role, slotIndex) => ({
    team,
    slotIndex,
    role,
    player: null,
  }))

  const remaining = [...players]

  for (const slot of slots) {
    const idx = remaining.findIndex((p) => {
      const r = inferPlayerRole(p)
      if (r) return r === slot.role
      return false
    })
    if (idx >= 0) {
      slot.player = remaining.splice(idx, 1)[0]
    }
  }

  for (const p of remaining) {
    const empty = slots.find((s) => !s.player)
    if (empty) empty.player = p
  }

  return slots
}

/** 6 titulares en formación 1-2-2-1; el resto queda en banco (sin perder jugadores). */
function fillStartersAndBench(
  team: 'A' | 'B',
  players: OpportunityParticipantRow[],
  starterRoles: SlotRole[] = FORMATION_121
): { starters: LineupSlot[]; bench: OpportunityParticipantRow[] } {
  const slots: LineupSlot[] = starterRoles.map((role, slotIndex) => ({
    team,
    slotIndex,
    role,
    player: null,
  }))
  const remaining = [...players]

  for (const slot of slots) {
    const idx = remaining.findIndex((p) => {
      const r = inferPlayerRole(p)
      if (r) return r === slot.role
      return false
    })
    if (idx >= 0) {
      slot.player = remaining.splice(idx, 1)[0]
    }
  }

  for (const p of remaining) {
    const empty = slots.find((s) => !s.player)
    if (empty) empty.player = p
  }

  const starterIds = new Set(
    slots.map((s) => s.player?.id).filter(Boolean) as string[]
  )
  const bench = players.filter((p) => !starterIds.has(p.id))

  return { starters: slots, bench }
}

function participantById(
  participants: OpportunityParticipantRow[],
  userId: string
): OpportunityParticipantRow {
  const found = participants.find((p) => p.id === userId)
  if (found) return found
  return {
    id: userId,
    name: 'Jugador',
    photo: DEFAULT_AVATAR,
    status: 'confirmed',
  }
}

function buildFromRevueltaLineup(
  opp: MatchOpportunity,
  participants: OpportunityParticipantRow[],
  slotsPerTeam: number
): MatchLineupLayout | null {
  const lineup = opp.revueltaLineup
  if (!lineup) return null

  const roles = FORMATION_121.slice(0, slotsPerTeam)
  const teamAPlayers = lineup.teamA.userIds.map((id) =>
    participantById(participants, id)
  )
  const teamBPlayers = lineup.teamB.userIds.map((id) =>
    participantById(participants, id)
  )

  return {
    mode: 'dual',
    slotsPerTeam,
    teamA: fillTeamFormationSlots('A', teamAPlayers, roles),
    teamB: fillTeamFormationSlots('B', teamBPlayers, roles),
    teamALabel: `EQUIPO A · ${FORMATION_121_LABEL}`,
    teamBLabel: `EQUIPO B · ${FORMATION_121_LABEL}`,
    pendingLineup: false,
  }
}

function buildDualFallback(
  participants: OpportunityParticipantRow[],
  slotsPerTeam: number,
  pendingLineup: boolean
): MatchLineupLayout {
  const active = activeParticipants(participants)
  const withTeam = active.filter((p) => p.pickTeam === 'A' || p.pickTeam === 'B')
  const withoutTeam = active.filter((p) => !p.pickTeam)
  const roles = FORMATION_121.slice(0, slotsPerTeam)

  const teamA =
    withTeam.length > 0
      ? active.filter((p) => p.pickTeam === 'A')
      : withoutTeam.slice(0, slotsPerTeam)
  const teamB =
    withTeam.length > 0
      ? active.filter((p) => p.pickTeam === 'B')
      : withoutTeam.slice(slotsPerTeam, slotsPerTeam * 2)

  return {
    mode: 'dual',
    slotsPerTeam,
    teamA: fillTeamFormationSlots('A', teamA, roles),
    teamB: fillTeamFormationSlots('B', teamB, roles),
    teamALabel: `EQUIPO A · ${FORMATION_121_LABEL}`,
    teamBLabel: `EQUIPO B · ${FORMATION_121_LABEL}`,
    pendingLineup,
  }
}

function buildSingleTeamLayout(
  opp: MatchOpportunity,
  participants: OpportunityParticipantRow[]
): MatchLineupLayout {
  const slotsPerTeam = Math.max(1, Math.min(6, opp.playersNeeded ?? 6))
  const active = activeParticipants(participants)
  const roles = FORMATION_121.slice(0, slotsPerTeam)

  return {
    mode: 'single',
    slotsPerTeam,
    teamA: fillTeamFormationSlots('A', active, roles),
    teamB: [],
    teamALabel: `${slotsPerTeam} CUPOS · ${FORMATION_121_LABEL}`,
    teamBLabel: '',
    pendingLineup: false,
  }
}

export function buildMatchLineupLayout(
  opp: MatchOpportunity,
  participants: OpportunityParticipantRow[]
): MatchLineupLayout {
  const slotsPerTeam =
    isTeamPickType(opp.type) || opp.type === 'open'
      ? 6
      : Math.max(1, Math.min(6, opp.playersNeeded ?? 6))

  if (isTeamPickType(opp.type)) {
    return buildDualFallback(participants, slotsPerTeam, false)
  }

  if (opp.type === 'open') {
    const fromLineup = buildFromRevueltaLineup(opp, participants, slotsPerTeam)
    if (fromLineup) return fromLineup
    return buildDualFallback(participants, slotsPerTeam, true)
  }

  return buildSingleTeamLayout(opp, participants)
}

export function usesPitchLineup(type: MatchOpportunity['type']): boolean {
  return (
    type === 'open' ||
    type === 'players' ||
    type === 'team_pick' ||
    type === 'team_pick_public' ||
    type === 'team_pick_private'
  )
}

function splitRivalParticipants(
  participants: OpportunityParticipantRow[],
  sideByUserId: Map<string, 'home' | 'away'>,
  creatorId?: string
): { home: OpportunityParticipantRow[]; away: OpportunityParticipantRow[] } {
  const active = activeParticipants(participants)
  const home: OpportunityParticipantRow[] = []
  const away: OpportunityParticipantRow[] = []
  const unassigned: OpportunityParticipantRow[] = []

  for (const p of active) {
    const side = sideByUserId.get(p.id)
    if (side === 'home') home.push(p)
    else if (side === 'away') away.push(p)
    else if (p.pickTeam === 'A') home.push(p)
    else if (p.pickTeam === 'B') away.push(p)
    else unassigned.push(p)
  }

  if (unassigned.length > 0) {
    const rest = unassigned.filter((p) => p.id !== creatorId)
    const creator = creatorId
      ? unassigned.find((p) => p.id === creatorId)
      : undefined
    if (creator) home.push(creator)
    for (let i = 0; i < rest.length; i++) {
      if (home.length <= away.length) home.push(rest[i])
      else away.push(rest[i])
    }
  }

  return { home, away }
}

function createEmptyRivalPitch(team: 'A' | 'B'): LineupSlot[] {
  return RIVAL_PITCH_SLOT_DEFS.map((d) => ({
    team,
    slotIndex: d.slotIndex,
    role: d.role,
    player: null,
  }))
}

function createEmptyRivalBench(maxBench: number): RivalBenchSlot[] {
  return RIVAL_BENCH_SLOT_DEFS.slice(0, maxBench).map((lineupSlot, benchIndex) => ({
    lineupSlot,
    benchIndex,
    player: null,
  }))
}

function assignRivalTeamToSlots(
  pitch: LineupSlot[],
  bench: RivalBenchSlot[],
  players: OpportunityParticipantRow[],
  pickTeam: RivalPickTeam,
  sideByUserId: Map<string, 'home' | 'away'>
) {
  const teamPlayers = players.filter(
    (p) => participantRivalPickTeam(p, sideByUserId) === pickTeam
  )
  const unplaced: OpportunityParticipantRow[] = []

  for (const p of teamPlayers) {
    let placed = false
    if (p.lineupSlot) {
      const def = RIVAL_PITCH_SLOT_DEFS.find((d) => d.slot === p.lineupSlot)
      if (def) {
        const slot = pitch.find((s) => s.slotIndex === def.slotIndex)
        if (slot && !slot.player) {
          slot.player = p
          placed = true
        }
      }
      if (!placed) {
        const b = bench.find((x) => x.lineupSlot === p.lineupSlot)
        if (b && !b.player) {
          b.player = p
          placed = true
        }
      }
    }
    if (!placed) unplaced.push(p)
  }

  if (unplaced.length === 0) return

  const { starters, bench: overflow } = fillStartersAndBench(
    pickTeam,
    unplaced,
    FORMATION_121
  )
  for (const s of starters) {
    if (!s.player) continue
    const target = pitch.find((t) => t.slotIndex === s.slotIndex)
    if (target && !target.player) target.player = s.player
  }
  let bi = 0
  for (const p of overflow) {
    while (bi < bench.length && bench[bi].player) bi++
    if (bi < bench.length) {
      bench[bi].player = p
      bi++
    }
  }
}

/** Plantilla en cancha para partidos rival (local arriba, visita abajo). */
export function buildRivalMatchLineupLayout(
  homeName: string,
  awayName: string,
  homeLogoUrl: string,
  awayLogoUrl: string,
  perSideMax: number,
  participants: OpportunityParticipantRow[],
  sideByUserId: Map<string, 'home' | 'away'>,
  creatorId?: string
): MatchLineupLayout {
  const slotsPerTeam = Math.max(1, perSideMax)
  const { home, away } = splitRivalParticipants(
    participants,
    sideByUserId,
    creatorId
  )

  const useBenchLayout = slotsPerTeam > 6
  const maxBench = useBenchLayout ? Math.min(3, slotsPerTeam - 6) : 0

  if (useBenchLayout) {
    const teamA = createEmptyRivalPitch('A')
    const teamB = createEmptyRivalPitch('B')
    const benchA = createEmptyRivalBench(maxBench)
    const benchB = createEmptyRivalBench(maxBench)
    const active = activeParticipants(participants)
    assignRivalTeamToSlots(teamA, benchA, active, 'A', sideByUserId)
    assignRivalTeamToSlots(teamB, benchB, active, 'B', sideByUserId)
    return {
      mode: 'dual',
      slotsPerTeam,
      teamA,
      teamB,
      teamALabel: homeName,
      teamBLabel: awayName,
      teamALogoUrl: homeLogoUrl,
      teamBLogoUrl: awayLogoUrl,
      benchA,
      benchB,
      pendingLineup: false,
      positionSet: 'rival6Bench',
      formationLabel: `${FORMATION_121_LABEL} · ${maxBench} supl.`,
    }
  }

  const roles = FORMATION_121.slice(0, Math.min(6, slotsPerTeam))
  return {
    mode: 'dual',
    slotsPerTeam,
    teamA: fillTeamFormationSlots('A', home, roles),
    teamB: fillTeamFormationSlots('B', away, roles),
    teamALabel: homeName,
    teamBLabel: awayName,
    teamALogoUrl: homeLogoUrl,
    teamBLogoUrl: awayLogoUrl,
    pendingLineup: false,
    positionSet: 'standard6',
    formationLabel: FORMATION_121_LABEL,
  }
}

/** Rol del cupo para preseleccionar al unirse (team pick). */
export function slotRoleToTeamPickRole(
  role: SlotRole
): 'gk' | 'defensa' | 'mediocampista' | 'delantero' {
  return role
}
