export type TicketStatus = "active" | "used" | "expired" | "cancelled"
export type TicketType = "regular" | "secure" | "vip" | "vvip" | "couple" | "table"
export type PaymentMethod = "mtn" | "airtel" | "card"

export interface PaymentAccount {
  type: PaymentMethod
  accountNumber: string
  accountName: string
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

export interface PaymentConfirmation {
  id: string
  ticketId: string
  eventId: string
  buyerId: string
  sellerId: string
  amount: number
  paymentMethod: PaymentMethod
  paymentReference: string
  timestamp: Date
  type: "purchase" | "refund"
  status: "success" | "failed" | "pending"
}

export interface Ticket {
  id: string
  eventId: string
  eventName: string
  eventPosterUrl?: string

  // Buyer information
  buyerId: string
  buyerName: string
  buyerEmail: string
  buyerPhone?: string
  buyerImageUrl?: string

  // Ticket details
  quantity: number
  ticketType: TicketType
  ticketTypeName: string
  pricePerTicket: number
  totalAmount: number

  // Payment details
  paymentFees: number
  appCommission: number
  sellerRevenue: number
  paymentMethod: PaymentMethod
  paymentReference?: string
  paymentAccount?: PaymentAccount

  // QR and verification
  qrCode: string
  qrData?: string
  status: TicketStatus
  purchaseDate: Date
  validationHistory: TicketValidation[]
  isVerified: boolean

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

// Payment method fees
export const PAYMENT_FEES = {
  mtn: { fixed: 500, percentage: 0.01 }, // UGX 500 + 1%
  airtel: { fixed: 300, percentage: 0.015 }, // UGX 300 + 1.5%
  card: { fixed: 1000, percentage: 0.025 }, // UGX 1000 + 2.5%
}

// App commission rate
export const APP_COMMISSION_RATE = 0.05 // 5%

// Helper functions
export const calculatePaymentFees = (amount: number, method: PaymentMethod): number => {
  const fees = PAYMENT_FEES[method]
  return fees.fixed + amount * fees.percentage
}

export const calculateAppCommission = (amount: number): number => {
  return amount * APP_COMMISSION_RATE
}

export const calculateSellerRevenue = (ticketPrice: number, quantity: number): number => {
  const totalTicketRevenue = ticketPrice * quantity
  const commission = calculateAppCommission(totalTicketRevenue)
  return totalTicketRevenue - commission
}

export const calculateTotalAmount = (ticketPrice: number, quantity: number, paymentMethod: PaymentMethod): number => {
  const ticketTotal = ticketPrice * quantity
  const paymentFees = calculatePaymentFees(ticketTotal, paymentMethod)
  return ticketTotal + paymentFees
}
