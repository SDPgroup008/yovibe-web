import supabase from "../config/supabase"
import { v4 as uuidv4 } from "uuid"
import TicketService from "./TicketService"
import PawaPayService from "./PawaPayService"
import PesaPalService from "./PesaPalService"
import NotificationService from "./NotificationService"
import type { Event } from "../models/Event"
import {
  type InstallmentPlan,
  type Installment,
  type InstallmentPlanType,
  INSTALLMENT_SERVICE_FEE_RATE,
  YOVIBE_COMMISSION_RATE,
  splitIntoInstallments,
  buildDueDates,
} from "../models/InstallmentPlan"

const FUNCTIONS_BASE_URL =
  process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL ||
  process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  ""

function resolveFunctionUrl(functionName: string): string {
  const base = FUNCTIONS_BASE_URL.replace(/\/$/, "")
  return base ? `${base}/.netlify/functions/${functionName}` : `/.netlify/functions/${functionName}`
}

export class InstallmentService {
  // ─── Plan Creation ────────────────────────────────────────────────────────

  /**
   * Builds the installment schedule (no DB write, no payment).
   * Call this to preview the plan in the UI before the user confirms.
   */
  static previewPlan(
    totalAmount: number,
    planType: InstallmentPlanType,
    eventDate: Date
  ): Installment[] {
    const baseAmounts = splitIntoInstallments(totalAmount, planType)
    const dueDates = buildDueDates(planType, eventDate)

    return baseAmounts.map((amount, i) => {
      const serviceFee = Math.round(amount * INSTALLMENT_SERVICE_FEE_RATE)
      return {
        index: i,
        amount,
        serviceFee,
        totalDue: amount + serviceFee,
        dueDate: dueDates[i],
        status: "pending",
      }
    })
  }

  /**
   * Creates the plan row in Supabase and immediately charges the first installment.
   * Returns the plan ID and the deposit/order ID for the first payment.
   */
  static async createPlanAndPayFirst(
    event: Event,
    planType: InstallmentPlanType,
    totalAmount: number,
    lateFee: number,
    buyerInfo: {
      buyerId?: string
      buyerEmail: string
      buyerName: string
      ticketType: string
      buyerNames: string[]
      buyerEmails: string[]
      deliveryEmails: string[]
      payerEmail: string
      isTableEntry: boolean
      tableSize: number
      buyerPhotoUrl?: string
      seatNumber?: number
      tableNumber?: number
      checkoutHoldId?: string
    },
    paymentDetails: {
      method: "mobile_money" | "credit_card" | "bank_transfer"
      provider?: string
      number?: string
      name?: string
    }
  ): Promise<{ planId: string; depositId?: string; paymentUrl?: string; orderId?: string; trackingId?: string }> {
    const installments = this.previewPlan(totalAmount, planType, event.date)

    const plan: Omit<InstallmentPlan, "id"> = {
      buyerId: buyerInfo.buyerId,
      buyerEmail: buyerInfo.buyerEmail,
      buyerName: buyerInfo.buyerName,
      eventId: event.id,
      eventName: event.name,
      eventDate: event.date,
      ticketType: buyerInfo.ticketType,
      quantity: buyerInfo.buyerNames.length,
      buyerNames: buyerInfo.buyerNames,
      buyerEmails: buyerInfo.buyerEmails,
      deliveryEmails: buyerInfo.deliveryEmails,
      payerEmail: buyerInfo.payerEmail,
      isTableEntry: buyerInfo.isTableEntry,
      tableSize: buyerInfo.tableSize,
      buyerPhotoUrl: buyerInfo.buyerPhotoUrl,
      seatNumber: buyerInfo.seatNumber,
      tableNumber: buyerInfo.tableNumber,
      checkoutHoldId: buyerInfo.checkoutHoldId,
      paymentProvider: paymentDetails.provider,
      paymentNumber: paymentDetails.number,
      baseTotal: totalAmount - lateFee,
      lateFee,
      totalAmount,
      installments,
      installmentsPaid: 0,
      amountPaid: 0,
      status: "active",
      ticketIds: [],
      created_at: new Date(),
      updated_at: new Date(),
    }

    const { data, error } = await supabase
      .from("ticket_installment_plans")
      .insert(this.planToRow(plan))
      .select("id")
      .single()

    if (error) throw error
    const planId = data.id

    // Charge first installment
    const first = installments[0]
    const payResult = await this.chargeInstallment(planId, 0, first.totalDue, paymentDetails, event)

    return { planId, ...payResult }
  }

  // ─── Pay Next Installment ─────────────────────────────────────────────────

