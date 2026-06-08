import { getExpoAppScheme } from './app-linking'
import { isValidTeamInviteId } from './team-invite-url'

/** Deep link al detalle del partido en la app móvil. */
export function matchInviteDeepLinkFallback(matchId: string): string {
  return `${getExpoAppScheme()}://partidos/${matchId}`
}

/** URL pública para invitar a un partido (web o deep link). */
export function matchInviteAbsoluteUrl(matchId: string): string {
  if (!isValidTeamInviteId(matchId)) {
    return matchInviteDeepLinkFallback(matchId)
  }
  const base = (process.env.EXPO_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  if (!base) {
    return matchInviteDeepLinkFallback(matchId)
  }
  return `${base}/partidos/${matchId}`
}
