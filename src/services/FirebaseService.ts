import "react-native-get-random-values"
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  getAuth,
  updateProfile,
  onAuthStateChanged,
  signOut,
} from "firebase/auth"
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
  writeBatch,
  getFirestore,
} from "firebase/firestore"
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { auth, db } from "../config/firebase"
import type { User as AppUser } from "../models/User"
import type { User, UserType } from "../models/User"
import type { Venue } from "../models/Venue"
import type { Event } from "../models/Event"
import { getDefaultTicketTypes, parseEntryFee } from "../models/Event"
import type { VibeImage } from "../models/VibeImage"
import type { Ticket, TicketValidation } from "../models/Ticket"
import { initializeApp, getApps } from "firebase/app"

// Payment confirmation interface
export interface PaymentConfirmation {
  id: string
  ticketId: string
  eventId: string
  buyerId: string
  sellerId: string
  amount: number
  paymentMethod: string
  paymentReference: string
  timestamp: Date
  type: "purchase" | "refund" | "commission"
  status: "success" | "failed" | "pending"
}

class FirebaseService {
  private static instance: FirebaseService
  private app
  private authOriginal
  private dbOriginal
  private storageOriginal

  private constructor() {
    console.log("Firebase service initialized")

    // Firebase configuration - use environment variables if available, otherwise fallback
    const firebaseConfig = {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyCu3hXDaqQ58VvHNQ1On5wxcgaU0CIXCo8",
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "eco-guardian-bd74f.firebaseapp.com",
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "eco-guardian-bd74f",
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "eco-guardian-bd74f.appspot.com",
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "917905910857",
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:917905910857:android:5886ab1db46cec56912398",
    }

    // Check if Firebase app already exists to prevent duplicate initialization
    if (getApps().length === 0) {
      this.app = initializeApp(firebaseConfig)
    } else {
      this.app = getApps()[0]
    }

    this.authOriginal = getAuth(this.app)
    this.dbOriginal = getFirestore(this.app)
    this.storageOriginal = getStorage(this.app)
  }

  static getInstance(): FirebaseService {
    if (!FirebaseService.instance) {
      FirebaseService.instance = new FirebaseService()
    }
    return FirebaseService.instance
  }

  // Auth methods
  async signUp(email: string, password: string, userType: UserType): Promise<void> {
    try {
      console.log("FirebaseService: Signing up user", email, "as", userType)
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const { uid } = userCredential.user
      console.log("FirebaseService: User created with UID", uid)

      // Create user profile in Firestore
      const userRef = await addDoc(collection(db, "users"), {
        uid,
        email,
        userType,
        createdAt: Timestamp.now(),
        lastLoginAt: Timestamp.now(),
        isDeleted: false,
      })
      console.log("FirebaseService: User profile created with ID", userRef.id)

      return
    } catch (error) {
      console.error("FirebaseService: Error signing up:", error)
      throw error
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    try {
      console.log("FirebaseService: Signing in user", email)
      await signInWithEmailAndPassword(auth, email, password)
      console.log("FirebaseService: Sign in successful")
      return
    } catch (error) {
      console.error("FirebaseService: Error signing in:", error)
      throw error
    }
  }

  async signOut(): Promise<void> {
    try {
      console.log("FirebaseService: Starting sign out process")

      // Clear any cached auth state
      if (auth.currentUser) {
        console.log("FirebaseService: Signing out current user:", auth.currentUser.email)
        await firebaseSignOut(auth)
        console.log("FirebaseService: Firebase sign out completed")
      }

      // Additional cleanup - clear any persisted auth state
      if (typeof window !== "undefined" && window.localStorage) {
        console.log("FirebaseService: Clearing localStorage")
        // Clear any Firebase auth persistence
        const firebaseKeys = Object.keys(window.localStorage).filter(
          (key) => key.startsWith("firebase:") || key.includes("firebaseLocalStorageDb"),
        )
        firebaseKeys.forEach((key) => {
          console.log("FirebaseService: Removing key:", key)
          window.localStorage.removeItem(key)
        })
      }

      console.log("FirebaseService: Sign out process completed successfully")
      return
    } catch (error) {
      console.error("FirebaseService: Error during sign out:", error)
      // Don't throw the error - we want to clear local state regardless
      console.warn("FirebaseService: Continuing with local cleanup despite Firebase error")
    }
  }

  // User methods
  async getUserProfile(uid: string): Promise<User> {
    try {
      console.log("FirebaseService: Getting user profile for UID", uid)
      const usersRef = collection(db, "users")
      const q = query(usersRef, where("uid", "==", uid))
      const querySnapshot = await getDocs(q)

      if (querySnapshot.empty) {
        console.error("FirebaseService: User not found for UID", uid)
        throw new Error("User not found")
      }

      const userDoc = querySnapshot.docs[0]
      const userData = userDoc.data()
      console.log("FirebaseService: User profile found", userDoc.id)

      return {
        id: userDoc.id,
        uid: userData.uid,
        email: userData.email,
        userType: userData.userType,
        displayName: userData.displayName,
        photoURL: userData.photoURL,
        venueId: userData.venueId,
        isFrozen: userData.isFrozen,
        createdAt: userData.createdAt.toDate(),
        lastLoginAt: userData.lastLoginAt.toDate(),
      }
    } catch (error) {
      console.error("FirebaseService: Error getting user profile:", error)
      throw error
    }
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      const currentUser = auth.currentUser
      if (!currentUser) {
        console.log("FirebaseService: No current user")
        return null
      }

      console.log("FirebaseService: Getting current user profile for", currentUser.email)
      return await this.getUserProfile(currentUser.uid)
    } catch (error) {
      console.error("FirebaseService: Error getting current user:", error)
      throw error
    }
  }

  async updateUserProfile(userId: string, data: Partial<User>): Promise<void> {
    try {
      console.log("FirebaseService: Updating user profile", userId)
      const userRef = doc(db, "users", userId)
      await updateDoc(userRef, {
        ...data,
        lastLoginAt: Timestamp.now(),
      })
      console.log("FirebaseService: User profile updated")
      return
    } catch (error) {
      console.error("FirebaseService: Error updating user profile:", error)
      throw error
    }
  }

