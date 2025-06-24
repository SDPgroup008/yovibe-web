import { collection, addDoc, getDocs, query, where, Timestamp } from "firebase/firestore"
import { db } from "../config/firebase"
import FirebaseService from "./FirebaseService"

interface Notification {
  id?: string
  userId: string
  type: string
  title: string
  message: string
  data?: any
  read: boolean
  createdAt: Date
}

class NotificationService {
  // Send notification to event owner
  async notifyEventOwner(
    eventId: string,
    notification: {
      type: string
      message: string
      ticketId?: string
      amount?: number
    },
  ): Promise<void> {
    try {
      // Get event details to find owner
      const event = await FirebaseService.getEventById(eventId)
      if (!event || !event.createdBy) {
        console.warn("NotificationService: Event or owner not found")
        return
      }

      const notificationData: Omit<Notification, "id"> = {
        userId: event.createdBy,
        type: notification.type,
        title: "Ticket Purchase",
        message: notification.message,
        data: {
          eventId,
          ticketId: notification.ticketId,
          amount: notification.amount,
        },
        read: false,
        createdAt: new Date(),
      }

      await addDoc(collection(db, "notifications"), {
        ...notificationData,
        createdAt: Timestamp.fromDate(notificationData.createdAt),
      })

      console.log("NotificationService: Notification sent to event owner")
    } catch (error) {
      console.error("NotificationService: Error sending notification:", error)
    }
  }

  // Get user notifications
  async getUserNotifications(userId: string): Promise<Notification[]> {
    try {
      const notificationsRef = collection(db, "notifications")
      const q = query(notificationsRef, where("userId", "==", userId))
      const querySnapshot = await getDocs(q)
      const notifications: Notification[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        notifications.push({
          id: doc.id,
          userId: data.userId,
          type: data.type,
          title: data.title,
          message: data.message,
          data: data.data,
          read: data.read,
          createdAt: data.createdAt.toDate(),
        })
      })

      return notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    } catch (error) {
      console.error("NotificationService: Error getting notifications:", error)
      return []
    }
  }
}

export default new NotificationService()
