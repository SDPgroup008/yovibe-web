import FirebaseService from "./FirebaseService"
import QRCodeService from "./QRCodeService"
import PaymentService from "./PaymentService"
import type { Ticket } from "../models/Ticket"

export interface TicketPurchaseData {
  eventId: string
  eventName: string
  buyerId: string
  buyerName: string
  buyerEmail: string
  buyerPhone?: string
  quantity: number
  ticketType: "regular" | "secure"
  totalAmount: number
  paymentMethod: string
  buyerImageUrl?: string
}

export interface TicketValidationData {
  ticketId: string
  qrData: string
  buyerImageUrl?: string
  validatedBy: string
  location?: string
}

class TicketService {
  private static readonly APP_COMMISSION_RATE = 0.05 // 5% commission
  private static readonly SECURE_TICKET_PREMIUM = 1.5 // 50% premium for secure tickets
  private static instance: TicketService

  private constructor() {}

  static getInstance(): TicketService {
    if (!TicketService.instance) {
      TicketService.instance = new TicketService()
    }
    return TicketService.instance
  }

  static async purchaseTicket(purchaseData: TicketPurchaseData): Promise<Ticket> {
    try {
      console.log("TicketService: Starting ticket purchase process")

      // Validate event exists
      const event = await FirebaseService.getEventById(purchaseData.eventId)
      if (!event) {
        throw new Error("Event not found")
      }

      // Calculate pricing
      const basePrice = event.entryFee || 0
      const ticketPrice = purchaseData.ticketType === "secure" ? basePrice * this.SECURE_TICKET_PREMIUM : basePrice

      const totalAmount = ticketPrice * purchaseData.quantity
      const appCommission = totalAmount * this.APP_COMMISSION_RATE
      const venueRevenue = totalAmount - appCommission

      // Process payment
      const paymentResult = await PaymentService.processPayment({
        amount: totalAmount,
        currency: "UGX",
        paymentMethod: purchaseData.paymentMethod,
        description: `Ticket for ${purchaseData.eventName}`,
        customerEmail: purchaseData.buyerEmail,
      })

      if (!paymentResult.success) {
        throw new Error(`Payment failed: ${paymentResult.error}`)
      }

      // Generate ticket ID
      const ticketId = this.generateTicketId()

      // Create QR code data
      const qrData = QRCodeService.createTicketQRData(ticketId, purchaseData.eventId)
      const qrCode = await QRCodeService.generateQRCode(qrData)

      // Create ticket object
      const ticket: Ticket = {
        id: ticketId,
        eventId: purchaseData.eventId,
        eventName: purchaseData.eventName,
        buyerId: purchaseData.buyerId,
        buyerName: purchaseData.buyerName,
        buyerEmail: purchaseData.buyerEmail,
        buyerPhone: purchaseData.buyerPhone,
        buyerImageUrl: purchaseData.buyerImageUrl,
        quantity: purchaseData.quantity,
        ticketType: purchaseData.ticketType,
        totalAmount,
        venueRevenue,
        appCommission,
        purchaseDate: new Date(),
        qrCode,
        status: "active",
        validationHistory: [],
        isVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // Save ticket to database
      await FirebaseService.saveTicket(ticket)

      console.log("TicketService: Ticket purchased successfully:", ticketId)
      return ticket
    } catch (error) {
      console.error("TicketService: Error purchasing ticket:", error)
      throw error
    }
  }

  async validateTicket(ticketId: string, validatorId: string): Promise<boolean> {
    try {
      const ticket = await this.getTicketById(ticketId)
      if (!ticket) {
        throw new Error("Ticket not found")
      }

      if (ticket.status !== "active") {
        throw new Error("Ticket is not active")
      }

      // Add validation record
      const validationRecord = {
        validatedBy: validatorId,
        validatedAt: new Date(),
        location: "Event Entrance", // This could be dynamic
      }

      ticket.validationHistory.push(validationRecord)
      ticket.status = "used"
      ticket.updatedAt = new Date()

      await this.saveTicket(ticket)
      return true
    } catch (error) {
      console.error("Error validating ticket:", error)
      throw error
    }
  }

  async getTicketsByEvent(eventId: string): Promise<Ticket[]> {
    try {
      return await FirebaseService.getTicketsByEvent(eventId)
    } catch (error) {
      console.error("Error getting tickets by event:", error)
      throw error
    }
  }

  // Alias for backward compatibility
  async getEventTickets(eventId: string): Promise<Ticket[]> {
    return this.getTicketsByEvent(eventId)
  }

  async getTicketsByUser(userId: string): Promise<Ticket[]> {
    try {
      return await FirebaseService.getTicketsByUser(userId)
    } catch (error) {
      console.error("Error getting tickets by user:", error)
      throw error
    }
  }

  async getTicketById(ticketId: string): Promise<Ticket | null> {
    try {
      return await FirebaseService.getTicketById(ticketId)
    } catch (error) {
      console.error("Error getting ticket by ID:", error)
      throw error
    }
  }

  async saveTicket(ticket: Ticket): Promise<void> {
    try {
      await FirebaseService.saveTicket(ticket)
    } catch (error) {
      console.error("Error saving ticket:", error)
      throw error
    }
  }

  async updateTicketStatus(ticketId: string, status: "active" | "used" | "cancelled" | "refunded"): Promise<void> {
    try {
      await FirebaseService.updateTicketStatus(ticketId, status)
    } catch (error) {
      console.error("Error updating ticket status:", error)
      throw error
    }
  }

  static calculateTicketPrice(
    basePrice: number,
    ticketType: "regular" | "secure",
    quantity: number,
  ): {
    unitPrice: number
    totalPrice: number
    appCommission: number
    venueRevenue: number
  } {
    const unitPrice = ticketType === "secure" ? basePrice * this.SECURE_TICKET_PREMIUM : basePrice

    const totalPrice = unitPrice * quantity
    const appCommission = totalPrice * this.APP_COMMISSION_RATE
    const venueRevenue = totalPrice - appCommission

    return {
      unitPrice,
      totalPrice,
      appCommission,
      venueRevenue,
    }
  }

  private static generateTicketId(): string {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 8)
    return `ticket_${timestamp}_${random}`
  }