  async signInOriginal(email: string, password: string): Promise<AppUser> {
    try {
      console.log(`FirebaseService: Signing in user ${email}`)
      const userCredential = await signInWithEmailAndPassword(this.authOriginal, email, password)
      const user = userCredential.user

      // Get user profile from Firestore
      const userDoc = await getDoc(doc(this.dbOriginal, "users", user.uid))
      if (userDoc.exists()) {
        const userData = userDoc.data()
        return {
          id: user.uid,
          uid: user.uid,
          email: user.email!,
          displayName: user.displayName || userData.displayName || "",
          photoURL: user.photoURL || userData.photoURL || "",
          userType: userData.userType || "user",
          createdAt: userData.createdAt?.toDate() || new Date(),
          lastLoginAt: userData.lastLoginAt?.toDate() || new Date(),
        }
      } else {
        // Create user profile if it doesn't exist
        const newUser: AppUser = {
          id: user.uid,
          uid: user.uid,
          email: user.email!,
          displayName: user.displayName || "",
          photoURL: user.photoURL || "",
          userType: "user",
          createdAt: new Date(),
          lastLoginAt: new Date(),
        }
        await this.createUserProfile(newUser)
        return newUser
      }
    } catch (error) {
      console.error("FirebaseService: Error signing in:", error)
      throw error
    }
  }

