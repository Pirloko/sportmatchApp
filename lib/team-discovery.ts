import type { SportsVenue, Team, User } from './types'

export function normalizeLocationKey(v: string | null | undefined): string {
  return (v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * Misma ciudad que el jugador (texto o city_id). Sin ciudad en perfil → no coincide.
 */
export function teamIsInSameCity(user: User, team: Team): boolean {
  if (user.cityId && team.cityId) {
    return user.cityId === team.cityId
  }

  const userCityKey = normalizeLocationKey(user.city)
  const teamCityKey = normalizeLocationKey(team.city)
  if (!userCityKey || !teamCityKey) return false
  if (userCityKey === teamCityKey) return true
  if (teamCityKey.includes(userCityKey)) return true
  if (userCityKey.includes(teamCityKey)) return true
  return false
}

/** Centro deportivo en la misma ciudad que el organizador (id o texto normalizado). */
export function venueIsInSameCity(user: User, venue: SportsVenue): boolean {
  if (user.cityId && venue.cityId) {
    return user.cityId === venue.cityId
  }

  const userCityKey = normalizeLocationKey(user.city)
  const venueCityKey = normalizeLocationKey(venue.city)
  if (!userCityKey || !venueCityKey) return false
  if (userCityKey === venueCityKey) return true
  if (venueCityKey.includes(userCityKey)) return true
  if (userCityKey.includes(venueCityKey)) return true
  return false
}

/**
 * Con región en perfil → misma región (vía ciudad) o misma ciudad explícita.
 * Sin región pero con ciudad → misma ciudad (id o texto normalizado).
 */
export function teamIsInPlayerGeo(user: User, team: Team): boolean {
  const userCityKey = normalizeLocationKey(user.city)
  const teamCityKey = normalizeLocationKey(team.city)
  const hasUserGeo = !!(
    user.cityId ||
    user.homeRegionId ||
    userCityKey
  )
  if (!hasUserGeo) return true

  if (user.homeRegionId && team.homeRegionId) {
    if (user.homeRegionId === team.homeRegionId) return true
  }
  if (user.cityId && team.cityId && user.cityId === team.cityId) return true
  if (userCityKey && teamCityKey) {
    if (userCityKey === teamCityKey) return true
    // Permite "rancagua" vs "rancagua ohiggins" o variantes similares
    if (teamCityKey.includes(userCityKey)) return true
    if (userCityKey.includes(teamCityKey)) return true
  }
  return false
}

/**
 * Jugador en la misma región que quien ve el ranking (no todo el país).
 */
export function playerIsInSameRegion(viewer: User, candidate: User): boolean {
  if (viewer.homeRegionId && candidate.homeRegionId) {
    return viewer.homeRegionId === candidate.homeRegionId
  }
  if (viewer.homeRegionId) return false
  const userCityKey = normalizeLocationKey(viewer.city)
  const candCityKey = normalizeLocationKey(candidate.city)
  if (userCityKey && candCityKey) {
    if (userCityKey === candCityKey) return true
    if (candCityKey.includes(userCityKey)) return true
    if (userCityKey.includes(candCityKey)) return true
  }
  if (viewer.cityId && candidate.cityId) {
    return viewer.cityId === candidate.cityId
  }
  return false
}

/**
 * Equipo en la misma región que quien ve el ranking.
 */
export function teamIsInSameRegion(user: User, team: Team): boolean {
  if (user.homeRegionId) {
    return !!team.homeRegionId && user.homeRegionId === team.homeRegionId
  }
  return teamIsInPlayerGeo(user, team)
}

export function rankTeamsByRivalRecord(teams: Team[]): Team[] {
  return [...teams].sort((a, b) => {
    const aw = a.statsWins ?? 0
    const bw = b.statsWins ?? 0
    if (bw !== aw) return bw - aw
    const ad = a.statsDraws ?? 0
    const bd = b.statsDraws ?? 0
    if (bd !== ad) return bd - ad
    const al = a.statsLosses ?? 0
    const bl = b.statsLosses ?? 0
    return al - bl
  })
}

export function rosterCountForDisplay(team: Team): number {
  return team.members.filter((m) => m.status !== 'invited').length
}

export type TeamFogueoUi = {
  tierLabel: string
  subtitle: string
  progress: number
}

/** “Fogueo” rival: barra y texto a partir de récord + rachas (solo cliente). */
export function teamRivalFogueo(team: Team): TeamFogueoUi {
  const w = team.statsWins ?? 0
  const d = team.statsDraws ?? 0
  const l = team.statsLosses ?? 0
  const total = w + d + l
  const winStreak = team.statsWinStreak ?? 0
  const lossStreak = team.statsLossStreak ?? 0

  if (total === 0) {
    return {
      tierLabel: 'Sin fogueo aún',
      subtitle: 'Aún sin partidos rival',
      progress: 0,
    }
  }

  const momentumPoints = w * 4 + d * 2 - l + Math.min(6, winStreak * 2)
  const progress = Math.min(1, Math.max(0.08, (momentumPoints + 8) / 40))

  let tierLabel = 'Pisando el césped'
  if (momentumPoints >= 28) tierLabel = 'En llamas'
  else if (momentumPoints >= 16) tierLabel = 'Racha en alza'
  else if (momentumPoints >= 8) tierLabel = 'Cogiendo ritmo'

  if (lossStreak >= 3) tierLabel = 'A buscar la remontada'

  return {
    tierLabel,
    subtitle:
      winStreak >= 2
        ? `${winStreak} victorias seguidas`
        : total === 1
          ? 'Primer partido rival en el bolsillo'
          : `${total} partidos rival jugados`,
    progress,
  }
}
