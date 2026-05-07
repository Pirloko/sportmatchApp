export type RevueltaLineupTeam = {
  userIds: string[]
  colorHex: string
}

export type RevueltaLineup = {
  teamA: RevueltaLineupTeam
  teamB: RevueltaLineupTeam
  createdAt: string
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Reparto aleatorio: hasta 2 arqueros → uno en A y otro en B si hay dos;
 * el resto se reparte equilibrando tamaños.
 */
export function buildRandomRevueltaLineup(
  roster: Array<{ userId: string; isGoalkeeper: boolean }>,
  colorHexA: string,
  colorHexB: string
): RevueltaLineup {
  const byId = new Map<string, boolean>()
  for (const r of roster) {
    byId.set(r.userId, r.isGoalkeeper === true)
  }

  const ids = [...byId.keys()]
  const gks = ids.filter((id) => byId.get(id) === true)
  const field = ids.filter((id) => byId.get(id) !== true)

  const teamA: string[] = []
  const teamB: string[] = []

  if (gks.length >= 2) {
    const pair = shuffle([gks[0], gks[1]])
    teamA.push(pair[0])
    teamB.push(pair[1])
    const extraGks = gks.slice(2)
    field.push(...extraGks)
  } else if (gks.length === 1) {
    if (Math.random() < 0.5) {
      teamA.push(gks[0])
    } else {
      teamB.push(gks[0])
    }
  }

  const pool = shuffle(field)
  for (const uid of pool) {
    if (teamA.length <= teamB.length) {
      teamA.push(uid)
    } else {
      teamB.push(uid)
    }
  }

  return {
    teamA: { userIds: teamA, colorHex: colorHexA },
    teamB: { userIds: teamB, colorHex: colorHexB },
    createdAt: new Date().toISOString(),
  }
}

export function parseRevueltaLineup(raw: unknown): RevueltaLineup | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const a = o.teamA as Record<string, unknown> | undefined
  const b = o.teamB as Record<string, unknown> | undefined
  if (!a || !b) return null
  const idsA = a.userIds
  const idsB = b.userIds
  if (!Array.isArray(idsA) || !Array.isArray(idsB)) return null
  const colorA = typeof a.colorHex === 'string' ? a.colorHex : ''
  const colorB = typeof b.colorHex === 'string' ? b.colorHex : ''
  if (!colorA || !colorB) return null
  const createdAt =
    typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString()
  return {
    teamA: {
      userIds: idsA.filter((x): x is string => typeof x === 'string'),
      colorHex: colorA,
    },
    teamB: {
      userIds: idsB.filter((x): x is string => typeof x === 'string'),
      colorHex: colorB,
    },
    createdAt,
  }
}
