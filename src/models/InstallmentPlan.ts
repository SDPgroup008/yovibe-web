export interface Installment {
  index: number
  amount: number          // base installment amount (before service fee)
  serviceFee: number      // 8% of amount
  totalDue: number        // amount + serviceFee (what buyer actually pays)
  dueDate: Date
  status: "pending" | "paid" | "failed"
  depositId?: string
  paymentMethod?: "mobile_money" | "credit_card" | "bank_transfer"
  paidAt?: Date
}

export interface InstallmentPlan {
  id: string
  buyerId?: string
  buyerEmail: string
  buyerName?: string
  eventId: string
  eventName?: string
  eventDate?: Date
  ticketType?: string
  quantity: number
  // Attendee info (mirrors what TicketService needs on completion)
  buyerNames: string[]
  buyerEmails: string[]
  deliveryEmails: string[]
  payerEmail: string
  isTableEntry: boolean
  tableSize: number
  buyerPhotoUrl?: string
  seatNumber?: number
  paymentProvider?: string   // last used provider, for convenience
  paymentNumber?: string     // last used number
  // Financials
  baseTotal: number          // ticket price × qty, before late fee
  lateFee: number
  totalAmount: number        // baseTotal + lateFee (no service fees — those are per installment)
  installments: Installment[]
  installmentsPaid: number
  amountPaid: number         // sum of base amounts paid (excluding service fees)
  status: "active" | "completed" | "cancelled" | "expired"
  ticketIds?: string[]       // populated after final installment
  created_at: Date
  updated_at: Date
}

export const INSTALLMENT_SERVICE_FEE_RATE = 0.08  // 8% per installment
export const YOVIBE_COMMISSION_RATE = 0.15         // 15% per installment

export type InstallmentPlanType = "2" | "3" | "4" | "5"

/** Returns installment base amounts (before service fee) for a given plan type.
 *  First installment is always 40% of total; remainder split equally across the rest.
 */
export function splitIntoInstallments(total: number, planType: InstallmentPlanType): number[] {
  const count = parseInt(planType)
  if (count === 2) {
    const first = Math.round(total * 0.5)
    return [first, total - first]
  }
  // For 3-5: first = 40%, rest split equally
  const first = Math.round(total * 0.4)
  const remaining = total - first
  const perPart = Math.floor(remaining / (count - 1))
  const parts: number[] = [first]
  for (let i = 1; i < count - 1; i++) parts.push(perPart)
  // Last part absorbs rounding remainder
  parts.push(total - first - perPart * (count - 2))
  return parts
}

/** Builds due dates: first is today, rest are evenly spaced before the event */
export function buildDueDates(planType: InstallmentPlanType, eventDate: Date): Date[] {
  const count = parseInt(planType)
  const now = new Date()
  const msToEvent = eventDate.getTime() - now.getTime()
  const interval = Math.floor(msToEvent / count)

  return Array.from({ length: count }, (_, i) => {
    if (i === 0) return now
    return new Date(now.getTime() + interval * i)
  })
}