  static async payInstallment(
    planId: string,
    installmentIndex: number,
    paymentDetails: {
      method: "mobile_money" | "credit_card" | "bank_transfer"
      provider?: string
      number?: string
      name?: string
    }
  ): Promise<{ depositId?: string; paymentUrl?: string; orderId?: string; trackingId?: string }> {
    const plan = await this.getPlanById(planId)
    if (!plan) throw new Error("Installment plan not found")
    if (plan.status !== "active") throw new Error("This installment plan is no longer active")

    const installment = plan.installments[installmentIndex]
    if (!installment) throw new Error("Installment not found")
    if (installment.status === "paid") throw new Error("This installment is already paid")

    // Missed installments remain payable until the reservation release cutoff.
    if (plan.reservationExpiresAt && new Date() >= plan.reservationExpiresAt) {
      await this.updatePlanStatus(planId, "expired")
      throw new Error("The reservation cutoff has passed. The seats/tables were released and this payment requires admin review.")
    }
    if (plan.eventDate && new Date() > plan.eventDate) {
      await this.updatePlanStatus(planId, "expired")
      throw new Error("The event has already passed. This plan has been cancelled.")
    }

    const event = { id: plan.eventId, name: plan.eventName || "" } as Event
    return this.chargeInstallment(planId, installmentIndex, installment.totalDue, paymentDetails, event)
  }

  // ─── Confirm Payment (called after PawaPay/PesaPal confirms) ─────────────

