import type { Timestamp } from "firebase/firestore"
import type { UserType } from "./User"

export interface Event {
  id: string
  slug: string
  name: string
  venueSlug: string
  venueName: string
  description: string
  date: Date
  time: string
  posterImageUrl: string
  artists: string[]
  isFeatured: boolean
  createdAt: Date
  createdBy?: string
  createdByAuth?: string
  createdByType?: UserType
  location?: string
  priceIndicator?: number
  isFreeEntry: boolean
  entryFees: Array<{
    name: string
    amount: string
    isTable?: boolean
    tableSize?: number
    maxTickets?: number
    seatMap?: {
      type: "none" | "numbered" | "cinema"
      rows?: number
      cols?: number
    }
    ticketDesign?: {
      enabled: boolean
      orientation: "portrait" | "landscape"
      source: "template" | "upload"
      template_id: string | null
      background_url: string | null
      qr_position?: "top" | "bottom" | "center" | "left" | "right"
      dimensions: { width: number; height: number }
    }
  }>
  ticketContacts: Array<{ number: string; type: "call" | "whatsapp" }>
  attendees?: string[]
  paymentMethods?: {
    mobileMoney: Array<{ provider: "mtn" | "airtel"; number: string; name: string }>
    bankAccounts: Array<{ bankName: string; accountNumber: string; accountName: string }>
  }
  ticket_design?: {
    enabled: boolean
    orientation: "portrait" | "landscape"
    source: "template" | "upload"
    template_id: string | null
    background_url: string | null
    qr_position?: "top" | "bottom" | "center" | "left" | "right"
    dimensions: { width: number; height: number }
  } | null
}

export interface TicketDesign {
  enabled: boolean
  orientation: "portrait" | "landscape"
  source: "template" | "upload"
  template_id: string | null
  background_url: string | null
  qr_position?: "top" | "bottom" | "center" | "left" | "right"
  dimensions: { width: number; height: number }
}

// Add a new interface for Firestore storage
export interface FirestoreEvent {
  name: string
  venueSlug: string
  venueName: string
  description: string
  date: Timestamp
  time: string
  posterImageUrl: string
  artists: string[]
  isFeatured: boolean
  createdAt: Date
  createdBy?: string
  createdByType?: UserType
  location?: string
  priceIndicator?: number
  isFreeEntry: boolean
  entryFees: Array<{
    name: string
    amount: string
    isTable?: boolean
    tableSize?: number
    ticketDesign?: TicketDesign
  }>
  ticketContacts: Array<{ number: string; type: "call" | "whatsapp" }>
  attendees?: string[]
  ticket_design?: TicketDesign | null
}
