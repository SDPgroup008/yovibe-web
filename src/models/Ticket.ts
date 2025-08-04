export type PaymentMethod = "mtn" | "airtel" | "card"

export interface PaymentAccount {
  type: PaymentMethod
  accountNumber: string
  accountName: string
  isActive: boolean
}

export interface QRTicketData {
  ticketId: string
  eventId: string
  buyerId: string
  eventName: string
  ticketType: string
  quantity: number
  timestamp: number
}

export interface TicketValidation {
  id: string
  ticketId: string
  eventId: string
  validatedBy: string
  validatedAt: Date
  validationType: "qr_only" | "image_verification"
  isValid: boolean
  location: string
  biometricData?: string
}

export type TicketStatus = "active" | "used" | "cancelled" | "expired"

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
  ticketType: "regular" | "secure"
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

// Helper functions
export function calculatePaymentFees(amount: number, method: PaymentMethod): number {
  const fees = PAYMENT_FEES[method]
  return fees.fixed + amount * fees.percentage
}

export function calculateAppCommission(ticketPrice: number): number {
  return ticketPrice * APP_COMMISSION_RATE
}

export function calculateSellerRevenue(ticketPrice: number, quantity: number): number {
  const subtotal = ticketPrice * quantity
  const commission = calculateAppCommission(ticketPrice) * quantity
  return subtotal - commission
}
