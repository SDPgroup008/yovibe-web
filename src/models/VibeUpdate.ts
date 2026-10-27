export type VibeUpdateMediaType = "image" | "video"

export interface VibeUpdate {
  id: string
  venueSlug: string
  authorId: string
  mediaType: VibeUpdateMediaType
  mediaUrl: string
  mediaKey: string
  caption: string
  viewsCount: number
  createdAt: Date
  expiresAt: Date
}

export interface VibeUpdateVenue {
  venueSlug: string
  venueName: string
  posterUrl?: string
  ownerId: string
  updates: VibeUpdate[]
}
