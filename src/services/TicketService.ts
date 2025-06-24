import PaymentService from "./PaymentService"
import BiometricService from "./BiometricService"
import NotificationService from "./NotificationService"
import type { Ticket, TicketValidation } from "../models/Ticket"

// Ticket Service for managing ticket operations
class TicketService {
  private static instance: TicketService

  public static getInstance(): TicketService {
    if (!TicketService.instance) {
      TicketService.instance = new TicketService()
    }
    return TicketService.instance
  }

  // Purchase tickets
  async purchaseTickets(
    eventId: string,
    eventName: string,
    venueId: string,
    venueName: string,
    buyerId: string,
    buyerName: string,
    buyerEmail: string,
    quantity: number,
    ticketPrice: number,
  ): Promise<Ticket> {
    try {
      const totalAmount = quantity * ticketPrice
      const revenueSplit = PaymentService.calculateRevenueSplit(totalAmount)

      // Capture biometric data
      const biometricHash = await BiometricService.captureBiometric()

      // Create ticket
      const ticket: Ticket = {
        id: `ticket_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        ticketCode: this.generateTicketCode(),
        eventId,
        eventName,
        venueId,
        venueName,
        buyerId,
        buyerName,
        buyerEmail,
        quantity,
        ticketPrice,
        totalAmount: revenueSplit.totalAmount,
        appCommission: revenueSplit.appCommission,
        venueRevenue: revenueSplit.venueRevenue,
        purchaseDate: new Date(),
        status: "active",
        biometricHash,
        qrCodeData: this.generateQRCodeData(),
        paymentIntentId: "",
        validationHistory: [],
      }

      // Create payment intent
      const paymentIntent = await PaymentService.createPaymentIntent(totalAmount, "UGX", ticket.id)
      ticket.paymentIntentId = paymentIntent.id

      // Process payment
      await PaymentService.processPayment(paymentIntent.id)

      // Save ticket to database
      await this.saveTicket(ticket)

      // Send notification to event owner
      await NotificationService.sendTicketPurchaseNotification(eventId, buyerName, quantity, revenueSplit.venueRevenue)

      return ticket
    } catch (error) {
      console.error("Error purchasing tickets:", error)
      throw new Error("Failed to purchase tickets")
    }
  }

  // Get tickets for an event (for event owners)
  async getEventTickets(eventId: string): Promise<Ticket[]> {
    try {
      // In production, query from Firebase
      const mockTickets: Ticket[] = [
        {
          id: "ticket_1",
          ticketCode: "TKT-DEMO-001",
          eventId,
          eventName: "Sample Event",
          venueId: "venue_1",
          venueName: "Sample Venue",
          buyerId: "user_1",
          buyerName: "John Doe",
          buyerEmail: "john@example.com",
          quantity: 2,
          ticketPrice: 50000,
          totalAmount: 100000,
          appCommission: 5000,
          venueRevenue: 95000,
          purchaseDate: new Date(),
          status: "active",
          biometricHash: "bio_hash_123",
          qrCodeData: "qr_data_123",
          paymentIntentId: "pi_123",
          validationHistory: [],
        },
      ]

      return mockTickets
    } catch (error) {
      console.error("Error getting event tickets:", error)
      return []
    }
  }

  // Get ticket by code
  async getTicketByCode(ticketCode: string): Promise<Ticket | null> {
    try {
      // In production, query from Firebase
      const mockTicket: Ticket = {
        id: "ticket_1",
        ticketCode,
        eventId: "event_1",
        eventName: "Sample Event",
        venueId: "venue_1",
        venueName: "Sample Venue",
        buyerId: "user_1",
        buyerName: "John Doe",
        buyerEmail: "john@example.com",
        quantity: 1,
        ticketPrice: 50000,
        totalAmount: 50000,
        appCommission: 2500,
        venueRevenue: 47500,
        purchaseDate: new Date(),
        status: "active",
        biometricHash: "bio_hash_123",
        qrCodeData: "qr_data_123",
        paymentIntentId: "pi_123",
        validationHistory: [],
      }

      return mockTicket
    } catch (error) {
      console.error("Error getting ticket by code:", error)
      return null
    }
  }

  // Validate ticket at entry
  async validateTicket(
    ticketCode: string,
    validatorId: string,
  ): Promise<{
    entryGranted: boolean
    ticket: Ticket | null
    reason?: string
  }> {
    try {
      const ticket = await this.getTicketByCode(ticketCode)

      if (!ticket) {
        return {
          entryGranted: false,
          ticket: null,
          reason: "Ticket not found",
        }
      }

      if (ticket.status !== "active") {
        return {
          entryGranted: false,
          ticket,
          reason: `Ticket is ${ticket.status}`,
        }
      }

      // Verify biometric data
      const biometricMatch = await BiometricService.verifyBiometric(ticket.biometricHash)

      if (!biometricMatch) {
        return {
          entryGranted: false,
          ticket,
          reason: "Biometric verification failed",
        }
      }

      // Create validation record
      const validation: TicketValidation = {
        id: `val_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        ticketId: ticket.id,
        validatedBy: validatorId,
        validatedAt: new Date(),
        entryGranted: true,
        biometricMatch: true,
      }

      // Update ticket status and add validation
      ticket.status = "used"
      ticket.validationHistory.push(validation)

      await this.updateTicket(ticket)

      return {
        entryGranted: true,
        ticket,
      }
    } catch (error) {
      console.error("Error validating ticket:", error)
      return {
        entryGranted: false,
        ticket: null,
        reason: "Validation error",
      }
    }
  }

  // Generate unique ticket code
  private generateTicketCode(): string {
    const prefix = "TKT"
    const timestamp = Date.now().toString().slice(-6)
    const random = Math.random().toString(36).substring(2, 8).toUpperCase()
    return `${prefix}-${timestamp}-${random}`
  }

  // Generate QR code data
  private generateQRCodeData(): string {
    const data = {
      ticketId: `ticket_${Date.now()}`,
      timestamp: Date.now(),
      hash: Math.random().toString(36).substring(2, 15),
    }
    return JSON.stringify(data)
  }

  // Save ticket to database
  private async saveTicket(ticket: Ticket): Promise<void> {
    try {
      // In production, save to Firebase
      console.log("Saving ticket:", ticket.id)
    } catch (error) {
      console.error("Error saving ticket:", error)
      throw error
    }
  }

  // Update ticket in database
  private async updateTicket(ticket: Ticket): Promise<void> {
    try {
      // In production, update in Firebase
      console.log("Updating ticket:", ticket.id)
    } catch (error) {
      console.error("Error updating ticket:", error)
      throw error
    }
  }

  // Cancel ticket
  async cancelTicket(ticketId: string): Promise<boolean> {
    try {
      const ticket = await this.getTicketByCode(ticketId)
      if (!ticket) return false

      // Process refund
      const refundSuccess = await PaymentService.refundPayment(ticket.paymentIntentId)

      if (refundSuccess) {
        ticket.status = "cancelled"
        await this.updateTicket(ticket)
        return true
      }

      return false
    } catch (error) {
      console.error("Error cancelling ticket:", error)
      return false
    }
  }
}

export default TicketService.getInstance()