  async signUpOriginal(
    email: string,
    password: string,
    displayName: string,
    userType: "user" | "club_owner" = "user",
  ): Promise<AppUser> {
    try {
      console.log(`FirebaseService: Creating user ${email}`)
      const userCredential = await createUserWithEmailAndPassword(this.authOriginal, email, password)
      const user = userCredential.user

      // Update the user's display name
      await updateProfile(user, { displayName })

      // Create user profile in Firestore
      const newUser: AppUser = {
        id: user.uid,
        uid: user.uid,
        email: user.email!,
        displayName,
        photoURL: "",
        userType,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      await this.createUserProfile(newUser)
      return newUser
    } catch (error) {
      console.error("FirebaseService: Error creating user:", error)
      throw error
    }
  }

  async signOutOriginal(): Promise<void> {
    try {
      await signOut(this.authOriginal)
    } catch (error) {
      console.error("FirebaseService: Error signing out:", error)
      throw error
    }
  }

  onAuthStateChanged(callback: (user: AppUser | null) => void): () => void {
    return onAuthStateChanged(this.authOriginal, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(this.dbOriginal, "users", user.uid))
          if (userDoc.exists()) {
            const userData = userDoc.data()
            callback({
              id: user.uid,
              uid: user.uid,
              email: user.email!,
              displayName: user.displayName || userData.displayName || "",
              photoURL: user.photoURL || userData.photoURL || "",
              userType: userData.userType || "user",
              createdAt: userData.createdAt?.toDate() || new Date(),
              lastLoginAt: userData.lastLoginAt?.toDate() || new Date(),
            } as AppUser)
          } else {
            callback({
              id: user.uid,
              uid: user.uid,
              email: user.email!,
              displayName: user.displayName || "",
              photoURL: user.photoURL || "",
              userType: "user",
              createdAt: new Date(),
              lastLoginAt: new Date(),
            } as AppUser)
          }
        } catch (error) {
          console.error("Error getting user profile:", error)
          callback(null)
        }
      } else {
        callback(null)
      }
    })
  }

  async updateUserProfileOriginal(userId: string, updates: Partial<AppUser>): Promise<void> {
    try {
      const userRef = doc(this.dbOriginal, "users", userId)
      await updateDoc(userRef, updates)

      // Also update Firebase Auth profile if displayName or photoURL changed
      if (this.authOriginal.currentUser && (updates.displayName !== undefined || updates.photoURL !== undefined)) {
        const profileUpdates: { displayName?: string; photoURL?: string } = {}
        if (updates.displayName !== undefined) profileUpdates.displayName = updates.displayName
        if (updates.photoURL !== undefined) profileUpdates.photoURL = updates.photoURL
        await updateProfile(this.authOriginal.currentUser, profileUpdates)
      }
    } catch (error) {
      console.error("Error updating user profile:", error)
      throw error
    }
  }

  private async createUserProfile(user: AppUser): Promise<void> {
    try {
      await addDoc(collection(this.dbOriginal, "users"), {
        ...user,
        createdAt: serverTimestamp(),
      })
    } catch (error) {
      console.error("Error creating user profile:", error)
      throw error
    }
  }

  // Venue methods
  async getVenues(): Promise<Venue[]> {
    try {
      console.log("FirebaseService: Getting venues")

      // Try to get venues from Firestore first
      const venuesRef = collection(db, "venues")

      // Try without the isDeleted filter first to see if there are any venues at all
      const querySnapshot = await getDocs(venuesRef)
      console.log("FirebaseService: Total venues in database:", querySnapshot.size)

      if (querySnapshot.empty) {
        console.log("FirebaseService: No venues found in database, returning mock data for development")
        return this.getMockVenues()
      }

      // Now filter for non-deleted venues
      const venues: Venue[] = []
      querySnapshot.forEach((doc) => {
        const data = doc.data()

        // Only include non-deleted venues (or venues without isDeleted field for backward compatibility)
        if (!data.isDeleted) {
          venues.push({
            id: doc.id,
            name: data.name,
            location: data.location,
            description: data.description,
            backgroundImageUrl: data.backgroundImageUrl,
            categories: data.categories,
            vibeRating: data.vibeRating,
            todayImages: data.todayImages || [],
            latitude: data.latitude,
            longitude: data.longitude,
            weeklyPrograms: data.weeklyPrograms || {},
            ownerId: data.ownerId,
            createdAt: data.createdAt.toDate(),
            venueType: data.venueType || "nightlife",
          })
        }
      })

      console.log("FirebaseService: Found", venues.length, "active venues")

      if (venues.length === 0) {
        console.log("FirebaseService: All venues are deleted, returning mock data for development")
        return this.getMockVenues()
      }

      return venues
    } catch (error) {
      console.error("FirebaseService: Error getting venues:", error)
      console.log("FirebaseService: Falling back to mock data due to error")
      return this.getMockVenues()
    }
  }

  // Mock data for development/testing
  private getMockVenues(): Venue[] {
    return [
      {
        id: "venue1",
        name: "Club Neon",
        location: "123 Main St, Downtown",
        description: "The hottest nightclub in town with amazing DJs and dance floors.",
        backgroundImageUrl:
          "https://images.unsplash.com/photo-1566737236500-c8ac43014a67?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80",
        categories: ["Nightclub", "Dance", "EDM"],
        vibeRating: 4.8,
        latitude: 40.7128,
        longitude: -74.006,
        weeklyPrograms: {
          Monday: "Closed",
          Tuesday: "Techno Tuesday with DJ Max",
          Wednesday: "Ladies Night - Free entry for ladies",
          Thursday: "Throwback Thursday - 90s and 00s hits",
          Friday: "International DJs and VIP tables",
          Saturday: "Club Neon Signature Night",
          Sunday: "Sunday Chill Sessions",
        },
        ownerId: "owner1",
        createdAt: new Date(),
        venueType: "nightlife",
      },
      {
        id: "venue2",
        name: "Jazz & Whiskey",
        location: "456 Oak Ave, Midtown",
        description: "Sophisticated jazz bar with premium whiskey selection and live performances.",
        backgroundImageUrl:
          "https://images.unsplash.com/photo-1514933651103-005eec06c04b?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80",
        categories: ["Jazz", "Bar", "Live Music"],
        vibeRating: 4.5,
        latitude: 40.7308,
        longitude: -73.9973,
        weeklyPrograms: {
          Monday: "Closed",
          Tuesday: "Amateur Jazz Night",
          Wednesday: "Whiskey Tasting Event",
          Thursday: "Classic Jazz Quartet",
          Friday: "Featured Artist Performance",
          Saturday: "Premium Jazz Experience",
          Sunday: "Sunday Blues & Soul",
        },
        ownerId: "owner2",
        createdAt: new Date(),
        venueType: "nightlife",
      },
      {
        id: "venue3",
        name: "Fitness Plus Center",
        location: "789 Health Dr, Uptown",
        description: "Modern fitness center with state-of-the-art equipment and group classes.",
        backgroundImageUrl:
          "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80",
        categories: ["Fitness", "Recreation", "Sports"],
        vibeRating: 4.7,
        latitude: 40.758,
        longitude: -73.9855,
        weeklyPrograms: {
          Monday: "Morning Yoga & Evening Cardio",
          Tuesday: "Strength Training & Pilates",
          Wednesday: "Zumba & CrossFit",
          Thursday: "Swimming & Aqua Aerobics",
          Friday: "HIIT & Spinning",
          Saturday: "Group Classes & Personal Training",
          Sunday: "Relaxation & Stretching",
        },
        ownerId: "owner3",
        createdAt: new Date(),
        venueType: "recreation",
      },
    ]
  }

  async createVenue(venue: Omit<Venue, "id">): Promise<string> {
    try {
      const docRef = await addDoc(collection(this.dbOriginal, "venues"), {
        ...venue,
        createdAt: serverTimestamp(),
      })
      return docRef.id
    } catch (error) {
      console.error("Error creating venue:", error)
      throw error
    }
  }

  async getVenuesOriginal(): Promise<Venue[]> {
    try {
      const querySnapshot = await getDocs(collection(this.dbOriginal, "venues"))
      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Venue[]
    } catch (error) {
      console.error("Error getting venues:", error)
      throw error
    }
  }

  async getVenueById(venueId: string): Promise<Venue | null> {
    try {
      // Add validation for venueId
      if (!venueId || typeof venueId !== "string" || venueId.trim() === "") {
        console.error("FirebaseService: Invalid venueId provided:", venueId)
        return null
      }

      const venueRef = doc(db, "venues", venueId.trim())
      const venueDoc = await getDoc(venueRef)

      if (!venueDoc.exists()) {
        return null
      }

      const data = venueDoc.data()

      // Check if venue is deleted
      if (data.isDeleted) {
        return null
      }

      return {
        id: venueDoc.id,
        name: data.name,
        location: data.location,
        description: data.description,
        backgroundImageUrl: data.backgroundImageUrl,
        categories: data.categories,
        vibeRating: data.vibeRating,
        todayImages: data.todayImages || [],
        latitude: data.latitude,
        longitude: data.longitude,
        weeklyPrograms: data.weeklyPrograms || {},
        ownerId: data.ownerId,
        createdAt: data.createdAt.toDate(),
        venueType: data.venueType || "nightlife",
      }
    } catch (error) {
      console.error("Error getting venue by ID:", error)
      throw error
    }
  }

  async updateVenue(venueId: string, updates: Partial<Venue>): Promise<void> {
    try {
      const venueRef = doc(db, "venues", venueId)
      await updateDoc(venueRef, updates)
      return
    } catch (error) {
      console.error("Error updating venue:", error)
      throw error
    }
  }

  async deleteVenueOriginal(venueId: string): Promise<void> {
    try {
      await deleteDoc(doc(this.dbOriginal, "venues", venueId))
    } catch (error) {
      console.error("Error deleting venue:", error)
      throw error
    }
  }

  async getVenuesByOwner(ownerId: string): Promise<Venue[]> {
    try {
      const venuesRef = collection(db, "venues")
      const q = query(venuesRef, where("ownerId", "==", ownerId))
      const querySnapshot = await getDocs(q)
      const venues: Venue[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        // Only include non-deleted venues
        if (!data.isDeleted) {
          venues.push({
            id: doc.id,
            name: data.name,
            location: data.location,
            description: data.description,
            backgroundImageUrl: data.backgroundImageUrl,
            categories: data.categories,
            vibeRating: data.vibeRating,
            todayImages: data.todayImages || [],
            latitude: data.latitude,
            longitude: data.longitude,
            weeklyPrograms: data.weeklyPrograms || {},
            ownerId: data.ownerId,
            createdAt: data.createdAt.toDate(),
            venueType: data.venueType || "nightlife",
          })
        }
      })

      return venues
    } catch (error) {
      console.error("Error getting venues by owner:", error)
      throw error
    }
  }

  // Event methods
  async createEvent(event: Omit<Event, "id">): Promise<string> {
    try {
      const docRef = await addDoc(collection(this.dbOriginal, "events"), {
        ...event,
        createdAt: serverTimestamp(),
      })
      return docRef.id
    } catch (error) {
      console.error("Error creating event:", error)
      throw error
    }
  }

  async getEvents(): Promise<Event[]> {
    try {
      console.log("FirebaseService: Getting events")

      try {
        const eventsRef = collection(db, "events")
        const querySnapshot = await getDocs(eventsRef)
        const events: Event[] = []

        querySnapshot.forEach((doc) => {
          const data = doc.data()

          // Only include non-deleted events
          if (!data.isDeleted) {
            const eventDate = data.date && data.date.toDate ? data.date.toDate() : new Date(data.date)

            // Only include future events
            if (eventDate >= new Date()) {
              events.push({
                id: doc.id,
                name: data.name,
                venueId: data.venueId,
                venueName: data.venueName,
                description: data.description,
                date: eventDate,
                posterImageUrl: data.posterImageUrl,
                artists: data.artists,
                isFeatured: data.isFeatured,
                location: data.location,
                priceIndicator: data.priceIndicator || 1,
                entryFee: data.entryFee,
                attendees: data.attendees || [],
                createdAt: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : new Date(),
                createdBy: data.createdBy,
                createdByType: data.createdByType,
                ticketTypes: data.ticketTypes || getDefaultTicketTypes(parseEntryFee(data.entryFee)),
                paymentAccounts: data.paymentAccounts || [],
                totalRevenue: data.totalRevenue || 0,
                appCommission: data.appCommission || 0,
                netRevenue: data.netRevenue || 0,
              })
            }
          }
        })

        console.log("FirebaseService: Found", events.length, "events")

        // Sort events by date (closest to today first)
        const sortedEvents = events.sort((a, b) => {
          return a.date.getTime() - b.date.getTime()
        })

        return sortedEvents
      } catch (error) {
        console.error("Error getting events from Firestore:", error)
        return []
      }
    } catch (error) {
      console.error("Error getting events:", error)
      throw error
    }
  }

  async getEventByIdOriginal(eventId: string): Promise<Event | null> {
    try {
      const docRef = doc(this.dbOriginal, "events", eventId)
      const docSnap = await getDoc(docRef)

      if (docSnap.exists()) {
        const data = docSnap.data()
        return {
          id: docSnap.id,
          ...data,
          date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
        } as Event
      } else {
        return null
      }
    } catch (error) {
      console.error("Error getting event:", error)
      throw error
    }
  }

  async updateEvent(eventId: string, updates: Partial<Event>): Promise<void> {
    try {
      const eventRef = doc(db, "events", eventId)
      await updateDoc(eventRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      })
    } catch (error) {
      console.error("Error updating event:", error)
      throw error
    }
  }

  async deleteEvent(eventId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, "events", eventId))
    } catch (error) {
      console.error("Error deleting event:", error)
      throw error
    }
  }

  async getEventsByVenue(venueId: string): Promise<Event[]> {
    try {
      const q = query(collection(db, "events"), where("venueId", "==", venueId))
      const querySnapshot = await getDocs(q)
      return querySnapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          ...data,
          date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
        }
      }) as Event[]
    } catch (error) {
      console.error("Error getting events by venue:", error)
      throw error
    }
  }

  async getFeaturedEvents(): Promise<Event[]> {
    try {
      const eventsRef = collection(db, "events")
      const q = query(eventsRef, where("isFeatured", "==", true))
      const querySnapshot = await getDocs(q)
      const events: Event[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()

        // Only include non-deleted events
        if (!data.isDeleted) {
          const eventDate = data.date.toDate()

          // Only include future events
          if (eventDate >= new Date()) {
            events.push({
              id: doc.id,
              name: data.name,
              venueId: data.venueId,
              venueName: data.venueName,
              description: data.description,
              date: eventDate,
              posterImageUrl: data.posterImageUrl,
              artists: data.artists,
              isFeatured: data.isFeatured,
              location: data.location,
              priceIndicator: data.priceIndicator || 1,
              entryFee: data.entryFee,
              attendees: data.attendees || [],
              createdAt: data.createdAt.toDate(),
              createdBy: data.createdBy,
              createdByType: data.createdByType,
              ticketTypes: data.ticketTypes || getDefaultTicketTypes(parseEntryFee(data.entryFee)),
              paymentAccounts: data.paymentAccounts || [],
              totalRevenue: data.totalRevenue || 0,
              appCommission: data.appCommission || 0,
              netRevenue: data.netRevenue || 0,
            })
          }
        }
      })

      return events
    } catch (error) {
      console.error("Error getting featured events:", error)
      return []
    }
  }

  async deleteEventsByVenueOriginal(venueId: string): Promise<void> {
    try {
      const q = query(collection(this.dbOriginal, "events"), where("venueId", "==", venueId))
      const querySnapshot = await getDocs(q)
      const batch = writeBatch(this.dbOriginal)

      querySnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref)
      })

      await batch.commit()
    } catch (error) {
      console.error("Error deleting events by venue:", error)
      throw error
    }
  }

  async deletePastEventsOriginal(): Promise<void> {
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const q = query(collection(this.dbOriginal, "events"))
      const querySnapshot = await getDocs(q)
      const batch = writeBatch(this.dbOriginal)

      querySnapshot.docs.forEach((doc) => {
        const data = doc.data()
        const eventDate = data.date?.toDate ? data.date.toDate() : new Date(data.date)

        if (eventDate < today) {
          batch.delete(doc.ref)
        }
      })

      await batch.commit()
    } catch (error) {
      console.error("Error deleting past events:", error)
      throw error
    }
  }

  // Storage methods
  async uploadVenueImage(imageUri: string): Promise<string> {
    try {
      const response = await fetch(imageUri)
      const blob = await response.blob()
      const filename = `venues/${Date.now()}-${Math.random().toString(36).substring(7)}`
      const storageRef = ref(this.storageOriginal, filename)
      await uploadBytes(storageRef, blob)
      return await getDownloadURL(storageRef)
    } catch (error) {
      console.error("Error uploading venue image:", error)
      throw error
    }
  }

  async uploadEventImage(imageUri: string): Promise<string> {
    try {
      const response = await fetch(imageUri)
      const blob = await response.blob()
      const filename = `events/${Date.now()}-${Math.random().toString(36).substring(7)}`
      const storageRef = ref(this.storageOriginal, filename)
      await uploadBytes(storageRef, blob)
      return await getDownloadURL(storageRef)
    } catch (error) {
      console.error("Error uploading event image:", error)
      throw error
    }
  }

  async uploadVibeImage(imageUri: string): Promise<string> {
    try {
      const response = await fetch(imageUri)
      const blob = await response.blob()
      const filename = `vibes/${Date.now()}-${Math.random().toString(36).substring(7)}`
      const storageRef = ref(this.storageOriginal, filename)
      await uploadBytes(storageRef, blob)
      return await getDownloadURL(storageRef)
    } catch (error) {
      console.error("Error uploading vibe image:", error)
      throw error
    }
  }

  // User management methods
  async getUsers(): Promise<AppUser[]> {
    try {
      const querySnapshot = await getDocs(collection(this.dbOriginal, "users"))
      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as AppUser[]
    } catch (error) {
      console.error("Error getting users:", error)
      throw error
    }
  }

  async deleteUserOriginal(userId: string): Promise<void> {
    try {
      await deleteDoc(doc(this.dbOriginal, "users", userId))
    } catch (error) {
      console.error("Error deleting user:", error)
      throw error
    }
  }

  // Vibe methods
  async saveVibeImage(vibeImage: Omit<VibeImage, "id">): Promise<string> {
    try {
      const docRef = await addDoc(collection(this.dbOriginal, "vibeImages"), {
        ...vibeImage,
        createdAt: serverTimestamp(),
      })
      return docRef.id
    } catch (error) {
      console.error("Error saving vibe image:", error)
      throw error
    }
  }

  async getVibeImagesByVenueAndDateOriginal(venueId: string, date: Date): Promise<VibeImage[]> {
    try {
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)

      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      const q = query(
        collection(this.dbOriginal, "vibeImages"),
        where("venueId", "==", venueId),
        where("createdAt", ">=", startOfDay),
        where("createdAt", "<=", endOfDay),
        orderBy("createdAt", "desc"),
      )

      const querySnapshot = await getDocs(q)
      return querySnapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          venueId: data.venueId,
          imageUrl: data.imageUrl,
          vibeRating: data.vibeRating,
          uploadedAt: data.createdAt?.toDate() || new Date(),
          uploadedBy: data.uploadedBy,
        }
      }) as VibeImage[]
    } catch (error) {
      console.error("Error getting vibe images by venue and date:", error)
      throw error
    }
  }

  async getVibeImagesByVenueAndWeekOriginal(venueId: string, startDate: Date): Promise<VibeImage[]> {
    try {
      const endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 7)

      const q = query(
        collection(this.dbOriginal, "vibeImages"),
        where("venueId", "==", venueId),
        where("createdAt", ">=", startDate),
        where("createdAt", "<=", endDate),
        orderBy("createdAt", "desc"),
      )

      const querySnapshot = await getDocs(q)
      return querySnapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          venueId: data.venueId,
          imageUrl: data.imageUrl,
          vibeRating: data.vibeRating,
          uploadedAt: data.createdAt?.toDate() || new Date(),
          uploadedBy: data.uploadedBy,
        }
      }) as VibeImage[]
    } catch (error) {
      console.error("Error getting vibe images by venue and week:", error)
      throw error
    }
  }

  async saveVibeRating(venueId: string, rating: number): Promise<void> {
    try {
      await addDoc(collection(this.dbOriginal, "vibeRatings"), {
        venueId,
        rating,
        createdAt: serverTimestamp(),
      })
    } catch (error) {
      console.error("Error saving vibe rating:", error)
      throw error
    }
  }

  async getLatestVibeRating(venueId: string): Promise<number | null> {
    try {
      console.log("FirebaseService: Getting latest vibe rating for venue", venueId)

      // Query for the latest vibe rating for this venue
      const vibeRatingsRef = collection(db, "vibeRatings")
      const q = query(vibeRatingsRef, where("venueId", "==", venueId), orderBy("createdAt", "desc"), limit(1))

      const querySnapshot = await getDocs(q)

      if (querySnapshot.empty) {
        console.log("FirebaseService: No vibe ratings found for venue", venueId)
        return null
      }

      const latestRating = querySnapshot.docs[0].data()
      console.log("FirebaseService: Latest vibe rating found:", latestRating.rating)

      return latestRating.rating || null
    } catch (error) {
      console.error("Error getting latest vibe rating:", error)
      // Return a fallback rating instead of throwing
      return Math.random() * 5
    }
  }

  // Ticket methods
  async saveTicketOriginal(ticket: Omit<Ticket, "id">): Promise<string> {
    try {
      const docRef = await addDoc(collection(this.dbOriginal, "tickets"), {
        ...ticket,
        createdAt: serverTimestamp(),
      })
      return docRef.id
    } catch (error) {
      console.error("Error saving ticket:", error)
      throw error
    }
  }

  async getTicketByIdOriginal(ticketId: string): Promise<Ticket | null> {
    try {
      const docRef = doc(this.dbOriginal, "tickets", ticketId)
      const docSnap = await getDoc(docRef)

      if (docSnap.exists()) {
        const data = docSnap.data()
        return {
          id: docSnap.id,
          ...data,
          purchaseDate: data.purchaseDate?.toDate() || new Date(),
        } as Ticket
      } else {
        return null
      }
    } catch (error) {
      console.error("Error getting ticket:", error)
      throw error
    }
  }

  async getTicketsByEventOriginal(eventId: string): Promise<Ticket[]> {
    try {
      const q = query(collection(this.dbOriginal, "tickets"), where("eventId", "==", eventId))
      const querySnapshot = await getDocs(q)
      return querySnapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          ...data,
          purchaseDate: data.purchaseDate?.toDate() || new Date(),
        }
      }) as Ticket[]
    } catch (error) {
      console.error("Error getting tickets by event:", error)
      throw error
    }
  }

  async getTicketsByUserOriginal(userId: string): Promise<Ticket[]> {
    try {
      const q = query(collection(this.dbOriginal, "tickets"), where("buyerId", "==", userId))
      const querySnapshot = await getDocs(q)
      return querySnapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          ...data,
          purchaseDate: data.purchaseDate?.toDate() || new Date(),
        }
      }) as Ticket[]
    } catch (error) {
      console.error("Error getting tickets by user:", error)
      throw error
    }
  }

  async updateTicketOriginal(ticketId: string, updates: Partial<Ticket>): Promise<void> {
    try {
      const ticketRef = doc(this.dbOriginal, "tickets", ticketId)
      await updateDoc(ticketRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      })
    } catch (error) {
      console.error("Error updating ticket:", error)
      throw error
    }
  }

  async saveTicketValidationOriginal(validation: {
    ticketId: string
    eventId: string
    validatedBy: string
    validatedAt: Date
    biometricData?: string
  }): Promise<void> {
    try {
      await addDoc(collection(this.dbOriginal, "ticketValidations"), {
        ...validation,
        createdAt: serverTimestamp(),
      })
    } catch (error) {
      console.error("Error saving ticket validation:", error)
      throw error
    }
  }

  async addVenue(venueData: Omit<Venue, "id">): Promise<string> {
    try {
      const venueRef = await addDoc(collection(db, "venues"), {
        ...venueData,
        createdAt: Timestamp.fromDate(venueData.createdAt),
        isDeleted: false,
      })

      return venueRef.id
    } catch (error) {
      console.error("Error adding venue:", error)
      throw error
    }
  }

  async updateVenuePrograms(venueId: string, programs: Record<string, string>): Promise<void> {
    try {
      const venueRef = doc(db, "venues", venueId)
      await updateDoc(venueRef, { weeklyPrograms: programs })
      return
    } catch (error) {
      console.error("Error updating venue programs:", error)
      throw error
    }
  }

  // Soft delete venue (mark as deleted)
  async deleteVenue(venueId: string): Promise<void> {
    try {
      console.log("FirebaseService: Soft deleting venue", venueId)
      const venueRef = doc(db, "venues", venueId)
      await updateDoc(venueRef, {
        isDeleted: true,
        deletedAt: Timestamp.now(),
      })
      console.log("FirebaseService: Venue soft deleted successfully")
      return
    } catch (error) {
      console.error("Error soft deleting venue:", error)
      throw error
    }
  }

  // Restore deleted venue
  async restoreVenue(venueId: string): Promise<void> {
    try {
      console.log("FirebaseService: Restoring venue", venueId)
      const venueRef = doc(db, "venues", venueId)
      await updateDoc(venueRef, {
        isDeleted: false,
        deletedAt: null,
      })
      console.log("FirebaseService: Venue restored successfully")
      return
    } catch (error) {
      console.error("Error restoring venue:", error)
      throw error
    }
  }

  // Get deleted venues (admin only)
  async getDeletedVenues(): Promise<Venue[]> {
    try {
      console.log("FirebaseService: Getting deleted venues")
      const venuesRef = collection(db, "venues")
      const q = query(venuesRef, where("isDeleted", "==", true))
      const querySnapshot = await getDocs(q)
      const venues: Venue[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        venues.push({
          id: doc.id,
          name: data.name,
          location: data.location,
          description: data.description,
          backgroundImageUrl: data.backgroundImageUrl,
          categories: data.categories,
          vibeRating: data.vibeRating,
          todayImages: data.todayImages || [],
          latitude: data.latitude,
          longitude: data.longitude,
          weeklyPrograms: data.weeklyPrograms || {},
          ownerId: data.ownerId,
          createdAt: data.createdAt.toDate(),
          venueType: data.venueType || "nightlife",
        })
      })

      console.log("FirebaseService: Found", venues.length, "deleted venues")
      return venues
    } catch (error) {
      console.error("Error getting deleted venues:", error)
      throw error
    }
  }

  async getEventById(eventId: string): Promise<Event | null> {
    try {
      // Add validation for eventId
      if (!eventId || typeof eventId !== "string" || eventId.trim() === "") {
        console.error("FirebaseService: Invalid eventId provided:", eventId)
        return null
      }

      const eventRef = doc(db, "events", eventId.trim())
      const eventDoc = await getDoc(eventRef)

      if (!eventDoc.exists()) {
        return null
      }

      const data = eventDoc.data()

      // Check if event is deleted
      if (data.isDeleted) {
        return null
      }

      return {
        id: eventDoc.id,
        name: data.name,
        venueId: data.venueId,
        venueName: data.venueName,
        description: data.description,
        date: data.date.toDate(),
        posterImageUrl: data.posterImageUrl,
        artists: data.artists,
        isFeatured: data.isFeatured,
        location: data.location,
        priceIndicator: data.priceIndicator || 1,
        entryFee: data.entryFee,
        attendees: data.attendees || [],
        createdAt: data.createdAt.toDate(),
        createdBy: data.createdBy,
        createdByType: data.createdByType,
        
        paymentAccounts: data.paymentAccounts || [],
        totalRevenue: data.totalRevenue || 0,
        appCommission: data.appCommission || 0,
        netRevenue: data.netRevenue || 0,
      }
    } catch (error) {
      console.error("Error getting event by ID:", error)
      return null
    }
  }

  async addEvent(eventData: Omit<Event, "id">): Promise<string> {
    try {
      // Create a Firestore-compatible object with type assertion
      const firestoreEventData = {
        name: eventData.name,
        venueId: eventData.venueId,
        venueName: eventData.venueName,
        description: eventData.description,
        date: Timestamp.fromDate(eventData.date),
        posterImageUrl: eventData.posterImageUrl,
        artists: eventData.artists,
        isFeatured: eventData.isFeatured,
        location: eventData.location,
        priceIndicator: eventData.priceIndicator,
        entryFee: eventData.entryFee,
        attendees: eventData.attendees || [],
        createdAt: Timestamp.now(),
        createdBy: eventData.createdBy,
        createdByType: eventData.createdByType,

        isDeleted: false,
      }

      const eventRef = await addDoc(collection(db, "events"), firestoreEventData)
      return eventRef.id
    } catch (error) {
      console.error("Error adding event:", error)
      throw error
    }
  }

  // Add these methods after the existing methods, before the export statement

  async deletePastEvents(): Promise<void> {
    try {
      console.log("FirebaseService: Deleting past events")
      const eventsRef = collection(db, "events")
      const querySnapshot = await getDocs(eventsRef)
      const now = new Date()

      const deletePromises: Promise<void>[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        const eventDate = data.date.toDate()

        // Mark past events as deleted instead of actually deleting them
        if (eventDate < now && !data.isDeleted) {
          const eventRef = doc.ref
          deletePromises.push(
            updateDoc(eventRef, {
              isDeleted: true,
              deletedAt: Timestamp.now(),
            }),
          )
        }
      })

      await Promise.all(deletePromises)
      console.log("FirebaseService: Past events marked as deleted")
    } catch (error) {
      console.error("Error deleting past events:", error)
      // Don't throw error, just log it
    }
  }

  async getVibeImagesByVenueAndDate(venueId: string, date: Date): Promise<VibeImage[]> {
    try {
      console.log("FirebaseService: Getting vibe images for venue", venueId, "on", date.toDateString())

      // Create date range for the day
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)

      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      const vibeImagesRef = collection(db, "vibeImages")
      const q = query(
        vibeImagesRef,
        where("venueId", "==", venueId),
        where("uploadedAt", ">=", Timestamp.fromDate(startOfDay)),
        where("uploadedAt", "<=", Timestamp.fromDate(endOfDay)),
      )

      const querySnapshot = await getDocs(q)
      const vibeImages: VibeImage[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        vibeImages.push({
          id: doc.id,
          venueId: data.venueId,
          imageUrl: data.imageUrl,
          vibeRating: data.vibeRating || Math.random() * 5, // Fallback rating
          uploadedAt: data.uploadedAt.toDate(),
          uploadedBy: data.uploadedBy,
        })
      })

      console.log("FirebaseService: Found", vibeImages.length, "vibe images for today")
      return vibeImages
    } catch (error) {
      console.error("Error getting vibe images by venue and date:", error)
      // Return empty array instead of throwing
      return []
    }
  }

  async getVibeImagesByVenueAndWeek(venueId: string): Promise<Record<string, VibeImage[]>> {
    try {
      console.log("FirebaseService: Getting vibe images for venue", venueId, "for the week")

      // Get the last 7 days
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 7)

      const vibeImagesRef = collection(db, "vibeImages")
      const q = query(
        vibeImagesRef,
        where("venueId", "==", venueId),
        where("uploadedAt", ">=", Timestamp.fromDate(startDate)),
        where("uploadedAt", "<=", Timestamp.fromDate(endDate)),
      )

      const querySnapshot = await getDocs(q)
      const weekData: Record<string, VibeImage[]> = {}

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        const uploadDate = data.uploadedAt.toDate()
        const dateKey = uploadDate.toDateString()

        if (!weekData[dateKey]) {
          weekData[dateKey] = []
        }

        weekData[dateKey].push({
          id: doc.id,
          venueId: data.venueId,
          imageUrl: data.imageUrl,
          vibeRating: data.vibeRating || Math.random() * 5, // Fallback rating
          uploadedAt: uploadDate,
          uploadedBy: data.uploadedBy,
        })
      })

      console.log("FirebaseService: Found vibe images for", Object.keys(weekData).length, "days")
      return weekData
    } catch (error) {
      console.error("Error getting vibe images by venue and week:", error)
      // Return empty object instead of throwing
      return {}
    }
  }

  // Enhanced Ticket methods with proper null handling
  async saveTicket(ticket: Ticket): Promise<void> {
    try {
      console.log("FirebaseService: Saving ticket", ticket.id)

      // Clean the ticket data to remove undefined values
      const cleanTicketData = {
        id: ticket.id,
        eventId: ticket.eventId,
        eventName: ticket.eventName,
        eventPosterUrl: ticket.eventPosterUrl || null,
        buyerId: ticket.buyerId,
        buyerName: ticket.buyerName,
        buyerEmail: ticket.buyerEmail,
        buyerPhone: ticket.buyerPhone || null, // Convert undefined to null
        buyerImageUrl: ticket.buyerImageUrl || null,
        quantity: ticket.quantity,
        ticketType: ticket.ticketType,
        ticketTypeName: ticket.ticketTypeName,
        pricePerTicket: ticket.pricePerTicket,
        totalAmount: ticket.totalAmount,
        paymentFees: ticket.paymentFees,
        appCommission: ticket.appCommission,
        sellerRevenue: ticket.sellerRevenue,
        paymentMethod: ticket.paymentMethod,
        paymentReference: ticket.paymentReference || null,
        paymentAccount: ticket.paymentAccount || null,
        qrCode: ticket.qrCode,
        qrData: ticket.qrData || null,
        status: ticket.status,
        purchaseDate: Timestamp.fromDate(ticket.purchaseDate),
        validationHistory: ticket.validationHistory || [],
        isVerified: ticket.isVerified,
        createdAt: Timestamp.fromDate(ticket.createdAt),
        updatedAt: Timestamp.fromDate(ticket.updatedAt),
      }

      await addDoc(collection(db, "tickets"), cleanTicketData)
      console.log("FirebaseService: Ticket saved successfully")
    } catch (error) {
      console.error("Error saving ticket:", error)
      throw error
    }
  }

  async getTicketById(ticketId: string): Promise<Ticket | null> {
    try {
      const ticketRef = doc(db, "tickets", ticketId)
      const ticketDoc = await getDoc(ticketRef)

      if (!ticketDoc.exists()) {
        return null
      }

      const data = ticketDoc.data()
      return {
        id: ticketDoc.id,
        eventId: data.eventId,
        eventName: data.eventName,
        eventPosterUrl: data.eventPosterUrl,
        buyerId: data.buyerId,
        buyerName: data.buyerName,
        buyerEmail: data.buyerEmail,
        buyerPhone: data.buyerPhone,
        buyerImageUrl: data.buyerImageUrl,
        quantity: data.quantity,
        ticketType: data.ticketType,
        ticketTypeName: data.ticketTypeName,
        pricePerTicket: data.pricePerTicket,
        totalAmount: data.totalAmount,
        paymentFees: data.paymentFees,
        appCommission: data.appCommission,
        sellerRevenue: data.sellerRevenue,
        paymentMethod: data.paymentMethod,
        paymentReference: data.paymentReference,
        paymentAccount: data.paymentAccount,
        qrCode: data.qrCode,
        qrData: data.qrData,
        status: data.status,
        purchaseDate: data.purchaseDate.toDate(),
        validationHistory: data.validationHistory || [],
        isVerified: data.isVerified,
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
      }
    } catch (error) {
      console.error("Error getting ticket by ID:", error)
      throw error
    }
  }

  async getTicketsByEvent(eventId: string): Promise<Ticket[]> {
    try {
      console.log("FirebaseService: Getting tickets for event", eventId)
      const ticketsRef = collection(db, "tickets")
      const q = query(ticketsRef, where("eventId", "==", eventId))
      const querySnapshot = await getDocs(q)
      const tickets: Ticket[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        tickets.push({
          id: doc.id,
          eventId: data.eventId,
          eventName: data.eventName,
          eventPosterUrl: data.eventPosterUrl,
          buyerId: data.buyerId,
          buyerName: data.buyerName,
          buyerEmail: data.buyerEmail,
          buyerPhone: data.buyerPhone,
          buyerImageUrl: data.buyerImageUrl,
          quantity: data.quantity,
          ticketType: data.ticketType,
          ticketTypeName: data.ticketTypeName,
          pricePerTicket: data.pricePerTicket,
          totalAmount: data.totalAmount,
          paymentFees: data.paymentFees,
          appCommission: data.appCommission,
          sellerRevenue: data.sellerRevenue,
          paymentMethod: data.paymentMethod,
          paymentReference: data.paymentReference,
          paymentAccount: data.paymentAccount,
          qrCode: data.qrCode,
          qrData: data.qrData,
          status: data.status,
          purchaseDate: data.purchaseDate.toDate(),
          validationHistory: data.validationHistory || [],
          isVerified: data.isVerified,
          createdAt: data.createdAt.toDate(),
          updatedAt: data.updatedAt.toDate(),
        })
      })

      console.log("FirebaseService: Found", tickets.length, "tickets for event")
      return tickets
    } catch (error) {
      console.error("Error getting tickets by event:", error)
      throw error
    }
  }

  async getTicketsByUser(userId: string): Promise<Ticket[]> {
    try {
      console.log("FirebaseService: Getting tickets for user", userId)
      const ticketsRef = collection(db, "tickets")
      const q = query(ticketsRef, where("buyerId", "==", userId))
      const querySnapshot = await getDocs(q)
      const tickets: Ticket[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        tickets.push({
          id: doc.id,
          eventId: data.eventId,
          eventName: data.eventName,
          eventPosterUrl: data.eventPosterUrl,
          buyerId: data.buyerId,
          buyerName: data.buyerName,
          buyerEmail: data.buyerEmail,
          buyerPhone: data.buyerPhone,
          buyerImageUrl: data.buyerImageUrl,
          quantity: data.quantity,
          ticketType: data.ticketType,
          ticketTypeName: data.ticketTypeName,
          pricePerTicket: data.pricePerTicket,
          totalAmount: data.totalAmount,
          paymentFees: data.paymentFees,
          appCommission: data.appCommission,
          sellerRevenue: data.sellerRevenue,
          paymentMethod: data.paymentMethod,
          paymentReference: data.paymentReference,
          paymentAccount: data.paymentAccount,
          qrCode: data.qrCode,
          qrData: data.qrData,
          status: data.status,
          purchaseDate: data.purchaseDate.toDate(),
          validationHistory: data.validationHistory || [],
          isVerified: data.isVerified,
          createdAt: data.createdAt.toDate(),
          updatedAt: data.updatedAt.toDate(),
        })
      })

      console.log("FirebaseService: Found", tickets.length, "tickets for user")
      return tickets
    } catch (error) {
      console.error("Error getting tickets by user:", error)
      throw error
    }
  }

  async updateTicket(ticketId: string, data: Partial<Ticket>): Promise<void> {
    try {
      console.log("FirebaseService: Updating ticket", ticketId)
      const ticketRef = doc(db, "tickets", ticketId)

      // Clean the update data to handle undefined values
      const cleanUpdateData: any = {}
      Object.keys(data).forEach((key) => {
        const value = (data as any)[key]
        if (value !== undefined) {
          cleanUpdateData[key] = value
        }
      })

      // Always update the updatedAt timestamp
      cleanUpdateData.updatedAt = Timestamp.now()

      await updateDoc(ticketRef, cleanUpdateData)
      console.log("FirebaseService: Ticket updated successfully")
    } catch (error) {
      console.error("Error updating ticket:", error)
      throw error
    }
  }

  async saveTicketValidation(validation: TicketValidation): Promise<void> {
    try {
      console.log("FirebaseService: Saving ticket validation", validation.id)
      await addDoc(collection(db, "ticketValidations"), {
        ...validation,
        validatedAt: Timestamp.fromDate(validation.validatedAt),
      })
      console.log("FirebaseService: Ticket validation saved successfully")
    } catch (error) {
      console.error("Error saving ticket validation:", error)
      throw error
    }
  }

  async savePaymentConfirmation(confirmation: PaymentConfirmation): Promise<void> {
    try {
      console.log("FirebaseService: Saving payment confirmation")
      await addDoc(collection(db, "paymentConfirmations"), {
        ...confirmation,
        timestamp: Timestamp.fromDate(confirmation.timestamp),
      })
      console.log("FirebaseService: Payment confirmation saved successfully")
    } catch (error) {
      console.error("Error saving payment confirmation:", error)
      throw error
    }
  }

  async addVibeImage(vibeImageData: Omit<VibeImage, "id">): Promise<string> {
    try {
      console.log("FirebaseService: Adding vibe image")

      // Ensure the vibeImageData has the correct structure
      const firestoreVibeData = {
        venueId: vibeImageData.venueId,
        imageUrl: vibeImageData.imageUrl,
        vibeRating: vibeImageData.vibeRating,
        uploadedAt: Timestamp.fromDate(vibeImageData.uploadedAt),
        uploadedBy: vibeImageData.uploadedBy,
      }

      const vibeImageRef = await addDoc(collection(db, "vibeImages"), firestoreVibeData)

      // Update venue's vibe rating based on this new image
      if (vibeImageData.vibeRating) {
        await this.updateVenueVibeRating(vibeImageData.venueId, vibeImageData.vibeRating)
      }

      console.log("FirebaseService: Vibe image added successfully")
      return vibeImageRef.id
    } catch (error) {
      console.error("Error adding vibe image:", error)
      throw error
    }
  }

  private async updateVenueVibeRating(venueId: string, newRating: number): Promise<void> {
    try {
      // Get recent vibe images for this venue to calculate average
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 7) // Last 7 days

      const vibeImagesRef = collection(db, "vibeImages")
      const q = query(
        vibeImagesRef,
        where("venueId", "==", venueId),
        where("uploadedAt", ">=", Timestamp.fromDate(startDate)),
        where("uploadedAt", "<=", Timestamp.fromDate(endDate)),
      )

      const querySnapshot = await getDocs(q)
      const ratings: number[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        if (data.vibeRating) {
          ratings.push(data.vibeRating)
        }
      })

      // Include the new rating
      ratings.push(newRating)

      // Calculate average
      const averageRating = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length

      // Update venue's vibe rating
      const venueRef = doc(db, "venues", venueId)
      await updateDoc(venueRef, {
        vibeRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
      })

      console.log("FirebaseService: Updated venue vibe rating to", averageRating)
    } catch (error) {
      console.error("Error updating venue vibe rating:", error)
      // Don't throw error, just log it
    }
  }

  // Add ticket method for compatibility
  async addTicket(ticketData: Omit<Ticket, "id">): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, "tickets"), {
        ...ticketData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      return docRef.id
    } catch (error) {
      console.error("Error adding ticket:", error)
      throw error
    }
  }
}

// Export a singleton instance as default
const firebaseService = FirebaseService.getInstance()
export default firebaseService
