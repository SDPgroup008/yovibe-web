export type TicketStatus = "active" | "used" | "refunded" | "expired" | "cancelled"
export type TicketType = "regular" | "secure"
export type ValidationType = "qr_only" | "biometric" | "manual"

export interface Ticket {
  id: string
  eventId: string
  eventName: string
  buyerId: string
  buyerName: string
  buyerEmail: string
  quantity: number
  ticketType: TicketType
  totalAmount: number
  venueRevenue: number
  appCommission: number
  purchaseDate: Date
  qrCode: string
  biometricHash?: string
  status: TicketStatus
  validationHistory: TicketValidation[]
}

export interface TicketValidation {
  id: string
  ticketId: string
  validatedBy: string
  validatedAt: Date
  validationType: ValidationType
  location?: string
  biometricHash?: string
}
