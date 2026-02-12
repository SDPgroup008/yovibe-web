// Notification Service for sending alerts and updates
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  increment,
} from "firebase/firestore"
import { db } from "../config/firebase"
import type { Event } from "../models/Event"
import type { Ticket, TicketValidation } from "../models/Ticket"
import type { AppNotification, NotificationAnalytics } from "../models/Notification"

export class NotificationService {
  private static instance: NotificationService

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService()
    }
    return NotificationService.instance
  }

  // Save a notification to Firestore
  async saveNotification(notification: Omit<AppNotification, "id" | "createdAt">): Promise<string> {
    console.log("[NotificationService] saveNotification called");
    console.log("[NotificationService] Input notification:", notification);
    
    try {
      const notificationData: any = {
        title: notification.title,
        body: notification.body,
        type: notification.type,
        isRead: false,
        createdAt: Timestamp.now(),
      }

      // Explicitly set userId (null for broadcast, string for user-specific, omit if undefined)
      if (notification.userId === null) {
        notificationData.userId = null
        console.log("[NotificationService] Setting userId to NULL (broadcast)");
      } else if (notification.userId !== undefined) {
        notificationData.userId = notification.userId
        console.log("[NotificationService] Setting userId to:", notification.userId);
      } else {
        console.log("[NotificationService] No userId set (undefined)");
      }

      // Add optional fields if present
      if (notification.data) notificationData.data = notification.data
      if (notification.imageUrl) notificationData.imageUrl = notification.imageUrl
      if (notification.deepLink) notificationData.deepLink = notification.deepLink

      console.log("[NotificationService] Final notification data to save:", notificationData);
      console.log("[NotificationService] Saving to collection: YoVibe/data/notifications");
      
      const docRef = await addDoc(collection(db, "YoVibe/data/notifications"), notificationData)
      
      console.log("[NotificationService] ✅ Saved notification with ID:", docRef.id);
      console.log("[NotificationService] Document path:", docRef.path);
      
      return docRef.id
    } catch (error) {
      console.error("[NotificationService] ❌ ERROR saving notification:", error);
      console.error("[NotificationService] Error type:", error instanceof Error ? error.constructor.name : typeof error);
      console.error("[NotificationService] Error message:", error instanceof Error ? error.message : String(error));
      console.error("[NotificationService] Error stack:", error instanceof Error ? error.stack : "N/A");
      throw error
    }
  }

  // Get notifications for a specific user
  async getUserNotifications(userId?: string, limitCount: number = 50): Promise<AppNotification[]> {
    try {
      const notificationsRef = collection(db, "YoVibe/data/notifications")
      const allNotifications: AppNotification[] = []

      // Get broadcast notifications (userId == null)
      const broadcastQuery = query(
        notificationsRef,
        where("userId", "==", null),
        orderBy("createdAt", "desc"),
        limit(limitCount)
      )
      const broadcastSnapshot = await getDocs(broadcastQuery)
      console.log(`NotificationService: Found ${broadcastSnapshot.size} broadcast notifications`)
      
      broadcastSnapshot.forEach((doc) => {
        const data = doc.data()
        allNotifications.push({
          id: doc.id,
          userId: data.userId,
          title: data.title,
          body: data.body,
          type: data.type,
          data: data.data,
          imageUrl: data.imageUrl,
          deepLink: data.deepLink,
          isRead: data.isRead || false,
          createdAt: data.createdAt?.toDate() || new Date(),
          readAt: data.readAt?.toDate(),
          openedAt: data.openedAt?.toDate(),
        })
      })

      // If user is authenticated, also get their personal notifications
      if (userId) {
        const userQuery = query(
          notificationsRef,
          where("userId", "==", userId),
          orderBy("createdAt", "desc"),
          limit(limitCount)
        )
        const userSnapshot = await getDocs(userQuery)
        console.log(`NotificationService: Found ${userSnapshot.size} user-specific notifications`)
        
        userSnapshot.forEach((doc) => {
          const data = doc.data()
          allNotifications.push({
            id: doc.id,
            userId: data.userId,
            title: data.title,
            body: data.body,
            type: data.type,
            data: data.data,
            imageUrl: data.imageUrl,
            deepLink: data.deepLink,
            isRead: data.isRead || false,
            createdAt: data.createdAt?.toDate() || new Date(),
            readAt: data.readAt?.toDate(),
            openedAt: data.openedAt?.toDate(),
          })
        })
      }

      // Sort all notifications by date and limit
      const sortedNotifications = allNotifications
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limitCount)

      console.log(`NotificationService: Retrieved ${sortedNotifications.length} total notifications`)
      return sortedNotifications
    } catch (error) {
      console.error("NotificationService: Error getting notifications:", error)
      return []
    }
  }

  // Get unread count for a user
  async getUnreadCount(userId?: string): Promise<number> {
    try {
      const notificationsRef = collection(db, "YoVibe/data/notifications")
      let count = 0

      // Get broadcast unread notifications (userId == null)
      const broadcastQuery = query(
        notificationsRef,
        where("userId", "==", null),
        where("isRead", "==", false)
      )
      const broadcastSnapshot = await getDocs(broadcastQuery)
      count += broadcastSnapshot.size
      console.log(`NotificationService: Found ${broadcastSnapshot.size} unread broadcast notifications`)

      // If user is authenticated, also get their personal unread notifications
      if (userId) {
        const userQuery = query(
          notificationsRef,
          where("userId", "==", userId),
          where("isRead", "==", false)
        )
        const userSnapshot = await getDocs(userQuery)
        count += userSnapshot.size
        console.log(`NotificationService: Found ${userSnapshot.size} unread user notifications`)
      }
      
      console.log(`NotificationService: Total unread count for user ${userId || 'anonymous'}: ${count}`)
      return count
    } catch (error) {
      console.error("NotificationService: Error getting unread count:", error)
      return 0
    }
  }

  // Mark notification as read
  async markAsRead(notificationId: string): Promise<void> {
    try {
      const notificationRef = doc(db, "YoVibe/data/notifications", notificationId)
      await updateDoc(notificationRef, {
        isRead: true,
        readAt: Timestamp.now(),
      })
      console.log("NotificationService: Marked notification as read:", notificationId)
      
      // Update analytics
      await this.updateAnalytics(notificationId, "read")
    } catch (error) {
      console.error("NotificationService: Error marking as read:", error)
    }
  }

  // Mark notification as opened
  async markAsOpened(notificationId: string): Promise<void> {
    try {
      const notificationRef = doc(db, "YoVibe/data/notifications", notificationId)
      const notificationDoc = await getDoc(notificationRef)
      
      if (notificationDoc.exists() && !notificationDoc.data().openedAt) {
        await updateDoc(notificationRef, {
          openedAt: Timestamp.now(),
          isRead: true,
          readAt: Timestamp.now(),
        })
        console.log("NotificationService: Marked notification as opened:", notificationId)
        
        // Update analytics
        await this.updateAnalytics(notificationId, "opened")
      }
    } catch (error) {
      console.error("NotificationService: Error marking as opened:", error)
    }
  }

  // Mark all notifications as read for a user
  async markAllAsRead(userId?: string): Promise<void> {
    try {
      const notifications = await this.getUserNotifications(userId)
      const unreadNotifications = notifications.filter(n => !n.isRead)
      
      const promises = unreadNotifications.map(notification =>
        this.markAsRead(notification.id)
      )
      
      await Promise.all(promises)
      console.log(`NotificationService: Marked ${unreadNotifications.length} notifications as read`)
    } catch (error) {
      console.error("NotificationService: Error marking all as read:", error)
    }
  }

  // Update analytics for a notification
  private async updateAnalytics(notificationId: string, action: "read" | "opened"): Promise<void> {
    try {
      const analyticsRef = collection(db, "YoVibe/data/notification_analytics")
      const q = query(analyticsRef, where("notificationId", "==", notificationId))
      const querySnapshot = await getDocs(q)

      if (querySnapshot.empty) {
        // Create new analytics document
        await addDoc(analyticsRef, {
          notificationId,
          totalSent: 1,
          totalOpened: action === "opened" ? 1 : 0,
          totalRead: 1,
          createdAt: Timestamp.now(),
        })
      } else {
        // Update existing analytics
        const analyticsDoc = querySnapshot.docs[0]
        const updateData: any = {
          totalRead: increment(1),
        }
        
        if (action === "opened") {
          updateData.totalOpened = increment(1)
        }
        
        await updateDoc(doc(db, "YoVibe/data/notification_analytics", analyticsDoc.id), updateData)
      }
    } catch (error) {
      console.error("NotificationService: Error updating analytics:", error)
    }
  }

  // Get analytics for all notifications (limited to most recent)
  async getAllNotificationAnalytics(limitCount: number = 20): Promise<NotificationAnalytics[]> {
    try {
      const analyticsRef = collection(db, "YoVibe/data/notification_analytics")
      const q = query(analyticsRef, orderBy("createdAt", "desc"), limit(limitCount))
      const querySnapshot = await getDocs(q)
      
      const analytics: NotificationAnalytics[] = []
      
      querySnapshot.forEach((doc) => {
        const data = doc.data()
        analytics.push({
          notificationId: data.notificationId,
          totalSent: data.totalSent || 0,
          totalOpened: data.totalOpened || 0,
          totalRead: data.totalRead || 0,
          openRate: data.totalSent > 0 ? (data.totalOpened / data.totalSent) * 100 : 0,
          readRate: data.totalSent > 0 ? (data.totalRead / data.totalSent) * 100 : 0,
          createdAt: data.createdAt?.toDate() || new Date(),
        })
      })
      
      return analytics
    } catch (error) {
      console.error("NotificationService: Error getting analytics:", error)
      return []
    }
  }

  // Send ticket purchase notification to event owner
  async notifyTicketPurchase(event: Event, ticket: Ticket): Promise<void> {
    try {
      console.log("NotificationService: Sending ticket purchase notification")
      
      // Save to Firestore
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
        deepLink: `/events/${event.id}`,
      })

      console.log("NotificationService: Ticket purchase notification saved successfully")
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
      })

      console.log("NotificationService: Validation notification saved")
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
      })

      console.log("NotificationService: Payment confirmation saved")
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
        deepLink: `/events/${event.id}`,
        imageUrl: event.posterImageUrl,
      })

      console.log("NotificationService: Event reminder saved")
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
      })

      console.log("NotificationService: Welcome notification saved")
    } catch (error) {
      console.error("NotificationService: Error sending welcome notification:", error)
    }
  }

  // Notification listeners for real-time updates
  private notificationListeners: Array<() => void> = []

  // Register a listener for new notifications
  addNotificationListener(callback: () => void): () => void {
    this.notificationListeners.push(callback)
    // Return unsubscribe function
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

  // Process incoming push notification and save to Firestore
  async processIncomingNotification(payload: any, userId?: string): Promise<void> {
    console.log("[NotificationService] processIncomingNotification called");
    console.log("[NotificationService] Payload:", payload);
    console.log("[NotificationService] User ID:", userId);
    
    try {
      const notificationType = payload.data?.type || "other"
      console.log("[NotificationService] Notification type:", notificationType);
      
      // Broadcast notifications (upcoming_summary from GitHub workflows) should have null userId
      const isBroadcast = notificationType === "upcoming_summary"
      console.log("[NotificationService] Is broadcast:", isBroadcast);
      
      const notification: Omit<AppNotification, "id" | "createdAt"> = {
        userId: isBroadcast ? null : (userId || undefined),
        title: payload.notification?.title || "Notification",
        body: payload.notification?.body || "",
        type: notificationType,
        data: payload.data || {},
        deepLink: payload.data?.deepLink,
        imageUrl: payload.notification?.imageUrl,
        isRead: false,
      }

      console.log("[NotificationService] Prepared notification:", notification);
      console.log("[NotificationService] Calling saveNotification...");
      
      const notificationId = await this.saveNotification(notification)
      
      console.log("[NotificationService] ✅ Notification saved with ID:", notificationId);
      console.log("[NotificationService] Notifying listeners...");
      
      // Notify all listeners that a new notification arrived
      this.notifyListeners()
      
      console.log("[NotificationService] ✅ Processing complete");
    } catch (error) {
      console.error("[NotificationService] ❌ ERROR processing incoming notification:", error);
      console.error("[NotificationService] Error details:", error instanceof Error ? error.message : String(error));
      console.error("[NotificationService] Error stack:", error instanceof Error ? error.stack : "N/A");
      throw error;
    }
  }
}

export default NotificationService.getInstance()

