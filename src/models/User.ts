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
  // Payment details for organizers
  paymentDetails?: {
    mobileMoney?: {
      provider: "mtn" | "airtel" | "airtel_tigo"
      phoneNumber: string
      accountName: string
    }
    bankAccount?: {
      bankName: string
      accountNumber: string
      accountName: string
      branchCode?: string
    }
  }
}
