export type AppNotificationType =
  | 'chat_message'
  | 'match_invitation'
  | 'match_upcoming_2h'
  | 'match_finished_review_pending'

export type NotificationPayload = {
  targetTab?: string
  matchId?: string
  chatId?: string
  route?: string
}

export type AppNotification = {
  id: string
  type: AppNotificationType
  title: string
  body: string
  payload: NotificationPayload
  isRead: boolean
  createdAt: Date
}
