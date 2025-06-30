export type UserType = "user" | "club_owner" | "admin"

export interface User {
  id: string
  uid: string
  email: string
  displayName?: string
  photoURL?: string
  userType: UserType
  venueId?: string
  isFrozen?: boolean
  phone?: string
  createdAt: Date
  lastLoginAt: Date
}
