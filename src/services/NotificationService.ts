// Notification Service for sending alerts and updates
import type { Event } from "../models/Event"
import type { Ticket, TicketValidation } from "../models/Ticket"

export class NotificationService {
  private static instance: NotificationService

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService()
    }
    return NotificationService.instance
  }

  // Send ticket purchase notification to event owner
  static async notifyTicketPurchase(event: Event, ticket: Ticket): Promise<void> {
    try {
      console.log("NotificationService: Sending ticket purchase notification")
      console.log(`Ticket purchased for ${event.name} by ${ticket.buyerName}`)

      // In a real implementation, you would:
      // 1. Send email to buyer with ticket details
      // 2. Send notification to event owner about new sale
      // 3. Update analytics/metrics

      // For now, just log the notification
      console.log("NotificationService: Ticket purchase notification sent successfully")
    } catch (error) {
      console.error("NotificationService: Error sending ticket purchase notification:", error)
      // Don't throw error - notifications shouldn't break the main flow
    }
  }

  // Send ticket validation notification
  async sendTicketValidationNotification(
    ticketId: string,
    buyerName: string,
    eventName: string,
    entryGranted: boolean,
  ): Promise<void> {
    try {
      const notification = {
        title: entryGranted ? "✅ Entry Granted" : "❌ Entry Denied",
        body: `${buyerName} ${entryGranted ? "entered" : "was denied entry to"} ${eventName}`,
        data: {
          type: "ticket_validation",
          ticketId,
          buyerName,
          eventName,
          entryGranted: entryGranted.toString(),
        },
      }

      console.log("Sending validation notification:", notification)
    } catch (error) {
      console.error("Error sending validation notification:", error)
    }
  }

  // Send payment confirmation
  async sendPaymentConfirmation(
    buyerEmail: string,
    ticketCode: string,
    eventName: string,
    amount: number,
  ): Promise<void> {
    try {
      // In production, send email confirmation
      const emailData = {
        to: buyerEmail,
        subject: `Ticket Confirmation - ${eventName}`,
        body: `Your ticket purchase was successful!\n\nTicket Code: ${ticketCode}\nEvent: ${eventName}\nAmount: UGX ${amount.toLocaleString()}`,
      }

      console.log("Sending payment confirmation:", emailData)
    } catch (error) {
      console.error("Error sending payment confirmation:", error)
    }
  }

  // Send event reminder
  static async sendEventReminder(event: Event, userEmail: string): Promise<void> {
    try {
      console.log("NotificationService: Sending event reminder for", event.name, "to", userEmail)
      // Implementation would go here
      console.log("NotificationService: Event reminder sent successfully")
    } catch (error) {
      console.error("NotificationService: Error sending event reminder:", error)
    }
  }

  // Get notification history for user
  async getNotificationHistory(userId: string): Promise<any[]> {
    try {
      // In production, query from database
      return []
    } catch (error) {
      console.error("Error getting notification history:", error)
      return []
    }
  }

  // Mark notification as read
  async markNotificationAsRead(notificationId: string): Promise<void> {
    try {
      // In production, update in database
      console.log("Marking notification as read:", notificationId)
    } catch (error) {
      console.error("Error marking notification as read:", error)
    }
  }

  static async notifyTicketValidation(ticket: Ticket, validation: TicketValidation): Promise<void> {
    try {
      console.log("NotificationService: Sending ticket validation notification")
      console.log(`Ticket ${ticket.id} validation: ${validation.status}`)

      // In a real implementation, you would:
      // 1. Send notification to event owner about ticket usage
      // 2. Update real-time dashboard
      // 3. Log security events if validation failed

      // For now, just log the notification
      console.log("NotificationService: Ticket validation notification sent successfully")
    } catch (error) {
      console.error("NotificationService: Error sending ticket validation notification:", error)
      // Don't throw error - notifications shouldn't break the main flow
    }
  }

  static async sendWelcomeEmail(userEmail: string, userName: string): Promise<void> {
    try {
      console.log("NotificationService: Sending welcome email to", userEmail)
      // Implementation would go here
      console.log("NotificationService: Welcome email sent successfully")
    } catch (error) {
      console.error("NotificationService: Error sending welcome email:", error)
    }
  }

  private static async sendPushNotification(userId: string, notification: any): Promise<void> {
    try {
      // In production, implement push notification service
      console.log(`Push notification to ${userId}:`, notification)
    } catch (error) {
      console.error("Error sending push notification:", error)
    }
  }
}

// export default NotificationService.getInstance()
