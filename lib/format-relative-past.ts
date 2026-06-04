/** Texto relativo al pasado, p. ej. "hace 3 días". */
export function formatRelativePast(date: Date): string {
  const ms = Math.max(0, Date.now() - date.getTime())
  const mins = Math.floor(ms / 60_000)
  const hours = Math.floor(ms / 3_600_000)
  const days = Math.floor(ms / 86_400_000)

  if (mins < 1) return 'hace un momento'
  if (mins < 60) return mins === 1 ? 'hace 1 minuto' : `hace ${mins} minutos`
  if (hours < 24) return hours === 1 ? 'hace 1 hora' : `hace ${hours} horas`
  if (days === 1) return 'hace ayer'
  if (days < 7) return `hace ${days} días`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return weeks === 1 ? 'hace 1 semana' : `hace ${weeks} semanas`
  const months = Math.floor(days / 30)
  if (months < 12) return months === 1 ? 'hace 1 mes' : `hace ${months} meses`
  const years = Math.floor(days / 365)
  return years === 1 ? 'hace 1 año' : `hace ${years} años`
}
