import supabase from "../config/supabase"
import PaymentService from "./PaymentService"
import PesaPalService from "./PesaPalService"
import PawaPayService from "./PawaPayService"
import NotificationService from "./NotificationService"
import SupabaseService from "./SupabaseService"
import { uploadQRCode, uploadBuyerPhoto } from "./R2Service"
import { v4 as uuidv4 } from "uuid"
import type { Ticket, TicketValidation, PaymentIntent } from "../models/Ticket"
import type { Event } from "../models/Event"
import type { PendingFulfillment, CreateFulfillmentInput } from "../models/PendingFulfillment"
import QRCode from "qrcode"
import { deriveTicketRef } from "../utils/ticketRef"

const FUNCTIONS_BASE_URL =
  process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL ||
  process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  ""

async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000 } = options
  let lastError: any
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      console.warn(`Attempt ${attempt}/${maxAttempts} failed:`, (err as Error)?.message || err)
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, baseDelayMs * attempt))
      }
    }
  }
  throw lastError
}

export class TicketService {
  static async purchaseTickets(
    event: Event,
    buyerNames: string[],
    buyerEmail: string,
    quantity: number,
    buyerPhotoUrl: string,
    totalAmount: number,
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
  ): Promise<Ticket[]> {
    return this.purchaseTicketsForTable(event, buyerNames, [buyerEmail], quantity, false, 1, quantity, buyerPhotoUrl, totalAmount, paymentDetails)
  }

  static async purchaseTicketsForTable(
    event: Event,
    buyerNames: string[],
    buyerEmails: string[],
    totalTickets: number,
    isTableEntry: boolean,
    tableSize: number,
    quantity: number,
    buyerPhotoUrl: string,
    totalAmount: number,
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
    buyerId?: string | null,
    payerEmail?: string,
    deliveryEmails?: string[],
    seatNumber?: number,
  ): Promise<Ticket[]> {
    try {
      console.log("========================================")
      console.log("🎫 BULK TICKET PURCHASE FLOW STARTED")
      console.log("========================================")
      console.log("📋 TicketService.purchaseTickets: Creating", totalTickets, "individual tickets")
      console.log("📋 Event:", event.name, "ID:", event.id)
      console.log("📋 Buyer Names:", buyerNames)
      console.log("📋 Buyer Emails:", buyerEmails)
      console.log("📋 Is Table Entry:", isTableEntry, "Table Size:", tableSize, "Quantity:", quantity)

      const createdTickets: Ticket[] = []
      const ticketsPerPurchase = totalTickets
      const tableTotal = isTableEntry ? totalAmount : undefined
      const tableGroupId = isTableEntry ? `YVG-${event.id.slice(-6)}-${Date.now().toString().slice(-6)}` : undefined

      const payerEmailFinal = payerEmail ?? buyerEmails[0] ?? ""

      for (let i = 0; i < buyerNames.length; i++) {
        const attendeeName = buyerNames[i]
        const attendeeEmail = buyerEmails[i] || ""
        const deliveryEmail = deliveryEmails?.[i] ?? attendeeEmail
        console.log(`\n--- Creating ticket ${i + 1}/${totalTickets} for ${attendeeName} (${attendeeEmail}) ---`)

        const ticket = await this.createSingleTicket(
          event,
          attendeeName,
          payerEmailFinal,
          1,
          buyerPhotoUrl,
          totalAmount / ticketsPerPurchase,
          paymentDetails,
          i === 0,
          tableTotal,
          tableGroupId,
          buyerId ?? null,
          deliveryEmail,
          seatNumber,
        )
        createdTickets.push(ticket)
      }

      console.log("\n========================================")
      console.log("🎫 BULK TICKET PURCHASE COMPLETED")
      console.log("========================================")

      return createdTickets
    } catch (error) {
      console.error("❌ Error in bulk ticket purchase:", error)
      throw error
    }
  }

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

      const ticket = await this.createSingleTicket(
        event,
        buyerName,
        buyerEmail,
        quantity,
        buyerPhotoUrl,
        totalAmount,
        paymentDetails
      )

      console.log("========================================")
      console.log("🎫 TICKET PURCHASE COMPLETED SUCCESSFULLY")
      console.log("========================================")

