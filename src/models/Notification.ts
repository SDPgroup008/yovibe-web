// Notification model
export interface AppNotification {
  id: string
  userId?: string // If null, it's a broadcast notification
  title: string
  body: string
  type: "event_summary" | "ticket_purchase" | "ticket_validation" | "payment_confirmation" | "event_reminder" | "welcome" | "upcoming_summary" | "other"
  data?: Record<string, any>
  imageUrl?: string
  deepLink?: string
  isRead: boolean
  createdAt: Date
  readAt?: Date
  openedAt?: Date
}

export interface NotificationAnalytics {
  notificationId: string
  totalSent: number
  totalOpened: number
  totalRead: number
  openRate: number
  readRate: number
  createdAt: Date
}

export interface DailyNotificationStats {
  date: string // Format: YYYY-MM-DD
  notificationsSent: number
  usersReceived: number // Total unique users who received notifications
  notificationsOpened: number
  newSubscriptions: number // New users who allowed notifications
  openRate: number
  createdAt: Date
}
