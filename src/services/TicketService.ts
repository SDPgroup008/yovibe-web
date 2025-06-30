import FirebaseService from "./FirebaseService"
import PaymentService from "./PaymentService.web"
import BiometricService from "./BiometricService.web"
import QRCodeService from "./QRCodeService.web"
import NotificationService from "./NotificationService"
import type { Ticket, TicketValidation, TicketType } from "../models/Ticket"
import type { Event } from "../models/Event"

export class TicketService {
  static async purchaseTicket(
    event: Event,
    buyerId: string,
    buyerName: string,
    buyerEmail: string,
    quantity: number,
    ticketType: TicketType,
    biometricHash?: string,
    paymentMethod?: any,
  ): Promise<Ticket> {
    try {
      console.log("Starting ticket purchase process...", { ticketType, quantity })

      // Validate biometric data for secure tickets
      if (ticketType === "secure" && !biometricHash) {
        throw new Error("Biometric data is required for secure tickets")
      }

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
      const ticketId = `ticket_${ticketType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      // Generate QR code with ticket type
      const qrCode = await QRCodeService.generateQRCode(ticketId, event.id, buyerId, ticketType)

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
        ticketType,
        biometricHash: ticketType === "secure" ? biometricHash : undefined,
        status: "active",
        validationHistory: [],
      }

      // Save ticket to database
      await FirebaseService.saveTicket(ticket)

      // Send notification to event owner
      await NotificationService.notifyTicketPurchase(event, ticket)

      console.log("Ticket purchase completed successfully:", ticketId, "Type:", ticketType)
      return ticket
    } catch (error) {
      console.error("Error purchasing ticket:", error)
      throw error
    }
  }

  static async validateTicket(
    qrCodeData: string,
    capturedBiometricData?: string,
    validatorId?: string,
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

      // Verify ticket type matches QR data
      if (ticket.ticketType !== qrData.ticketType) {
        return {
          success: false,
          reason: "Ticket type mismatch",
        }
      }

      let biometricMatch = true
      let validationReason: string | undefined

      // For secure tickets, verify biometric data
      if (ticket.ticketType === "secure") {
        if (!capturedBiometricData) {
          return {
            success: false,
            reason: "Biometric verification required for secure tickets",
          }
        }

        if (!ticket.biometricHash) {
          return {
            success: false,
            reason: "No biometric data found for secure ticket",
          }
        }

        biometricMatch = await BiometricService.verifyBiometric(ticket.biometricHash, capturedBiometricData)

        if (!biometricMatch) {
          validationReason = "Biometric verification failed"
        }
      }

      // Log validation attempt
      const validation: TicketValidation = {
        id: `val_${Date.now()}`,
        ticketId: ticket.id,
        validatedAt: new Date(),
        validatedBy: validatorId || "unknown",
        biometricMatch: ticket.ticketType === "secure" ? biometricMatch : undefined,
        location,
        status: biometricMatch ? "granted" : "denied",
        reason: validationReason,
      }

      await this.logValidation(validation)

      if (!biometricMatch) {
        return {
          success: false,
          reason: validationReason,
          ticket,
        }
      }

      // Mark ticket as used
      await FirebaseService.updateTicket(ticket.id, { status: "used" })

      // Send notification
      await NotificationService.notifyTicketValidation(ticket, validation)

      console.log("Ticket validation successful:", ticket.id, "Type:", ticket.ticketType)
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

  static async generateTicketReport(eventId: string): Promise<any> {
    try {
      const tickets = await this.getEventTickets(eventId)

      const report = {
        totalTickets: tickets.length,
        regularTickets: tickets.filter((t) => t.ticketType === "regular").length,
        secureTickets: tickets.filter((t) => t.ticketType === "secure").length,
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

  static async generateTicketQRImage(ticket: Ticket): Promise<string> {
    try {
      return await QRCodeService.generateQRCodeImage(ticket.qrCode)
    } catch (error) {
      console.error("Error generating ticket QR image:", error)
      throw error
    }
  }
}

export default TicketService
