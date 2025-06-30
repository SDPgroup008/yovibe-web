import FirebaseService from "./FirebaseService"
import PaymentService from "./PaymentService"
import BiometricService from "./BiometricService"
import QRCodeService from "./QRCodeService"
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
    paymentMethod: any,
  ): Promise<Ticket> {
    try {
      console.log("Starting ticket purchase process...")

      const ticketPrice = Number.parseInt(event.entryFee?.replace(/[^0-9]/g, "") || "0")
      const totalAmount = ticketPrice * quantity

      // Create payment intent
      const paymentIntent = await PaymentService.createPaymentIntent(totalAmount, event.id, buyerId)

      // Process payment
      const paymentResult = await PaymentService.processPayment(paymentIntent.id, paymentMethod, totalAmount)

      if (!paymentResult.success) {
        throw new Error(paymentResult.error || "Payment failed")
      }

      // Generate unique ticket ID
      const ticketId = `ticket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      // Generate QR code
      const qrCode = await QRCodeService.generateQRCode(ticketId, event.id, buyerId)

      // Create ticket
      const ticket: Ticket = {
        id: ticketId,
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
        qrCode,
        biometricHash,
        status: "active",
        validationHistory: [],
      }

      // Save ticket to database
      await FirebaseService.saveTicket(ticket)

      // Send notification to event owner
      await NotificationService.notifyTicketPurchase(event, ticket)

      console.log("Ticket purchase completed successfully:", ticketId)
      return ticket
    } catch (error) {
      console.error("Error purchasing ticket:", error)
      throw error
    }
  }

  static async validateTicket(
    qrCodeData: string,
    capturedBiometricData: string,
    validatorId: string,
    location?: string,
  ): Promise<{ success: boolean; reason?: string; ticket?: Ticket }> {
    try {
      console.log("Starting ticket validation process...")

      // Validate QR code
      const qrValidation = await QRCodeService.validateQRCode(qrCodeData)
      if (!qrValidation.valid) {
        return {
          success: false,
          reason: qrValidation.error || "Invalid QR code",
        }
      }

      const qrData = qrValidation.data!
      const ticket = await FirebaseService.getTicketById(qrData.ticketId)

      if (!ticket) {
        return { success: false, reason: "Ticket not found" }
      }

      if (ticket.status !== "active") {
        return {
          success: false,
          reason: `Ticket is ${ticket.status}`,
        }
      }

      // Verify biometric data
      const biometricMatch = await BiometricService.verifyBiometric(ticket.biometricHash, capturedBiometricData)

      if (!biometricMatch) {
        // Log failed validation
        const validation: TicketValidation = {
          id: `val_${Date.now()}`,
          ticketId: ticket.id,
          validatedAt: new Date(),
          validatedBy: validatorId,
          biometricMatch: false,
          location,
          status: "denied",
          reason: "Biometric verification failed",
        }

        await this.logValidation(validation)
        return {
          success: false,
          reason: "Biometric verification failed",
          ticket,
        }
      }

      // Mark ticket as used
      await FirebaseService.updateTicket(ticket.id, { status: "used" })

      // Log successful validation
      const validation: TicketValidation = {
        id: `val_${Date.now()}`,
        ticketId: ticket.id,
        validatedAt: new Date(),
        validatedBy: validatorId,
        biometricMatch: true,
        location,
        status: "granted",
      }

      await this.logValidation(validation)

      // Send notification
      await NotificationService.notifyTicketValidation(ticket, validation)

      console.log("Ticket validation successful:", ticket.id)
      return { success: true, ticket }
    } catch (error) {
      console.error("Error validating ticket:", error)
      return {
        success: false,
        reason: "Validation error occurred",
      }
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

  static async cancelTicket(ticketId: string, reason: string): Promise<boolean> {
    try {
      console.log("Cancelling ticket:", ticketId)

      const ticket = await FirebaseService.getTicketById(ticketId)
      if (!ticket) {
        throw new Error("Ticket not found")
      }

      if (ticket.status !== "active") {
        throw new Error("Ticket cannot be cancelled")
      }

      // Update ticket status
      await FirebaseService.updateTicket(ticketId, {
        status: "cancelled",
        cancelReason: reason,
        cancelledAt: new Date(),
      })

      // Process refund (if applicable)
      const refundSuccess = await PaymentService.refundPayment(`pi_${ticketId}`, ticket.totalAmount)

      if (refundSuccess) {
        console.log("Ticket cancelled and refunded successfully")
      } else {
        console.log("Ticket cancelled but refund failed")
      }

      return true
    } catch (error) {
      console.error("Error cancelling ticket:", error)
      return false
    }
  }

  private static async logValidation(validation: TicketValidation): Promise<void> {
    try {
      await FirebaseService.saveTicketValidation(validation)
    } catch (error) {
      console.error("Error logging validation:", error)
    }
  }

  static async getTicketValidationHistory(ticketId: string): Promise<TicketValidation[]> {
    try {
      // This would query the ticketValidations collection
      // For now, return empty array as the method isn't implemented in FirebaseService
      return []
    } catch (error) {
      console.error("Error getting validation history:", error)
      return []
    }
  }

  static async generateTicketReport(eventId: string): Promise<any> {
    try {
      const tickets = await this.getEventTickets(eventId)

      const report = {
        totalTickets: tickets.length,
        activeTickets: tickets.filter((t) => t.status === "active").length,
        usedTickets: tickets.filter((t) => t.status === "used").length,
        cancelledTickets: tickets.filter((t) => t.status === "cancelled").length,
        totalRevenue: tickets.reduce((sum, t) => sum + t.totalAmount, 0),
        venueRevenue: tickets.reduce((sum, t) => sum + t.venueRevenue, 0),
        appCommission: tickets.reduce((sum, t) => sum + t.appCommission, 0),
      }

      return report
    } catch (error) {
      console.error("Error generating ticket report:", error)
      return null
    }
  }
}

export default TicketService
