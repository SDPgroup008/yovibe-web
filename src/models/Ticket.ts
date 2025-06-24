export interface Ticket {
  id: string
  ticketCode: string
  eventId: string
  eventName: string
  venueId: string
  venueName: string
  buyerId: string
  buyerName: string
  buyerEmail: string
  quantity: number
  ticketPrice: number
  totalAmount: number
  appCommission: number
  venueRevenue: number
  purchaseDate: Date
  status: "active" | "used" | "cancelled" | "expired"
  biometricHash: string
  qrCodeData: string
  paymentIntentId: string
  validationHistory: TicketValidation[]
}

export interface TicketValidation {
  id: string
  ticketId: string
  validatedBy: string
  validatedAt: Date
  entryGranted: boolean
  biometricMatch: boolean
  location?: string
  notes?: string
}

export interface PaymentIntent {
  id: string
  ticketId: string
  amount: number
  currency: string
  status: "pending" | "succeeded" | "failed" | "cancelled"
  paymentMethod: string
  createdAt: Date
  completedAt?: Date
  failureReason?: string
}
