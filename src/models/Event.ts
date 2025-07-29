import type { Timestamp } from "firebase/firestore"
import type { UserType } from "./User"

export interface TicketType {
  id: string
  name: string
  price: number
  description?: string
  maxQuantity?: number
  isAvailable: boolean
}

export interface PaymentAccount {
  type: "mtn" | "airtel" | "bank"
  accountNumber: string
  accountName: string
  isActive: boolean
}

export interface Event {
  id: string
  name: string
  venueId: string
  venueName: string
  description: string
  date: Date
  posterImageUrl: string
  artists: string[]
  isFeatured: boolean
  createdAt: Date
  createdBy?: string
  createdByType?: UserType
  location?: string
  priceIndicator?: number
  entryFee?: string
  attendees?: string[]

  // New fields for enhanced ticket system
  ticketTypes: TicketType[]
  paymentAccounts: PaymentAccount[]

  // Event owner payment information
  ownerPaymentPhone?: string
  ownerPaymentName?: string

  // Revenue tracking
  totalRevenue?: number
  appCommission?: number
  netRevenue?: number
}

// Add a new interface for Firestore storage
export interface FirestoreEvent {
  name: string
  venueId: string
  venueName: string
  description: string
  date: Timestamp
  posterImageUrl: string
  artists: string[]
  isFeatured: boolean
  createdAt: Timestamp
  createdBy?: string
  createdByType?: UserType
  location?: string
  priceIndicator?: number
  entryFee?: string
  attendees?: string[]
  ticketTypes: TicketType[]
  paymentAccounts: PaymentAccount[]
  ownerPaymentPhone?: string
  ownerPaymentName?: string
  totalRevenue?: number
  appCommission?: number
  netRevenue?: number
}

// Default ticket types
export const getDefaultTicketTypes = (basePrice: number): TicketType[] => [
  {
    id: "regular",
    name: "Regular",
    price: basePrice,
    description: "Standard entry ticket",
    isAvailable: true,
  },
  {
    id: "secure",
    name: "Secure",
    price: basePrice,
    description: "Entry with photo verification",
    isAvailable: true,
  },
]

// Helper function to parse entry fee
export const parseEntryFee = (entryFee: string | number | undefined): number => {
  if (typeof entryFee === "number") return entryFee
  if (typeof entryFee === "string") {
    const match = entryFee.match(/[\d,]+/)
    if (match) {
      return Number.parseInt(match[0].replace(/,/g, ""))
    }
  }
  return 0
}
