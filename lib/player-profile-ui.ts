import type { Level } from './types'

const DAY_ORDER = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
] as const

export function formatAvailabilityDay(day: string): string {
  const map: Record<string, string> = {
    lunes: 'Lun',
    martes: 'Mar',
    miercoles: 'Mié',
    jueves: 'Jue',
    viernes: 'Vie',
    sabado: 'Sáb',
    domingo: 'Dom',
  }
  return map[day.toLowerCase()] ?? day
}

export function sortAvailabilityDays(days: string[]): string[] {
  return [...days].sort(
    (a, b) =>
      DAY_ORDER.indexOf(a.toLowerCase() as (typeof DAY_ORDER)[number]) -
      DAY_ORDER.indexOf(b.toLowerCase() as (typeof DAY_ORDER)[number])
  )
}

export function positionLabel(p: string): string {
  switch (p) {
    case 'portero':
      return 'Portero'
    case 'defensa':
      return 'Defensa'
    case 'mediocampista':
      return 'Mediocampista'
    case 'delantero':
      return 'Delantero'
    default:
      return p
  }
}

export function organizerProgress(completed: number): {
  label: string
  nextLabel: string | null
  progress: number
} {
  if (completed >= 40) {
    return { label: 'Organizador estrella', nextLabel: null, progress: 1 }
  }
  if (completed >= 15) {
    return {
      label: 'Organizador referente',
      nextLabel: 'Organizador estrella',
      progress: Math.min(1, (completed - 15) / 25),
    }
  }
  if (completed >= 5) {
    return {
      label: 'Organizador activo',
      nextLabel: 'Organizador referente',
      progress: Math.min(1, (completed - 5) / 10),
    }
  }
  return {
    label: 'Organizador en práctica',
    nextLabel: 'Organizador activo',
    progress: Math.min(1, completed / 5),
  }
}

export function levelBadgeColors(
  level: Level | undefined,
  isDark: boolean
): { backgroundColor: string; borderColor: string } {
  if (isDark) {
    switch (level) {
      case 'principiante':
        return {
          backgroundColor: 'rgba(59, 130, 246, 0.22)',
          borderColor: 'rgba(96, 165, 250, 0.5)',
        }
      case 'intermedio':
        return {
          backgroundColor: 'rgba(37, 99, 235, 0.22)',
          borderColor: 'rgba(96, 165, 250, 0.5)',
        }
      case 'avanzado':
        return {
          backgroundColor: 'rgba(8, 145, 178, 0.22)',
          borderColor: 'rgba(34, 211, 238, 0.45)',
        }
      case 'competitivo':
        return {
          backgroundColor: 'rgba(220, 38, 38, 0.2)',
          borderColor: 'rgba(248, 113, 113, 0.5)',
        }
      default:
        return {
          backgroundColor: 'rgba(255,255,255,0.08)',
          borderColor: 'rgba(148, 163, 184, 0.35)',
        }
    }
  }
  switch (level) {
    case 'principiante':
      return {
        backgroundColor: 'rgba(59, 130, 246, 0.12)',
        borderColor: 'rgba(59, 130, 246, 0.35)',
      }
    case 'intermedio':
      return {
        backgroundColor: 'rgba(37, 99, 235, 0.12)',
        borderColor: 'rgba(37, 99, 235, 0.35)',
      }
    case 'avanzado':
      return {
        backgroundColor: 'rgba(8, 145, 178, 0.12)',
        borderColor: 'rgba(8, 145, 178, 0.35)',
      }
    case 'competitivo':
      return {
        backgroundColor: 'rgba(220, 38, 38, 0.12)',
        borderColor: 'rgba(220, 38, 38, 0.35)',
      }
    default:
      return {
        backgroundColor: 'rgba(0,0,0,0.04)',
        borderColor: 'rgba(0,0,0,0.08)',
      }
  }
}