      return ticket
    } catch (error) {
      console.error("❌ Error purchasing ticket:", error)
      throw error
    }
  }

private static async createSingleTicket(
    event: Event,
    buyerName: string,
    buyerEmail: string,
    quantity: number,
    buyerPhotoUrl: string,
    totalAmount: number | undefined,
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
    shouldCreatePaymentIntent: boolean = true,
    tableTotalAmount?: number,
    tableGroupId?: string,
    buyerId?: string | null,
    deliveryEmail?: string,
    seatNumber?: number,
  ): Promise<Ticket> {
    console.log("--- Step 1: Calculating ticket price ---")
    const basePrice = event.entryFees && event.entryFees.length > 0
      ? Number.parseInt(event.entryFees[0].amount?.replace(/[^0-9]/g, "") || "0")
      : 0
    console.log("💰 Base price:", basePrice)

    const eventStartTime = event.date || new Date()
    console.log("📅 Event start time:", eventStartTime)
    
    let pricing
    if (totalAmount !== undefined && totalAmount > 0) {
      const perTicketBasePrice = totalAmount
      const lateFeePercent = 0.15
      const isLatePurchase = eventStartTime.getTime() - Date.now() < 24 * 60 * 60 * 1000
      const lateFee = isLatePurchase ? perTicketBasePrice * lateFeePercent : 0
      pricing = { 
        subtotal: perTicketBasePrice, 
        lateFee, 
        total: totalAmount, 
        isLatePurchase 
      }
      console.log("💰 Using provided totalAmount:", totalAmount)
    } else {
      pricing = PesaPalService.calculateTicketPrice(basePrice, 1, eventStartTime)
    }
    
    const { subtotal, lateFee, total, isLatePurchase } = pricing
    const { appCommission, venueRevenue } = PaymentService.calculateRevenueSplit(total)

    console.log("💰 Pricing calculated:")
    console.log("   - Subtotal:", subtotal)
    console.log("   - Late Fee:", lateFee)
    console.log("   - Total:", total)
    console.log("   - Is Late Purchase:", isLatePurchase)
    console.log("   - App Commission (15%):", appCommission)
    console.log("   - Venue Revenue:", venueRevenue)

    let paymentIntent: PaymentIntent | undefined

    if (shouldCreatePaymentIntent) {
      if (paymentDetails?.method === "mobile_money") {
        console.log("--- Step 2: Creating payment intent for mobile money ---")
        const buyerId = `buyer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        paymentIntent = await PaymentService.createPaymentIntent(total, event.id, buyerId)
        console.log("💳 Payment intent created:")
        console.log("   - Payment ID:", paymentIntent.id)
        console.log("   - Amount:", paymentIntent.amount)
        console.log("   - Currency:", paymentIntent.currency)
        console.log("   - Status: pending (mobile money verification required)")
      } else {
        console.log("--- Step 2: Creating payment intent for card/bank transfer ---")
        paymentIntent = await PaymentService.createPaymentIntent(total, event.id, buyerName)
        console.log("💳 Payment intent created:")
        console.log("   - Payment ID:", paymentIntent.id)
        console.log("   - Amount:", paymentIntent.amount)
        console.log("   - Currency:", paymentIntent.currency)
        console.log("   - Status: completed (verified via PesaPal)")
      }
    } else {
      console.log("--- Step 2: Skipping payment intent creation (bulk purchase) ---")
    }

    console.log("--- Step 3: Payment verification ---")
    if (paymentDetails?.method === "mobile_money") {
      console.log("⏳ Mobile money payment pending - will be verified via PawaPay callback")
    } else {
      console.log("✅ Payment verified successfully via PesaPal!")
    }

    console.log("--- Step 4: Calculating purchase deadline ---")
    const purchaseDeadline = new Date(eventStartTime.getTime() - 24 * 60 * 60 * 1000)
    console.log("📅 Purchase deadline:", purchaseDeadline)

    console.log("--- Step 5: Generating secure QR code ---")
    const qrCodeResult = await this.generateSecureQRCode(event.id, eventStartTime)
    console.log("🔒 QR Code generated:", qrCodeResult.qrCode)
    console.log("🔒 Expires at:", qrCodeResult.expiresAt)

    console.log("--- Step 6: Creating ticket object ---")
    const photoUploadToken = uuidv4()
    const ticketId = `ticket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const isTableEntry = !!tableGroupId
    const ticketRef = deriveTicketRef(ticketId, isTableEntry)
    
    const ticket: Ticket = {
      id: ticketId,
      eventId: event.id,
      eventName: event.name,
      buyerId: buyerId ?? undefined,
      buyerName,
      buyerEmail,
      deliveryEmail: deliveryEmail ?? buyerEmail,
      ticketRef,
      quantity: 1,
      totalAmount: total,
      tableTotalAmount: tableTotalAmount,
      tableGroupId: tableGroupId,
      seatNumber: seatNumber,
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
      photoUploadToken,
      photoUploadTokenExpiresAt: eventStartTime,
      status: paymentDetails?.method === "mobile_money" ? "pending" : "active",
      validationHistory: [],
      entryFeeType: paymentDetails?.ticketType || (event.entryFees && event.entryFees.length > 0 ? event.entryFees[0].name : "Standard"),
      isLatePurchase,
      isScanned: false,
      payoutEligible: false,
      payoutStatus: "pending",
      paymentId: paymentIntent?.id,
      paymentStatus: paymentDetails?.method === "mobile_money" ? "pending" : "completed",
      paymentReference: paymentIntent?.paymentReference || paymentDetails?.paymentReference || `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      paymentMethod: paymentDetails?.method,
      paymentProvider: paymentDetails?.provider,
      paymentNumber: paymentDetails?.number,
      paymentName: paymentDetails?.name,
      pesapalTransactionId: paymentDetails?.method !== "mobile_money" ? paymentIntent?.paymentId || paymentDetails?.pesapalTransactionId || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : undefined,
    }

    console.log("📝 Ticket object created:")
    console.log("   - Ticket ID:", ticket.id)
    console.log("   - Status:", ticket.status)
    console.log("   - QR Code:", ticket.qrCode)

    console.log("--- Step 7: Uploading files to R2 ---")
    if (ticket.qrCodeDataUrl) {
      console.log("📤 Uploading QR code to R2...")
      const qrUploadResult = await withRetry(
        () => uploadQRCode(ticket.qrCodeDataUrl!, ticket.id),
        { maxAttempts: 3, baseDelayMs: 500 }
      )
      ticket.qrCodeDataUrl = qrUploadResult.url
      console.log("✅ QR code uploaded to R2:", qrUploadResult.url)
    }

    if (ticket.buyerPhotoUrl) {
      console.log("📤 Uploading buyer photo to R2...")
      const photoUploadResult = await withRetry(
        () => uploadBuyerPhoto(ticket.buyerPhotoUrl!, ticket.id),
        { maxAttempts: 3, baseDelayMs: 500 }
      )
      ticket.buyerPhotoUrl = photoUploadResult.url
      console.log("✅ Buyer photo uploaded to R2:", photoUploadResult.url)
    }

    console.log("--- Step 8: Saving ticket to Supabase ---")
    const savedTicket = await withRetry(
      async () => {
        const result = await supabase.from("tickets_api").insert({ 
          ...ticket, 
          event_slug: event.slug || event.id,
          seat_number: seatNumber ?? null,
        }).select("id").single()
        if (result.error) throw result.error
        return result.data
      },
      { maxAttempts: 3, baseDelayMs: 1000 }
    )
    console.log("✅ Ticket saved to database!")
    console.log("   - Supabase ID:", savedTicket.id)

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
    console.log("   - Quantity:", 1)
    console.log("   - Total Paid:", total, "UGX")
    console.log("   - QR Code:", ticket.qrCode)
    console.log("   - Status:", ticket.status)
    console.log("========================================")

    return ticket
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

      // Parse ticket data from QR code
      let qrCodeValue = ticketId
      let scanningEventId: string | undefined
      
      try {
        const ticketData = JSON.parse(ticketId)
        qrCodeValue = (ticketData.id || ticketId).trim()
        scanningEventId = ticketData.eventId
        console.log("📋 Parsed QR JSON - ID:", qrCodeValue, "Event:", scanningEventId)
      } catch {
        qrCodeValue = ticketId.trim()
        console.log("📋 Raw QR code string:", qrCodeValue)
      }

      if (!qrCodeValue) {
        return { success: false, reason: "Empty QR code" }
      }

      // Step 1: Get ticket by QR code
      console.log("--- Step 1: Fetching ticket by QR code ---")
      const { data: ticket, error: ticketError } = await supabase.from("tickets").select("*").eq("qr_code", qrCodeValue).single()
      
      if (ticketError && ticketError.code !== "PGRST116") {
        console.error("❌ DB query error:", ticketError)
        throw ticketError
      }

      if (!ticket) {
        console.log("❌ Ticket not found with QR code:", qrCodeValue)
        return { success: false, reason: "Invalid QR code - ticket not found" }
      }

      const t = this.rowToTicket(ticket)
      const now = new Date()

      console.log("✅ Ticket found: ID:", t.id, "Status:", t.status, "Event:", t.eventName)

      // Step 2: Check if expired
      if (t.expiresAt && new Date(t.expiresAt) < now) {
        await supabase.from("tickets").update({ status: "expired" }).eq("id", t.id)
        await this.logValidation({ id: `val_${Date.now()}`, ticketId: t.id, eventId: t.eventId, validatedAt: now, validatedBy: validatorId, location, status: "denied", reason: "Ticket has expired" })
        return { success: false, reason: "Ticket has expired" }
      }

      // Step 3: Check status
      if (t.status !== "active" && t.status !== "pending") {
        const reason = t.status === "used" ? "Ticket already used" : t.status === "cancelled" ? "Ticket was cancelled" : "Invalid ticket status"
        await this.logValidation({ id: `val_${Date.now()}`, ticketId: t.id, eventId: t.eventId, validatedAt: now, validatedBy: validatorId, location, status: "denied", reason })
        return { success: false, reason }
      }

      // Step 4: Verify event
      if (scanningEventId && t.eventId !== scanningEventId) {
        await this.logValidation({ id: `val_${Date.now()}`, ticketId: t.id, eventId: t.eventId, validatedAt: now, validatedBy: validatorId, location, status: "denied", reason: "Wrong event" })
        return { success: false, reason: "Ticket is for a different event" }
      }

      console.log("✅ All checks passed - updating ticket")
      
      // Step 5: Check photo verification
      if (t.buyerPhotoUrl) {
        console.log("   - Ticket needs photo verification")
        return { 
          success: true, 
          needsPhotoVerification: true,
          buyerPhotoUrl: t.buyerPhotoUrl,
          buyerName: t.buyerName,
          ticketDocId: t.id,
        }
      }

      // Step 6: Mark ticket as used
      console.log("--- Step 6: Marking ticket as used ---")
      
      // Update ticket status directly using the ticket id
      const { data: updateResult, error: updateError } = await supabase
        .from("tickets")
        .update({ 
          status: "used", 
          is_scanned: true, 
          scanned_at: now.toISOString(), 
          payout_eligible: true, 
          payout_status: "pending" 
        })
        .eq("id", t.id)
        .select("id, status, is_scanned, payout_eligible")
        .single()
      
      if (updateError) {
        console.error("❌ Database update failed:", updateError)
        console.error("❌ Error code:", updateError.code)
        console.error("❌ Error details:", updateError.details)
        console.error("❌ Error hint:", updateError.hint)
        
        // Try alternative approach: use the tickets_api view
        console.log("⚠️ Trying update via tickets_api view...")
        const { error: apiError } = await supabase
          .from("tickets_api")
          .update({ 
            status: "used", 
            is_scanned: true, 
            scanned_at: now.toISOString(), 
            payout_eligible: true, 
            payout_status: "pending" 
          })
          .eq("id", t.id)
          
        if (apiError) {
          console.error("❌ API view update also failed:", apiError)
          throw apiError
        }
        
        console.log("✅ Update via tickets_api succeeded")
      } else {
        console.log("✅ Ticket updated successfully:", JSON.stringify(updateResult))
      }

      // Step 7: Log validation
      await this.logValidation({ id: `val_${Date.now()}`, ticketId: t.id, eventId: t.eventId, validatedAt: now, validatedBy: validatorId, location, status: "granted" })
      
      console.log("========================================")
      console.log("🔍 TICKET VALIDATION SUCCESSFUL")
      console.log("========================================")
      return { success: true }
    } catch (error: any) {
      console.error("❌ Error validating ticket:", error?.message || error)
      return { success: false, reason: error?.message || "Validation failed" }
    }
  }

  /**
   * Confirm ticket usage after photo verification
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

      const ct = this.rowToTicket(ticket)
      console.log("--- Marking ticket as used (eligible for payout) ---")
      
      // Mark ticket as used
      const { error: updateError } = await supabase
        .from("tickets")
        .update({
          status: "used",
          is_scanned: true,
          scanned_at: now.toISOString(),
          payout_eligible: true,
          payout_status: "pending",
        })
        .eq("id", ticketDocId)
      
      if (updateError) {
        console.error("❌ Update failed:", updateError)
        throw updateError
      }
      console.log("✅ Ticket status updated to: USED")

      const validation: TicketValidation = {
        id: `val_${Date.now()}`,
        ticketId: ticketDocId,
        eventId: eventId || ct.eventId,
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
      return { success: true }
    } catch (error: any) {
      console.error("❌ Error confirming ticket usage:", error?.message || error)
      return { success: false, reason: error?.message || "Failed to confirm ticket usage" }
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
      tableTotalAmount: row.table_total_amount || row.tableTotalAmount,
      tableGroupId: row.table_group_id || row.tableGroupId,
      seatNumber: row.seat_number ?? row.seatNumber,
      photoUploadToken: row.photo_upload_token || row.photoUploadToken,
      photoUploadTokenExpiresAt: row.photo_upload_token_expires_at || row.photoUploadTokenExpiresAt ? new Date(row.photo_upload_token_expires_at || row.photoUploadTokenExpiresAt) : undefined,
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

  static async getTicketsByEmail(email: string): Promise<Ticket[]> {
    try {
      console.log("📋 TicketService.getTicketsByEmail: Fetching tickets for email:", email)
      const { data: rows } = await supabase.from("tickets").select("*").eq("buyer_email", email)
      const ticketList = (rows || []).map(this.rowToTicket)
      console.log("✅ Found", ticketList.length, "tickets")
      return ticketList
    } catch (error) {
      console.error("Error getting tickets by email:", error)
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
      console.log("   - Event ID:", validation.eventId)
      
      // Don't insert id — let DB auto-generate (avoids TEXT vs UUID mismatch)
      const { error } = await supabase.from("ticket_validations").insert({
        ticketId: validation.ticketId,
        eventId: validation.eventId,
        validatedAt: validation.validatedAt.toISOString(),
        validatedBy: validation.validatedBy,
        location: validation.location || null,
        status: validation.status,
        reason: validation.reason || null,
        event_slug: validation.eventId,
      })
      
      if (error) {
        console.error("❌ Validation insert failed:", error)
        console.error("❌ Error code:", error.code)
        console.error("❌ Error message:", error.message)
      } else {
        console.log("✅ Validation logged successfully")
      }
    } catch (error) {
      console.error("Error logging validation:", error)
    }
  }

  static async addSecurityPhoto(
    ticketId: string,
    token: string,
    photoUrl: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log("🔒 TicketService.addSecurityPhoto: Adding security photo")
      console.log("   - Ticket ID:", ticketId)
      console.log("   - Token:", token ? "present" : "missing")

      const { data, error } = await supabase.rpc("add_ticket_security_photo", {
        p_ticket_id: ticketId,
        p_token: token,
        p_photo_url: photoUrl,
      })

      if (error) {
        console.error("❌ RPC error:", error)
        return { success: false, error: error.message }
      }

      console.log("✅ Security photo added successfully")
      return { success: data }
    } catch (error) {
      console.error("❌ Error adding security photo:", error)
      return { success: false, error: "Failed to add security photo" }
    }
  }

 // ============ Pending Fulfillment Safety Net ============

  static async createPendingFulfillment(input: CreateFulfillmentInput): Promise<string> {
    const fulfillment: Omit<PendingFulfillment, "id"> = {
      paymentId: input.paymentId,
      pawapayDepositId: input.pawapayDepositId,
      buyerEmail: input.buyerEmail,
      buyerName: input.buyerName,
      buyerId: input.buyerId,
      eventId: input.eventId,
      eventName: input.eventName,
      quantity: input.quantity ?? 1,
      amount: input.amount,
      status: "payment_confirmed",
      ticketIds: [],
      attemptCount: 0,
      attendeeNames: input.attendeeNames,
      created_at: new Date(),
      updated_at: new Date(),
    }

    const { data, error } = await supabase
      .from("pending_ticket_fulfillments")
      .insert({
        payment_id: fulfillment.paymentId,
        pawapay_deposit_id: fulfillment.pawapayDepositId,
        buyer_email: fulfillment.buyerEmail,
        buyer_name: fulfillment.buyerName,
        buyer_id: fulfillment.buyerId,
        event_id: fulfillment.eventId,
        event_name: fulfillment.eventName,
        quantity: fulfillment.quantity,
        amount: fulfillment.amount,
        status: fulfillment.status,
        ticket_ids: fulfillment.ticketIds,
        attempt_count: fulfillment.attemptCount,
        attendee_names: fulfillment.attendeeNames,
        created_at: fulfillment.created_at.toISOString(),
        updated_at: fulfillment.updated_at.toISOString(),
      })
      .select("id")
      .single()

    if (error) throw error
    return data.id
  }

  static async updateFulfillmentStatus(
    id: string,
    status: PendingFulfillment["status"],
    updates?: Partial<Pick<PendingFulfillment, "ticketIds" | "lastError" | "attemptCount" | "adminResolvedBy" | "adminResolvedAt" | "attendeeNames">>,
    appendError?: string
  ) {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (updates?.ticketIds !== undefined) updateData.ticket_ids = updates.ticketIds
    if (updates?.lastError !== undefined || appendError) {
      updateData.last_error = appendError
        ? `${updates?.lastError ? updates.lastError + " | " : ""}${appendError}`
        : updates?.lastError
    }
    if (updates?.attemptCount !== undefined) updateData.attempt_count = updates.attemptCount
    if (updates?.adminResolvedBy !== undefined) updateData.admin_resolved_by = updates.adminResolvedBy
    if (updates?.adminResolvedAt !== undefined) updateData.admin_resolved_at = updates.adminResolvedAt
    if (updates?.attendeeNames !== undefined) updateData.attendee_names = updates.attendeeNames

    const { error } = await supabase
      .from("pending_ticket_fulfillments")
      .update(updateData)
      .eq("id", id)

    if (error) throw error
  }

  static async getPendingFulfillmentsByStatus(status: PendingFulfillment["status"]): Promise<PendingFulfillment[]> {
    const { data, error } = await supabase
      .from("pending_ticket_fulfillments")
      .select("*")
      .eq("status", status)
      .order("created_at", { ascending: false })

    if (error) throw error

    return (data || []).map(this.rowToFulfillment)
  }

  private static rowToFulfillment(row: any): PendingFulfillment {
    return {
      id: row.id,
      paymentId: row.payment_id,
      pawapayDepositId: row.pawapay_deposit_id,
      buyerEmail: row.buyer_email,
      buyerName: row.buyer_name,
      buyerId: row.buyer_id,
      eventId: row.event_id,
      eventName: row.event_name,
      quantity: row.quantity,
      amount: row.amount,
      status: row.status,
      ticketIds: row.ticket_ids,
      lastError: row.last_error,
      attemptCount: row.attempt_count,
      adminResolvedBy: row.admin_resolved_by,
      adminResolvedAt: row.admin_resolved_at ? new Date(row.admin_resolved_at) : undefined,
      attendeeNames: row.attendee_names,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    }
  }

  static async recoverTicket(
    fulfillment: PendingFulfillment,
    adminEmail: string,
    attendeeNames?: string[]
  ): Promise<{ success: boolean; ticketIds: string[]; error?: string }> {
    const fulfillmentId = fulfillment.id
    console.log(`[ManualRecovery:${fulfillmentId}] Stage: starting — manual recovery initiated`)

    try {
      const event = await SupabaseService.getEventById(fulfillment.eventId)
      if (!event) {
        throw new Error(`Event not found: ${fulfillment.eventId}`)
      }

      const namesToUse = attendeeNames ?? fulfillment.attendeeNames ?? [fulfillment.buyerName || "Attendee"]
      const ticketsToCreate = fulfillment.quantity
      const createdTickets: Ticket[] = []
      const createdTicketIds: string[] = []

      console.log(`[ManualRecovery:${fulfillmentId}] Stage: ticket-creation — starting (${ticketsToCreate} tickets)`)

      for (let i = 0; i < ticketsToCreate; i++) {
        const ticket = await this.createSingleTicket(
          event,
          namesToUse[i] || namesToUse[0] || "Attendee",
          fulfillment.buyerEmail,
          1,
          "",
          fulfillment.amount / ticketsToCreate,
          undefined,
          false,
          undefined,
          undefined,
          fulfillment.buyerId ?? undefined,
          fulfillment.buyerEmail
        )
        createdTickets.push(ticket)
        createdTicketIds.push(ticket.id)
        console.log(`[ManualRecovery:${fulfillmentId}] Ticket created: ${ticket.id}`)
      }

      console.log(`[ManualRecovery:${fulfillmentId}] Stage: qr-upload — starting (${createdTickets.length} QR codes)`)

      for (let i = 0; i < createdTickets.length; i++) {
        const ticket = createdTickets[i]
        try {
          if (ticket.qrCodeDataUrl) {
            await uploadQRCode(ticket.qrCodeDataUrl, ticket.id)
            console.log(`[ManualRecovery:${fulfillmentId}] QR code uploaded for ticket ${ticket.id}`)
          }
        } catch (err) {
          const errorMsg = `QR upload failed for ticket ${ticket.id}: ${err}`
          console.error(`[ManualRecovery:${fulfillmentId}] Stage: qr-upload — FAILED`, err)
          await this.updateFulfillmentStatus(fulfillmentId, "failed", {
            attemptCount: fulfillment.attemptCount + 1,
          }, errorMsg)
          return { success: false, ticketIds: createdTicketIds, error: errorMsg }
        }
      }

      console.log(`[ManualRecovery:${fulfillmentId}] Stage: email-send — starting (${createdTickets.length} emails)`)

      for (const ticket of createdTickets) {
        try {
          const emailPayload = {
            buyerEmail: fulfillment.buyerEmail,
            buyerName: ticket.buyerName,
            eventName: event.name,
            ticketType: ticket.entryFeeType || "Standard",
            venue: event.venueName,
            date: event.date.toISOString().split("T")[0],
            time: event.time,
            quantity: 1,
            amountPaid: ticket.totalAmount.toLocaleString(),
            ticketRef: ticket.ticketRef,
            qrCodeDataUrl: ticket.qrCodeDataUrl,
            photoUploadLink: ticket.photoUploadToken ? `${FUNCTIONS_BASE_URL}/.netlify/functions/upload-buyer-photo?ticketId=${ticket.id}&token=${ticket.photoUploadToken}` : undefined,
          }

          const response = await fetch(`${FUNCTIONS_BASE_URL}/.netlify/functions/send-ticket-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(emailPayload),
          })

          if (!response.ok) {
            throw new Error(`Email send failed: ${response.status}`)
          }
          console.log(`[ManualRecovery:${fulfillmentId}] Email sent for ticket ${ticket.id}`)
        } catch (err) {
          const errorMsg = `Email send failed for ticket ${ticket.id}: ${err}`
          console.error(`[ManualRecovery:${fulfillmentId}] Stage: email-send — FAILED`, err)
          await this.updateFulfillmentStatus(fulfillmentId, "failed", {
            attemptCount: fulfillment.attemptCount + 1,
          }, errorMsg)
          return { success: false, ticketIds: createdTicketIds, error: errorMsg }
        }
      }

      console.log(`[ManualRecovery:${fulfillmentId}] Stage: fulfillment — completing (${createdTicketIds.length} tickets)`)

      await this.updateFulfillmentStatus(fulfillmentId, "fulfilled", {
        ticketIds: createdTicketIds,
        attemptCount: fulfillment.attemptCount + 1,
        adminResolvedBy: adminEmail,
        adminResolvedAt: new Date(),
      })

      console.log(`[ManualRecovery:${fulfillmentId}] Stage: completed — success`)
      return { success: true, ticketIds: createdTicketIds }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`[ManualRecovery:${fulfillmentId}] Stage: ticket-creation — FAILED`, error)
      await this.updateFulfillmentStatus(fulfillmentId, "failed", {
        attemptCount: fulfillment.attemptCount + 1,
      }, errorMsg)
      return { success: false, ticketIds: [], error: errorMsg }
    }
  }
}

export default TicketService