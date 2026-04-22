export type OwnershipRequestStatus = "pending" | "approved" | "rejected"

export interface VenueOwnershipRequest {
  id: string
  venueId: string
  venueName: string
  userId: string
  userName: string
  userEmail: string
  userPhone: string
  reason: string
  experience: string
  status: OwnershipRequestStatus
  requestedAt: Date
  reviewedAt?: Date
  reviewedBy?: string
  reviewNote?: string
}