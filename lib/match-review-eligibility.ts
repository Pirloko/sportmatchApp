import { positionLabel } from './player-profile-ui'
import type { OpportunityParticipantRow } from './supabase/message-queries'

/** Etiqueta de posición para el selector MVP (destaca arqueros). */
export function mvpParticipantRoleLabel(
  p: Pick<
    OpportunityParticipantRow,
    'isGoalkeeper' | 'encounterRole' | 'position'
  >
): string {
  if (p.isGoalkeeper || p.encounterRole === 'gk') return 'Arquero'
  if (p.encounterRole === 'defensa') return 'Defensa'
  if (p.encounterRole === 'mediocampista') return 'Mediocampista'
  if (p.encounterRole === 'delantero') return 'Delantero'
  if (p.position) return positionLabel(p.position)
  return 'Jugador'
}

export function isMvpGoalkeeper(
  p: Pick<OpportunityParticipantRow, 'isGoalkeeper' | 'encounterRole'>
): boolean {
  return p.isGoalkeeper === true || p.encounterRole === 'gk'
}

/** Organizador o participante confirmado: puede reseñar y aparecer como MVP. */
export function isMatchReviewEligibleParticipant(
  p: Pick<OpportunityParticipantRow, 'status'>
): boolean {
  return p.status === 'creator' || p.status === 'confirmed'
}

export function filterMvpEligibleParticipants(
  participants: OpportunityParticipantRow[]
): OpportunityParticipantRow[] {
  return participants.filter(isMatchReviewEligibleParticipant)
}

/** Candidatos MVP en UI: elegibles excepto el usuario que reseña. */
export function filterMvpVoteCandidates(
  participants: OpportunityParticipantRow[],
  raterUserId: string
): OpportunityParticipantRow[] {
  return filterMvpEligibleParticipants(participants).filter(
    (p) => p.id !== raterUserId
  )
}

export function userCanSubmitMatchReview(
  userId: string,
  participants: OpportunityParticipantRow[]
): boolean {
  return participants.some((p) => p.id === userId && isMatchReviewEligibleParticipant(p))
}
