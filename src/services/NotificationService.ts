// Notification Service for sending alerts and updates
import { supabase } from "../config/supabase"
import { publicSiteUrl } from "../config/runtime"
import type { Event } from "../models/Event"
import type { Ticket, TicketValidation } from "../models/Ticket"
import type { AppNotification, NotificationAnalytics, DailyNotificationStats, NotificationUserInteraction, NotificationDetailedAnalytics } from "../models/Notification"

export class NotificationService {
  private static instance: NotificationService

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService()
    }
    return NotificationService.instance
  }

  // Notification creation is server-only. This method remains as a compatibility
  // guard so an old client path fails closed instead of writing arbitrary rows.
  async saveNotification(notification: Omit<AppNotification, "id" | "createdAt">): Promise<string> {
    void notification
    throw new Error("Notifications must be created by an authorized server function")
  }

  private async applyUserReadStates(notifications: AppNotification[], userId?: string): Promise<AppNotification[]> {
    if (!userId || notifications.length === 0) return notifications

    const ids = notifications.map((notification) => notification.id)
    const { data, error } = await supabase
      .from("notification_user_states")
      .select("notification_id,is_read,read_at,opened_at")
      .eq("user_id", userId)
      .in("notification_id", ids)

    if (error) throw error

    const states = new Map((data || []).map((state) => [state.notification_id, state]))
    return notifications.map((notification) => {
      const state = states.get(notification.id)
      if (!state) return notification
      return {
        ...notification,
        isRead: state.is_read === true,
        readAt: state.read_at ? new Date(state.read_at) : notification.readAt,
        openedAt: state.opened_at ? new Date(state.opened_at) : notification.openedAt,
      }
    })
  }

  // Get notifications for a specific user
  async getUserNotifications(userId?: string, limitCount: number = 50): Promise<AppNotification[]> {
    try {
      let query = supabase
        .from("notifications")
        .select("*")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(limitCount)

      const { data: broadcastData, error: broadcastError } = await query

      if (broadcastError) throw broadcastError

      const allNotifications: AppNotification[] = broadcastData?.map((doc) => ({
        id: doc.id,
        userId: doc.user_id,
        title: doc.title,
        body: doc.body,
        type: doc.type,
        data: doc.data,
        imageUrl: doc.image_url,
        deepLink: doc.deep_link,
        isRead: doc.is_read || false,
        createdAt: new Date(doc.created_at),
        readAt: doc.read_at ? new Date(doc.read_at) : undefined,
        openedAt: doc.opened_at ? new Date(doc.opened_at) : undefined,
      })) || []

      // If user is authenticated, also get their personal notifications
      if (userId) {
        const { data: userData, error: userError } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limitCount)

        if (userError) throw userError

        if (userData) {
          userData.forEach((doc) => {
            allNotifications.push({
              id: doc.id,
              userId: doc.user_id,
              title: doc.title,
              body: doc.body,
              type: doc.type,
              data: doc.data,
              imageUrl: doc.image_url,
              deepLink: doc.deep_link,
              isRead: doc.is_read || false,
              createdAt: new Date(doc.created_at),
              readAt: doc.read_at ? new Date(doc.read_at) : undefined,
              openedAt: doc.opened_at ? new Date(doc.opened_at) : undefined,
            })
          })
        }
      }

      // Sort all notifications by date and limit
      return this.applyUserReadStates(allNotifications
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limitCount), userId)
    } catch (error) {
      console.error("NotificationService: Error getting notifications:", error)
      return []
    }
  }

  // Get unread count for a user
  async getUnreadCount(userId?: string): Promise<number> {
    try {
      const { data: broadcastData, error: broadcastError } = await supabase
        .from("notifications")
        .select("id,is_read")
        .is("user_id", null)

      if (broadcastError) throw broadcastError

      let personalData: Array<{ id: string; is_read: boolean | null }> = []
      if (userId) {
        const { data: userData, error: userError } = await supabase
          .from("notifications")
          .select("id,is_read")
          .eq("user_id", userId)

        if (userError) throw userError
        personalData = userData || []
      }

      const allRows = [...(broadcastData || []), ...personalData]
      if (!userId || allRows.length === 0) {
        return allRows.filter((row) => row.is_read !== true).length
      }

      const { data: states, error: statesError } = await supabase
        .from("notification_user_states")
        .select("notification_id,is_read")
        .eq("user_id", userId)
        .in("notification_id", allRows.map((row) => row.id))

      if (statesError) throw statesError
      const stateById = new Map((states || []).map((state) => [state.notification_id, state.is_read === true]))

      return allRows.filter((row) => stateById.has(row.id) ? !stateById.get(row.id) : row.is_read !== true).length
    } catch (error) {
      console.error("NotificationService: Error getting unread count:", error)
      return 0
    }
  }

  // Mark notification as read
  async markAsRead(notificationId: string, userId?: string): Promise<void> {
    try {
      if (!userId) return
      const now = new Date().toISOString()
      const { error } = await supabase
        .from("notification_user_states")
        .upsert({
          notification_id: notificationId,
          user_id: userId,
          is_read: true,
          read_at: now,
        }, { onConflict: "notification_id,user_id" })

      if (error) throw error

      /* console.log("NotificationService: Marked notification as read:", notificationId) */
    } catch (error) {
      console.error("NotificationService: Error marking as read:", error)
    }
  }

  // Mark notification as opened
  async markAsOpened(notificationId: string, userId?: string): Promise<void> {
    try {
      if (!userId) return
      const now = new Date().toISOString()
      const { error } = await supabase
        .from("notification_user_states")
        .upsert({
          notification_id: notificationId,
          user_id: userId,
          opened_at: new Date().toISOString(),
          is_read: true,
          read_at: now,
        }, { onConflict: "notification_id,user_id" })

      if (error) throw error

      /* console.log("NotificationService: Marked notification as opened:", notificationId) */
    } catch (error) {
      console.error("NotificationService: Error marking as opened:", error)
    }
  }

  // Mark all notifications as read for a user
  async markAllAsRead(userId?: string): Promise<void> {
    try {
      const notifications = await this.getUserNotifications(userId)
      const unreadNotifications = notifications.filter(n => !n.isRead)
      if (!userId || unreadNotifications.length === 0) return

      const now = new Date().toISOString()
      const { error } = await supabase
        .from("notification_user_states")
        .upsert(unreadNotifications.map((notification) => ({
          notification_id: notification.id,
          user_id: userId,
          is_read: true,
          read_at: now,
        })), { onConflict: "notification_id,user_id" })
      if (error) throw error

      /* console.log(`NotificationService: Marked ${unreadNotifications.length} notifications as read`) */
    } catch (error) {
      console.error("NotificationService: Error marking all as read:", error)
    }
  }

  // Send ticket purchase notification to event owner
  async notifyTicketPurchase(event: Event, ticket: Ticket): Promise<void> {
    try {
      /* console.log("NotificationService: Sending ticket purchase notification") */

      await this.saveNotification({
        userId: event.createdBy,
        title: "🎫 New Ticket Purchased",
        body: `${ticket.buyerName} purchased a ticket for ${event.name}`,
        type: "ticket_purchase",
        data: {
          eventId: event.id,
          ticketId: ticket.id,
          buyerName: ticket.buyerName,
        },
        deepLink: `/events/${event.slug}`,
        isRead: false,
      })

      /* console.log("NotificationService: Ticket purchase notification saved successfully") */
    } catch (error) {
      console.error("NotificationService: Error sending ticket purchase notification:", error)
    }
  }

  // Send ticket validation notification
  async sendTicketValidationNotification(
    ticketId: string,
    buyerName: string,
    eventName: string,
    entryGranted: boolean,
    userId?: string,
  ): Promise<void> {
    try {
      await this.saveNotification({
        userId,
        title: entryGranted ? "✅ Entry Granted" : "❌ Entry Denied",
        body: `${buyerName} ${entryGranted ? "entered" : "was denied entry to"} ${eventName}`,
        type: "ticket_validation",
        data: {
          ticketId,
          buyerName,
          eventName,
          entryGranted,
        },
        isRead: false,
      })

      /* console.log("NotificationService: Validation notification saved") */
    } catch (error) {
      console.error("NotificationService: Error sending validation notification:", error)
    }
  }

  // Send payment confirmation
  async sendPaymentConfirmation(
    userId: string,
    ticketCode: string,
    eventName: string,
    amount: number,
  ): Promise<void> {
    try {
      await this.saveNotification({
        userId,
        title: "💳 Payment Successful",
        body: `Your payment of UGX ${amount.toLocaleString()} for ${eventName} was successful`,
        type: "payment_confirmation",
        data: {
          ticketCode,
          eventName,
          amount,
        },
        isRead: false,
      })

      /* console.log("NotificationService: Payment confirmation saved") */
    } catch (error) {
      console.error("NotificationService: Error sending payment confirmation:", error)
    }
  }

  // Send event reminder
  async sendEventReminder(event: Event, userId: string): Promise<void> {
    try {
      await this.saveNotification({
        userId,
        title: "⏰ Event Reminder",
        body: `${event.name} is happening soon at ${event.time}`,
        type: "event_reminder",
        data: {
          eventId: event.id,
          eventName: event.name,
          eventTime: event.time,
        },
        deepLink: `/events/${event.slug}`,
        imageUrl: event.posterImageUrl,
        isRead: false,
      })

      /* console.log("NotificationService: Event reminder saved") */
    } catch (error) {
      console.error("NotificationService: Error sending event reminder:", error)
    }
  }

  // Send welcome notification
  async sendWelcomeNotification(userId: string, userName: string): Promise<void> {
    try {
      await this.saveNotification({
        userId,
        title: "👋 Welcome to YoVibe!",
        body: `Hi ${userName}! Discover amazing events and vibes in your area.`,
        type: "welcome",
        data: {
          userName,
        },
        isRead: false,
      })

      /* console.log("NotificationService: Welcome notification saved") */
    } catch (error) {
      console.error("NotificationService: Error sending welcome notification:", error)
    }
  }

  // Send security photo upload notification
  async sendSecurityPhotoNotification(
    userId: string,
    ticketId: string,
    eventName: string,
  ): Promise<void> {
    try {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : publicSiteUrl()
      const photoUrl = `${baseUrl}/add-photo?ticket=${ticketId}`

      await this.saveNotification({
        userId,
        title: "🔒 Add Security Photo (Optional)",
        body: `Add a quick photo to your ${eventName} ticket for extra security at the gate`,
        type: "ticket_purchase",
        data: {
          ticketId,
          eventName,
          photoUploadUrl: photoUrl,
        },
        deepLink: photoUrl,
        isRead: false,
      })

      /* console.log("NotificationService: Security photo notification saved") */
    } catch (error) {
      console.error("NotificationService: Error sending security photo notification:", error)
    }
  }

  // Send refund lifecycle notifications
  async sendRefundNotification(
    userId: string | undefined,
    requestReference: string,
    refundId: string,
    status: string,
    amount?: number,
    reason?: string,
  ): Promise<void> {
    try {
      const config: Record<string, { title: string; body: string }> = {
        pending_admin_review: {
          title: "🔄 Refund Request Submitted",
          body: `Your refund request ${requestReference} has been submitted for admin review.`,
        },
        approved: {
          title: "✅ Refund Approved",
          body: `Your refund ${requestReference} of UGX ${(amount || 0).toLocaleString()} has been approved.`,
        },
        rejected: {
          title: "❌ Refund Rejected",
          body: `Your refund request ${requestReference} has been rejected.${reason ? ` Reason: ${reason}` : ""}`,
        },
        submitted: {
          title: "💰 Refund Submitted",
          body: `Your refund ${requestReference} has been sent to the payment provider for processing.`,
        },
        completed: {
          title: "✅ Refund Completed",
          body: `Your refund ${requestReference} of UGX ${(amount || 0).toLocaleString()} has been completed.`,
        },
        needs_attention: {
          title: "⚠️ Refund Needs Attention",
          body: `There was an issue processing refund ${requestReference}. An admin is reviewing it.`,
        },
      }
      const c = config[status] || { title: "Refund Update", body: `Refund ${requestReference} updated to ${status}.` }
      await this.saveNotification({
        userId: userId || "",
        title: c.title,
        body: c.body,
        type: "refund_update",
        data: { refundId, requestReference, status, amount },
        isRead: false,
      })
    } catch (error) {
      console.error("NotificationService: Error sending refund notification:", error)
    }
  }

  // Send event cancellation/postponement notification to ticket buyers
  async sendEventStatusNotification(
    buyerId: string,
    eventName: string,
    status: "cancelled" | "postponed",
    postponedTo?: string,
  ): Promise<void> {
    try {
      const title = status === "cancelled" ? "🚫 Event Cancelled" : "📅 Event Postponed"
      const body = status === "cancelled"
        ? `${eventName} has been cancelled. You are eligible for a refund.`
        : `${eventName} has been postponed${postponedTo ? ` to ${postponedTo}` : ""}. Your tickets remain valid.`
      await this.saveNotification({
        userId: buyerId,
        title,
        body,
        type: "event_status_change",
        data: { eventName, status, postponedTo },
        isRead: false,
      })
    } catch (error) {
      console.error("NotificationService: Error sending event status notification:", error)
    }
  }

  // Notification listeners for real-time updates
  private notificationListeners: Array<() => void> = []

  // Register a listener for new notifications
  addNotificationListener(callback: () => void): () => void {
    this.notificationListeners.push(callback)
    return () => {
      this.notificationListeners = this.notificationListeners.filter(cb => cb !== callback)
    }
  }

  // Notify all listeners
  private notifyListeners(): void {
    this.notificationListeners.forEach(callback => {
      try {
        callback()
      } catch (error) {
        console.error("NotificationService: Error calling listener:", error)
      }
    })
  }

  // Process incoming push notification. Server-created notifications already exist
  // in Supabase; never create a second row for a foreground delivery.
  async processIncomingNotification(payload: any, userId?: string): Promise<void> {
    /* console.log("[NotificationService] processIncomingNotification called"); */

    try {
      void userId
      this.notifyListeners()
    } catch (error) {
      console.error("[NotificationService] ❌ ERROR processing incoming notification:", error);
      throw error;
    }
  }

  // Get daily notification statistics
  async getDailyNotificationStats(days: number = 30): Promise<DailyNotificationStats[]> {
    try {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)
      const startDateStr = startDate.toISOString().split('T')[0]

      const { data, error } = await supabase
        .from("daily_notification_stats")
        .select("*")
        .gte("date", startDateStr)
        .limit(days)
        .order("date", { ascending: true })

      if (error) throw error

      return (data || []).map((doc) => ({
        date: doc.date,
        notificationsSent: doc.notifications_sent || 0,
        usersReceived: doc.users_received || 0,
        notificationsOpened: doc.notifications_opened || 0,
        newSubscriptions: doc.new_subscriptions || 0,
        openRate: doc.notifications_sent > 0 ? (doc.notifications_opened / doc.notifications_sent) * 100 : 0,
        createdAt: new Date(doc.created_at),
      }))
    } catch (error) {
      console.error("[NotificationService] Error getting daily stats:", error)
      return []
    }
  }

  // Get analytics for all notifications
  async getAllNotificationAnalytics(limitCount: number = 20): Promise<NotificationAnalytics[]> {
    try {
      const { data, error } = await supabase
        .from("notification_analytics")
        .select("*")
        .limit(limitCount)
        .order("created_at", { ascending: false })

      if (error) throw error

      return (data || []).map((doc) => ({
        notificationId: doc.notification_id,
        totalSent: doc.total_sent || 0,
        totalOpened: doc.total_opened || 0,
        totalRead: doc.total_read || 0,
        uniqueUsersReceived: doc.unique_users_received || 0,
        uniqueUsersOpened: doc.unique_users_opened || 0,
        openRate: doc.total_sent > 0 ? (doc.total_opened / doc.total_sent) * 100 : 0,
        readRate: doc.total_sent > 0 ? (doc.total_read / doc.total_sent) * 100 : 0,
        createdAt: new Date(doc.created_at),
      }))
    } catch (error) {
      console.error("NotificationService: Error getting analytics:", error)
      return []
    }
  }

  // Get detailed analytics for a notification with user lists
  async getNotificationDetailedAnalytics(notificationId: string): Promise<NotificationDetailedAnalytics | null> {
    try {
      const { data, error } = await supabase
        .from("notification_analytics")
        .select("*")
        .eq("notification_id", notificationId)
        .single()

      if (error) throw error

      if (!data) return null

      const { data: interactions, error: interactionsError } = await supabase
        .from("notification_user_interactions")
        .select("user_id, opened_at")
        .eq("notification_id", notificationId)

      if (interactionsError) throw interactionsError

      const usersWhoReceived = interactions?.map(i => i.user_id) || []
      const usersWhoOpened = interactions?.filter(i => i.opened_at).map(i => i.user_id) || []

      const totalSent = data.total_sent || 0
      const totalOpened = data.total_opened || 0

      return {
        notificationId,
        totalSent,
        totalOpened,
        totalRead: data.total_read || 0,
        uniqueUsersReceived: usersWhoReceived.length,
        uniqueUsersOpened: usersWhoOpened.length,
        openRate: totalSent > 0 ? (totalOpened / totalSent) * 100 : 0,
        readRate: totalSent > 0 ? ((data.total_read || 0) / totalSent) * 100 : 0,
        createdAt: new Date(data.created_at),
        usersWhoReceived,
        usersWhoOpened,
      }
    } catch (error) {
      console.error("[NotificationService] Error getting detailed analytics:", error)
      return null
    }
  }

  // Get all notifications with user interaction details
  async getAllNotificationDetailedAnalytics(limitCount: number = 20): Promise<NotificationDetailedAnalytics[]> {
    try {
      const { data: analytics, error: analyticsError } = await supabase
        .from("notification_analytics")
        .select("*")
        .limit(limitCount)

      if (analyticsError) throw analyticsError

      const detailedAnalytics: NotificationDetailedAnalytics[] = []

      for (const doc of analytics || []) {
        const { data: interactions, error: interactionsError } = await supabase
          .from("notification_user_interactions")
          .select("user_id, opened_at")
          .eq("notification_id", doc.notification_id)

        if (interactionsError) throw interactionsError

        const usersWhoReceived = interactions?.map(i => i.user_id) || []
        const usersWhoOpened = interactions?.filter(i => i.opened_at).map(i => i.user_id) || []

        const totalSent = doc.total_sent || 0
        const totalOpened = doc.total_opened || 0

        detailedAnalytics.push({
          notificationId: doc.notification_id,
          totalSent,
          totalOpened,
          totalRead: doc.total_read || 0,
          uniqueUsersReceived: usersWhoReceived.length,
          uniqueUsersOpened: usersWhoOpened.length,
          openRate: totalSent > 0 ? (totalOpened / totalSent) * 100 : 0,
          readRate: totalSent > 0 ? ((doc.total_read || 0) / totalSent) * 100 : 0,
          createdAt: new Date(doc.created_at),
          usersWhoReceived,
          usersWhoOpened,
        })
      }

      return detailedAnalytics
    } catch (error) {
      console.error("[NotificationService] Error getting all detailed analytics:", error)
      return []
    }
  }

  // Track new subscription
  async trackNewSubscription(): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0]
      const { error } = await supabase
        .from("daily_notification_stats")
        .upsert({
          date: today,
          new_subscriptions: 1,
          created_at: new Date().toISOString(),
        }, {
          onConflict: 'date'
        })

      if (error) throw error
      /* console.log("NotificationService: New subscription tracked") */
    } catch (error) {
      console.error("NotificationService: Error tracking subscription:", error)
    }
  }
}

export default NotificationService.getInstance()
