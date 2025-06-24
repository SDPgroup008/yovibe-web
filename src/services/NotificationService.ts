// Notification Service for sending alerts and updates
import type { Event } from "../models/Event"
import type { Ticket, TicketValidation } from "../models/Ticket"

class NotificationService {
  private static instance: NotificationService

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService()
    }
    return NotificationService.instance
  }

  // Send ticket purchase notification to event owner
  async sendTicketPurchaseNotification(
    eventId: string,
    buyerName: string,
    quantity: number,
    revenue: number,
  ): Promise<void> {
    try {
      // In production, integrate with push notification service
      // (Firebase Cloud Messaging, OneSignal, etc.)

      const notification = {
        title: "🎫 New Ticket Purchase!",
        body: `${buyerName} purchased ${quantity} ticket(s). You earned UGX ${revenue.toLocaleString()}`,
        data: {
          type: "ticket_purchase",
          eventId,
          buyerName,
          quantity: quantity.toString(),
          revenue: revenue.toString(),
        },
      }

      // Simulate sending notification
      console.log("Sending notification:", notification)

      // In production, you would:
      // 1. Get event owner's device tokens
      // 2. Send push notification
      // 3. Store notification in database
      // 4. Send email notification if enabled
    } catch (error) {
      console.error("Error sending ticket purchase notification:", error)
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
  async sendEventReminder(buyerEmail: string, eventName: string, eventDate: Date, ticketCode: string): Promise<void> {
    try {
      const notification = {
        title: `📅 Event Reminder: ${eventName}`,
        body: `Your event is tomorrow! Don't forget your ticket: ${ticketCode}`,
        data: {
          type: "event_reminder",
          eventName,
          eventDate: eventDate.toISOString(),
          ticketCode,
        },
      }

      console.log("Sending event reminder:", notification)
    } catch (error) {
      console.error("Error sending event reminder:", error)
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

  static async notifyTicketPurchase(event: Event, ticket: Ticket): Promise<void> {
    try {
      // In a real app, this would send push notifications
      console.log(`Ticket purchased notification:`, {
        eventOwner: event.createdBy,
        eventName: event.name,
        buyerName: ticket.buyerName,
        quantity: ticket.quantity,
        revenue: ticket.venueRevenue,
      })

      // Simulate sending notification to event owner
      // await this.sendPushNotification(event.createdBy, {
      //   title: 'New Ticket Purchase!',
      //   body: `${ticket.buyerName} bought ${ticket.quantity} ticket(s) for ${event.name}`,
      //   data: { eventId: event.id, ticketId: ticket.id }
      // })
    } catch (error) {
      console.error("Error sending ticket purchase notification:", error)
    }
  }

  static async notifyTicketValidation(ticket: Ticket, validation: TicketValidation): Promise<void> {
    try {
      console.log(`Ticket validation notification:`, {
        ticketId: ticket.id,
        eventName: ticket.eventName,
        status: validation.status,
        validatedAt: validation.validatedAt,
      })

      // In a real app, send notification to ticket buyer
      // await this.sendPushNotification(ticket.buyerId, {
      //   title: validation.status === 'granted' ? 'Entry Granted!' : 'Entry Denied',
      //   body: `Your ticket for ${ticket.eventName} has been ${validation.status}`,
      //   data: { ticketId: ticket.id }
      // })
    } catch (error) {
      console.error("Error sending validation notification:", error)
    }
  }

  static async sendEventReminder(ticket: Ticket, hoursBeforeEvent: number): Promise<void> {
    try {
      console.log(`Event reminder:`, {
        ticketId: ticket.id,
        eventName: ticket.eventName,
        hoursBeforeEvent,
      })

      // In a real app, send reminder notification
      // await this.sendPushNotification(ticket.buyerId, {
      //   title: `${ticket.eventName} starts in ${hoursBeforeEvent} hours!`,
      //   body: 'Don\'t forget to bring your ticket and be ready for biometric verification',
      //   data: { ticketId: ticket.id }
      // })
    } catch (error) {
      console.error("Error sending event reminder:", error)
    }
  }

  private static async sendPushNotification(userId: string, notification: any): Promise<void> {
    // This would integrate with a push notification service like Firebase Cloud Messaging
    // For now, we'll just log the notification
    console.log(`Push notification to ${userId}:`, notification)
  }
}

export default NotificationService.getInstance()
