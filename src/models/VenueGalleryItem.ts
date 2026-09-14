export interface VenueGalleryItem {
  id: string
  venueSlug: string
  imageUrl: string
  title: string
  description?: string
  displayOrder: number
  createdBy: string
  createdAt: Date
}
