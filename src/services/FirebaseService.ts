import "react-native-get-random-values" // Add this import at the top
import { collection, addDoc, getDoc, getDocs, doc, query, where, updateDoc, Timestamp, limit } from "firebase/firestore"
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { auth, db, storage } from "../config/firebase"
import type { User, UserType } from "../models/User"
import type { Venue } from "../models/Venue"
import type { Event } from "../models/Event"
import type { VibeImage } from "../models/VibeImage"
import { v4 as uuidv4 } from "uuid"

class FirebaseService {
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
        date: Timestamp.fromDate(eventData.date) as any,
        posterImageUrl: eventData.posterImageUrl,
        artists: eventData.artists,
        isFeatured: eventData.isFeatured,
        location: eventData.location,
        priceIndicator: eventData.priceIndicator,
        entryFee: eventData.entryFee,
        attendees: eventData.attendees || [],
        createdAt: Timestamp.fromDate(new Date()) as any,
        createdBy: eventData.createdBy,
        createdByType: eventData.createdByType,
        isDeleted: false,
      }

      // Add the document to Firestore
      const eventRef = await addDoc(collection(db, "events"), firestoreEventData)

      return eventRef.id
    } catch (error) {
      console.error("Error adding event:", error)
      throw error
    }
  }

  async updateEvent(eventId: string, data: Partial<Event>): Promise<void> {
    try {
      const eventRef = doc(db, "events", eventId)

      // Convert Date objects to Firestore Timestamps
      const firestoreData: any = { ...data }
      if (data.date) {
        firestoreData.date = Timestamp.fromDate(data.date)
      }

      await updateDoc(eventRef, firestoreData)
      return
    } catch (error) {
      console.error("Error updating event:", error)
      throw error
    }
  }

  // Soft delete event
  async deleteEvent(eventId: string): Promise<void> {
    try {
      console.log("FirebaseService: Soft deleting event", eventId)
      const eventRef = doc(db, "events", eventId)
      await updateDoc(eventRef, {
        isDeleted: true,
        deletedAt: Timestamp.now(),
      })
      console.log("FirebaseService: Event soft deleted successfully")
      return
    } catch (error) {
      console.error("Error soft deleting event:", error)
      throw error
    }
  }

  // Restore deleted event
  async restoreEvent(eventId: string): Promise<void> {
    try {
      console.log("FirebaseService: Restoring event", eventId)
      const eventRef = doc(db, "events", eventId)
      await updateDoc(eventRef, {
        isDeleted: false,
        deletedAt: null,
      })
      console.log("FirebaseService: Event restored successfully")
      return
    } catch (error) {
      console.error("Error restoring event:", error)
      throw error
    }
  }

  // Get deleted events (admin only)
  async getDeletedEvents(): Promise<Event[]> {
    try {
      console.log("FirebaseService: Getting deleted events")
      const eventsRef = collection(db, "events")
      const q = query(eventsRef, where("isDeleted", "==", true))
      const querySnapshot = await getDocs(q)
      const events: Event[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        events.push({
          id: doc.id,
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
        })
      })

      console.log("FirebaseService: Found", events.length, "deleted events")
      return events
    } catch (error) {
      console.error("Error getting deleted events:", error)
      throw error
    }
  }

  // Delete past events
  async deletePastEvents(): Promise<void> {
    try {
      console.log("FirebaseService: Deleting past events")

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const eventsRef = collection(db, "events")
      const querySnapshot = await getDocs(eventsRef)
      const deletePromises: Promise<void>[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        const eventDate = data.date.toDate()

        // If event date is before today, delete it
        if (eventDate < today) {
          console.log(`FirebaseService: Deleting past event: ${data.name} (${eventDate.toDateString()})`)
          deletePromises.push(this.deleteEvent(doc.id))
        }
      })

      await Promise.all(deletePromises)
      console.log(`FirebaseService: Deleted ${deletePromises.length} past events`)
    } catch (error) {
      console.error("Error deleting past events:", error)
      throw error
    }
  }

  // Add a new method to delete events by venue ID
  async deleteEventsByVenue(venueId: string): Promise<void> {
    try {
      console.log("FirebaseService: Deleting events for venue", venueId)

      // Get all events for this venue
      const eventsRef = collection(db, "events")
      const q = query(eventsRef, where("venueId", "==", venueId))
      const querySnapshot = await getDocs(q)

      // Delete each event
      const deletePromises: Promise<void>[] = []
      querySnapshot.forEach((doc) => {
        deletePromises.push(this.deleteEvent(doc.id))
      })

      await Promise.all(deletePromises)
      console.log(`FirebaseService: Deleted ${deletePromises.length} events for venue ${venueId}`)
      return
    } catch (error) {
      console.error("Error deleting events by venue:", error)
      throw error
    }
  }

  // Vibe Image methods
  async addVibeImage(vibeImageData: Omit<VibeImage, "id">): Promise<string> {
    try {
      console.log("FirebaseService: Adding vibe image for venue", vibeImageData.venueId)

      const firestoreVibeData = {
        venueId: vibeImageData.venueId,
        imageUrl: vibeImageData.imageUrl,
        vibeRating: vibeImageData.vibeRating,
        uploadedAt: Timestamp.fromDate(vibeImageData.uploadedAt),
        uploadedBy: vibeImageData.uploadedBy,
        analysisData: vibeImageData.analysisData,
      }

      const vibeRef = await addDoc(collection(db, "vibeImages"), firestoreVibeData)
      console.log("FirebaseService: Vibe image added with ID", vibeRef.id)

      // Update venue's vibe rating with the latest rating
      await this.updateVenueVibeRating(vibeImageData.venueId, vibeImageData.vibeRating)

      return vibeRef.id
    } catch (error) {
      console.error("Error adding vibe image:", error)
      throw error
    }
  }

  // New method to update venue's vibe rating
  async updateVenueVibeRating(venueId: string, newVibeRating: number): Promise<void> {
    try {
      console.log("FirebaseService: Updating venue vibe rating", venueId, "to", newVibeRating)

      // Get all vibe images for this venue to calculate average
      const vibeImagesRef = collection(db, "vibeImages")
      const q = query(vibeImagesRef, where("venueId", "==", venueId), limit(10))
      const querySnapshot = await getDocs(q)

      if (!querySnapshot.empty) {
        // Calculate average of recent vibe ratings (last 10 ratings or all if less than 10)
        const recentRatings: number[] = []
        querySnapshot.docs.forEach((doc) => {
          const data = doc.data()
          recentRatings.push(data.vibeRating)
        })

        const averageRating = recentRatings.reduce((sum, rating) => sum + rating, 0) / recentRatings.length

        // Update venue's vibe rating
        const venueRef = doc(db, "venues", venueId)
        await updateDoc(venueRef, { vibeRating: averageRating })

        console.log("FirebaseService: Venue vibe rating updated to", averageRating.toFixed(2))
      }
    } catch (error) {
      console.error("Error updating venue vibe rating:", error)
      // Don't throw error as this is not critical for the main flow
    }
  }

  // Simplified query that doesn't require complex indexes
  async getVibeImagesByVenueAndDate(venueId: string, date: Date): Promise<VibeImage[]> {
    try {
      console.log("FirebaseService: Getting vibe images for venue and date", venueId, date.toDateString())

      // Get all vibe images for this venue first (simple query)
      const vibeImagesRef = collection(db, "vibeImages")
      const q = query(vibeImagesRef, where("venueId", "==", venueId))

      const querySnapshot = await getDocs(q)
      const vibeImages: VibeImage[] = []

      console.log("Query returned", querySnapshot.size, "documents")

      // Filter by date in JavaScript (client-side filtering)
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)

      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        const uploadedAt = data.uploadedAt.toDate()

        // Check if the upload date is within today's range
        if (uploadedAt >= startOfDay && uploadedAt <= endOfDay) {
          console.log("Processing vibe image:", doc.id, uploadedAt)
          vibeImages.push({
            id: doc.id,
            venueId: data.venueId,
            imageUrl: data.imageUrl,
            vibeRating: data.vibeRating,
            uploadedAt: uploadedAt,
            uploadedBy: data.uploadedBy,
            analysisData: data.analysisData,
          })
        }
      })

      // Sort by upload time (most recent first)
      vibeImages.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())

      console.log("FirebaseService: Found", vibeImages.length, "vibe images for today")
      return vibeImages
    } catch (error) {
      console.error("Error getting vibe images by venue and date:", error)
      return []
    }
  }

  // Add the missing method for week vibes
  async getVibeImagesByVenueAndWeek(venueId: string): Promise<Record<string, VibeImage[]>> {
    try {
      console.log("FirebaseService: Getting vibe images for venue and week", venueId)

      // Get all vibe images for this venue first (simple query)
      const vibeImagesRef = collection(db, "vibeImages")
      const q = query(vibeImagesRef, where("venueId", "==", venueId))

      const querySnapshot = await getDocs(q)
      const weekVibes: Record<string, VibeImage[]> = {}

      console.log("Week query returned", querySnapshot.size, "documents")

      // Filter by week in JavaScript (client-side filtering)
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 7)

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        const uploadedAt = data.uploadedAt.toDate()

        // Check if the upload date is within the last week
        if (uploadedAt >= startDate && uploadedAt <= endDate) {
          const vibeImage: VibeImage = {
            id: doc.id,
            venueId: data.venueId,
            imageUrl: data.imageUrl,
            vibeRating: data.vibeRating,
            uploadedAt: uploadedAt,
            uploadedBy: data.uploadedBy,
            analysisData: data.analysisData,
          }

          // Group by date string
          const dateString = vibeImage.uploadedAt.toISOString().split("T")[0]
          if (!weekVibes[dateString]) {
            weekVibes[dateString] = []
          }
          weekVibes[dateString].push(vibeImage)
        }
      })

      // Sort each day's vibes by time (most recent first)
      Object.keys(weekVibes).forEach((dateString) => {
        weekVibes[dateString].sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
      })

      console.log("FirebaseService: Found vibe images for", Object.keys(weekVibes).length, "days")
      return weekVibes
    } catch (error) {
      console.error("Error getting vibe images by venue and week:", error)
      return {}
    }
  }

  async getLatestVibeRating(venueId: string): Promise<number | null> {
    try {
      console.log("FirebaseService: Getting latest vibe rating for venue", venueId)

      // Simple query without ordering to avoid index requirements
      const vibeImagesRef = collection(db, "vibeImages")
      const q = query(vibeImagesRef, where("venueId", "==", venueId))

      const querySnapshot = await getDocs(q)

      if (querySnapshot.empty) {
        return null
      }

      // Find the most recent vibe image in JavaScript
      let latestVibe: any = null
      let latestDate = new Date(0) // Start with epoch

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        const uploadedAt = data.uploadedAt.toDate()

        if (uploadedAt > latestDate) {
          latestDate = uploadedAt
          latestVibe = data
        }
      })

      return latestVibe ? latestVibe.vibeRating : null
    } catch (error) {
      console.error("Error getting latest vibe rating:", error)
      return null
    }
  }

  // File upload methods
  async uploadVenueImage(imageUri: string): Promise<string> {
    try {
      console.log("FirebaseService: Uploading venue image")

      // Generate a unique filename
      const filename = `venues/${uuidv4()}.jpg`
      const imageRef = ref(storage, filename)

      // For web, we need to handle the image differently
      if (typeof window !== "undefined") {
        // Web environment
        const response = await fetch(imageUri)
        const blob = await response.blob()
        await uploadBytes(imageRef, blob)
      } else {
        // React Native environment
        const response = await fetch(imageUri)
        const blob = await response.blob()
        await uploadBytes(imageRef, blob)
      }

      // Get the download URL
      const downloadURL = await getDownloadURL(imageRef)
      console.log("FirebaseService: Image uploaded successfully")

      return downloadURL
    } catch (error) {
      console.error("Error uploading venue image:", error)
      throw error
    }
  }

  async uploadEventImage(imageUri: string): Promise<string> {
    try {
      console.log("FirebaseService: Uploading event image")

      // Generate a unique filename
      const filename = `events/${uuidv4()}.jpg`
      const imageRef = ref(storage, filename)

      // For web, we need to handle the image differently
      if (typeof window !== "undefined") {
        // Web environment
        const response = await fetch(imageUri)
        const blob = await response.blob()
        await uploadBytes(imageRef, blob)
      } else {
        // React Native environment
        const response = await fetch(imageUri)
        const blob = await response.blob()
        await uploadBytes(imageRef, blob)
      }

      // Get the download URL
      const downloadURL = await getDownloadURL(imageRef)
      console.log("FirebaseService: Event image uploaded successfully")

      return downloadURL
    } catch (error) {
      console.error("Error uploading event image:", error)
      throw error
    }
  }

  async uploadVibeImage(imageUri: string): Promise<string> {
    try {
      console.log("FirebaseService: Uploading vibe image")

      // Generate a unique filename
      const filename = `vibes/${uuidv4()}.jpg`
      const imageRef = ref(storage, filename)

      // For web, we need to handle the image differently
      if (typeof window !== "undefined") {
        // Web environment
        const response = await fetch(imageUri)
        const blob = await response.blob()
        await uploadBytes(imageRef, blob)
      } else {
        // React Native environment
        const response = await fetch(imageUri)
        const blob = await response.blob()
        await uploadBytes(imageRef, blob)
      }

      // Get the download URL
      const downloadURL = await getDownloadURL(imageRef)
      console.log("FirebaseService: Vibe image uploaded successfully")

      return downloadURL
    } catch (error) {
      console.error("Error uploading vibe image:", error)
      throw error
    }
  }

  // Admin methods
  async getAllUsers(): Promise<User[]> {
    try {
      console.log("FirebaseService: Getting all users (admin)")
      const usersRef = collection(db, "users")
      const querySnapshot = await getDocs(usersRef)
      const users: User[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        // Only include non-deleted users
        if (!data.isDeleted) {
          users.push({
            id: doc.id,
            uid: data.uid,
            email: data.email,
            userType: data.userType,
            displayName: data.displayName,
            photoURL: data.photoURL,
            venueId: data.venueId,
            isFrozen: data.isFrozen,
            createdAt: data.createdAt.toDate(),
            lastLoginAt: data.lastLoginAt.toDate(),
          })
        }
      })

      console.log("FirebaseService: Found", users.length, "users")
      return users
    } catch (error) {
      console.error("Error getting all users:", error)
      throw error
    }
  }

  async freezeUser(userId: string): Promise<void> {
    try {
      console.log("FirebaseService: Freezing user", userId)
      const userRef = doc(db, "users", userId)
      await updateDoc(userRef, { isFrozen: true })
      console.log("FirebaseService: User frozen successfully")
      return
    } catch (error) {
      console.error("Error freezing user:", error)
      throw error
    }
  }

  async unfreezeUser(userId: string): Promise<void> {
    try {
      console.log("FirebaseService: Unfreezing user", userId)
      const userRef = doc(db, "users", userId)
      await updateDoc(userRef, { isFrozen: false })
      console.log("FirebaseService: User unfrozen successfully")
      return
    } catch (error) {
      console.error("Error unfreezing user:", error)
      throw error
    }
  }

  // Soft delete user
  async deleteUser(userId: string): Promise<void> {
    try {
      console.log("FirebaseService: Soft deleting user", userId)
      const userRef = doc(db, "users", userId)
      await updateDoc(userRef, {
        isDeleted: true,
        deletedAt: Timestamp.now(),
      })
      console.log("FirebaseService: User soft deleted successfully")
      return
    } catch (error) {
      console.error("Error soft deleting user:", error)
      throw error
    }
  }

  // Restore deleted user
  async restoreUser(userId: string): Promise<void> {
    try {
      console.log("FirebaseService: Restoring user", userId)
      const userRef = doc(db, "users", userId)
      await updateDoc(userRef, {
        isDeleted: false,
        deletedAt: null,
      })
      console.log("FirebaseService: User restored successfully")
      return
    } catch (error) {
      console.error("Error restoring user:", error)
      throw error
    }
  }

  // Get deleted users (admin only)
  async getDeletedUsers(): Promise<User[]> {
    try {
      console.log("FirebaseService: Getting deleted users")
      const usersRef = collection(db, "users")
      const q = query(usersRef, where("isDeleted", "==", true))
      const querySnapshot = await getDocs(q)
      const users: User[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        users.push({
          id: doc.id,
          uid: data.uid,
          email: data.email,
          userType: data.userType,
          displayName: data.displayName,
          photoURL: data.photoURL,
          venueId: data.venueId,
          isFrozen: data.isFrozen,
          createdAt: data.createdAt.toDate(),
          lastLoginAt: data.lastLoginAt.toDate(),
        })
      })

      console.log("FirebaseService: Found", users.length, "deleted users")
      return users
    } catch (error) {
      console.error("Error getting deleted users:", error)
      throw error
    }
  }
}

export default new FirebaseService()
