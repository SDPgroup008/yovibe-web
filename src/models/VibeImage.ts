export interface VibeImage {
  id: string
  venueId: string
  imageUrl: string
  vibeRating: number // 0-5
  uploadedAt: Date
  uploadedBy: string
  analysisData?: {
    crowdDensity?: number
    lightingQuality?: number
    energyLevel?: number
    musicVibes?: number
    overallAtmosphere?: number
  }
}
