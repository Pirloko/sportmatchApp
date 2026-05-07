import type { MatchOpportunity, PlayersSeekProfile } from './types'

export function parsePlayersSeekProfile(
  raw: unknown
): PlayersSeekProfile | undefined {
  if (raw === 'gk_only' || raw === 'field_only' || raw === 'gk_and_field') {
    return raw
  }
  return undefined
}

export type PlayersJoinRules =
  | { kind: 'legacy' }
  | { kind: 'gk_only'; max: number }
  | { kind: 'field_only'; max: number }
  | { kind: 'mixed'; maxTotal: number; maxGk: 1; maxField: number }

/** Solo type === 'players'; null profile = publicaciones antiguas (solo campo). */
export function playersJoinRules(opp: MatchOpportunity): PlayersJoinRules {
  const n = opp.playersNeeded ?? 0
  const p = opp.playersSeekProfile
  if (!p) return { kind: 'legacy' }
  if (p === 'gk_only') return { kind: 'gk_only', max: n }
  if (p === 'field_only') return { kind: 'field_only', max: n }
  return {
    kind: 'mixed',
    maxTotal: n,
    maxGk: 1,
    maxField: Math.max(0, n - 1),
  }
}

export function playersSeekProfileLabel(
  p: PlayersSeekProfile | undefined
): string {
  if (p === 'gk_only') return 'Solo arquero(s)'
  if (p === 'field_only') return 'Solo jugadores de campo'
  if (p === 'gk_and_field') return 'Arquero + jugadores de campo'
  return ''
}
