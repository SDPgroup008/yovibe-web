export type PaymentMethod = "mtn" | "airtel" | "card"
export type TicketStatus = "active" | "used" | "cancelled" | "expired"
export type TicketType = "regular" | "secure" | string // Allow custom ticket types

export interface PaymentAccount {
  type: PaymentMethod
  accountNumber: string
  accountName: string
  isActive: boolean
}

export interface TicketValidation {
  id: string
  ticketId: string
  eventId: string
  validatedBy: string
  validatedAt: Date
  validationType: "qr" | "manual" | "biometric"
  location?: string
  notes?: string
}

export interface Ticket {
  id: string
  eventId: string
  eventName: string
  eventPosterUrl?: string
  buyerId: string
  buyerName: string
  buyerEmail: string
  buyerPhone?: string
  buyerImageUrl?: string
  quantity: number
  ticketType: TicketType
  ticketTypeName: string
  pricePerTicket: number
  totalAmount: number
  paymentFees: number
  appCommission: number
  sellerRevenue: number
  paymentMethod: PaymentMethod
  paymentReference?: string
  paymentAccount?: PaymentAccount
  qrCode: string
  qrData?: string
  status: TicketStatus
  purchaseDate: Date
  validationHistory: TicketValidation[]
  isVerified: boolean
  createdAt: Date
  updatedAt: Date
}

// Payment fee structure
export const PAYMENT_FEES: Record<PaymentMethod, { fixed: number; percentage: number }> = {
  mtn: { fixed: 500, percentage: 0.015 }, // 1.5% + 500 UGX
  airtel: { fixed: 500, percentage: 0.015 }, // 1.5% + 500 UGX
  card: { fixed: 1000, percentage: 0.025 }, // 2.5% + 1000 UGX
}

// App commission rate (5% of ticket price)
export const APP_COMMISSION_RATE = 0.05

// Calculate payment fees
export function calculatePaymentFees(amount: number, method: PaymentMethod): number {
  const fees = PAYMENT_FEES[method]
  return fees.fixed + amount * fees.percentage
}

// Calculate app commission
export function calculateAppCommission(ticketPrice: number): number {
  return ticketPrice * APP_COMMISSION_RATE
}

// Calculate seller revenue (after app commission)
export function calculateSellerRevenue(ticketPrice: number, quantity: number): number {
  const totalTicketValue = ticketPrice * quantity
  const commission = calculateAppCommission(ticketPrice) * quantity
  return totalTicketValue - commission
}

// Generate QR code data
export function generateQRData(ticket: Ticket): string {
  return JSON.stringify({
    ticketId: ticket.id,
    eventId: ticket.eventId,
    buyerId: ticket.buyerId,
    ticketType: ticket.ticketType,
    quantity: ticket.quantity,
    purchaseDate: ticket.purchaseDate.toISOString(),
    isSecure: ticket.ticketType === "secure",
  })
}

// Validate QR code data
export function validateQRData(qrData: string): boolean {
  try {
    const data = JSON.parse(qrData)
    return !!(data.ticketId && data.eventId && data.buyerId)
  } catch {
    return false
  }
}
