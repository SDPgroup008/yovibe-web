export interface Ticket {
  id: string
  eventId: string
  eventName: string
  venueId: string
  venueName: string
  buyerId: string
  buyerName: string
  buyerEmail: string
  quantity: number
  unitPrice: number
  totalAmount: number
  appCommission: number // 5% of total
  venueRevenue: number // 95% of total
  purchaseDate: Date
  ticketCode: string // Unique QR code
  biometricHash: string // Encrypted eye scan data
  status: "active" | "used" | "cancelled"
  paymentId: string
  paymentStatus: "pending" | "completed" | "failed"
  usedAt?: Date
  validatedBy?: string
}

export interface TicketValidation {
  id: string
  ticketId: string
  eventId: string
  validatedAt: Date
  validatedBy: string // Scanner operator ID
  biometricMatch: boolean
  entryGranted: boolean
  notes?: string
}

export interface PaymentIntent {
  id: string
  eventId: string
  buyerId: string
  amount: number
  currency: string
  status: "pending" | "processing" | "completed" | "failed"
  paymentMethod: string
  createdAt: Date
}
