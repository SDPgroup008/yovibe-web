import type { Timestamp } from "firebase/firestore"
import type { UserType } from "./User"

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
  location?: string // Added for city/location display
  priceIndicator?: number // Added for price indicator (1-3)
  entryFee?: string // Added for entry fee in UGX
  attendees?: string[] // Added to track users who are going
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
}
