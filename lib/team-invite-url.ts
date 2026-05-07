const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** UUID v4 (equipos, centros, partidos en URL pública). */
export function isValidTeamInviteId(id: string): boolean {
  return UUID_RE.test(id.trim())
}

/** URL para compartir invitación (configura `EXPO_PUBLIC_SITE_URL` en producción). */
export function teamInviteAbsoluteUrl(teamId: string): string {
  const base = (process.env.EXPO_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  if (!base) {
    return `pichanga://equipo/${teamId}`
  }
  return `${base}/equipo/${teamId}`
}
