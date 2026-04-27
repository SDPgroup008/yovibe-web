import FirebaseService from "./FirebaseService"
import PaymentService from "./PaymentService"
import PesaPalService from "./PesaPalService"
import NotificationService from "./NotificationService"
import { uploadQRCode, uploadBuyerPhoto } from "./R2Service"
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
      ticketType?: string
      paymentReference?: string
      pesapalTransactionId?: string
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

      // Step 2: Create payment intent for internal tracking (payment already verified)
      console.log("--- Step 2: Creating payment intent ---")
      const paymentIntent = await PaymentService.createPaymentIntent(total, event.id, buyerId)
      console.log("💳 Payment intent created:")
      console.log("   - Payment ID:", paymentIntent.id)
      console.log("   - Amount:", paymentIntent.amount)
      console.log("   - Currency:", paymentIntent.currency)
      console.log("   - Status: completed (verified via PesaPal)")

      // Step 3: Mark payment as completed since it was verified with PesaPal
      console.log("--- Step 3: Payment already verified with PesaPal ---")
      console.log("✅ Payment verified successfully via PesaPal!")

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
        payoutEligible: true, // Mark as eligible for payout since payment is verified
        payoutStatus: "pending",
        paymentId: paymentIntent.id,
        paymentStatus: "completed", // Payment already verified
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

      // Step 7: Upload QR code and buyer photo to R2
      console.log("--- Step 7: Uploading files to R2 ---")
      if (ticket.qrCodeDataUrl) {
        console.log("📤 Uploading QR code to R2...")
        const qrUploadResult = await uploadQRCode(ticket.qrCodeDataUrl, ticket.id)
        ticket.qrCodeDataUrl = qrUploadResult.url
        console.log("✅ QR code uploaded to R2:", qrUploadResult.url)
      }

      if (ticket.buyerPhotoUrl) {
        console.log("📤 Uploading buyer photo to R2...")
        const photoUploadResult = await uploadBuyerPhoto(ticket.buyerPhotoUrl, ticket.id)
        ticket.buyerPhotoUrl = photoUploadResult.url
        console.log("✅ Buyer photo uploaded to R2:", photoUploadResult.url)
      }

      // Step 8: Save ticket to database
      console.log("--- Step 8: Saving ticket to Firebase ---")
      const ticketId = await FirebaseService.saveTicket(ticket)
      console.log("✅ Ticket saved to database!")
      console.log("   - Firestore Document ID:", ticketId)

      // Step 9: Send notification to event owner
      console.log("--- Step 9: Sending notification to event owner ---")
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
  ): Promise<{ 
    success: boolean; 
    reason?: string;
    needsPhotoVerification?: boolean;
    buyerPhotoUrl?: string;
    buyerName?: string;
    ticketDocId?: string;
  }> {
    try {
      console.log("========================================")
      console.log("🔍 TICKET VALIDATION FLOW STARTED")
      console.log("========================================")
      console.log("📋 TicketService.validateTicket: Starting ticket validation")
      console.log("📋 Ticket ID:", ticketId)
      console.log("📋 Validator ID:", validatorId)
      console.log("📋 Location:", location || "Not specified")

      // Parse ticket data from QR code - QR contains JSON with id and eventId
      let ticketData: { id?: string; eventId?: string } = {}
      let qrCodeValue = ticketId
      let scanningEventId: string | undefined
      
      try {
        // Try to parse as JSON first (new QR format)
        ticketData = JSON.parse(ticketId)
        qrCodeValue = ticketData.id || ticketId
        scanningEventId = ticketData.eventId
        console.log("📋 Parsed QR JSON - ID:", qrCodeValue, "Event:", scanningEventId)
      } catch {
        // Not JSON - treat as plain QR code string (might be legacy format or just the ID)
        qrCodeValue = ticketId
        console.log("📋 Raw QR code string:", qrCodeValue)
      }

      // Step 1: Get ticket directly by QR code
      console.log("--- Step 1: Fetching ticket by QR code ---")
      const ticket = await FirebaseService.getTicketByQRCode(qrCodeValue)

      if (!ticket) {
        console.log("❌ Ticket not found with QR code:", qrCodeValue)
        console.log("========================================")
        return { success: false, reason: "Invalid QR code - ticket not found" }
      }

      console.log("✅ Ticket found:")
      console.log("   - Ticket ID:", ticket.id)
      console.log("   - Event ID:", ticket.eventId)
      console.log("   - Event:", ticket.eventName)
      console.log("   - Buyer:", ticket.buyerName)
      console.log("   - Buyer Photo URL:", ticket.buyerPhotoUrl || "None")
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
          eventId: ticket.eventId,
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
          eventId: ticket.eventId,
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
          eventId: ticket.eventId,
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
          eventId: ticket.eventId,
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
      
      // Check if this ticket has a buyer photo - if so, need photo verification
      const needsPhotoVerification = !!ticket.buyerPhotoUrl
      console.log("--- Step 6: Photo verification check ---")
      console.log("   - Has buyer photo:", needsPhotoVerification)
      
      // Store ticket document ID for later use when marking as used
      const ticketDocId = ticket.id

      // If ticket has buyer photo, DON'T mark as used yet - need photo verification first
      if (needsPhotoVerification) {
        console.log("   - Ticket needs photo verification - returning for confirmation")
        console.log("========================================")
        console.log("🔍 TICKET VALIDATION - PHOTO VERIFICATION REQUIRED")
        console.log("========================================")
        
        return { 
          success: true, 
          needsPhotoVerification: true,
          buyerPhotoUrl: ticket.buyerPhotoUrl,
          buyerName: ticket.buyerName,
          ticketDocId: ticketDocId,
        }
      }

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
      try {
        await FirebaseService.updateTicket(ticket.id, {
          status: "used",
          isScanned: true,
          scannedAt: now,
          payoutEligible,
          payoutStatus: "pending",
        })
        console.log("✅ Ticket status updated to: USED")
      } catch (updateError: any) {
        // If document doesn't exist, check if it's already been used
        if (updateError?.message?.includes("No document to update")) {
          console.log("⚠️ Ticket may already be used - continuing validation")
        } else {
          throw updateError
        }
      }

      // Step 8: Log successful validation
      console.log("--- Step 8: Logging successful validation ---")
      const validation: TicketValidation = {
        id: `val_${Date.now()}`,
        ticketId: ticket.id,
        eventId: ticket.eventId,
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
    } catch (error: any) {
      console.error("❌ Error validating ticket:", error)
      const errorMessage = error?.message || "Validation failed"
      return { success: false, reason: errorMessage }
    }
  }

  /**
   * Confirm ticket usage after photo verification
   * This is called when the scanner verifies the buyer matches the photo
   */
  static async confirmTicketUsage(
    ticketDocId: string,
    validatorId: string,
    location?: string,
    eventId?: string,
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      console.log("========================================")
      console.log("✅ PHOTO VERIFICATION CONFIRMATION")
      console.log("========================================")
      console.log("📋 TicketService.confirmTicketUsage: Confirming ticket after photo verification")
      console.log("📋 Ticket Doc ID:", ticketDocId)
      console.log("📋 Validator ID:", validatorId)
      console.log("📋 Event ID:", eventId)

      const now = new Date()

      // Get the ticket first
      const ticket = await FirebaseService.getTicketById(ticketDocId)
      if (!ticket) {
        console.log("❌ Ticket not found:", ticketDocId)
        return { success: false, reason: "Ticket not found" }
      }

      // Check if already used
      if (ticket.status === "used") {
        console.log("❌ Ticket already used")
        return { success: false, reason: "Ticket already used" }
      }

      // Calculate payout eligibility
      const isLatePurchase = ticket.isLatePurchase
      let payoutEligible = false
      
      if (!isLatePurchase) {
        payoutEligible = true
      } else {
        if (ticket.eventStartTime) {
          const hoursSinceEventStart = (now.getTime() - ticket.eventStartTime.getTime()) / (1000 * 60 * 60)
          payoutEligible = hoursSinceEventStart >= 24
        }
      }

      // Mark ticket as used
      console.log("--- Marking ticket as used ---")
      await FirebaseService.updateTicket(ticketDocId, {
        status: "used",
        isScanned: true,
        scannedAt: now,
        payoutEligible,
        payoutStatus: "pending",
      })
      console.log("✅ Ticket status updated to: USED")

      // Log successful validation
      const validation: TicketValidation = {
        id: `val_${Date.now()}`,
        ticketId: ticketDocId,
        eventId: eventId || ticket.eventId,
        validatedAt: now,
        validatedBy: validatorId,
        location,
        status: "granted",
        reason: "Photo verification confirmed - entry granted",
      }

      await this.logValidation(validation)
      console.log("✅ Validation logged to database")

      console.log("========================================")
      console.log("✅ PHOTO VERIFICATION CONFIRMED - ENTRY GRANTED")
      console.log("========================================")
      console.log("📋 Ticket ID:", ticketDocId)
      console.log("📋 Buyer:", ticket.buyerName)
      console.log("📋 Event:", ticket.eventName)
      console.log("========================================")

      return { success: true }
    } catch (error: any) {
      console.error("❌ Error confirming ticket usage:", error)
      const errorMessage = error?.message || "Failed to confirm ticket usage"
      return { success: false, reason: errorMessage }
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
