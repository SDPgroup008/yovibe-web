import "react-native-get-random-values" // Add this import at the top
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth"
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  doc,
  query,
  where,
  Timestamp,
  orderBy,
  limit,
} from "firebase/firestore"
import { auth, db } from "../config/firebase"
import type { User, UserType } from "../models/User"
import type { Venue } from "../models/Venue"
import type { Event } from "../models/Event"

class FirebaseService {
  private static instance: FirebaseService

  private constructor() {
    console.log("Firebase service initialized")
  }

  public static getInstance(): FirebaseService {
    if (!FirebaseService.instance) {
      FirebaseService.instance = new FirebaseService()
    }
    return FirebaseService.getInstance()
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

  async getVenueById(venueId: string): Promise<Venue | null> {
    try {
      const venueRef = doc(db, "venues", venueId)
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

  async updateVenue(venueId: string, data: Partial<Venue>): Promise<void> {
    try {
      const venueRef = doc(db, "venues", venueId)
      await updateDoc(venueRef, data)
      return
    } catch (error) {
      console.error("Error updating venue:", error)
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

  // Event methods
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
                location: data.location, // Make sure this is included
                priceIndicator: data.priceIndicator || 1,
                entryFee: data.entryFee, // Make sure this is included
                attendees: data.attendees || [],
                createdAt: data.createdAt.toDate(),
                createdBy: data.createdBy,
                createdByType: data.createdByType,
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
              location: data.location, // Make sure this is included
              priceIndicator: data.priceIndicator || 1,
              entryFee: data.entryFee, // Make sure this is included
              attendees: data.attendees || [],
              createdAt: data.createdAt.toDate(),
              createdBy: data.createdBy,
              createdByType: data.createdByType,
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

  async getEventsByVenue(venueId: string): Promise<Event[]> {
    try {
      const eventsRef = collection(db, "events")
      const q = query(eventsRef, where("venueId", "==", venueId))
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
              location: data.location, // Make sure this is included
              priceIndicator: data.priceIndicator || 1,
              entryFee: data.entryFee, // Make sure this is included
              attendees: data.attendees || [],
              createdAt: data.createdAt.toDate(),
              createdBy: data.createdBy,
              createdByType: data.createdByType,
            })
          }
        }
      })

      return events
    } catch (error) {
      console.error("Error getting events by venue:", error)
      throw error
    }
  }

  async getEventById(eventId: string): Promise<Event | null> {
    try {
      const eventRef = doc(db, "events", eventId)
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
        location: data.location, // Make sure this is included
        priceIndicator: data.priceIndicator || 1,
        entryFee: data.entryFee, // Make sure this is included
        attendees: data.attendees || [],
        createdAt: data.createdAt.toDate(),
        createdBy: data.createdBy,
        createdByType: data.createdByType,
      }
    } catch (error) {
      console.error("Error getting event by ID:", error)
      throw error
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
      }

      const eventRef = await addDoc(collection(db, "events"), firestoreEventData)
      return eventRef.id
    } catch (error) {
      console.error("Error adding event:", error)
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

  async getVibeImagesByVenueAndDate(venueId: string, date: Date): Promise<any[]> {
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
      const vibeImages: any[] = []

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

  async getVibeImagesByVenueAndWeek(venueId: string): Promise<Record<string, any[]>> {
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
      const weekData: Record<string, any[]> = {}

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
}

// Export a singleton instance as default
const firebaseService = FirebaseService.getInstance()
export default firebaseService