  static async onInstallmentPaid(
    planId: string,
    installmentIndex: number,
    depositId: string,
    paymentMethod: "mobile_money" | "credit_card" | "bank_transfer",
    extra?: { orderId?: string; trackingId?: string }
  ): Promise<{ planComplete: boolean; ticketIds?: string[] }> {
    const plan = await this.getPlanById(planId)
    if (!plan) throw new Error("Plan not found")

    if (plan.status === "completed" && plan.ticketIds?.length) {
      return { planComplete: true, ticketIds: plan.ticketIds }
    }

    const response = await fetch(resolveFunctionUrl("confirm-installment-payment"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId,
        installmentIndex,
        paymentMethod,
        depositId: paymentMethod === "mobile_money" ? depositId : undefined,
        orderId: paymentMethod !== "mobile_money" ? (extra?.orderId || depositId) : undefined,
        trackingId: extra?.trackingId,
        checkoutHoldId: installmentIndex === 0 ? plan.checkoutHoldId : undefined,
      }),
    })
    const data = await response.json()
    if (!response.ok || !data.success) throw new Error(data.error || "Installment payment could not be confirmed")
    if (data.reservationStatus === "needs_review") {
      throw new Error("Payment was received, but the selected seat/table could not be reserved. Please contact support for manual review.")
    }

    if (data.planComplete) {
      const updatedPlan = await this.getPlanById(planId)
      if (!updatedPlan) throw new Error("Updated installment plan not found")
      // Preserve the payment identifier from the just-verified charge even if
      // the plan read races with the database JSONB update. Final fulfillment
      // must verify the payment that actually completed the plan.
      const completedInstallment = updatedPlan.installments.map((installment) =>
        installment.index === installmentIndex
          ? {
              ...installment,
              paymentMethod,
              depositId: paymentMethod === "mobile_money" ? depositId : installment.depositId,
              orderId: paymentMethod !== "mobile_money" ? (extra?.orderId || depositId) : installment.orderId,
              trackingId: paymentMethod !== "mobile_money" ? (extra?.trackingId || installment.trackingId) : installment.trackingId,
            }
          : installment,
      )
      const ticketIds = await this.fulfillTickets({
        ...updatedPlan,
        installments: completedInstallment,
        reservationId: data.reservationId || updatedPlan.reservationId,
      })
      return { planComplete: true, ticketIds }
    }

    return { planComplete: false }
  }

  // ─── Ticket Fulfillment (final step) ─────────────────────────────────────

  /**
   * Phase 1+: final fulfillment runs through the SERVER (fulfill-purchase) —
   * the client no longer creates ticket rows for installments. The server
   * re-verifies the LAST installment's payment, enforces inventory, uploads
   * QR/photo, emails, and records the fulfillment.
   */
  private static async fulfillTickets(plan: InstallmentPlan): Promise<string[]> {
    const lastInst = plan.installments[plan.installments.length - 1]
    const lastMethod = lastInst.paymentMethod || "mobile_money"
    const isMM = lastMethod === "mobile_money"
    const photo = plan.buyerPhotoUrl || ""
    const isRemotePhoto = /^https?:\/\//.test(photo)

    const result = await TicketService.fulfillPurchase({
      fulfillmentId: uuidv4(),
      eventId: plan.eventId,
      ticketType: plan.ticketType,
      quantity: plan.quantity,
      totalAmount: plan.totalAmount,
      isTableEntry: plan.isTableEntry,
      tableSize: plan.tableSize,
      buyerNames: plan.buyerNames,
      buyerEmails: plan.buyerEmails,
      deliveryEmails: plan.deliveryEmails,
      payerEmail: plan.payerEmail,
      buyerId: plan.buyerId ?? null,
      buyerPhone: plan.paymentNumber,
      buyerPhotoUrl: isRemotePhoto ? photo : undefined,
      buyerPhotoDataUrl: !isRemotePhoto && photo ? photo : undefined,
      seatNumbers: !plan.isTableEntry && plan.seatNumber != null ? Array(plan.quantity).fill(plan.seatNumber) : undefined,
      tableNumbers: plan.isTableEntry && plan.tableNumber != null ? Array(plan.quantity).fill(plan.tableNumber) : undefined,
      inventoryHoldIds: plan.reservationId ? [plan.reservationId] : undefined,
      installmentPlanId: plan.id,
      payment: {
        method: lastMethod,
        provider: plan.paymentProvider,
        number: plan.paymentNumber,
        name: plan.buyerName,
        cardName: plan.buyerName,
      },
      verification: {
        depositId: isMM ? (lastInst.depositId || undefined) : undefined,
        orderId: !isMM ? (lastInst.orderId || lastInst.depositId || undefined) : undefined,
        trackingId: !isMM ? (lastInst.trackingId || undefined) : undefined,
        pollStatus: "completed",
      },
    })

    if (!result.success || !result.ticketIds || result.ticketIds.length === 0) {
      throw new Error(result.error || "Installment fulfillment failed")
    }
    const ticketIds = result.ticketIds

    // Update plan with ticket IDs
    await supabase
      .from("ticket_installment_plans")
      .update({ ticket_ids: ticketIds, updated_at: new Date().toISOString() })
      .eq("id", plan.id)

    return ticketIds
  }

  // ─── Revenue Calculation ──────────────────────────────────────────────────

  static calculateInstallmentRevenue(installmentBaseAmount: number): {
    serviceFee: number
    yovibeCommission: number
    venueRevenue: number
    totalDue: number
  } {
    const serviceFee = Math.round(installmentBaseAmount * INSTALLMENT_SERVICE_FEE_RATE)
    const totalDue = installmentBaseAmount + serviceFee
    const yovibeCommission = Math.round(installmentBaseAmount * YOVIBE_COMMISSION_RATE)
    const venueRevenue = installmentBaseAmount - yovibeCommission
    return { serviceFee, yovibeCommission, venueRevenue, totalDue }
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  static async getPlanById(planId: string): Promise<InstallmentPlan | null> {
    const { data, error } = await supabase
      .from("ticket_installment_plans")
      .select("*")
      .eq("id", planId)
      .single()

    if (error || !data) return null
    return this.rowToPlan(data)
  }

  static async getPlansByBuyer(buyerEmail: string): Promise<InstallmentPlan[]> {
    const { data, error } = await supabase
      .from("ticket_installment_plans")
      .select("*")
      .eq("buyer_email", buyerEmail)
      .order("created_at", { ascending: false })

    if (error) return []
    return (data || []).map(this.rowToPlan)
  }

  static async getPlansByBuyerId(buyerId: string): Promise<InstallmentPlan[]> {
    const { data, error } = await supabase
      .from("ticket_installment_plans")
      .select("*")
      .eq("buyer_id", buyerId)
      .order("created_at", { ascending: false })

    if (error) return []
    return (data || []).map(this.rowToPlan)
  }

  static async updatePlanStatus(planId: string, status: InstallmentPlan["status"]): Promise<void> {
    await supabase
      .from("ticket_installment_plans")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", planId)
  }

  // ─── Internal: charge via PawaPay or PesaPal ─────────────────────────────

  private static async chargeInstallment(
    planId: string,
    installmentIndex: number,
    amount: number,
    paymentDetails: {
      method: "mobile_money" | "credit_card" | "bank_transfer"
      provider?: string
      number?: string
      name?: string
    },
    event: Pick<Event, "id" | "name">
  ): Promise<{ depositId?: string; paymentUrl?: string; orderId?: string; trackingId?: string }> {
    if (paymentDetails.method === "mobile_money") {
      const provider =
        paymentDetails.provider === "mtn" ? "MTN_MOMO_UGA" : "AIRTEL_OAPI_UGA"
      const result = await PawaPayService.initiateDeposit(
        amount,
        "UGX",
        paymentDetails.number!,
        provider
      )
      if (!result.success) throw new Error(result.error || "Mobile money payment failed")
      return { depositId: result.depositId }
    }

    // PesaPal (card / bank)
    const result = await PesaPalService.submitOrder(
      amount,
      `Installment ${installmentIndex + 1} for ${event.name}`,
      paymentDetails.name || "",
      "",
      typeof window !== "undefined" ? window.location.origin : "",
      paymentDetails.name
    )
    if (!result.success) throw new Error(result.error || "Payment failed")
    return { paymentUrl: result.paymentUrl, orderId: result.orderId, trackingId: result.trackingId }
  }

  // ─── Row mappers ──────────────────────────────────────────────────────────

  private static planToRow(plan: Omit<InstallmentPlan, "id">): Record<string, any> {
    return {
      buyer_id: plan.buyerId,
      buyer_email: plan.buyerEmail,
      buyer_name: plan.buyerName,
      event_id: plan.eventId,
      event_name: plan.eventName,
      event_date: plan.eventDate?.toISOString(),
      ticket_type: plan.ticketType,
      quantity: plan.quantity,
      buyer_names: plan.buyerNames,
      buyer_emails: plan.buyerEmails,
      delivery_emails: plan.deliveryEmails,
      payer_email: plan.payerEmail,
      is_table_entry: plan.isTableEntry,
      table_size: plan.tableSize,
      buyer_photo_url: plan.buyerPhotoUrl,
      seat_number: plan.seatNumber,
      table_number: plan.tableNumber,
      checkout_hold_id: plan.checkoutHoldId,
      reservation_id: plan.reservationId,
      reservation_status: plan.reservationStatus || "none",
      reservation_expires_at: plan.reservationExpiresAt?.toISOString(),
      payment_provider: plan.paymentProvider,
      payment_number: plan.paymentNumber,
      base_total: plan.baseTotal,
      late_fee: plan.lateFee,
      total_amount: plan.totalAmount,
      installments: plan.installments,
      installments_paid: plan.installmentsPaid,
      amount_paid: plan.amountPaid,
      status: plan.status,
      ticket_ids: plan.ticketIds || [],
      created_at: plan.created_at.toISOString(),
      updated_at: plan.updated_at.toISOString(),
    }
  }

  private static rowToPlan(row: any): InstallmentPlan {
    const installments: Installment[] = (row.installments || []).map((i: any) => ({
      index: i.index,
      amount: i.amount,
      serviceFee: i.serviceFee ?? Math.round(i.amount * INSTALLMENT_SERVICE_FEE_RATE),
      totalDue: i.totalDue ?? i.amount + Math.round(i.amount * INSTALLMENT_SERVICE_FEE_RATE),
      dueDate: new Date(i.dueDate),
      status: i.status,
      depositId: i.depositId,
      paymentMethod: i.paymentMethod,
      paidAt: i.paidAt ? new Date(i.paidAt) : undefined,
      orderId: i.orderId,
      trackingId: i.trackingId,
    }))

    return {
      id: row.id,
      buyerId: row.buyer_id,
      buyerEmail: row.buyer_email,
      buyerName: row.buyer_name,
      eventId: row.event_id,
      eventName: row.event_name,
      eventDate: row.event_date ? new Date(row.event_date) : undefined,
      ticketType: row.ticket_type,
      quantity: row.quantity,
      buyerNames: row.buyer_names || [],
      buyerEmails: row.buyer_emails || [],
      deliveryEmails: row.delivery_emails || [],
      payerEmail: row.payer_email || "",
      isTableEntry: row.is_table_entry || false,
      tableSize: row.table_size || 1,
      buyerPhotoUrl: row.buyer_photo_url,
      seatNumber: row.seat_number,
      tableNumber: row.table_number,
      checkoutHoldId: row.checkout_hold_id,
      reservationId: row.reservation_id,
      reservationStatus: row.reservation_status || "none",
      reservationExpiresAt: row.reservation_expires_at ? new Date(row.reservation_expires_at) : undefined,
      paymentProvider: row.payment_provider,
      paymentNumber: row.payment_number,
      baseTotal: row.base_total,
      lateFee: row.late_fee || 0,
      totalAmount: row.total_amount,
      installments,
      installmentsPaid: row.installments_paid || 0,
      amountPaid: row.amount_paid || 0,
      status: row.status,
      ticketIds: row.ticket_ids || [],
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    }
  }
}

export default InstallmentService
