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
  static async sendTicketPurchaseNotification(
    eventId: string,
    buyerName: string,
    quantity: number,
    amount: number,
  ): Promise<void> {
    try {
      console.log(`Notification: ${buyerName} purchased ${quantity} ticket(s)`)
      console.log(`Revenue: UGX ${amount.toLocaleString()}`)

      // In production, implement actual notification sending
    } catch (error) {
      console.error("Error sending notification:", error)
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
      console.log(`Notification: Ticket purchased for ${event.name}`)
      console.log(`Buyer: ${ticket.buyerName}`)
      console.log(`Quantity: ${ticket.quantity}`)
      console.log(`Amount: UGX ${ticket.totalAmount.toLocaleString()}`)

      // In production, send push notification to event owner
      // await this.sendPushNotification(event.createdBy, {
      //   title: "New Ticket Purchase",
      //   body: `${ticket.buyerName} purchased ${ticket.quantity} ticket(s) for ${event.name}`,
      //   data: { ticketId: ticket.id, eventId: event.id }
      // })
    } catch (error) {
      console.error("Error sending ticket purchase notification:", error)
    }
  }

  static async notifyTicketValidation(ticket: Ticket, validation: TicketValidation): Promise<void> {
    try {
      console.log(`Notification: Ticket validated`)
      console.log(`Ticket: ${ticket.id}`)
      console.log(`Status: ${validation.status}`)
      console.log(`Validated by: ${validation.validatedBy}`)

      // In production, send notification to relevant parties
      // await this.sendPushNotification(ticket.buyerId, {
      //   title: "Ticket Validated",
      //   body: `Your ticket for ${ticket.eventName} has been validated`,
      //   data: { ticketId: ticket.id, validationId: validation.id }
      // })
    } catch (error) {
      console.error("Error sending ticket validation notification:", error)
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

export default NotificationService.getInstance()
