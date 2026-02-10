// Notification model
export interface AppNotification {
  id: string
  userId?: string // If null, it's a broadcast notification
  title: string
  body: string
  type: "event_summary" | "ticket_purchase" | "ticket_validation" | "payment_confirmation" | "event_reminder" | "welcome" | "other"
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
