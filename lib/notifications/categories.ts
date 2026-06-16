import type { AppNotificationType } from './types'

/** Categorías configurables en ajustes de push. */
export type NotificationCategory = 'matches' | 'chat' | 'reviews'

export type NotificationPreferences = {
  pushMatches: boolean
  pushChat: boolean
  pushReviews: boolean
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  pushMatches: true,
  pushChat: true,
  pushReviews: true,
}

export const NOTIFICATION_CATEGORY_LABELS: Record<
  NotificationCategory,
  { title: string; description: string }
> = {
  matches: {
    title: 'Partidos',
    description: 'Invitaciones y recordatorios 2 h antes del partido.',
  },
  chat: {
    title: 'Mensajes',
    description: 'Nuevos mensajes en el chat del partido.',
  },
  reviews: {
    title: 'Reseñas y MVP',
    description: 'Aviso cuando un partido termina y puedes valorar.',
  },
}

export function notificationTypeToCategory(
  type: AppNotificationType | string
): NotificationCategory {
  switch (type) {
    case 'chat_message':
      return 'chat'
    case 'match_finished_review_pending':
      return 'reviews'
    case 'match_invitation':
    case 'match_upcoming_2h':
      return 'matches'
    default:
      return 'matches'
  }
}

export function isPushAllowedForType(
  type: AppNotificationType | string,
  prefs: NotificationPreferences
): boolean {
  const category = notificationTypeToCategory(type)
  if (category === 'chat') return prefs.pushChat
  if (category === 'reviews') return prefs.pushReviews
  return prefs.pushMatches
}
