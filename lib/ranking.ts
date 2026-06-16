import { playerIsInSameRegion, rankTeamsByRivalRecord, teamIsInSameRegion } from './team-discovery'
import type { Team, User } from './types'

export const RANKING_LIST_MAX = 10

export type WinDrawLoss = {
  wins: number
  draws: number
  losses: number
}

export type RankingPercents = {
  winPct: number
  drawPct: number
  lossPct: number
}

export function recordFromStats(w: number, d: number, l: number): WinDrawLoss & {
  played: number
} & RankingPercents {
  const wins = Math.max(0, w)
  const draws = Math.max(0, d)
  const losses = Math.max(0, l)
  const played = wins + draws + losses
  if (played === 0) {
    return {
      wins,
      draws,
      losses,
      played: 0,
      winPct: 0,
      drawPct: 0,
      lossPct: 0,
    }
  }
  return {
    wins,
    draws,
    losses,
    played,
    winPct: Math.round((wins / played) * 100),
    drawPct: Math.round((draws / played) * 100),
    lossPct: Math.round((losses / played) * 100),
  }
}

export type PlayerRankingRow = {
  id: string
  name: string
  photo: string
  city: string
  level: User['level']
  isCurrentUser: boolean
  lastPlayedAt: Date | null
  mvpWins: number
} & WinDrawLoss &
  RankingPercents & { played: number }

export type TeamRankingRow = {
  id: string
  name: string
  logo?: string
  city: string
  level: Team['level']
  lastPlayedAt: Date | null
} & WinDrawLoss &
  RankingPercents & { played: number }

function comparePlayerRank(a: PlayerRankingRow, b: PlayerRankingRow): number {
  if (b.wins !== a.wins) return b.wins - a.wins
  if (b.winPct !== a.winPct) return b.winPct - a.winPct
  if (a.losses !== b.losses) return a.losses - b.losses
  if (b.played !== a.played) return b.played - a.played
  return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
}

function compareTeamRank(a: TeamRankingRow, b: TeamRankingRow): number {
  if (b.wins !== a.wins) return b.wins - a.wins
  if (b.winPct !== a.winPct) return b.winPct - a.winPct
  if (a.losses !== b.losses) return a.losses - b.losses
  if (b.played !== a.played) return b.played - a.played
  return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
}

export function buildPlayerRankingRows(
  currentUser: User,
  others: User[],
  lastPlayedAt: Map<string, Date>,
  mvpWinsByUser: Map<string, number> = new Map()
): PlayerRankingRow[] {
  const pool = [
    currentUser,
    ...others.filter(
      (u) => u.id !== currentUser.id && playerIsInSameRegion(currentUser, u)
    ),
  ]
  const rows = pool.map((u): PlayerRankingRow => {
    const rec = recordFromStats(
      u.statsPlayerWins ?? 0,
      u.statsPlayerDraws ?? 0,
      u.statsPlayerLosses ?? 0
    )
    return {
      id: u.id,
      name: u.name,
      photo: u.photo,
      city: u.city,
      level: u.level,
      isCurrentUser: u.id === currentUser.id,
      lastPlayedAt: lastPlayedAt.get(u.id) ?? null,
      mvpWins: mvpWinsByUser.get(u.id) ?? 0,
      ...rec,
    }
  })
  return rows
    .sort((a, b) => {
      if (a.played === 0 && b.played > 0) return 1
      if (b.played === 0 && a.played > 0) return -1
      return comparePlayerRank(a, b)
    })
    .slice(0, RANKING_LIST_MAX)
}

export function buildTeamRankingRows(
  currentUser: User,
  teams: Team[],
  lastPlayedAt: Map<string, Date>
): TeamRankingRow[] {
  const regionalTeams = teams.filter((t) => teamIsInSameRegion(currentUser, t))
  const ordered = rankTeamsByRivalRecord(regionalTeams)
  const rankIndex = new Map(ordered.map((t, i) => [t.id, i]))
  const rows = regionalTeams.map((t): TeamRankingRow => {
    const rec = recordFromStats(
      t.statsWins ?? 0,
      t.statsDraws ?? 0,
      t.statsLosses ?? 0
    )
    return {
      id: t.id,
      name: t.name,
      logo: t.logo,
      city: t.city,
      level: t.level,
      lastPlayedAt: lastPlayedAt.get(t.id) ?? null,
      ...rec,
    }
  })
  return rows
    .sort((a, b) => {
      if (a.played === 0 && b.played > 0) return 1
      if (b.played === 0 && a.played > 0) return -1
      const ia = rankIndex.get(a.id) ?? 9999
      const ib = rankIndex.get(b.id) ?? 9999
      if (ia !== ib) return ia - ib
      return compareTeamRank(a, b)
    })
    .slice(0, RANKING_LIST_MAX)
}
