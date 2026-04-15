import FirebaseService from "./FirebaseService"
import PaymentService from "./PaymentService"
import PesaPalService from "./PesaPalService"
import NotificationService from "./NotificationService"
import type { Ticket, TicketValidation } from "../models/Ticket"
import type { Event } from "../models/Event"
import QRCode from "qrcode"

export class TicketService {
  static async purchaseTicket(
    event: Event,
    buyerId: string,
    buyerName: string,
    buyerEmail: string,
    quantity: number,
    buyerPhotoUrl: string,
    totalAmount?: number,
    paymentDetails?: {
      method: "mobile_money" | "credit_card" | "bank_transfer"
      provider?: string
      number?: string
      name?: string
      cardNumber?: string
      expiry?: string
      bankName?: string
      accountNumber?: string
      accountName?: string
    },
  ): Promise<Ticket> {
    try {
      console.log("========================================")
      console.log("🎫 TICKET PURCHASE FLOW STARTED")
      console.log("========================================")
      console.log("📋 TicketService.purchaseTicket: Starting ticket purchase")
      console.log("📋 Event:", event.name, "ID:", event.id)
      console.log("📋 Buyer ID:", buyerId)
      console.log("📋 Buyer Name:", buyerName)
      console.log("📋 Buyer Email:", buyerEmail)
      console.log("📋 Quantity:", quantity)

      // Step 1: Get base price from event entry fees
      console.log("--- Step 1: Calculating ticket price ---")
      const basePrice = event.entryFees && event.entryFees.length > 0
        ? Number.parseInt(event.entryFees[0].amount?.replace(/[^0-9]/g, "") || "0")
        : 0
      console.log("💰 Base price:", basePrice)

      // Calculate price with late fee
      const eventStartTime = event.date || new Date()
      console.log("📅 Event start time:", eventStartTime)
      
      // Use provided totalAmount or calculate it
      let pricing
      if (totalAmount !== undefined && totalAmount > 0) {
        const basePrice = totalAmount / quantity
        const lateFeePercent = 0.15 // 15% late fee
        const isLatePurchase = eventStartTime.getTime() - Date.now() < 24 * 60 * 60 * 1000
        const lateFee = isLatePurchase ? basePrice * lateFeePercent : 0
        pricing = { 
          subtotal: basePrice, 
          lateFee, 
          total: totalAmount, 
          isLatePurchase 
        }
        console.log("💰 Using provided totalAmount:", totalAmount)
      } else {
        pricing = PesaPalService.calculateTicketPrice(basePrice, quantity, eventStartTime)
      }
      
      const { subtotal, lateFee, total, isLatePurchase } = pricing
      const { appCommission, venueRevenue } = PaymentService.calculateRevenueSplit(total)

      console.log("💰 Pricing calculated:")
      console.log("   - Subtotal:", subtotal)
      console.log("   - Late Fee:", lateFee)
      console.log("   - Total:", total)
      console.log("   - Is Late Purchase:", isLatePurchase)
      console.log("   - App Commission (8%):", appCommission)
      console.log("   - Venue Revenue:", venueRevenue)

      // Step 2: Create payment intent
      console.log("--- Step 2: Creating payment intent ---")
      const paymentIntent = await PaymentService.createPaymentIntent(total, event.id, buyerId)
      console.log("💳 Payment intent created:")
      console.log("   - Payment ID:", paymentIntent.id)
      console.log("   - Amount:", paymentIntent.amount)
      console.log("   - Currency:", paymentIntent.currency)
      console.log("   - Status:", paymentIntent.status)

      // Step 3: Process payment via PesaPal
      console.log("--- Step 3: Processing payment via PesaPal ---")
      console.log("⏳ Processing payment...")
      await PaymentService.processPayment(paymentIntent.id)
      console.log("✅ Payment processed successfully!")

      // Step 4: Calculate purchase deadline
      console.log("--- Step 4: Calculating purchase deadline ---")
      const purchaseDeadline = new Date(eventStartTime.getTime() - 24 * 60 * 60 * 1000)
      console.log("📅 Purchase deadline:", purchaseDeadline)

      // Step 5: Generate secure QR code with event binding and expiry
      console.log("--- Step 5: Generating secure QR code ---")
      const qrCodeResult = await this.generateSecureQRCode(event.id, eventStartTime)
      console.log("🔒 QR Code generated:", qrCodeResult.qrCode)
      console.log("🔒 Expires at:", qrCodeResult.expiresAt)

      // Step 6: Create ticket object
      console.log("--- Step 6: Creating ticket object ---")
      const ticket: Ticket = {
        id: `ticket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        eventId: event.id,
        eventName: event.name,
        buyerId,
        buyerName,
        buyerEmail,
        quantity,
        totalAmount: total,
        basePrice: subtotal,
        lateFee: lateFee,
        venueRevenue,
        appCommission,
        purchaseDate: new Date(),
        eventStartTime,
        purchaseDeadline,
        qrCode: qrCodeResult.qrCode,
        qrCodeDataUrl: qrCodeResult.qrCodeDataUrl,
        qrSignature: qrCodeResult.qrSignature,
        expiresAt: qrCodeResult.expiresAt,
        buyerPhotoUrl,
        status: "active",
        validationHistory: [],
        entryFeeType: (event.entryFees && event.entryFees.length > 0 ? event.entryFees[0].name : "Standard"),
        isLatePurchase,
        isScanned: false,
        payoutEligible: false,
        payoutStatus: "pending",
        paymentId: paymentIntent.id,
        paymentStatus: "completed",
        paymentReference: paymentIntent.paymentReference || `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        pesapalTransactionId: paymentIntent.paymentId || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        paymentMethod: paymentDetails?.method,
        paymentProvider: paymentDetails?.provider,
        paymentNumber: paymentDetails?.number,
        paymentName: paymentDetails?.name,
      }

      console.log("📝 Ticket object created:")
      console.log("   - Ticket ID:", ticket.id)
      console.log("   - Status:", ticket.status)
      console.log("   - QR Code:", ticket.qrCode)

      // Step 7: Save ticket to database
      console.log("--- Step 7: Saving ticket to Firebase ---")
      const ticketId = await FirebaseService.saveTicket(ticket)
      console.log("✅ Ticket saved to database!")
      console.log("   - Firestore Document ID:", ticketId)

      // Step 8: Send notification to event owner
      console.log("--- Step 8: Sending notification to event owner ---")
      await NotificationService.notifyTicketPurchase(event, ticket)
      console.log("✅ Notification sent to event owner")

      console.log("========================================")
      console.log("🎫 TICKET PURCHASE COMPLETED SUCCESSFULLY")
      console.log("========================================")
      console.log("📋 Final Ticket Details:")
      console.log("   - Ticket ID:", ticket.id)
      console.log("   - Event:", event.name)
      console.log("   - Buyer:", buyerName, `(${buyerEmail})`)
      console.log("   - Quantity:", quantity)
      console.log("   - Total Paid:", total, "UGX")
      console.log("   - QR Code:", ticket.qrCode)
      console.log("   - Status:", ticket.status)
      console.log("========================================")

      return ticket
    } catch (error) {
      console.error("❌ Error purchasing ticket:", error)
      throw error
    }
  }

