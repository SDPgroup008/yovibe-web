import type { Timestamp } from "firebase/firestore"
import type { UserType } from "./User"

export interface Event {
  id: string
  name: string
  venueId: string
  venueName: string
  description: string
  date: Date
  time: string
  posterImageUrl: string
  artists: string[]
  isFeatured: boolean
  createdAt: Date
  createdBy?: string
  createdByType?: UserType
  location?: string // Added for city/location display
  priceIndicator?: number // Added for price indicator (1-3)
  isFreeEntry: boolean
  entryFees: Array<{ name: string; amount: string }>
  ticketContacts: Array<{ number: string; type: "call" | "whatsapp" }>
  attendees?: string[] // Added to track users who are going
}

// Add a new interface for Firestore storage
export interface FirestoreEvent {
  name: string
  venueId: string
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
  entryFees: Array<{ name: string; amount: string }>
  ticketContacts: Array<{ number: string; type: "call" | "whatsapp" }>
  attendees?: string[]
}