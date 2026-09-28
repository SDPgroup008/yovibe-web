import supabase from "../config/supabase"
import type { PendingFulfillment } from "../models/PendingFulfillment"

const FUNCTIONS_BASE_URL =
  process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL ||
  process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL ||
  process.env.EXPO_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  ""

/**
 * Ticket operations deliberately terminate at a Netlify function. Ticket
 * creation, scanning, recovery, delivery, refunds and private-photo access
 * must never be performed from the browser against Supabase tables or views.
 */
function resolveFunctionUrl(functionName: string): string {
  const base = FUNCTIONS_BASE_URL.replace(/\/$/, "")
  return base ? `${base}/.netlify/functions/${functionName}` : `/.netlify/functions/${functionName}`
}

async function scanTicketSecure(body: Record<string, unknown>): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`

  const response = await fetch(resolveFunctionUrl("scan-ticket"), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({ success: false, reason: "Invalid scanner response" }))
  if (!response.ok && !payload.reason) payload.reason = "Ticket validation failed"
  return payload
}

export class TicketService {
  /**
   * The sole client entry point for a completed payment. The function verifies
   * the gateway result and invokes server-only ticket creation.
   */
  static async fulfillPurchase(input: {
    fulfillmentId: string
    eventId: string
    ticketType?: string
    quantity: number
    totalAmount: number
    isTableEntry: boolean
    tableSize: number
    buyerNames: string[]
    buyerEmails: string[]
    deliveryEmails: string[]
    payerEmail: string
    buyerId?: string | null
    buyerPhone?: string
    buyerPhotoDataUrl?: string
    buyerPhotoUrl?: string
    seatNumbers?: (number | null)[]
    tableNumbers?: (number | null)[]
    inventoryHoldIds?: (string | null)[]
    inventorySessionId?: string
    installmentPlanId?: string
    payment: {
      method: "mobile_money" | "credit_card" | "bank_transfer"
      provider?: string
      number?: string
      name?: string
      cardName?: string
      bankName?: string
      accountNumber?: string
      accountName?: string
    }
    verification: {
      orderId?: string
      trackingId?: string
      depositId?: string
      pollStatus?: string
    }
  }): Promise<{
    success: boolean
    status?: string
    fulfillmentId?: string
    ticketIds?: string[]
    tickets?: Array<{ id: string; ticketRef: string; qrCodeDataUrl: string }>
    error?: string
  }> {
    try {
      const response = await fetch(resolveFunctionUrl("fulfill-purchase"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        return {
          success: false,
          status: data.status,
          error: data.error || `Failed to fulfill purchase (${response.status})`,
        }
      }
      return data
    } catch (error: any) {
      console.error("[TicketService] fulfillPurchase error:", error?.message || error)
      return { success: false, error: error?.message || "Network error during purchase finalization" }
    }
  }

  static async getFulfillmentStatus(fulfillmentId: string): Promise<{
    success: boolean
    status?: string
    fulfillmentId?: string
    ticketIds?: string[]
    tickets?: Array<{ id: string; ticketRef: string; qrCodeDataUrl: string }>
    error?: string
  }> {
    try {
      const response = await fetch(
        `${resolveFunctionUrl("get-fulfillment-status")}?fulfillmentId=${encodeURIComponent(fulfillmentId)}`,
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        return { success: false, status: data.status, error: data.error || "Unable to read fulfillment status" }
      }
      return data
    } catch (error: any) {
      return { success: false, status: "in_progress", error: error?.message || "Network error while checking fulfillment" }
    }
  }

  static async validateTicket(
    qrText: string,
    _validatorId: string,
    location?: string,
    eventId?: string,
    staffToken?: string,
  ): Promise<{
    success: boolean
    reason?: string
    needsPhotoVerification?: boolean
    buyerPhotoUrl?: string
    buyerName?: string
    ticketDocId?: string
    isReentry?: boolean
    reentryGrantedByName?: string
    reentryGrantedAt?: string
    ticketRef?: string
    entryFeeType?: string
    seatNumber?: number
    tableNumber?: number
  }> {
    if (!eventId) {
      return { success: false, reason: "Scanner event context is required. Open a valid staff scan link and try again." }
    }
    return scanTicketSecure({
      action: "validate",
      qrText,
      eventId,
      staffToken: staffToken || undefined,
      location,
    })
  }

  static async confirmTicketUsage(
    ticketId: string,
    _validatorId: string,
    location?: string,
    eventId?: string,
    staffToken?: string,
    qrText?: string,
  ): Promise<{ success: boolean; reason?: string }> {
    if (!eventId || !qrText) {
      return { success: false, reason: "Scanner event context and QR code are required." }
    }
    return scanTicketSecure({
      action: "confirm-photo",
      ticketId,
      qrText,
      eventId,
      staffToken: staffToken || undefined,
      location,
    })
  }

  static async grantReentryPass(
    ticketId: string,
    eventId: string,
    _grantedById: string,
    _grantedByName: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await scanTicketSecure({ action: "grant-reentry", eventId, ticketId })
      return result.success ? { success: true } : { success: false, error: result.reason || "Failed to grant re-entry" }
    } catch (error: any) {
      return { success: false, error: error?.message || "Failed to grant re-entry" }
    }
  }

  static async findTicketByRef(
    eventSlug: string,
    query: string,
  ): Promise<{ id: string; buyerName: string; entryFeeType: string; status: string; reentryPass: unknown } | null> {
    const result = await scanTicketSecure({ action: "find-reentry", eventId: eventSlug, query })
    if (!result.success) return null
    return {
      id: result.ticketId,
      buyerName: result.buyerName,
      entryFeeType: result.entryFeeType,
      status: result.status,
      reentryPass: result.reentryPass ?? null,
    }
  }

  /**
   * Read-only operational status for the administrator monitor. The monitor
   * has no browser-side retry, ticket creation, email or status-update action.
   */
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
}
