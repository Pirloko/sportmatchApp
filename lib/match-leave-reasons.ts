/** Motivos predefinidos para salir de revuelta / selección de equipos (mín. 5 caracteres en RPC). */
export const MATCH_LEAVE_REASON_PRESETS = [
  { id: 'cannot_attend', label: 'No puedo asistir al partido' },
  { id: 'schedule', label: 'Conflicto de horario' },
  { id: 'injury', label: 'Lesión o molestia física' },
  { id: 'other_commitment', label: 'Otro compromiso personal' },
  { id: 'transport', label: 'Problemas de transporte' },
] as const

export type MatchLeaveReasonPresetId =
  (typeof MATCH_LEAVE_REASON_PRESETS)[number]['id']

export function matchLeaveReasonLabel(id: MatchLeaveReasonPresetId): string {
  return MATCH_LEAVE_REASON_PRESETS.find((r) => r.id === id)?.label ?? id
}

export function mapLeaveMatchRpcError(code: string | null): string {
  switch (code) {
    case 'not_authenticated':
      return 'Debes iniciar sesión.'
    case 'reason_required':
      return 'Selecciona un motivo para salir del partido.'
    case 'not_found':
      return 'No encontramos este partido.'
    case 'already_closed':
      return 'Este partido ya está cerrado.'
    case 'not_supported_for_type':
      return 'Este tipo de partido no permite salir desde la app.'
    case 'creator_cannot_leave':
      return 'El organizador no puede abandonar su propio partido.'
    case 'too_late_leave':
      return 'Ya no puedes salir: faltan menos de 2 horas para el partido.'
    case 'not_participant':
      return 'No estás inscrito en este partido.'
    default:
      return 'No se pudo salir del partido. Intenta de nuevo.'
  }
}

/** Tipos que usan `leave_match_opportunity_with_reason` en Supabase. */
export function supportsLeaveWithReason(type: string): boolean {
  return (
    type === 'open' ||
    type === 'players' ||
    type === 'team_pick' ||
    type === 'team_pick_public' ||
    type === 'team_pick_private'
  )
}
