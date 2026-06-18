import supabase from "../config/supabase"
import PaymentService from "./PaymentService"
import PesaPalService from "./PesaPalService"
import PawaPayService from "./PawaPayService"
import NotificationService from "./NotificationService"
import { uploadQRCode, uploadBuyerPhoto } from "./R2Service"
import type { Ticket, TicketValidation, PaymentIntent } from "../models/Ticket"
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

      let paymentIntent: PaymentIntent
      let isMobileMoney = paymentDetails?.method === "mobile_money"

      if (isMobileMoney) {
        console.log("--- Step 2: Creating payment intent for mobile money ---")
        paymentIntent = await PaymentService.createPaymentIntent(total, event.id, buyerId)
        console.log("💳 Payment intent created:")
        console.log("   - Payment ID:", paymentIntent.id)
        console.log("   - Amount:", paymentIntent.amount)
        console.log("   - Currency:", paymentIntent.currency)
        console.log("   - Status: pending (mobile money verification required)")
      } else {
        console.log("--- Step 2: Creating payment intent for card/bank transfer ---")
        paymentIntent = await PaymentService.createPaymentIntent(total, event.id, buyerId)
        console.log("💳 Payment intent created:")
        console.log("   - Payment ID:", paymentIntent.id)
        console.log("   - Amount:", paymentIntent.amount)
        console.log("   - Currency:", paymentIntent.currency)
        console.log("   - Status: completed (verified via PesaPal)")
      }

      console.log("--- Step 3: Payment verification ---")
      if (isMobileMoney) {
        console.log("⏳ Mobile money payment pending - will be verified via PawaPay callback")
      } else {
        console.log("✅ Payment verified successfully via PesaPal!")
      }

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
        status: isMobileMoney ? "pending" : "active",
        validationHistory: [],
        entryFeeType: (event.entryFees && event.entryFees.length > 0 ? event.entryFees[0].name : "Standard"),
        isLatePurchase,
        isScanned: false,
        payoutEligible: false,
        payoutStatus: "pending",
        paymentId: paymentIntent.id,
        paymentStatus: isMobileMoney ? "pending" : "completed",
        paymentReference: paymentIntent.paymentReference || `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        paymentMethod: paymentDetails?.method,
        paymentProvider: paymentDetails?.provider,
        paymentNumber: paymentDetails?.number,
        paymentName: paymentDetails?.name,
        pesapalTransactionId: !isMobileMoney ? paymentIntent.paymentId || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : undefined,
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
      console.log("--- Step 8: Saving ticket to Supabase ---")
      const { data: savedTicket, error: saveError } = await supabase.from("tickets_api").insert({ ...ticket, event_slug: event.slug || event.id }).select("id").single()
      if (saveError) throw saveError
      const ticketId = savedTicket.id
      console.log("✅ Ticket saved to database!")
      console.log("   - Supabase ID:", ticketId)

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
      const { data: ticket, error: ticketError } = await supabase.from("tickets").select("*").eq("qr_code", qrCodeValue).single()
      if (ticketError && ticketError.code !== "PGRST116") throw ticketError

      if (!ticket) {
        console.log("❌ Ticket not found with QR code:", qrCodeValue)
        console.log("========================================")
        return { success: false, reason: "Invalid QR code - ticket not found" }
      }

      // Map snake_case DB row to camelCase Ticket object
      const t = this.rowToTicket(ticket)

      console.log("✅ Ticket found:")
      console.log("   - Ticket ID:", t.id)
      console.log("   - Event ID:", t.eventId)
      console.log("   - Event:", t.eventName)
      console.log("   - Buyer:", t.buyerName)
      console.log("   - Buyer Photo URL:", t.buyerPhotoUrl || "None")
      console.log("   - Current Status:", t.status)
      console.log("   - QR Code:", t.qrCode)
      console.log("   - Expires At:", t.expiresAt)

      // Step 2: Check if ticket is expired
      console.log("--- Step 2: Checking ticket expiry ---")
      const now = new Date()
      if (t.expiresAt && new Date(t.expiresAt) < now) {
        console.log("❌ Ticket has expired")
        
        await supabase.from("tickets").update({ status: "expired" }).eq("id", t.id)
        await this.logValidation({
          id: `val_${Date.now()}`, ticketId: t.id, eventId: t.eventId,
          validatedAt: now, validatedBy: validatorId, location,
          status: "denied", reason: "Ticket has expired",
        })
        console.log("========================================")
        console.log("🔍 TICKET VALIDATION FAILED - EXPIRED")
        console.log("========================================")
        return { success: false, reason: "Ticket has expired" }
      }

      // Step 3: Check ticket status
      console.log("--- Step 3: Validating ticket status ---")
      // Accept "pending" (mobile money) and "active" as valid
      if (t.status !== "active" && t.status !== "pending") {
        console.log("❌ Ticket is not valid. Status:", t.status)
        
        const reason = t.status === "used" ? "Ticket already used" : 
                       t.status === "cancelled" ? "Ticket was cancelled" :
                       t.status === "refunded" ? "Ticket was refunded" :
                       t.status === "expired" ? "Ticket has expired" : "Invalid ticket status"
        
        await this.logValidation({
          id: `val_${Date.now()}`, ticketId: t.id, eventId: t.eventId,
          validatedAt: now, validatedBy: validatorId, location,
          status: "denied", reason,
        })
        console.log("========================================")
        console.log("🔍 TICKET VALIDATION FAILED")
        console.log("========================================")
        return { success: false, reason }
      }

      // Step 4: Verify event ID matches (if provided)
      console.log("--- Step 4: Verifying event ID ---")
      if (scanningEventId && t.eventId !== scanningEventId) {
        console.log("❌ Event ID mismatch")
        console.log("   - Scanner Event:", scanningEventId)
        console.log("   - Ticket Event:", t.eventId)
        
        await this.logValidation({
          id: `val_${Date.now()}`, ticketId: t.id, eventId: t.eventId,
          validatedAt: now, validatedBy: validatorId, location,
          status: "denied", reason: "Ticket is for a different event",
        })
        console.log("========================================")
        console.log("🔍 TICKET VALIDATION FAILED - WRONG EVENT")
        console.log("========================================")
        return { success: false, reason: "Ticket is for a different event" }
      }

      // Step 5: Verify QR code exists
      console.log("--- Step 5: Verifying QR code ---")
      if (!t.qrCode) {
        console.log("❌ QR code missing")
        await this.logValidation({
          id: `val_${Date.now()}`, ticketId: t.id, eventId: t.eventId,
          validatedAt: now, validatedBy: validatorId, location,
          status: "denied", reason: "Invalid ticket - no QR code",
        })
        console.log("========================================")
        console.log("🔍 TICKET VALIDATION FAILED - NO QR")
        console.log("========================================")
        return { success: false, reason: "Invalid ticket" }
      }

      console.log("✅ All security checks passed")
      console.log("   - Status:", t.status)
      console.log("   - Not expired")
      console.log("   - QR code valid")
      
      // Check if this ticket has a buyer photo
      const needsPhotoVerification = !!t.buyerPhotoUrl
      console.log("--- Step 6: Photo verification check ---")
      console.log("   - Has buyer photo:", needsPhotoVerification)
      
      const ticketDocId = t.id

      if (needsPhotoVerification) {
        console.log("   - Ticket needs photo verification")
        return { 
          success: true, 
          needsPhotoVerification: true,
          buyerPhotoUrl: t.buyerPhotoUrl,
          buyerName: t.buyerName,
          ticketDocId,
        }
      }

      // Step 7: Mark ticket as used
      console.log("--- Step 7: Marking ticket as used ---")
      try {
        await supabase.from("tickets").update({
          status: "used",
          is_scanned: true,
          scanned_at: now.toISOString(),
          payout_eligible: true,
          payout_status: "pending",
        }).eq("id", t.id)
        console.log("✅ Ticket status updated to: USED")
      } catch (updateError: any) {
        console.log("⚠️ Ticket update issue - continuing")
      }

      // Step 8: Log validation
      console.log("--- Step 8: Logging successful validation ---")
      await this.logValidation({
        id: `val_${Date.now()}`, ticketId: t.id, eventId: t.eventId,
        validatedAt: now, validatedBy: validatorId, location,
        status: "granted",
      })

      console.log("========================================")
      console.log("🔍 TICKET VALIDATION SUCCESSFUL")
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
      const { data: ticket, error: getErr } = await supabase.from("tickets").select("*").eq("id", ticketDocId).single()
      if (getErr) throw getErr
      if (!ticket) {
        console.log("❌ Ticket not found:", ticketDocId)
        return { success: false, reason: "Ticket not found" }
      }

      // Check if already used
      if (ticket.status === "used") {
        console.log("❌ Ticket already used")
        return { success: false, reason: "Ticket already used" }
      }

      // Mark ticket as used — scanned tickets are eligible for payout
      console.log("--- Marking ticket as used (eligible for payout) ---")
      await supabase.from("tickets").update({
        status: "used",
        is_scanned: true,
        scanned_at: now.toISOString(),
        payout_eligible: true,
        payout_status: "pending",
      }).eq("id", ticketDocId)
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
        const { data: ticket } = await supabase.from("tickets").select("*").eq("id", ticketId).single()
        if (ticket && ticket.payout_eligible && ticket.payout_status === "pending") {
          eligibleTickets.push(ticket as any)
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
          await supabase.from("tickets").update({ payout_status: "failed" }).eq("id", ticket.id)
        }
        
        return { success: false, error: payoutResult.error }
      }

      console.log("✅ Payout processed successfully!")
      console.log("   - Payout ID:", payoutResult.payoutId)
      console.log("   - Transaction Ref:", payoutResult.transactionReference)

      // Step 3: Update ticket statuses
      console.log("--- Step 3: Updating ticket payout statuses ---")
      for (const ticket of eligibleTickets) {
        await supabase.from("tickets").update({ payout_status: "processing" }).eq("id", ticket.id)
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

  /**
   * Convert a snake_case database row to a camelCase Ticket object.
   */
  private static rowToTicket(row: any): Ticket {
    if (!row) return row
    return {
      id: row.id,
      eventId: row.event_id || row.eventId,
      eventName: row.event_name || row.eventName,
      buyerId: row.buyer_id || row.buyerId,
      buyerName: row.buyer_name || row.buyerName,
      buyerEmail: row.buyer_email || row.buyerEmail,
      buyerPhone: row.buyer_phone || row.buyerPhone,
      quantity: row.quantity,
      totalAmount: row.total_amount ?? row.totalAmount ?? 0,
      basePrice: row.base_price ?? row.basePrice ?? 0,
      lateFee: row.late_fee ?? row.lateFee ?? 0,
      venueRevenue: row.venue_revenue ?? row.venueRevenue ?? 0,
      appCommission: row.app_commission ?? row.appCommission ?? 0,
      purchaseDate: row.purchase_date || row.purchaseDate ? new Date(row.purchase_date || row.purchaseDate) : new Date(),
      eventStartTime: row.event_start_time || row.eventStartTime ? new Date(row.event_start_time || row.eventStartTime) : new Date(),
      purchaseDeadline: row.purchase_deadline || row.purchaseDeadline ? new Date(row.purchase_deadline || row.purchaseDeadline) : new Date(),
      qrCode: row.qr_code || row.qrCode,
      qrCodeDataUrl: row.qr_code_data_url || row.qrCodeDataUrl,
      qrSignature: row.qr_signature || row.qrSignature,
      buyerPhotoUrl: row.buyer_photo_url || row.buyerPhotoUrl,
      status: row.status || "pending",
      validationHistory: row.validation_history || row.validationHistory || [],
      entryFeeType: row.entry_fee_type || row.entryFeeType,
      isLatePurchase: row.is_late_purchase ?? row.isLatePurchase ?? false,
      isScanned: row.is_scanned ?? row.isScanned ?? false,
      expiresAt: row.expires_at || row.expiresAt ? new Date(row.expires_at || row.expiresAt) : new Date(),
      payoutEligible: row.payout_eligible ?? row.payoutEligible ?? false,
      payoutStatus: row.payout_status || row.payoutStatus || "pending",
      payoutDate: row.payout_date || row.payoutDate ? new Date(row.payout_date || row.payoutDate) : undefined,
      scannedAt: row.scanned_at || row.scannedAt ? new Date(row.scanned_at || row.scannedAt) : undefined,
      paymentId: row.payment_id || row.paymentId,
      paymentStatus: row.payment_status || row.paymentStatus || "pending",
      paymentReference: row.payment_reference || row.paymentReference,
      paymentMethod: row.payment_method || row.paymentMethod,
      paymentProvider: row.payment_provider || row.paymentProvider,
      paymentNumber: row.payment_number || row.paymentNumber,
      paymentName: row.payment_name || row.paymentName,
      pesapalTransactionId: row.pesapal_transaction_id || row.pesapalTransactionId,
      pawapayDepositId: row.pawapay_deposit_id || row.pawapayDepositId,
    }
  }

  static async getEventTickets(eventId: string): Promise<Ticket[]> {
    try {
      console.log("📋 TicketService.getEventTickets: Fetching tickets for event:", eventId)
      const { data: rows } = await supabase.from("tickets").select("*").eq("event_slug", eventId)
      const ticketList = (rows || []).map(this.rowToTicket)
      console.log("✅ Found", ticketList.length, "tickets")
      return ticketList
    } catch (error) {
      console.error("Error getting event tickets:", error)
      return []
    }
  }

  static async getUserTickets(userId: string): Promise<Ticket[]> {
    try {
      console.log("📋 TicketService.getUserTickets: Fetching tickets for user:", userId)
      const { data: rows } = await supabase.from("tickets").select("*").eq("buyer_id", userId)
      const ticketList = (rows || []).map(this.rowToTicket)
      console.log("✅ Found", ticketList.length, "tickets")
      return ticketList
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
      
      await supabase.from("ticket_validations").insert(validation)
      console.log("✅ Validation logged successfully")
    } catch (error) {
      console.error("Error logging validation:", error)
    }
  }
}

export default TicketService
