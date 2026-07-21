export interface Ticket {
  id: string
  eventId: string
  eventName: string
  venueName?: string
  buyerId?: string
  buyerName: string
  buyerEmail: string
  deliveryEmail?: string
  ticketRef?: string
  buyerPhone?: string
  quantity: number
  totalAmount: number
  tableTotalAmount?: number
  seatNumber?: number
  tableGroupId?: string
  basePrice: number
  lateFee: number
  venueRevenue: number
  appCommission: number
  purchaseDate: Date
  eventStartTime: Date
  qrCode: string
  qrCodeDataUrl?: string
  buyerPhotoUrl?: string
  photoUploadToken?: string
  photoUploadTokenExpiresAt?: Date
  status: "active" | "used" | "cancelled" | "refunded" | "expired" | "pending"
  validationHistory: TicketValidation[]
  entryFeeType?: string
  reentryPass?: { grantedAt: string; grantedBy: string; grantedByName: string; used: boolean }
  paymentId?: string
  paymentStatus?: "pending" | "completed" | "failed"
  paymentReference?: string
  pesapalTransactionId?: string
  pesapalConfirmationCode?: string
  pawapayDepositId?: string
  gatewayFee?: number
  installmentPlanId?: string
  refundedAmount?: number
  refundStatus?: "none" | "pending" | "completed" | "failed"
  isLatePurchase: boolean
  isScanned: boolean
  purchaseDeadline: Date
  expiresAt: Date
  payoutEligible: boolean
  payoutStatus: "pending" | "processing" | "paid" | "failed"
  payoutDate?: Date
  scannedAt?: Date
  paymentMethod?: "mobile_money" | "credit_card" | "bank_transfer"
  paymentProvider?: string
  paymentNumber?: string
  paymentName?: string
  qrSignature?: string
}

export interface TicketValidation {
  id: string
  ticketId: string
  eventId: string
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
