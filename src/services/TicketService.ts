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
      pesapalConfirmationCode?: string
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
      pesapalConfirmationCode?: string
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
      pesapalConfirmationCode?: string
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
      pesapalConfirmationCode?: string
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
      const lateFeePct = (event as any).lateFeePercent ?? 0
      const sevenAm = new Date(eventStartTime)
      sevenAm.setHours(7, 0, 0, 0)
      const isLatePurchase = new Date() >= sevenAm
      const lateFee = isLatePurchase ? Math.round(perTicketBasePrice * lateFeePct / 100) : 0
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
      venueName: event.venueName,
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
      pesapalConfirmationCode: paymentDetails?.pesapalConfirmationCode,
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
    isReentry?: boolean;
    reentryGrantedByName?: string;
    reentryGrantedAt?: string;
    ticketRef?: string;
    entryFeeType?: string;
    seatNumber?: number;
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
        return { success: false, reason: "Ticket has expired", ticketRef: t.ticketRef, entryFeeType: t.entryFeeType, seatNumber: t.seatNumber, buyerName: t.buyerName }
      }

      // Step 3: Check status
      if (t.status !== "active" && t.status !== "pending") {
        // Check for active re-entry pass before denying
        if (t.status === "used" && t.reentryPass && !t.reentryPass.used) {
          // Mark the pass as consumed
          await supabase
            .from("tickets")
            .update({ reentry_pass: { ...t.reentryPass, used: true } })
            .eq("id", t.id)
          await this.logValidation({
            id: `val_${Date.now()}`,
            ticketId: t.id,
            eventId: t.eventId,
            validatedAt: now,
            validatedBy: validatorId,
            location,
            status: "granted",
            reason: `Re-entry authorised by ${t.reentryPass.grantedByName}`,
          })
          return {
            success: true,
            isReentry: true,
            buyerName: t.buyerName,
            reentryGrantedByName: t.reentryPass.grantedByName,
            reentryGrantedAt: t.reentryPass.grantedAt,
            ticketRef: t.ticketRef,
            entryFeeType: t.entryFeeType,
            seatNumber: t.seatNumber,
          }
        }
        const reason = t.status === "used" ? "Ticket already used" : t.status === "cancelled" ? "Ticket was cancelled" : "Invalid ticket status"
        await this.logValidation({ id: `val_${Date.now()}`, ticketId: t.id, eventId: t.eventId, validatedAt: now, validatedBy: validatorId, location, status: "denied", reason })
        return { success: false, reason, ticketRef: t.ticketRef, entryFeeType: t.entryFeeType, seatNumber: t.seatNumber, buyerName: t.buyerName }
      }

      // Step 4: Verify event
      if (scanningEventId && t.eventId !== scanningEventId) {
        await this.logValidation({ id: `val_${Date.now()}`, ticketId: t.id, eventId: t.eventId, validatedAt: now, validatedBy: validatorId, location, status: "denied", reason: "Wrong event" })
        return { success: false, reason: "Ticket is for a different event", ticketRef: t.ticketRef, entryFeeType: t.entryFeeType, seatNumber: t.seatNumber, buyerName: t.buyerName }
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
          ticketRef: t.ticketRef,
          entryFeeType: t.entryFeeType,
          seatNumber: t.seatNumber,
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
            isScanned: true, 
            scannedAt: now.toISOString(), 
            payoutEligible: true, 
            payoutStatus: "pending" 
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
      return { success: true, ticketRef: t.ticketRef, entryFeeType: t.entryFeeType, seatNumber: t.seatNumber, buyerName: t.buyerName }
    } catch (error: any) {
      console.error("❌ Error validating ticket:", error?.message || error)
      return { success: false, reason: error?.message || "Validation failed" }
    }
  }

  static async grantReentryPass(
    ticketId: string,
    grantedById: string,
    grantedByName: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: ticket, error: fetchErr } = await supabase
        .from("tickets")
        .select("id, status, buyer_name")
        .eq("id", ticketId)
        .single()
      if (fetchErr || !ticket) return { success: false, error: "Ticket not found" }
      if (ticket.status !== "used") return { success: false, error: "Ticket has not been scanned yet" }
      const { error } = await supabase
        .from("tickets")
        .update({
          reentry_pass: {
            grantedAt: new Date().toISOString(),
            grantedBy: grantedById,
            grantedByName,
            used: false,
          },
        })
        .eq("id", ticketId)
      if (error) throw error
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message || "Failed to grant re-entry" }
    }
  }

  static async findTicketByRef(
    eventSlug: string,
    query: string,
  ): Promise<{ id: string; buyerName: string; entryFeeType: string; status: string; reentryPass: any } | null> {
    const q = query.trim().toLowerCase()
    const { data, error } = await supabase
      .from("tickets")
      .select("id, buyer_name, entry_fee_type, status, reentry_pass, ticket_ref")
      .eq("event_slug", eventSlug)
      .or(`ticket_ref.ilike.%${q}%,buyer_name.ilike.%${q}%`)
      .limit(1)
      .single()
    if (error || !data) return null
    return {
      id: data.id,
      buyerName: data.buyer_name,
      entryFeeType: data.entry_fee_type,
      status: data.status,
      reentryPass: data.reentry_pass ?? null,
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
        // Skip fetching — use the provided ticket data or skip
      }
      
      if (ticketIds.length > 0) {
        const { data: tickets } = await supabase.from("tickets").select("*").in("id", ticketIds)
        for (const ticket of tickets || []) {
          if (ticket.payout_eligible && ticket.payout_status === "pending") {
            eligibleTickets.push(ticket as any)
            console.log("   ✅ Ticket", ticket.id, "eligible for payout")
          } else {
            console.log("   ❌ Ticket", ticket.id, "not eligible")
          }
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
        await Promise.all(eligibleTickets.map(ticket =>
          supabase.from("tickets").update({ payout_status: "failed" }).eq("id", ticket.id)
        ))
        
        return { success: false, error: payoutResult.error }
      }

      console.log("✅ Payout processed successfully!")
      console.log("   - Payout ID:", payoutResult.payoutId)
      console.log("   - Transaction Ref:", payoutResult.transactionReference)

      // Step 3: Update ticket statuses
      console.log("--- Step 3: Updating ticket payout statuses ---")
      await Promise.all(eligibleTickets.map(ticket =>
        supabase.from("tickets").update({ payout_status: "processing" }).eq("id", ticket.id).then(() => {
          console.log("   ✅ Ticket", ticket.id, "marked as processing")
        })
      ))

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
      venueName: row.venue_name || row.venueName,
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
      ticketRef: row.ticket_ref || row.ticketRef,
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
      gatewayFee: row.gateway_fee ?? row.gatewayFee ?? 0,
      installmentPlanId: row.installment_plan_id || row.installmentPlanId,
      refundedAmount: row.refunded_amount ?? row.refundedAmount ?? 0,
      refundStatus: row.refund_status || row.refundStatus || "none",
      tableTotalAmount: row.table_total_amount || row.tableTotalAmount,
      tableGroupId: row.table_group_id || row.tableGroupId,
      seatNumber: row.seat_number ?? row.seatNumber,
      reentryPass: row.reentry_pass ?? row.reentryPass ?? undefined,
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
      ticketType: input.ticketType,
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
        ticket_type: fulfillment.ticketType,
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
      ticketType: row.ticket_type,
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

  // ============ Automatic Retry Mechanism ============

  /**
   * Retry a single fulfillment with exponential backoff
   * Returns true if successfully retried, false if should be marked as failed
   */
  static async retryFulfillment(
    fulfillment: PendingFulfillment,
    maxRetries: number = 3
  ): Promise<{ success: boolean; error?: string; ticketsCreated?: string[] }> {
    const { id: fulfillmentId, attemptCount, lastError } = fulfillment
    
    if (attemptCount >= maxRetries) {
      return { 
        success: false, 
        error: `Max retries (${maxRetries}) exceeded. Previous error: ${lastError || "Unknown"}` 
      }
    }

    try {
      const event = await SupabaseService.getEventById(fulfillment.eventId)
      if (!event) {
        return { success: false, error: `Event not found: ${fulfillment.eventId}` }
      }

      const namesToUse = fulfillment.attendeeNames ?? [fulfillment.buyerName || "Attendee"]
      const ticketsToCreate = fulfillment.quantity
      const createdTicketIds: string[] = []

      for (let i = 0; i < ticketsToCreate; i++) {
        const ticket = await this.createSingleTicket(
          event,
          namesToUse[i] || namesToUse[0] || "Attendee",
          fulfillment.buyerEmail,
          1,
          "",
          fulfillment.amount / ticketsToCreate,
           { method: "credit_card", ticketType: fulfillment.ticketType },
          false,
          undefined,
          undefined,
          fulfillment.buyerId ?? undefined,
          fulfillment.buyerEmail
        )
        createdTicketIds.push(ticket.id)
      }

      const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://yovibe.net"
      // Get ticket design from first entry fee as fallback for bulk fulfillment
      const bulkTicketDesign = event.entryFees?.[0]?.ticketDesign
      await Promise.allSettled(createdTicketIds.map(ticketId =>
        fetch(`${baseUrl}/.netlify/functions/send-ticket-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buyerEmail: fulfillment.buyerEmail,
            buyerName: namesToUse[0] || "Attendee",
            eventName: event.name,
            ticketType: fulfillment.ticketType || "Standard",
            venue: event.venueName,
            date: event.date.toISOString().split("T")[0],
            time: event.time,
            quantity: 1,
            amountPaid: (fulfillment.amount / ticketsToCreate).toLocaleString(),
            ticketRef: ticketId,
            qrCodeDataUrl: "",
            ticketDesign: bulkTicketDesign,
            posterUrl: event.posterImageUrl,
          }),
        })
      ))

      await this.updateFulfillmentStatus(fulfillmentId, "fulfilled", {
        ticketIds: createdTicketIds,
        attemptCount: attemptCount + 1,
      })

      return { success: true, ticketsCreated: createdTicketIds }
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      await this.updateFulfillmentStatus(fulfillmentId, "failed", {
        attemptCount: attemptCount + 1,
      }, errorMsg)
      return { success: false, error: errorMsg }
    }
  }

  /**
   * Get all fulfillments that need retry (older than 5 minutes, not yet failed)
   */
  static async getStuckFulfillments(
    maxAgeMinutes: number = 5,
    excludeFailed: boolean = true
  ): Promise<PendingFulfillment[]> {
    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000)
    
    const { data, error } = await supabase
      .from("pending_ticket_fulfillments")
      .select("*")
      .gt("created_at", cutoffTime.toISOString())
      .neq("status", "fulfilled")
      .order("created_at", { ascending: true })

    if (error) throw error
    
    let fulfillments = (data || []).map(this.rowToFulfillment)
    
    if (excludeFailed) {
      fulfillments = fulfillments.filter(f => f.status !== "failed")
    }
    
    return fulfillments
  }

  /**
   * Process stuck fulfillments automatically
   * Call this from a cron job or background task
   */
  static async processStuckFulfillments(
    batchSize: number = 10,
    maxRetries: number = 3
  ): Promise<{ processed: number; succeeded: number; failed: number }> {
    const fulfillments = await this.getStuckFulfillments(5)
    
    const batch = fulfillments.slice(0, batchSize)
    let succeeded = 0
    let failed = 0

    for (const fulfillment of batch) {
      const result = await this.retryFulfillment(fulfillment, maxRetries)
      if (result.success) {
        succeeded++
      } else {
        failed++
      }
    }

    return { processed: batch.length, succeeded, failed }
  }

  // ============ Manual Recovery ============

  static async recoverTicket(
    fulfillment: PendingFulfillment,
    adminEmail: string,
    attendeeNames?: string[]
  ): Promise<{ success: boolean; ticketIds: string[]; error?: string }> {
    const fulfillmentId = fulfillment.id
    const existingTicketIds = fulfillment.ticketIds || []

    console.log(`[ManualRecovery:${fulfillmentId}] Stage: starting — manual recovery initiated${existingTicketIds.length > 0 ? ` (resuming from previous attempt, ${existingTicketIds.length} tickets exist)` : ''}`)

    try {
      const event = await SupabaseService.getEventById(fulfillment.eventId)
      if (!event) {
        throw new Error(`Event not found: ${fulfillment.eventId}`)
      }

      const namesToUse = attendeeNames ?? fulfillment.attendeeNames ?? [fulfillment.buyerName || "Attendee"]
      const ticketsToCreate = fulfillment.quantity

      let createdTickets: Ticket[] = []
      let createdTicketIds: string[] = []
      let needsTicketCreation = true

      // Phase 1: Try to find existing tickets from:
      //   a) ticketIds stored in the fulfillment record, OR
      //   b) fallback lookup by buyerEmail + eventId (for stranded records where ticketIds weren't saved)
      if (existingTicketIds.length > 0) {
        // Case a: Resume from stored ticket IDs
        console.log(`[ManualRecovery:${fulfillmentId}] Stage: resume — ${existingTicketIds.length} tickets already exist, fetching from DB`)
        await this.updateFulfillmentStatus(fulfillmentId, "fulfilling", {
          attemptCount: fulfillment.attemptCount,
        }, `Resuming recovery — ${existingTicketIds.length} tickets already created...`)

        for (const ticketId of existingTicketIds) {
          const { data, error } = await supabase
            .from("tickets")
            .select("*")
            .eq("id", ticketId)
            .single()

          if (error || !data) {
            console.warn(`[ManualRecovery:${fulfillmentId}] Could not fetch existing ticket ${ticketId}: ${error?.message || 'not found'}`)
            continue
          }
          createdTickets.push(this.rowToTicket(data))
        }
        createdTicketIds = existingTicketIds.slice()

        if (createdTickets.length === 0) {
          console.log(`[ManualRecovery:${fulfillmentId}] Stage: resume — no valid existing tickets found, will try fallback lookup`)
        } else {
          needsTicketCreation = false
          console.log(`[ManualRecovery:${fulfillmentId}] Stage: resume — loaded ${createdTickets.length} existing tickets from DB`)
        }
      }

      // Case b: No stored ticket IDs, attempt fallback lookup by buyer email + event
      // Query tickets_api view because it has camelCase columns that match the Ticket model
      if (needsTicketCreation && fulfillment.buyerEmail && fulfillment.eventId) {
        console.log(`[ManualRecovery:${fulfillmentId}] Stage: lookup — no stored ticket IDs, searching tickets_api by buyer email + event`)
        const { data: foundTickets, error: findError } = await supabase
          .from("tickets_api")
          .select("*")
          .eq("buyerEmail", fulfillment.buyerEmail)
          .eq("eventId", fulfillment.eventId)
          .limit(fulfillment.quantity)

        if (!findError && foundTickets && foundTickets.length > 0) {
          const mapped = foundTickets.map(t => this.rowToTicket(t))
          // Log QR data URL availability for debugging
          for (const t of mapped) {
            console.log(`[ManualRecovery:${fulfillmentId}] Ticket ${t.id}: qrCodeDataUrl=${t.qrCodeDataUrl ? t.qrCodeDataUrl.substring(0, 80) + '...' : 'MISSING'}, ticketRef=${t.ticketRef || 'MISSING'}`)
          }
          createdTickets.push(...mapped)
          createdTicketIds.push(...mapped.map(t => t.id))
          needsTicketCreation = false
          console.log(`[ManualRecovery:${fulfillmentId}] Stage: lookup — found ${mapped.length} existing tickets via tickets_api email+event lookup`)

          // Save these IDs to the fulfillment so next retry uses the stored IDs
          await this.updateFulfillmentStatus(fulfillmentId, "fulfilling", {
            attemptCount: fulfillment.attemptCount,
            ticketIds: createdTicketIds,
          }, `Found ${createdTicketIds.length} existing tickets, proceeding to email send...`)
        } else {
          console.log(`[ManualRecovery:${fulfillmentId}] Stage: lookup — no existing tickets found by email+event, will create new ones`)
        }
      }

      if (needsTicketCreation) {
        console.log(`[ManualRecovery:${fulfillmentId}] Stage: ticket-creation — starting (${ticketsToCreate} tickets)`)
        await this.updateFulfillmentStatus(fulfillmentId, "fulfilling", {
          attemptCount: fulfillment.attemptCount,
        }, "Creating tickets...")

        for (let i = 0; i < ticketsToCreate; i++) {
          const ticket = await this.createSingleTicket(
            event,
            namesToUse[i] || namesToUse[0] || "Attendee",
            fulfillment.buyerEmail,
            1,
            "",
            fulfillment.amount / ticketsToCreate,
            { method: "credit_card", ticketType: fulfillment.ticketType },
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

        // QR code was already uploaded within createSingleTicket (Step 7).
        // The qrCodeDataUrl is now the hosted R2 URL for use in the email, no re-upload needed.
        console.log(`[ManualRecovery:${fulfillmentId}] Stage: email-preparation — QR codes already uploaded during ticket creation`)
        await this.updateFulfillmentStatus(fulfillmentId, "fulfilling", {
          attemptCount: fulfillment.attemptCount + 1,
          ticketIds: createdTicketIds,
        }, `Created ${createdTicketIds.length} tickets, proceeding to email send...`)
      }

      console.log(`[ManualRecovery:${fulfillmentId}] Stage: email-send — starting (${createdTickets.length} emails, sending in parallel with 120s timeout)`)

      // Pre-generate QR codes for any tickets that don't have one
      // (old recovery tickets may have null qrCodeDataUrl in the tickets_api table)
      for (let i = 0; i < createdTickets.length; i++) {
        const ticket = createdTickets[i]
        if (!ticket.qrCodeDataUrl) {
          try {
            const qrResult = await this.generateSecureQRCode(event.id, event.date || new Date())
            ticket.qrCodeDataUrl = qrResult.qrCodeDataUrl
            ticket.qrCode = qrResult.qrCode
            console.log(`[ManualRecovery:${fulfillmentId}] Generated fresh QR for ticket ${ticket.id}: ${qrResult.qrCode}`)
          } catch (err) {
            console.warn(`[ManualRecovery:${fulfillmentId}] Could not generate QR for ticket ${ticket.id}:`, err)
          }
        }
      }

      const emailResults = await Promise.allSettled(
        createdTickets.map(async (ticket) => {
          // Format date safely — event.date may be a Date object or ISO string
          const eventDate = event.date instanceof Date ? event.date : new Date(event.date || Date.now())
          const formattedDate = !isNaN(eventDate.getTime()) ? eventDate.toISOString().split("T")[0] : "TBD"
          const formattedTime = event.time || "TBD"

          // Fallback for ticketRef — old tickets may not have it stored in the tickets table
          const ticketRef = ticket.ticketRef || ticket.id

          // Must have a qrCodeDataUrl — generate one now if still missing
          const qrCodeDataUrl = ticket.qrCodeDataUrl || ""

          const emailPayload = {
            buyerEmail: fulfillment.buyerEmail,
            buyerName: ticket.buyerName || "Attendee",
            eventName: event.name || "Event",
            ticketType: ticket.entryFeeType || "Standard",
            venue: event.venueName || "",
            date: formattedDate,
            time: formattedTime,
            quantity: 1,
            amountPaid: (ticket.totalAmount || 0).toLocaleString(),
            ticketRef,
            qrCodeDataUrl,
            photoUploadLink: ticket.photoUploadToken ? `${FUNCTIONS_BASE_URL}/.netlify/functions/upload-buyer-photo?ticketId=${ticket.id}&token=${ticket.photoUploadToken}` : undefined,
            // Include ticket design from entry fee
            ticketDesign: event.entryFees?.find((f: any) => f.name === ticket.entryFeeType)?.ticketDesign,
            posterUrl: event.posterImageUrl,
          }

          // Use AbortController with 120s timeout (accounts for Netlify cold starts + PDF generation + Resend)
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 120000)

          const functionUrl = FUNCTIONS_BASE_URL
            ? `${FUNCTIONS_BASE_URL}/.netlify/functions/send-ticket-email`
            : `/.netlify/functions/send-ticket-email`

          try {
            const response = await fetch(functionUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(emailPayload),
              signal: controller.signal,
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
              // Read the 400 response body to see which fields are missing
              let bodyText = ""
              try { bodyText = await response.text() } catch {}
              throw new Error(`${response.status} ${bodyText || response.statusText}`)
            }
            return { ticketId: ticket.id, success: true }
          } catch (err) {
            clearTimeout(timeoutId)
            throw err
          }
        })
      )

      const emailErrors: string[] = []
      for (const result of emailResults) {
        if (result.status === "fulfilled") {
          console.log(`[ManualRecovery:${fulfillmentId}] Email sent for ticket ${result.value.ticketId}`)
        } else {
          const msg = result.reason instanceof Error ? result.reason.message : String(result.reason)
          emailErrors.push(msg)
          console.error(`[ManualRecovery:${fulfillmentId}] Email send failed:`, msg)
        }
      }

      if (emailErrors.length > 0) {
        const errorMsg = `Email send failed for ${emailErrors.length}/${createdTickets.length} tickets: ${emailErrors.join("; ")}`
        console.error(`[ManualRecovery:${fulfillmentId}] Stage: email-send — FAILED`, errorMsg)
        await this.updateFulfillmentStatus(fulfillmentId, "failed", {
          attemptCount: fulfillment.attemptCount + 1,
        }, errorMsg)
        return { success: false, ticketIds: createdTicketIds, error: errorMsg }
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

  // ============ Cleanup Old Records ============

  /**
   * Clean up old fulfilled/cancelled pending fulfillments
   * Call this from a cron job or nightly cleanup task
   */
  static async cleanupOldFulfillments(
    olderThanDays: number = 30,
    statusesToClean: ("fulfilled" | "failed" | "cancelled")[] = ["fulfilled", "failed"]
  ): Promise<{ deleted: number; error?: string }> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    try {
      let totalDeleted = 0

      for (const status of statusesToClean) {
        const { data: beforeDelete, error: countError } = await supabase
          .from("pending_ticket_fulfillments")
          .select("*", { count: "exact", head: true })
          .eq("status", status)
          .lt("updated_at", cutoffDate.toISOString())

        if (countError) {
          console.error(`[Cleanup] Error counting ${status} records:`, countError)
          continue
        }

        const count = beforeDelete?.length || 0

        const { error: deleteError } = await supabase
          .from("pending_ticket_fulfillments")
          .delete()
          .eq("status", status)
          .lt("updated_at", cutoffDate.toISOString())

        if (deleteError) {
          console.error(`[Cleanup] Error deleting ${status} records:`, deleteError)
          continue
        }

        totalDeleted += count
      }

      console.log(`[Cleanup] Deleted ${totalDeleted} old fulfillment records`)
      return { deleted: totalDeleted }
    } catch (error: any) {
      console.error("[Cleanup] Error cleaning up fulfillments:", error)
      return { deleted: 0, error: error.message || "Unknown error" }
    }
  }

  /**
   * Get summary of pending fulfillments by status
   */
  static async getFulfillmentSummary(): Promise<{
    total: number
    paymentConfirmed: number
    fulfilling: number
    fulfilled: number
    failed: number
    oldestFailed: Date | null
  }> {
    const statuses = ["payment_confirmed", "fulfilling", "fulfilled", "failed"] as const
    const counts: Record<string, number> = {}
    let total = 0

    for (const status of statuses) {
      const { data, error } = await supabase
        .from("pending_ticket_fulfillments")
        .select("*", { count: "exact", head: true })
        .eq("status", status)

      if (!error && data) {
        const count = data.length
        counts[status] = count
        total += count
      } else {
        counts[status] = 0
      }
    }

    const { data: failedData } = await supabase
      .from("pending_ticket_fulfillments")
      .select("created_at")
      .eq("status", "failed")
      .order("created_at", { ascending: true })
      .limit(1)

    const oldestFailed = failedData?.[0]?.created_at ? new Date(failedData[0].created_at) : null

    return {
      total,
      paymentConfirmed: counts["payment_confirmed"] || 0,
      fulfilling: counts["fulfilling"] || 0,
      fulfilled: counts["fulfilled"] || 0,
      failed: counts["failed"] || 0,
      oldestFailed,
    }
  }
}

export default TicketService
