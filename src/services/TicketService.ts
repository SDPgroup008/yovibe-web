import type { Ticket, TicketValidation } from "../models/Ticket"
import type { Event } from "../models/Event"
import FirebaseService from "./FirebaseService"
import QRCodeService, { type QRCodeData } from "./QRCodeService"
import { BiometricService } from "./BiometricService"
import PaymentService, { type PaymentRequest, type PaymentMethod } from "./PaymentService"

export interface TicketPurchaseRequest {
  eventId: string
  quantity: number
  buyerInfo: {
    name: string
    email: string
    phone?: string
  }
  paymentMethod: PaymentMethod
}

export interface TicketPurchaseResult {
  success: boolean
  tickets?: Ticket[]
  message: string
  error?: string
}

export class TicketService {
  private static instance: TicketService

  static getInstance(): TicketService {
    if (!TicketService.instance) {
      TicketService.instance = new TicketService()
    }
    return TicketService.instance
  }

  async purchaseTickets(request: TicketPurchaseRequest): Promise<TicketPurchaseResult> {
    try {
      console.log("TicketService: Processing ticket purchase:", request)

      // Get event details
      const event = await FirebaseService.getEventById(request.eventId)
      if (!event) {
        return {
          success: false,
          message: "Event not found",
          error: "The specified event does not exist",
        }
      }

      // Calculate pricing
      const ticketPrice = this.calculateTicketPrice(event)
      const totalAmount = ticketPrice * request.quantity
      const { venueRevenue, appCommission } = this.calculateRevenueSplit(totalAmount)

      // Process payment
      const paymentRequest: PaymentRequest = {
        amount: totalAmount,
        currency: "UGX",
        method: request.paymentMethod,
        customerInfo: request.buyerInfo,
        metadata: {
          eventId: request.eventId,
          eventName: event.name,
          quantity: request.quantity,
        },
      }

      const paymentResult = await PaymentService.processPayment(paymentRequest)
      if (!paymentResult.success) {
        return {
          success: false,
          message: "Payment failed",
          error: paymentResult.error,
        }
      }

      // Generate tickets
      const tickets: Ticket[] = []
      for (let i = 0; i < request.quantity; i++) {
        const ticket = await this.generateTicket({
          event,
          buyerInfo: request.buyerInfo,
          totalAmount,
          venueRevenue,
          appCommission,
          transactionId: paymentResult.transactionId!,
        })
        tickets.push(ticket)
      }

      // Save tickets to database
      for (const ticket of tickets) {
        await FirebaseService.saveTicket(ticket)
      }

      console.log("TicketService: Tickets purchased successfully:", tickets.length)

      return {
        success: true,
        tickets,
        message: `Successfully purchased ${request.quantity} ticket(s) for ${event.name}`,
      }
    } catch (error) {
      console.error("TicketService: Error purchasing tickets:", error)
      return {
        success: false,
        message: "Failed to purchase tickets",
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  private async generateTicket(params: {
    event: Event
    buyerInfo: { name: string; email: string; phone?: string }
    totalAmount: number
    venueRevenue: number
    appCommission: number
    transactionId: string
  }): Promise<Ticket> {
    const ticketId = this.generateTicketId()

    // Generate QR code data
    const qrData: QRCodeData = QRCodeService.createTicketQRData(ticketId, params.event.id)
    const qrCode = await QRCodeService.generateQRCode(qrData)

    // Generate biometric hash placeholder (will be updated when user scans)
    const biometricHash = this.generatePlaceholderBiometricHash(ticketId)

    const ticket: Ticket = {
      id: ticketId,
      eventId: params.event.id,
      eventName: params.event.name,
      buyerId: params.transactionId, // Using transaction ID as buyer ID for now
      buyerName: params.buyerInfo.name,
      buyerEmail: params.buyerInfo.email,
      quantity: 1, // Each ticket is individual
      totalAmount: params.totalAmount,
      venueRevenue: params.venueRevenue,
      appCommission: params.appCommission,
      purchaseDate: new Date(),
      qrCode,
      biometricHash,
      status: "active",
      validationHistory: [],
    }

    return ticket
  }

  private generateTicketId(): string {
    return "TKT_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8).toUpperCase()
  }

  private generatePlaceholderBiometricHash(ticketId: string): string {
    // Generate a placeholder hash that will be replaced when user first scans
    let hash = 0
    for (let i = 0; i < ticketId.length; i++) {
      const char = ticketId.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16) + "_PLACEHOLDER"
  }

  private calculateTicketPrice(event: Event): number {
    // Extract price from entry fee string or use default
    if (event.entryFee && event.entryFee !== "Free Entry") {
      const priceMatch = event.entryFee.match(/(\d+(?:,\d+)*)/)
      if (priceMatch) {
        return Number.parseInt(priceMatch[1].replace(/,/g, ""))
      }
    }

    // Default pricing based on price indicator
    switch (event.priceIndicator) {
      case 1:
        return 10000 // Budget
      case 2:
        return 25000 // Mid-range
      case 3:
        return 50000 // Premium
      default:
        return 15000
    }
  }

  private calculateRevenueSplit(totalAmount: number): { venueRevenue: number; appCommission: number } {
    const appCommissionRate = 0.15 // 15% commission
    const appCommission = Math.round(totalAmount * appCommissionRate)
    const venueRevenue = totalAmount - appCommission

    return { venueRevenue, appCommission }
  }

  async validateTicket(
    ticketId: string,
    qrData: QRCodeData,
    biometricHash?: string,
  ): Promise<{
    success: boolean
    ticket?: Ticket
    message: string
    error?: string
  }> {
    try {
      console.log("TicketService: Validating ticket:", ticketId)

      // Get ticket from database
      const ticket = await FirebaseService.getTicketById(ticketId)
      if (!ticket) {
        return {
          success: false,
          message: "Ticket not found",
          error: "Invalid ticket ID",
        }
      }

      // Check ticket status
      if (ticket.status !== "active") {
        return {
          success: false,
          message: "Ticket is not active",
          error: `Ticket status: ${ticket.status}`,
        }
      }

      // Validate QR code signature
      if (!QRCodeService.validateSignature(qrData)) {
        return {
          success: false,
          message: "Invalid QR code",
          error: "QR code signature validation failed",
        }
      }

      // Validate biometric if provided
      if (biometricHash && ticket.biometricHash && !ticket.biometricHash.includes("PLACEHOLDER")) {
        const biometricResult = await BiometricService.verifyBiometric(biometricHash, ticket.biometricHash)
        if (!biometricResult.isValid) {
          return {
            success: false,
            message: "Biometric verification failed",
            error: biometricResult.message,
          }
        }
      }

      // Create validation record
      const validation: TicketValidation = {
        id: this.generateValidationId(),
        ticketId,
        eventId: ticket.eventId,
        validatedAt: new Date(),
        validatedBy: "SYSTEM", // In real app, this would be the validator's ID
        biometricHash,
        validationType: biometricHash ? "biometric" : "qr_only",
      }

      // Save validation
      await FirebaseService.saveTicketValidation(validation)

      // Update ticket validation history
      ticket.validationHistory.push(validation)
      await FirebaseService.updateTicket(ticketId, {
        validationHistory: ticket.validationHistory,
        status: "used",
      })

      console.log("TicketService: Ticket validated successfully")

      return {
        success: true,
        ticket,
        message: "Ticket validated successfully",
      }
    } catch (error) {
      console.error("TicketService: Error validating ticket:", error)
      return {
        success: false,
        message: "Ticket validation failed",
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  private generateValidationId(): string {
    return "VAL_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6).toUpperCase()
  }

  async getUserTickets(userId: string): Promise<Ticket[]> {
    try {
      return await FirebaseService.getTicketsByUser(userId)
    } catch (error) {
      console.error("TicketService: Error getting user tickets:", error)
      return []
    }
  }

  async getEventTickets(eventId: string): Promise<Ticket[]> {
    try {
      return await FirebaseService.getTicketsByEvent(eventId)
    } catch (error) {
      console.error("TicketService: Error getting event tickets:", error)
      return []
    }
  }

  async generateTicketPDF(ticket: Ticket): Promise<string> {
    // This is a placeholder for PDF generation
    // In a real implementation, you would use a library like jsPDF
    console.log("Generating PDF for ticket:", ticket.id)

    // Return a placeholder PDF data URL
    return "data:application/pdf;base64,JVBERi0xLjQKJdPr6eEKMSAwIG9iago8PAovVGl0bGUgKFlvVmliZSBUaWNrZXQpCi9Qcm9kdWNlciAoWW9WaWJlIEFwcCkKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDMgMCBSCj4+CmVuZG9iagozIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovS2lkcyBbNCAwIFJdCi9Db3VudCAxCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9QYXJlbnQgMyAwIFIKL01lZGlhQm94IFswIDAgNjEyIDc5Ml0KPj4KZW5kb2JqCnhyZWYKMCA1CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDc0IDAwMDAwIG4gCjAwMDAwMDAxMjEgMDAwMDAgbiAKMDAwMDAwMDE3OCAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDUKL1Jvb3QgMiAwIFIKPj4Kc3RhcnR4cmVmCjI3MwolJUVPRgo="
  }

  async sendTicketEmail(ticket: Ticket): Promise<boolean> {
    try {
      console.log("Sending ticket email to:", ticket.buyerEmail)

      // This is a placeholder for email sending
      // In a real implementation, you would integrate with an email service
      // like SendGrid, AWS SES, or similar

      // Simulate email sending delay
      await new Promise((resolve) => setTimeout(resolve, 1000))

      console.log("Ticket email sent successfully")
      return true
    } catch (error) {
      console.error("Error sending ticket email:", error)
      return false
    }
  }
}

export default TicketService.getInstance()
