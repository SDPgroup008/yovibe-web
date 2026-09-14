export interface WeeklyProgramDetails {
  description: string
  posterUrl?: string
}

export type WeeklyProgramValue = string | WeeklyProgramDetails

export interface Venue {
  id: string
  slug?: string
  name: string
  location: string
  description: string
  backgroundImageUrl: string
  categories: string[]
  vibeRating: number
  todayImages?: string[]
  latitude: number
  longitude: number
  phoneNumber?: string
  coordinates?: { latitude: number; longitude: number }
  weeklyPrograms?: Record<string, WeeklyProgramValue>
  ownerId: string
  createdAt: Date
  venueType?: "nightlife" | "recreation"
}