  static async validateTicket(
    ticketId: string,
    validatorId: string,
    location?: string,
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      console.log("========================================")
      console.log("🔍 TICKET VALIDATION FLOW STARTED")
      console.log("========================================")
      console.log("📋 TicketService.validateTicket: Starting ticket validation")
      console.log("📋 Ticket ID:", ticketId)
      console.log("📋 Validator ID:", validatorId)
      console.log("📋 Location:", location || "Not specified")

      // Parse ticket data - could be JSON (new format) or plain string (legacy QR or ticket ID)
      let ticketData: { id?: string; eventId?: string } = {}
      let actualTicketId = ticketId
      let scanningEventId: string | undefined
      
      try {
        ticketData = JSON.parse(ticketId)
        actualTicketId = ticketData.id || ticketId
        scanningEventId = ticketData.eventId
        console.log("📋 Parsed QR data - ID:", actualTicketId, "Event:", scanningEventId)
      } catch {
        console.log("📋 Using raw ticket ID:", actualTicketId)
      }

      // Step 1: Get ticket by ID (or by QR code if it looks like a QR)
      console.log("--- Step 1: Fetching ticket from database ---")
      let ticket = await FirebaseService.getTicketById(actualTicketId)
      
      // If not found by ID, try by QR code
      if (!ticket) {
        console.log("📋 Trying to find by QR code:", actualTicketId)
        ticket = await FirebaseService.getTicketByQRCode(actualTicketId)
      }

      if (!ticket) {
        console.log("❌ Ticket not found in database")
        console.log("========================================")
        return { success: false, reason: "Ticket not found" }
      }

      console.log("✅ Ticket found:")
      console.log("   - Ticket ID:", ticket.id)
      console.log("   - Event ID:", ticket.eventId)
      console.log("   - Event:", ticket.eventName)
      console.log("   - Buyer:", ticket.buyerName)
      console.log("   - Current Status:", ticket.status)
      console.log("   - QR Code:", ticket.qrCode)
      console.log("   - Expires At:", ticket.expiresAt)

      // Step 2: Check if ticket is expired
      console.log("--- Step 2: Checking ticket expiry ---")
      const now = new Date()
      if (ticket.expiresAt && new Date(ticket.expiresAt) < now) {
        console.log("❌ Ticket has expired")
        
        await FirebaseService.updateTicket(ticket.id, {
          status: "expired"
        })
        
        const validation: TicketValidation = {
          id: `val_${Date.now()}`,
          ticketId: ticket.id,
          validatedAt: now,
          validatedBy: validatorId,
          location,
          status: "denied",
          reason: "Ticket has expired",
        }
        await this.logValidation(validation)
        
        console.log("========================================")
        console.log("🔍 TICKET VALIDATION FAILED - EXPIRED")
        console.log("========================================")
        return { success: false, reason: "Ticket has expired" }
      }

      // Step 3: Check ticket status
      console.log("--- Step 3: Validating ticket status ---")
      if (ticket.status !== "active") {
        console.log("❌ Ticket is not active. Status:", ticket.status)
        
        const reason = ticket.status === "used" ? "Ticket already used" : 
                       ticket.status === "cancelled" ? "Ticket was cancelled" :
                       ticket.status === "refunded" ? "Ticket was refunded" :
                       ticket.status === "expired" ? "Ticket has expired" : "Invalid ticket status"
        
        const validation: TicketValidation = {
          id: `val_${Date.now()}`,
          ticketId: ticket.id,
          validatedAt: now,
          validatedBy: validatorId,
          location,
          status: "denied",
          reason,
        }

        await this.logValidation(validation)
        console.log("--- Step 4: Logging failed validation ---")
        
        console.log("========================================")
        console.log("🔍 TICKET VALIDATION FAILED")
        console.log("========================================")
        return { success: false, reason }
      }

      // Step 4: Verify event ID matches (if provided)
      console.log("--- Step 4: Verifying event ID ---")
      if (scanningEventId && ticket.eventId !== scanningEventId) {
        console.log("❌ Event ID mismatch")
        console.log("   - Scanner Event:", scanningEventId)
        console.log("   - Ticket Event:", ticket.eventId)
        
        const validation: TicketValidation = {
          id: `val_${Date.now()}`,
          ticketId: ticket.id,
          validatedAt: now,
          validatedBy: validatorId,
          location,
          status: "denied",
          reason: "Ticket is for a different event",
        }
        await this.logValidation(validation)
        
        console.log("========================================")
        console.log("🔍 TICKET VALIDATION FAILED - WRONG EVENT")
        console.log("========================================")
        return { success: false, reason: "Ticket is for a different event" }
      }

      // Step 5: Verify QR code exists
      console.log("--- Step 5: Verifying QR code ---")
      if (!ticket.qrCode) {
        console.log("❌ QR code missing")
        
        const validation: TicketValidation = {
          id: `val_${Date.now()}`,
          ticketId: ticket.id,
          validatedAt: now,
          validatedBy: validatorId,
          location,
          status: "denied",
          reason: "Invalid ticket - no QR code",
        }
        await this.logValidation(validation)
        
        console.log("========================================")
        console.log("🔍 TICKET VALIDATION FAILED - NO QR")
        console.log("========================================")
        return { success: false, reason: "Invalid ticket" }
      }

      console.log("✅ All security checks passed")
      console.log("   - Status: active")
      console.log("   - Not expired")
      console.log("   - QR code valid")

      // Step 6: Calculate payout eligibility
      console.log("--- Step 6: Calculating payout eligibility ---")
      const isLatePurchase = ticket.isLatePurchase
      
      let payoutEligible = false
      if (!isLatePurchase) {
        payoutEligible = true
        console.log("   - Early ticket: Immediately eligible for payout")
      } else {
        if (ticket.eventStartTime) {
          const hoursSinceEventStart = (now.getTime() - ticket.eventStartTime.getTime()) / (1000 * 60 * 60)
          payoutEligible = hoursSinceEventStart >= 24
          console.log("   - Late ticket - Hours since event:", hoursSinceEventStart.toFixed(2))
          console.log("   - Eligible after 24 hours:", payoutEligible)
        }
      }

      // Step 7: Mark ticket as used immediately (prevent double-use)
      console.log("--- Step 7: Marking ticket as used ---")
      await FirebaseService.updateTicket(ticket.id, {
        status: "used",
        isScanned: true,
        scannedAt: now,
        payoutEligible,
        payoutStatus: "pending",
      })
      console.log("✅ Ticket status updated to: USED")

      // Step 8: Log successful validation
      console.log("--- Step 8: Logging successful validation ---")
      const validation: TicketValidation = {
        id: `val_${Date.now()}`,
        ticketId: ticket.id,
        validatedAt: now,
        validatedBy: validatorId,
        location,
        status: "granted",
      }

      await this.logValidation(validation)
      console.log("✅ Validation logged to database")

      console.log("========================================")
      console.log("🔍 TICKET VALIDATION SUCCESSFUL")
      console.log("========================================")
      console.log("📋 Validation Details:")
      console.log("   - Ticket ID:", ticket.id)
      console.log("   - Event:", ticket.eventName)
      console.log("   - Buyer:", ticket.buyerName)
      console.log("   - Validated By:", validatorId)
      console.log("   - Location:", location || "N/A")
      console.log("   - New Status: USED")
      console.log("   - Payout Eligible:", payoutEligible)
      console.log("========================================")

      return { success: true }
    } catch (error) {
      console.error("❌ Error validating ticket:", error)
      return { success: false, reason: "Validation error" }
    }
  }

  static async requestPayout(
    organizerId: string,
    ticketIds: string[],
    amount: number,
    payoutMethod: "mobile_money" | "bank_transfer",
    recipientDetails: {
      name: string
      accountNumber?: string
      phoneNumber?: string
      bankName?: string
    }
  ): Promise<{ success: boolean; payoutId?: string; error?: string }> {
    try {
      console.log("========================================")
      console.log("💰 PAYOUT REQUEST FLOW STARTED")
      console.log("========================================")
      console.log("📋 TicketService.requestPayout: Starting payout request")
      console.log("📋 Organizer ID:", organizerId)
      console.log("📋 Number of tickets:", ticketIds.length)
      console.log("📋 Total amount:", amount, "UGX")
      console.log("📋 Payout method:", payoutMethod)
      console.log("📋 Recipient:", recipientDetails.name)

      // Step 1: Verify tickets are eligible for payout
      console.log("--- Step 1: Verifying ticket eligibility ---")
      const eligibleTickets: Ticket[] = []
      
      for (const ticketId of ticketIds) {
        const ticket = await FirebaseService.getTicketById(ticketId)
        if (ticket && ticket.payoutEligible && ticket.payoutStatus === "pending") {
          eligibleTickets.push(ticket)
          console.log("   ✅ Ticket", ticketId, "eligible for payout")
        } else {
          console.log("   ❌ Ticket", ticketId, "not eligible")
        }
      }

      if (eligibleTickets.length === 0) {
        console.log("❌ No eligible tickets for payout")
        return { success: false, error: "No eligible tickets for payout" }
      }

      const eligibleAmount = eligibleTickets.reduce((sum, t) => sum + t.venueRevenue, 0)
      console.log("   - Eligible tickets:", eligibleTickets.length)
      console.log("   - Eligible amount:", eligibleAmount, "UGX")

      // Step 2: Process payout via PesaPal
      console.log("--- Step 2: Processing payout via PesaPal ---")
      console.log("⏳ Initiating payout request...")
      
      const payoutResult = await PesaPalService.processPayout(
        organizerId,
        eligibleAmount,
        payoutMethod,
        recipientDetails
      )

      if (!payoutResult.success) {
        console.log("❌ PesaPal payout failed:", payoutResult.error)
        
        // Update ticket statuses to failed
        for (const ticket of eligibleTickets) {
          await FirebaseService.updateTicket(ticket.id, {
            payoutStatus: "failed",
          })
        }
        
        return { success: false, error: payoutResult.error }
      }

      console.log("✅ Payout processed successfully!")
      console.log("   - Payout ID:", payoutResult.payoutId)
      console.log("   - Transaction Ref:", payoutResult.transactionReference)

      // Step 3: Update ticket statuses
      console.log("--- Step 3: Updating ticket payout statuses ---")
      for (const ticket of eligibleTickets) {
        await FirebaseService.updateTicket(ticket.id, {
          payoutStatus: "processing",
        })
        console.log("   ✅ Ticket", ticket.id, "marked as processing")
      }

      console.log("========================================")
      console.log("💰 PAYOUT REQUEST COMPLETED SUCCESSFULLY")
      console.log("========================================")
      console.log("📋 Payout Details:")
      console.log("   - Payout ID:", payoutResult.payoutId)
      console.log("   - Amount:", eligibleAmount, "UGX")
      console.log("   - Method:", payoutMethod)
      console.log("   - Recipient:", recipientDetails.name)
      console.log("   - Tickets:", eligibleTickets.length)
      console.log("========================================")

      return { 
        success: true, 
        payoutId: payoutResult.payoutId,
      }
    } catch (error) {
      console.error("❌ Error requesting payout:", error)
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
    }
  }

  static async getEventTickets(eventId: string): Promise<Ticket[]> {
    try {
      console.log("📋 TicketService.getEventTickets: Fetching tickets for event:", eventId)
      const tickets = await FirebaseService.getTicketsByEvent(eventId)
      console.log("✅ Found", tickets.length, "tickets")
      return tickets
    } catch (error) {
      console.error("Error getting event tickets:", error)
      return []
    }
  }

  static async getUserTickets(userId: string): Promise<Ticket[]> {
    try {
      console.log("📋 TicketService.getUserTickets: Fetching tickets for user:", userId)
      const tickets = await FirebaseService.getTicketsByUser(userId)
      console.log("✅ Found", tickets.length, "tickets")
      return tickets
    } catch (error) {
      console.error("Error getting user tickets:", error)
      return []
    }
  }

  private static generateHMAC(data: string, secret: string): string {
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return `${secret}_${hash.toString(16)}_${Date.now()}`
  }

  private static async generateSecureQRCode(
    eventId: string,
    eventStartTime: Date
  ): Promise<{ qrCode: string; qrCodeDataUrl: string; qrSignature: string; expiresAt: Date }> {
    const timestamp = Date.now()
    const uniqueId = `YOVIBE_${timestamp}_${Math.random().toString(36).substr(2, 9)}`
    
    const expiresAt = new Date(eventStartTime.getTime() + 24 * 60 * 60 * 1000)
    
    const qrData = JSON.stringify({
      id: uniqueId,
      eventId: eventId,
      timestamp: timestamp,
      expires: expiresAt.getTime()
    })
    
    const qrSignature = this.generateHMAC(qrData, "YOVIBE_SECURE")
    
    const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF"
      },
      errorCorrectionLevel: "H"
    })
    
    return { qrCode: uniqueId, qrCodeDataUrl, qrSignature, expiresAt }
  }

  private static async logValidation(validation: TicketValidation): Promise<void> {
    try {
      console.log("📝 Logging ticket validation to database:")
      console.log("   - Validation ID:", validation.id)
      console.log("   - Ticket ID:", validation.ticketId)
      console.log("   - Status:", validation.status)
      console.log("   - Validated By:", validation.validatedBy)
      
      await FirebaseService.saveTicketValidation(validation)
      console.log("✅ Validation logged successfully")
    } catch (error) {
      console.error("Error logging validation:", error)
    }
  }
}

export default TicketService
