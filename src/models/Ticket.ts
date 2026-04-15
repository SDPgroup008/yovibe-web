export interface Ticket {
  id: string
  eventId: string
  eventName: string
  buyerId: string
  buyerName: string
  buyerEmail: string
  buyerPhone?: string
  quantity: number
  totalAmount: number
  basePrice: number
  lateFee: number
  venueRevenue: number
  appCommission: number
  purchaseDate: Date
  eventStartTime: Date
  qrCode: string
  qrCodeDataUrl?: string
  buyerPhotoUrl?: string
  status: "active" | "used" | "cancelled" | "refunded" | "expired"
  validationHistory: TicketValidation[]
  // Ticket type/entry fee
  entryFeeType?: string
  // PesaPal payment details
  paymentId?: string
  paymentStatus?: "pending" | "completed" | "failed"
  paymentReference?: string
  pesapalTransactionId?: string
  // Late purchase tracking
  isLatePurchase: boolean
  isScanned: boolean
  purchaseDeadline: Date
  // Expiry - tickets expire day after event
  expiresAt: Date
  // Payout tracking
  payoutEligible: boolean
  payoutStatus: "pending" | "processing" | "paid" | "failed"
  payoutDate?: Date
  scannedAt?: Date
  // Payment method details
  paymentMethod?: "mobile_money" | "credit_card" | "bank_transfer"
  paymentProvider?: string
  paymentNumber?: string
  paymentName?: string
  // Security: QR signature
  qrSignature?: string
}

export interface TicketValidation {
  id: string
  ticketId: string
  validatedAt: Date
  validatedBy: string
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
  paymentId?: string
  paymentReference?: string
}

export interface OrganizerWallet {
  id: string
  organizerId: string
  availableBalance: number
  pendingBalance: number
  totalEarnings: number
  totalPayouts: number
  lastPayoutDate?: Date
  lastUpdated: Date
}

export interface Payout {
  id: string
  organizerId: string
  ticketIds: string[]
  amount: number
  status: "pending" | "processing" | "completed" | "failed" | "cancelled"
  requestDate: Date
  processedDate?: Date
  failureReason?: string
  transactionReference?: string
  payoutMethod: "mobile_money" | "bank_transfer"
  recipientDetails: {
    name: string
    accountNumber?: string
    phoneNumber?: string
    bankName?: string
  }
}
