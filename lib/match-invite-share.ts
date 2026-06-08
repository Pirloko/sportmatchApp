import {
  formatMatchClock,
  formatMatchWeekdayDate,
} from './format-match'
import { matchInviteAbsoluteUrl } from './match-invite-url'
import type { MatchOpportunity } from './types'

export function buildMatchInviteShareMessage(
  match: MatchOpportunity,
  options?: { slotsLeft?: number }
): string {
  const url = matchInviteAbsoluteUrl(match.id)
  const dateLine = `${formatMatchWeekdayDate(match.dateTime)} · ${formatMatchClock(match.dateTime)}`
  const placeLine = `${match.venue}, ${match.location}`
  const slotsLeft = options?.slotsLeft

  const slotsLine =
    slotsLeft != null && slotsLeft > 0
      ? `\nQuedan ${slotsLeft} cupo${slotsLeft === 1 ? '' : 's'} — ¡corre a sumarte!`
      : ''

  return (
    `¡Ey, amigo! Te invito a jugar un partido en SportMatch ⚽\n\n` +
    `«${match.title}»\n` +
    `📅 ${dateLine}\n` +
    `📍 ${placeLine}${slotsLine}\n\n` +
    `Únete, suma partidos y mejora tus estadísticas en el ranking. ¡Nos vemos en la cancha!\n\n` +
    url
  )
}

export function matchInviteSharePayload(
  match: MatchOpportunity,
  options?: { slotsLeft?: number }
): { message: string; url: string; title: string } {
  const url = matchInviteAbsoluteUrl(match.id)
  return {
    message: buildMatchInviteShareMessage(match, options),
    url,
    title: `Partido SportMatch — ${match.title}`,
  }
}
