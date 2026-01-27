export type UserType = "user" | "club_owner" | "admin"

export interface User {
  id: string
  uid: string
  email: string
  userType: UserType
  displayName?: string
  photoURL?: string
  venueId?: string
  isFrozen?: boolean
  createdAt: Date
  lastLoginAt: Date
}
