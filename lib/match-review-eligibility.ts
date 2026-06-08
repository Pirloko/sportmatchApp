import type { OpportunityParticipantRow } from './supabase/message-queries'

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
