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
  uniqueUsersReceived: number // Unique users who received this notification
  uniqueUsersOpened: number // Unique users who opened this notification
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

// Track individual user interactions with notifications
export interface NotificationUserInteraction {
  id: string
  notificationId: string
  userId: string // FCM token or user ID
  receivedAt: Date
  openedAt?: Date
  readAt?: Date
}

// Detailed analytics with user lists
export interface NotificationDetailedAnalytics extends NotificationAnalytics {
  usersWhoReceived: string[] // List of user IDs who received
  usersWhoOpened: string[] // List of user IDs who opened
}
