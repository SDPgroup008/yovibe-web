import "react-native-get-random-values"
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
  deleteDoc,
  startAfter,
  DocumentSnapshot,
} from "firebase/firestore"
import { v4 as uuidv4 } from "uuid";
import { getStorage, ref, ref as storageRef, uploadString, getDownloadURL, uploadBytes } from "firebase/storage"
import { auth, db } from "../config/firebase"
import type { User, UserType } from "../models/User"
import type { Venue } from "../models/Venue"
import type { Event } from "../models/Event"
import type { VibeImage } from "../models/VibeImage"

class FirebaseService {
  private static instance: FirebaseService

  private constructor() {
    console.log("FirebaseService: Initialized")
  }

  public static getInstance(): FirebaseService {
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
      const userRef = await addDoc(collection(db, "YoVibe/data/users"), {
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
      const usersRef = collection(db, "YoVibe/data/users")
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
      const userRef = doc(db, "YoVibe/data/users", userId)
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
      const venuesRef = collection(db, "YoVibe/data/venues")
      const querySnapshot = await getDocs(venuesRef)
      console.log("FirebaseService: Total venues in database:", querySnapshot.size)

      if (querySnapshot.empty) {
        console.log("FirebaseService: No venues found in database, returning mock data for development")
        return this.getMockVenues()
      }

      const venues: Venue[] = []
      querySnapshot.forEach((doc) => {
        const data = doc.data()
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

  async getVenuesPaginated(pageSize: number = 5, lastDoc?: DocumentSnapshot): Promise<{venues: Venue[], lastDoc: DocumentSnapshot | null}> {
    try {
      console.log("\n========== FIREBASE VENUE PAGINATION ==========\nRequested page size:", pageSize)
      if (lastDoc) {
        console.log("Continuing from last document (pagination cursor set)")
      } else {
        console.log("Starting fresh fetch (first page)")
      }
      
      const venuesRef = collection(db, "YoVibe/data/venues")
      
      let q = query(
        venuesRef,
        orderBy("name", "asc"),
        limit(pageSize)
      )
      
      if (lastDoc) {
        q = query(
          venuesRef,
          orderBy("name", "asc"),
          startAfter(lastDoc),
          limit(pageSize)
        )
      }
      
      const querySnapshot = await getDocs(q)
      console.log("\nFirebase returned", querySnapshot.size, "venue documents")
      
      const venues: Venue[] = []
      let deletedCount = 0
      let loadedCount = 0
      let lastVisible = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null
      
      querySnapshot.forEach((doc) => {
        const data = doc.data()
        const venueName = data.name || "Unnamed Venue"
        
        if (data.isDeleted) {
          deletedCount++
          console.log(`❌ EXCLUDED: "${venueName}" (ID: ${doc.id}) - Reason: Marked as deleted (isDeleted=true)`)
        } else {
          loadedCount++
          const categories = data.categories || []
          console.log(`✅ LOADED: "${venueName}" (ID: ${doc.id}) - Categories: [${categories.join(", ")}], Type: ${data.venueType || "nightlife"}`)
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
      
      console.log("\n--- FIREBASE FETCH SUMMARY ---")
      console.log("Total documents from Firebase:", querySnapshot.size)
      console.log("Loaded venues:", loadedCount)
      console.log("Excluded (deleted):", deletedCount)
      console.log("Returning", venues.length, "venues to screen")
      console.log("Has more pages:", querySnapshot.docs.length === pageSize)
      console.log("========================================\n")
      
      return { venues, lastDoc: lastVisible }
    } catch (error) {
      console.error("❌ Error getting paginated venues from Firestore:", error)
      return { venues: [], lastDoc: null }
    }
  }

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
      const venuesRef = collection(db, "YoVibe/data/venues")
      const q = query(venuesRef, where("ownerId", "==", ownerId))
      const querySnapshot = await getDocs(q)
      const venues: Venue[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
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
      const venueRef = doc(db, "YoVibe/data/venues", venueId)
      const venueDoc = await getDoc(venueRef)

      if (!venueDoc.exists()) {
        return null
      }

      const data = venueDoc.data()
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
      const venueRef = await addDoc(collection(db, "YoVibe/data/venues"), {
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

  async uploadVenueImage(imageUri: string, venueId: string = `venue-${Date.now()}`): Promise<string> {
    try {
      console.log("FirebaseService: Uploading venue background image for venue", venueId)
      const storage = getStorage()
      const storageRef = ref(storage, `venues/${venueId}/background.jpg`)

      await uploadString(storageRef, imageUri, "data_url")
      const downloadURL = await getDownloadURL(storageRef)
      console.log("FirebaseService: Venue image uploaded, URL:", downloadURL)
      return downloadURL
    } catch (error) {
      console.error("FirebaseService: Error uploading venue image:", error)
      throw error
    }
  }

  async updateVenue(venueId: string, data: Partial<Venue>): Promise<void> {
    try {
      const venueRef = doc(db, "YoVibe/data/venues", venueId)
      await updateDoc(venueRef, data)
      return
    } catch (error) {
      console.error("Error updating venue:", error)
      throw error
    }
  }

  async updateVenuePrograms(venueId: string, programs: Record<string, string>): Promise<void> {
    try {
      const venueRef = doc(db, "YoVibe/data/venues", venueId)
      await updateDoc(venueRef, { weeklyPrograms: programs })
      return
    } catch (error) {
      console.error("Error updating venue programs:", error)
      throw error
    }
  }

  async deleteVenue(venueId: string): Promise<void> {
    try {
      console.log("FirebaseService: Soft deleting venue", venueId)
      const venueRef = doc(db, "YoVibe/data/venues", venueId)
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

  async restoreVenue(venueId: string): Promise<void> {
    try {
      console.log("FirebaseService: Restoring venue", venueId)
      const venueRef = doc(db, "YoVibe/data/venues", venueId)
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

  async getDeletedVenues(): Promise<Venue[]> {
    try {
      console.log("FirebaseService: Getting deleted venues")
      const venuesRef = collection(db, "YoVibe/data/venues")
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

  async deleteExpiredCustomVenues(): Promise<void> {
    try {
      console.log("FirebaseService: Deleting expired custom venues")
      const now = new Date()
      const eventsRef = collection(db, "YoVibe/data/events")
      const q = query(
        eventsRef,
        where("createdByType", "!=", "club_owner"),
        where("date", "<=", Timestamp.fromDate(now)),
        where("isDeleted", "==", false)
      )
      const querySnapshot = await getDocs(q)
      const deletePromises: Promise<void>[] = []

      for (const doc of querySnapshot.docs) {
        const data = doc.data()
        const venueId = data.venueId
        if (venueId) {
          console.log(`FirebaseService: Deleting custom venue ${venueId} for expired event ${doc.id}`)
          const venueRef = doc(db, "YoVibe/data/venues", venueId)
          deletePromises.push(deleteDoc(venueRef))
        }
      }

      await Promise.all(deletePromises)
      console.log(`FirebaseService: Deleted ${deletePromises.length} custom venues`)
    } catch (error) {
      console.error("FirebaseService: Error deleting expired custom venues:", error)
      throw error
    }
  }

  // Event methods
  async getEvents(): Promise<Event[]> {
    try {
      console.log("FirebaseService: Getting events")
      const eventsRef = collection(db, "YoVibe/data/events")
      const querySnapshot = await getDocs(eventsRef)
      const events: Event[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        if (!data.isDeleted) {
          if (!data.date || typeof data.date.toDate !== "function") {
            console.warn(`FirebaseService: Skipping event ${doc.id} with invalid date field`, data.date)
            return
          }

          const eventDate = data.date.toDate()
          if (eventDate >= new Date()) {
            events.push({
              id: doc.id,
              name: data.name,
              venueId: data.venueId,
              venueName: data.venueName,
              description: data.description,
              date: eventDate,
              time: data.time || "Time TBD",
              posterImageUrl: data.posterImageUrl,
              artists: data.artists,
              isFeatured: data.isFeatured,
              location: data.location,
              priceIndicator: data.priceIndicator || 1,
              entryFees: data.entryFees || (data.entryFee ? [{ name: "General", amount: data.entryFee.toDateString() }] : []),
              ticketContacts: data.ticketContacts || [],
              attendees: data.attendees || [],
              createdAt: data.createdAt?.toDate?.() || new Date(),
              createdBy: data.createdBy,
              createdByType: data.createdByType,
              isFreeEntry: data.isFreeEntry ?? (data.entryFees?.length === 0),
            })
          }
        }
      })

      console.log("FirebaseService: Found", events.length, "events")
      return events.sort((a, b) => a.date.getTime() - b.date.getTime())
    } catch (error) {
      console.error("Error getting events from Firestore:", error)
      return []
    }
  }

  async getEventsPaginated(pageSize: number = 5, lastDoc?: DocumentSnapshot): Promise<{events: Event[], lastDoc: DocumentSnapshot | null}> {
    try {
      console.log("FirebaseService: Getting paginated events, pageSize:", pageSize)
      const eventsRef = collection(db, "YoVibe/data/events")
      
      let q = query(
        eventsRef,
        orderBy("date", "asc"),
        limit(pageSize)
      )
      
      if (lastDoc) {
        q = query(
          eventsRef,
          orderBy("date", "asc"),
          startAfter(lastDoc),
          limit(pageSize)
        )
      }
      
      const querySnapshot = await getDocs(q)
      const events: Event[] = []
      let lastVisible = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null
      
      querySnapshot.forEach((doc) => {
        const data = doc.data()
        
        // Skip if explicitly deleted
        if (data.isDeleted === true) {
          return
        }
        
        if (!data.date || typeof data.date.toDate !== "function") {
          console.warn(`FirebaseService: Skipping event ${doc.id} with invalid date field`, data.date)
          return
        }

        const eventDate = data.date.toDate()
        
        events.push({
          id: doc.id,
          name: data.name,
          venueId: data.venueId,
          venueName: data.venueName,
          description: data.description,
          date: eventDate,
          time: data.time || "Time TBD",
          posterImageUrl: data.posterImageUrl,
          artists: data.artists,
          isFeatured: data.isFeatured,
          location: data.location,
          priceIndicator: data.priceIndicator || 1,
          entryFees: data.entryFees || (data.entryFee ? [{ name: "General", amount: data.entryFee.toDateString() }] : []),
          ticketContacts: data.ticketContacts || [],
          attendees: data.attendees || [],
          createdAt: data.createdAt?.toDate?.() || new Date(),
          createdBy: data.createdBy,
          createdByType: data.createdByType,
          isFreeEntry: data.isFreeEntry ?? (data.entryFees?.length === 0),
        })
      })
      
      console.log("FirebaseService: Found", events.length, "paginated events")
      return { events, lastDoc: lastVisible }
    } catch (error) {
      console.error("Error getting paginated events from Firestore:", error)
      return { events: [], lastDoc: null }
    }
  }

  async getFeaturedEvents(): Promise<Event[]> {
    try {
      const eventsRef = collection(db, "YoVibe/data/events")
      const q = query(eventsRef, where("isFeatured", "==", true))
      const querySnapshot = await getDocs(q)
      const events: Event[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        if (!data.isDeleted) {
          if (!data.date || typeof data.date.toDate !== "function") {
            console.warn(`FirebaseService: Skipping featured event ${doc.id} with invalid date field`, data.date)
            return
          }

          const eventDate = data.date.toDate()
          if (eventDate >= new Date()) {
            events.push({
              id: doc.id,
              name: data.name,
              venueId: data.venueId,
              venueName: data.venueName,
              description: data.description,
              date: eventDate,
              time: data.time || "Time TBD",
              posterImageUrl: data.posterImageUrl,
              artists: data.artists,
              isFeatured: data.isFeatured,
              location: data.location,
              priceIndicator: data.priceIndicator || 1,
              entryFees: data.entryFees || (data.entryFee ? [{ name: "General", amount: data.entryFee.toString() }] : []),
              ticketContacts: data.ticketContacts || [],
              attendees: data.attendees || [],
              createdAt: data.createdAt?.toDate?.() || new Date(),
              createdBy: data.createdBy,
              createdByType: data.createdByType,
              isFreeEntry: data.isFreeEntry ?? (data.entryFees?.length === 0),
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
      const eventsRef = collection(db, "YoVibe/data/events")
      const q = query(eventsRef, where("venueId", "==", venueId))
      const querySnapshot = await getDocs(q)
      const events: Event[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        if (!data.isDeleted) {
          if (!data.date || typeof data.date.toDate !== "function") {
            console.warn(`FirebaseService: Skipping event ${doc.id} with invalid date field`, data.date)
            return
          }

          const eventDate = data.date.toDate()
          if (eventDate >= new Date()) {
            events.push({
              id: doc.id,
              name: data.name,
              venueId: data.venueId,
              venueName: data.venueName,
              description: data.description,
              date: eventDate,
              time: data.time || "Time TBD",
              posterImageUrl: data.posterImageUrl,
              artists: data.artists,
              isFeatured: data.isFeatured,
              location: data.location,
              priceIndicator: data.priceIndicator || 1,
              entryFees: data.entryFees || (data.entryFee ? [{ name: "General", amount: data.entryFee.toString() }] : []),
              ticketContacts: data.ticketContacts || [],
              attendees: data.attendees || [],
              createdAt: data.createdAt?.toDate?.() || new Date(),
              createdBy: data.createdBy,
              createdByType: data.createdByType,
              isFreeEntry: data.isFreeEntry ?? (data.entryFees?.length === 0),
            })
          }
        }
      })

      return events
    } catch (error) {
      console.error("Error getting events by venue:", error)
      return []
    }
  }

  async getEventById(eventId: string): Promise<Event | null> {
    try {
      const eventRef = doc(db, "YoVibe/data/events", eventId)
      const eventDoc = await getDoc(eventRef)

      if (!eventDoc.exists()) {
        return null
      }

      const data = eventDoc.data()
      if (data.isDeleted) {
        return null
      }

      if (!data.date || typeof data.date.toDate !== "function") {
        console.warn(`FirebaseService: Skipping event ${eventId} with invalid date field`, data.date)
        return null
      }

      return {
        id: eventDoc.id,
        name: data.name,
        venueId: data.venueId,
        venueName: data.venueName,
        description: data.description,
        date: data.date.toDate(),
        time: data.time || "Time TBD",
        posterImageUrl: data.posterImageUrl,
        artists: data.artists,
        isFeatured: data.isFeatured,
        location: data.location,
        priceIndicator: data.priceIndicator || 1,
        entryFees: data.entryFees || (data.entryFee ? [{ name: "General", amount: data.entryFee.toString() }] : []),
        ticketContacts: data.ticketContacts || [],
        attendees: data.attendees || [],
        createdAt: data.createdAt?.toDate?.() || new Date(),
        createdBy: data.createdBy,
        createdByType: data.createdByType,
        isFreeEntry: data.isFreeEntry ?? (data.entryFees?.length === 0),
      }
    } catch (error) {
      console.error("Error getting event by ID:", error)
      throw error
    }
  }

  async addEvent(eventData: Omit<Event, "id">): Promise<string> {
    try {
      if (!(eventData.date instanceof Date) || isNaN(eventData.date.getTime())) {
        throw new Error("Invalid event date provided")
      }

      const firestoreEventData = {
        name: eventData.name,
        venueId: eventData.venueId,
        venueName: eventData.venueName,
        description: eventData.description,
        date: Timestamp.fromDate(eventData.date),
        time: eventData.time,
        posterImageUrl: eventData.posterImageUrl,
        artists: eventData.artists,
        isFeatured: eventData.isFeatured,
        location: eventData.location,
        priceIndicator: eventData.priceIndicator,
        entryFees: eventData.entryFees || [],
        ticketContacts: eventData.ticketContacts || [],
        attendees: eventData.attendees || [],
        createdAt: Timestamp.now(),
        createdBy: eventData.createdBy,
        createdByType: eventData.createdByType,
        isFreeEntry: eventData.isFreeEntry,
        isDeleted: false,
      }

      const eventRef = await addDoc(collection(db, "YoVibe/data/events"), firestoreEventData)
      return eventRef.id
    } catch (error) {
      console.error("Error adding event:", error)
      throw error
    }
  }

  async updateEvent(eventId: string, data: Partial<Event>): Promise<void> {
    try {
      console.log("FirebaseService: Updating event", eventId)
      const eventRef = doc(db, "YoVibe/data/events", eventId)
      const updateData: any = { ...data }
      if (data.date) {
        updateData.date = Timestamp.fromDate(data.date)
      }
      await updateDoc(eventRef, updateData)
      console.log("FirebaseService: Event updated successfully")
    } catch (error) {
      console.error("Error updating event:", error)
      throw error
    }
  }

  async deleteEvent(eventId: string): Promise<void> {
    try {
      console.log("FirebaseService: Soft deleting event", eventId)
      const eventRef = doc(db, "YoVibe/data/events", eventId)
      await updateDoc(eventRef, {
        isDeleted: true,
        deletedAt: Timestamp.now(),
      })
      console.log("FirebaseService: Event soft deleted successfully")
    } catch (error) {
      console.error("Error soft deleting event:", error)
      throw error
    }
  }

  async getLatestVibeRating(venueId: string): Promise<number | null> {
    try {
      console.log("FirebaseService: Getting latest vibe rating for venue", venueId)
      const vibeRatingsRef = collection(db, "YoVibe/data/vibeRatings")
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
      return Math.random() * 5
    }
  }

  async deletePastEvents(): Promise<void> {
    try {
      console.log("FirebaseService: Deleting past events")
      const eventsRef = collection(db, "YoVibe/data/events")
      const querySnapshot = await getDocs(eventsRef)
      const now = new Date()

      const deletePromises: Promise<void>[] = []
      querySnapshot.forEach((doc) => {
        const data = doc.data()
        if (data.date && typeof data.date.toDate === "function") {
          const eventDate: Date = data.date.toDate()

          // Compute the "expiry" date = eventDate + 1 day
          const expiryDate = new Date(eventDate)
          expiryDate.setDate(expiryDate.getDate() + 1)

          // Only delete if we are past the expiry date
          if (expiryDate <= now && !data.isDeleted) {
            deletePromises.push(
              updateDoc(doc.ref, {
                isDeleted: true,
                deletedAt: Timestamp.now(),
              })
            )
          }
        }
      })

      await Promise.all(deletePromises)
      console.log("FirebaseService: Past events marked as deleted")
    } catch (error) {
      console.error("Error deleting past events:", error)
    }
  }


  async getVibeImagesByVenueAndDate(venueId: string, date: Date): Promise<VibeImage[]> {
    try {
      console.log("FirebaseService: Getting vibe images for venue", venueId, "on", date.toDateString())
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      const vibeImagesRef = collection(db, "YoVibe/data/vibeImages")
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
          vibeRating: data.vibeRating || Math.random() * 5,
          uploadedAt: data.uploadedAt.toDate(),
          uploadedBy: data.uploadedBy,
        })
      })

      console.log("FirebaseService: Found", vibeImages.length, "vibe images for today")
      return vibeImages
    } catch (error) {
      console.error("Error getting vibe images by venue and date:", error)
      return []
    }
  }

  async getVibeImagesByVenueAndWeek(venueId: string): Promise<Record<string, VibeImage[]>> {
    try {
      console.log("FirebaseService: Getting vibe images for venue", venueId, "for the week")
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 7)

      const vibeImagesRef = collection(db, "YoVibe/data/vibeImages")
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
          vibeRating: data.vibeRating || Math.random() * 5,
          uploadedAt: uploadDate,
          uploadedBy: data.uploadedBy,
        })
      })

      console.log("FirebaseService: Found vibe images for", Object.keys(weekData).length, "days")
      return weekData
    } catch (error) {
      console.error("Error getting vibe images by venue and week:", error)
      return {}
    }
  }

  async uploadVibeImage(fileOrUrl: Blob | string, venueId: string = `vibe-${Date.now()}`): Promise<string> {
    try {
      console.log("FirebaseService: Uploading vibe image for venue", venueId);

      // If it's already a remote http(s) URL, return it directly
      if (typeof fileOrUrl === "string" && (fileOrUrl.startsWith("http://") || fileOrUrl.startsWith("https://"))) {
        return fileOrUrl;
      }

      const storage = getStorage();
      const filename = `vibeImages/${venueId}/${Date.now()}.jpg`;
      const ref = storageRef(storage, filename);

      // data: URL string -> use uploadString with 'data_url'
      if (typeof fileOrUrl === "string" && fileOrUrl.startsWith("data:")) {
        const snapshot = await uploadString(ref, fileOrUrl, "data_url");
        const downloadURL = await getDownloadURL(snapshot.ref);
        console.log("FirebaseService: Vibe image uploaded (data_url), URL:", downloadURL);
        return downloadURL;
      }

      // blob: object URL string -> fetch to Blob
      if (typeof fileOrUrl === "string" && fileOrUrl.startsWith("blob:")) {
        const resp = await fetch(fileOrUrl);
        fileOrUrl = await resp.blob();
      }

      // At this point we expect a Blob
      if (fileOrUrl instanceof Blob) {
        const snapshot = await uploadBytes(ref, fileOrUrl);
        const downloadURL = await getDownloadURL(snapshot.ref);
        console.log("FirebaseService: Vibe image uploaded (blob), URL:", downloadURL);
        return downloadURL;
      }

      throw new Error("uploadVibeImage: unsupported file type");
    } catch (error) {
      console.error("FirebaseService: Error uploading vibe image:", error);
      throw error;
    }
  }



  async uploadEventImage(imageUri: string, eventId: string = `event-${Date.now()}`): Promise<string> {
    try {
      console.log("FirebaseService: Uploading event poster image for event", eventId)
      const storage = getStorage()
      const storageRef = ref(storage, `events/${eventId}/poster.jpg`)
      console.log("Current user UID:", auth.currentUser?.uid)
      console.log("Auth token exists:", !!await auth.currentUser?.getIdToken())

      await uploadString(storageRef, imageUri, "data_url")
      const downloadURL = await getDownloadURL(storageRef)
      console.log("FirebaseService: Event image uploaded, URL:", downloadURL)
      return downloadURL
    } catch (error) {
      console.error("FirebaseService: Error uploading event image:", error)
      throw error
    }
  }

  async addVibeImage(vibeImageData: Omit<VibeImage, "id">): Promise<string> {
    try {
      console.log("FirebaseService: Adding vibe image for venue", vibeImageData.venueId)
      const vibeImageRef = await addDoc(collection(db, "YoVibe/data/vibeImages"), {
        ...vibeImageData,
        uploadedAt: Timestamp.fromDate(vibeImageData.uploadedAt),
      })
      console.log("FirebaseService: Vibe image added with ID", vibeImageRef.id)

      const vibeRating = await this.getLatestVibeRating(vibeImageData.venueId)
      if (vibeRating !== null) {
        await this.updateVenue(vibeImageData.venueId, { vibeRating })
      }

      return vibeImageRef.id
    } catch (error) {
      console.error("FirebaseService: Error adding vibe image:", error)
      throw error
    }
  }
}

const firebaseService = FirebaseService.getInstance()
export default firebaseService