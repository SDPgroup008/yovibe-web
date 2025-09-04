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
  biometricHash: string
  status: "active" | "used" | "cancelled"
  validationHistory: TicketValidation[]
}

export interface TicketValidation {
  id: string
  ticketId: string
  validatedAt: Date
  validatedBy: string
  biometricMatch: boolean
  location?: string
  status: "granted" | "denied"
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
