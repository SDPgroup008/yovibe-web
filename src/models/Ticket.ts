export type PaymentMethod = "mtn" | "airtel" | "card"

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
  validationType: "qr" | "manual"
  location?: string
  notes?: string
}

export interface QRTicketData {
  ticketId: string
  eventId: string
  eventName: string
  buyerId: string
  buyerName: string
  ticketType: string
  quantity: number
  purchaseDate: string
  verificationCode: string
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
  ticketType: string
  ticketTypeName?: string
  pricePerTicket: number
  totalAmount: number
  paymentFees: number
  appCommission: number
  sellerRevenue: number
  paymentMethod: PaymentMethod
  paymentReference?: string
  paymentAccount: PaymentAccount
  qrCode: string
  qrData: string
  status: "active" | "used" | "cancelled" | "refunded"
  purchaseDate: Date
  validationHistory: TicketValidation[]
  isVerified: boolean
  createdAt: Date
  updatedAt: Date
}

// Payment fee structure
export const PAYMENT_FEES = {
  mtn: { fixed: 500, percentage: 0.01 }, // UGX 500 + 1%
  airtel: { fixed: 300, percentage: 0.015 }, // UGX 300 + 1.5%
  card: { fixed: 1000, percentage: 0.025 }, // UGX 1000 + 2.5%
}

// App commission rate (5%)
export const APP_COMMISSION_RATE = 0.05

// Calculate payment fees
export function calculatePaymentFees(amount: number, method: PaymentMethod): number {
  const fees = PAYMENT_FEES[method]
  return fees.fixed + amount * fees.percentage
}

// Calculate app commission
export function calculateAppCommission(subtotal: number): number {
  return subtotal * APP_COMMISSION_RATE
}

// Calculate seller revenue (after commission, before payment fees)
export function calculateSellerRevenue(pricePerTicket: number, quantity: number): number {
  const subtotal = pricePerTicket * quantity
  const commission = calculateAppCommission(subtotal)
  return subtotal - commission
}

// Firestore-compatible ticket interface
export interface FirestoreTicket {
  eventId: string
  eventName: string
  eventPosterUrl?: string
  buyerId: string
  buyerName: string
  buyerEmail: string
  buyerPhone?: string
  buyerImageUrl?: string
  quantity: number
  ticketType: string
  ticketTypeName?: string
  pricePerTicket: number
  totalAmount: number
  paymentFees: number
  appCommission: number
  sellerRevenue: number
  paymentMethod: PaymentMethod
  paymentReference?: string
  paymentAccount: PaymentAccount
  qrCode: string
  qrData: string
  status: "active" | "used" | "cancelled" | "refunded"
  purchaseDate: any // Firestore Timestamp
  validationHistory: TicketValidation[]
  isVerified: boolean
  createdAt: any // Firestore Timestamp
  updatedAt: any // Firestore Timestamp
}
