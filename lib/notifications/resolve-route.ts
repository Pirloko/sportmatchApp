import type { AppNotificationType, NotificationPayload } from './types'

export type PushNotificationData = {
  route?: string
  tab?: string
  opportunityId?: string
  matchId?: string
  type?: string
  notificationType?: string
  targetTab?: string
}

function matchIdFrom(payload: NotificationPayload | null | undefined): string | null {
  const id = payload?.matchId ?? payload?.chatId
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

function tabRoute(targetTab: string, matchId: string | null): string | null {
  const tab = targetTab.trim().toLowerCase()
  if (tab === 'chats' || tab === 'chat') {
    return matchId ? `/partidos/chat/${matchId}` : '/partidos?tab=chats'
  }
  if (tab === 'invitations' || tab === 'invitaciones' || tab === 'invitation') {
    return matchId ? `/partidos/${matchId}` : '/partidos?tab=invitaciones'
  }
  if (tab === 'upcoming' || tab === 'proximos' || tab === 'mine') {
    return matchId ? `/partidos/${matchId}` : '/partidos?tab=proximos'
  }
  if (tab === 'finished' || tab === 'finalizados' || tab === 'past' || tab === 'completed') {
    return matchId ? `/partidos/${matchId}` : '/partidos?tab=finalizados'
  }
  return null
}

export function resolveNotificationRoute(
  type: AppNotificationType | string | undefined,
  payload: NotificationPayload | null | undefined
): string | null {
  if (payload?.route && typeof payload.route === 'string') {
    return payload.route
  }

  const matchId = matchIdFrom(payload)

  if (payload?.targetTab) {
    const fromTab = tabRoute(payload.targetTab, matchId)
    if (fromTab) return fromTab
  }

  switch (type) {
    case 'chat_message':
      return matchId ? `/partidos/chat/${matchId}` : '/partidos?tab=chats'
    case 'match_invitation':
      return matchId ? `/partidos/${matchId}` : '/partidos?tab=invitaciones'
    case 'match_upcoming_2h':
      return matchId ? `/partidos/${matchId}` : '/partidos?tab=proximos'
    case 'match_finished_review_pending':
      return matchId ? `/partidos/${matchId}` : '/partidos?tab=finalizados'
    default:
      return null
  }
}

/** Rutas desde payload de push nativo (Expo / cron). */
export function resolvePushNotificationRoute(data: PushNotificationData): string | null {
  if (data.route && typeof data.route === 'string') return data.route

  const matchId =
    (typeof data.opportunityId === 'string' && data.opportunityId) ||
    (typeof data.matchId === 'string' && data.matchId) ||
    null

  const payload: NotificationPayload = {
    targetTab: data.targetTab ?? data.tab,
    matchId: matchId ?? undefined,
  }

  const type =
    data.notificationType ??
    data.type ??
    (data.tab === 'chats' ? 'chat_message' : undefined)

  if (type === 'chat' && matchId) return `/partidos/chat/${matchId}`
  if (type === 'invitacion' || type === 'invitation') {
    return resolveNotificationRoute('match_invitation', payload)
  }
  if (type === 'finalizado' && matchId) return `/partidos/${matchId}`

  const resolved = resolveNotificationRoute(type, payload)
  if (resolved) return resolved

  if (data.tab === 'chats') return '/partidos?tab=chats'
  return null
}
