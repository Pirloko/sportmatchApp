import type { Level, MatchType } from './types'

/** Ej. "lunes 29 de marzo" (es-CL). */
export function formatMatchWeekdayDate(d: Date): string {
  return new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d)
}

export function formatMatchClock(d: Date): string {
  return new Intl.DateTimeFormat('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

/** Etiquetas del home (match-card web). */
export function matchTypeHomeLabel(t: MatchType): string {
  if (t === 'rival') return 'Busca rival'
  if (t === 'players') return 'Faltan jugadores'
  if (t === 'team_pick' || t === 'team_pick_public' || t === 'team_pick_private') {
    return 'Selección de equipos'
  }
  return 'Revuelta abierta'
}

export function formatMatchDateTime(d: Date): string {
  return new Intl.DateTimeFormat('es-CL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function matchTypeLabel(t: MatchType): string {
  if (t === 'rival') return 'Rival'
  if (t === 'players') return 'Busca jugadores'
  if (t === 'team_pick' || t === 'team_pick_public' || t === 'team_pick_private') {
    return 'Team pick'
  }
  return 'Revuelta'
}

export function levelLabel(l: Level): string {
  const map: Record<Level, string> = {
    principiante: 'Principiante',
    intermedio: 'Intermedio',
    avanzado: 'Avanzado',
    competitivo: 'Competitivo',
  }
  return map[l]
}

export function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Texto breve para cuándo cierra el chat (fecha futura). */
export function formatRelativeUntil(deadline: Date): string {
  const ms = Math.max(0, deadline.getTime() - Date.now())
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h >= 48) return `en ${Math.floor(h / 24)} días`
  if (h >= 1) return `en ${h} h`
  if (m >= 1) return `en ${m} min`
  return 'en segundos'
}