  private static generateValidationId(): string {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 8)
    return `validation_${timestamp}_${random}`
  }

  static async refundTicket(ticketId: string, reason: string): Promise<boolean> {
    try {
      console.log("TicketService: Processing ticket refund")

      const ticket = await FirebaseService.getTicketById(ticketId)
      if (!ticket) {
        throw new Error("Ticket not found")
      }

      if (ticket.status !== "active") {
        throw new Error("Ticket cannot be refunded")
      }

      // Process refund through payment service
      const refundResult = await PaymentService.processRefund({
        amount: ticket.totalAmount,
        reason,
        originalTransactionId: ticket.id,
      })

      if (!refundResult.success) {
        throw new Error(`Refund failed: ${refundResult.error}`)
      }

      // Update ticket status
      await FirebaseService.updateTicket(ticketId, {
        status: "refunded",
      })

      console.log("TicketService: Ticket refunded successfully")
      return true
    } catch (error) {
      console.error("TicketService: Error refunding ticket:", error)
      throw error
    }
  }

  static async transferTicket(ticketId: string, newBuyerId: string, newBuyerEmail: string): Promise<boolean> {
    try {
      console.log("TicketService: Processing ticket transfer")

      const ticket = await FirebaseService.getTicketById(ticketId)
      if (!ticket) {
        throw new Error("Ticket not found")
      }

      if (ticket.status !== "active") {
        throw new Error("Ticket cannot be transferred")
      }

      // Update ticket ownership
      await FirebaseService.updateTicket(ticketId, {
        buyerId: newBuyerId,
        buyerEmail: newBuyerEmail,
      })

      console.log("TicketService: Ticket transferred successfully")
      return true
    } catch (error) {
      console.error("TicketService: Error transferring ticket:", error)
      throw error
    }
  }

  async getEventTicketStats(eventId: string): Promise<{
    totalSold: number
    totalRevenue: number
    totalCommission: number
    ticketsByType: Record<string, number>
  }> {
    try {
      const tickets = await this.getTicketsByEvent(eventId)

      const stats = {
        totalSold: 0,
        totalRevenue: 0,
        totalCommission: 0,
        ticketsByType: {} as Record<string, number>,
      }

      tickets.forEach((ticket) => {
        stats.totalSold += ticket.quantity
        stats.totalRevenue += ticket.totalAmount
        stats.totalCommission += ticket.appCommission

        if (!stats.ticketsByType[ticket.ticketType]) {
          stats.ticketsByType[ticket.ticketType] = 0
        }
        stats.ticketsByType[ticket.ticketType] += ticket.quantity
      })

      return stats
    } catch (error) {
      console.error("Error getting event ticket stats:", error)
      throw error
    }
  }

  async getUserTicketStats(userId: string): Promise<{
    totalTickets: number
    totalSpent: number
    activeTickets: number
    usedTickets: number
  }> {
    try {
      const tickets = await this.getTicketsByUser(userId)

      const stats = {
        totalTickets: 0,
        totalSpent: 0,
        activeTickets: 0,
        usedTickets: 0,
      }

      tickets.forEach((ticket) => {
        stats.totalTickets += ticket.quantity
        stats.totalSpent += ticket.totalAmount

        if (ticket.status === "active") {
          stats.activeTickets += ticket.quantity
        } else if (ticket.status === "used") {
          stats.usedTickets += ticket.quantity
        }
      })

      return stats
    } catch (error) {
      console.error("Error getting user ticket stats:", error)
      throw error
    }
  }
}

export default TicketService.getInstance()
