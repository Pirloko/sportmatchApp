import type { AppNotificationType, NotificationPayload } from '../notifications/types'

/** Payload `data` de Expo Push alineado con resolvePushNotificationRoute. */
export function buildExpoPushData(
  type: AppNotificationType | string,
  payload: NotificationPayload | null | undefined
): Record<string, string> {
  const matchId =
    (typeof payload?.matchId === 'string' && payload.matchId) ||
    (typeof payload?.chatId === 'string' && payload.chatId) ||
    ''

  const data: Record<string, string> = {
    notificationType: String(type),
  }

  if (matchId) {
    data.matchId = matchId
    data.opportunityId = matchId
  }

  if (typeof payload?.targetTab === 'string' && payload.targetTab) {
    data.targetTab = payload.targetTab
    data.tab = payload.targetTab
  }

  if (typeof payload?.route === 'string' && payload.route) {
    data.route = payload.route
  }

  return data
}
