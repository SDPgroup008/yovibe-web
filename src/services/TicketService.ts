import FirebaseService from "./FirebaseService"
import PaymentService from "./PaymentService"
import BiometricService from "./BiometricService"
import NotificationService from "./NotificationService"
import type { Ticket, TicketValidation } from "../models/Ticket"
import type { Event } from "../models/Event"

export class TicketService {
  static async purchaseTicket(
    event: Event,
    buyerId: string,
    buyerName: string,
    buyerEmail: string,
    quantity: number,
    biometricHash: string,
  ): Promise<Ticket> {
    try {
      const ticketPrice = Number.parseInt(event.entryFee?.replace(/[^0-9]/g, "") || "0")
      const totalAmount = ticketPrice * quantity

      // Create payment intent
      const paymentIntent = await PaymentService.createPaymentIntent(totalAmount, event.id, buyerId)

      // Process payment
      await PaymentService.processPayment(paymentIntent.id)

      // Generate ticket
      const ticket: Ticket = {
        id: `ticket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        eventId: event.id,
        eventName: event.name,
        buyerId,
        buyerName,
        buyerEmail,
        quantity,
        totalAmount,
        venueRevenue: paymentIntent.venueRevenue,
        appCommission: paymentIntent.appCommission,
        purchaseDate: new Date(),
        qrCode: this.generateQRCode(),
        biometricHash,
        status: "active",
        validationHistory: [],
      }

      // Save ticket to database
      await FirebaseService.saveTicket(ticket)

      // Send notification to event owner - use static method
      await NotificationService.notifyTicketPurchase(event, ticket)

      return ticket
    } catch (error) {
      console.error("Error purchasing ticket:", error)
      throw error
    }
  }

  static async validateTicket(
    ticketId: string,
    biometricData: string,
    validatorId: string,
    location?: string,
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      const ticket = await FirebaseService.getTicketById(ticketId)

      if (!ticket) {
        return { success: false, reason: "Ticket not found" }
      }

      if (ticket.status !== "active") {
        return { success: false, reason: "Ticket already used or cancelled" }
      }

      // Verify biometric data
      const biometricMatch = await BiometricService.verifyBiometric(ticket.biometricHash, biometricData)

      if (!biometricMatch) {
        // Log failed validation
        const validation: TicketValidation = {
          id: `val_${Date.now()}`,
          ticketId,
          validatedAt: new Date(),
          validatedBy: validatorId,
          biometricMatch: false,
          location,
          status: "denied",
          reason: "Biometric verification failed",
        }

        await this.logValidation(validation)
        return { success: false, reason: "Biometric verification failed" }
      }

      // Mark ticket as used
      await FirebaseService.updateTicket(ticketId, { status: "used" })

      // Log successful validation
      const validation: TicketValidation = {
        id: `val_${Date.now()}`,
        ticketId,
        validatedAt: new Date(),
        validatedBy: validatorId,
        biometricMatch: true,
        location,
        status: "granted",
      }

      await this.logValidation(validation)

      // Send notification - use static method
      await NotificationService.notifyTicketValidation(ticket, validation)

      return { success: true }
    } catch (error) {
      console.error("Error validating ticket:", error)
      return { success: false, reason: "Validation error" }
    }
  }

  static async getEventTickets(eventId: string): Promise<Ticket[]> {
    try {
      return await FirebaseService.getTicketsByEvent(eventId)
    } catch (error) {
      console.error("Error getting event tickets:", error)
      return []
    }
  }

  static async getUserTickets(userId: string): Promise<Ticket[]> {
    try {
      return await FirebaseService.getTicketsByUser(userId)
    } catch (error) {
      console.error("Error getting user tickets:", error)
      return []
    }
  }

  private static generateQRCode(): string {
    // Generate a unique QR code data string
    return `YOVIBE_${Date.now()}_${Math.random().toString(36).substr(2, 15)}`
  }

  private static async logValidation(validation: TicketValidation): Promise<void> {
    try {
      await FirebaseService.saveTicketValidation(validation)
    } catch (error) {
      console.error("Error logging validation:", error)
    }
  }
}

export default TicketService
