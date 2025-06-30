export type TicketType = "regular" | "secure"
export type TicketStatus = "active" | "used" | "cancelled" | "expired"
export type ValidationStatus = "granted" | "denied"

export interface Ticket {
  id: string
  eventId: string
  eventName: string
  buyerId: string
  buyerName: string
  buyerEmail: string
  quantity: number
  totalAmount: number
  venueRevenue: number
  appCommission: number
  purchaseDate: Date
  qrCode: string
  ticketType: TicketType
  biometricHash?: string // Only for secure tickets
  status: TicketStatus
  validationHistory: TicketValidation[]
  cancelReason?: string
  cancelledAt?: Date
}

export interface TicketValidation {
  id: string
  ticketId: string
  validatedAt: Date
  validatedBy: string
  biometricHash?: string
  validationType: "qr_only" | "biometric"
  biometricMatch?: boolean // Only for secure tickets
  location?: string
  status?: ValidationStatus
  reason?: string
}

export interface PaymentIntent {
  id: string
  amount: number
  currency: string
  status: "pending" | "succeeded" | "failed"
  eventId: string
  buyerId: string
  venueRevenue: number
  appCommission: number
  createdAt: Date
}
