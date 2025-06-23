import "react-native-get-random-values" // Add this import at the top
import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  doc,
  query,
  where,
  updateDoc,
  deleteDoc,
  Timestamp,
  orderBy,
} from "firebase/firestore"
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth"
import { ref, uploadBytes, getDownloadURL, uploadString } from "firebase/storage"
import { auth, db, storage } from "../config/firebase"
import type { User, UserType } from "../models/User"
import type { Venue } from "../models/Venue"
import type { Event } from "../models/Event"
import type { VibeImage } from "../models/VibeImage"
import { v4 as uuidv4 } from "uuid"
import { isDevelopment } from "../utils/env"

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
      console.log("FirebaseService: Signing out user")

      // Clear any cached auth state
      if (auth.currentUser) {
        await firebaseSignOut(auth)
      }

      // Additional cleanup - clear any persisted auth state
      if (typeof window !== "undefined" && window.localStorage) {
        // Clear any Firebase auth persistence
        const firebaseKeys = Object.keys(window.localStorage).filter(
          (key) => key.startsWith("firebase:") || key.includes("firebaseLocalStorageDb"),
        )
        firebaseKeys.forEach((key) => window.localStorage.removeItem(key))
      }

      console.log("FirebaseService: Sign out successful")
      return
    } catch (error) {
      console.error("FirebaseService: Error signing out:", error)
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

      // For development/testing, return mock data if Firebase is not properly configured
      if (isDevelopment()) {
        try {
          const venuesRef = collection(db, "venues")
          const querySnapshot = await getDocs(venuesRef)

          if (querySnapshot.empty) {
            console.log("FirebaseService: No venues found, returning mock data")
            return this.getMockVenues()
          }

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
            })
          })

          console.log("FirebaseService: Found", venues.length, "venues")
          return venues
        } catch (error) {
          console.warn("FirebaseService: Error getting venues, returning mock data:", error)
          return this.getMockVenues()
        }
      }

      // Production code
      const venuesRef = collection(db, "venues")
      const querySnapshot = await getDocs(venuesRef)
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
        })
      })

      console.log("FirebaseService: Found", venues.length, "venues")
      return venues
    } catch (error) {
      console.error("FirebaseService: Error getting venues:", error)
      throw error
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
      },
      {
        id: "venue3",
        name: "Rooftop Lounge",
        location: "789 Skyview Dr, Uptown",
        description: "Elegant rooftop bar with panoramic city views and craft cocktails.",
        backgroundImageUrl:
          "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80",
        categories: ["Lounge", "Rooftop", "Cocktails"],
        vibeRating: 4.7,
        latitude: 40.758,
        longitude: -73.9855,
        weeklyPrograms: {
          Monday: "Monday Sunset Sessions",
          Tuesday: "Taco & Tequila Tuesday",
          Wednesday: "Wine Down Wednesday",
          Thursday: "Acoustic Live Sets",
          Friday: "DJ & Dancing under the Stars",
          Saturday: "VIP Bottle Service Night",
          Sunday: "Sunday Brunch & Beats",
        },
        ownerId: "owner3",
        createdAt: new Date(),
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
        })
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
        deletePromises.push(deleteDoc(doc.ref))
      })

      await Promise.all(deletePromises)
      console.log(`FirebaseService: Deleted ${deletePromises.length} events for venue ${venueId}`)
      return
    } catch (error) {
      console.error("Error deleting events by venue:", error)
      throw error
    }
  }

  // Enhance the deleteVenue method to also delete associated images
  async deleteVenue(venueId: string): Promise<void> {
    try {
      console.log("FirebaseService: Deleting venue", venueId)

      // Get venue data to check for images
      const venueRef = doc(db, "venues", venueId)
      const venueDoc = await getDoc(venueRef)

      if (venueDoc.exists()) {
        // Delete the venue document
        await deleteDoc(venueRef)
        console.log("FirebaseService: Venue deleted successfully")
      } else {
        console.warn("FirebaseService: Venue not found", venueId)
      }

      return
    } catch (error) {
      console.error("Error deleting venue:", error)
      throw error
    }
  }

  // Event methods
  async getEvents(): Promise<Event[]> {
    try {
      console.log("FirebaseService: Getting events")

      // Always try to get real events from Firestore first
      try {
        const eventsRef = collection(db, "events")
        const querySnapshot = await getDocs(eventsRef)
        const events: Event[] = []

        querySnapshot.forEach((doc) => {
          const data = doc.data()
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
              attendees: data.attendees || [],
              createdAt: data.createdAt.toDate(),
              createdBy: data.createdBy,
              createdByType: data.createdByType,
            })
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

        // Only in development mode and if Firestore fails, return an empty array
        if (isDevelopment()) {
          console.warn("Development mode: Returning empty events array")
          return []
        } else {
          throw error
        }
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
            attendees: data.attendees || [],
            createdAt: data.createdAt.toDate(),
            createdBy: data.createdBy,
            createdByType: data.createdByType,
          })
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
            attendees: data.attendees || [],
            createdAt: data.createdAt.toDate(),
            createdBy: data.createdBy,
            createdByType: data.createdByType,
          })
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
        date: Timestamp.fromDate(eventData.date) as any, // Use type assertion to avoid TypeScript error
        posterImageUrl: eventData.posterImageUrl,
        artists: eventData.artists,
        isFeatured: eventData.isFeatured,
        location: eventData.location,
        priceIndicator: eventData.priceIndicator,
        entryFee: eventData.entryFee,
        attendees: eventData.attendees || [],
        createdAt: Timestamp.fromDate(new Date()) as any, // Use type assertion to avoid TypeScript error
        createdBy: eventData.createdBy,
        createdByType: eventData.createdByType,
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

  // Enhance the deleteEvent method to also delete associated images
  async deleteEvent(eventId: string): Promise<void> {
    try {
      console.log("FirebaseService: Deleting event", eventId)

      // Get event data to check for images
      const eventRef = doc(db, "events", eventId)
      const eventDoc = await getDoc(eventRef)

      if (eventDoc.exists()) {
        // Delete the event document
        await deleteDoc(eventRef)
        console.log("FirebaseService: Event deleted successfully")
      } else {
        console.warn("FirebaseService: Event not found", eventId)
      }

      return
    } catch (error) {
      console.error("Error deleting event:", error)
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
      const q = query(vibeImagesRef, where("venueId", "==", venueId), orderBy("uploadedAt", "desc"))
      const querySnapshot = await getDocs(q)

      if (!querySnapshot.empty) {
        // Calculate average of recent vibe ratings (last 10 ratings or all if less than 10)
        const recentRatings: number[] = []
        querySnapshot.docs.slice(0, 10).forEach((doc) => {
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

  async getVibeImagesByVenueAndDate(venueId: string, date: Date): Promise<VibeImage[]> {
    try {
      console.log("FirebaseService: Getting vibe images for venue and date", venueId, date.toDateString())

      // Create start and end of day timestamps
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)

      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      console.log("Date range:", startOfDay.toISOString(), "to", endOfDay.toISOString())

      const vibeImagesRef = collection(db, "vibeImages")
      const q = query(
        vibeImagesRef,
        where("venueId", "==", venueId),
        where("uploadedAt", ">=", Timestamp.fromDate(startOfDay)),
        where("uploadedAt", "<=", Timestamp.fromDate(endOfDay)),
        orderBy("uploadedAt", "desc"),
      )

      const querySnapshot = await getDocs(q)
      const vibeImages: VibeImage[] = []

      console.log("Query returned", querySnapshot.size, "documents")

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        console.log("Processing vibe image:", doc.id, data.uploadedAt.toDate())
        vibeImages.push({
          id: doc.id,
          venueId: data.venueId,
          imageUrl: data.imageUrl,
          vibeRating: data.vibeRating,
          uploadedAt: data.uploadedAt.toDate(),
          uploadedBy: data.uploadedBy,
          analysisData: data.analysisData,
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
      console.log("FirebaseService: Getting vibe images for venue and week", venueId)

      // Get last 7 days
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 7)

      console.log("Week range:", startDate.toISOString(), "to", endDate.toISOString())

      const vibeImagesRef = collection(db, "vibeImages")
      const q = query(
        vibeImagesRef,
        where("venueId", "==", venueId),
        where("uploadedAt", ">=", Timestamp.fromDate(startDate)),
        where("uploadedAt", "<=", Timestamp.fromDate(endDate)),
        orderBy("uploadedAt", "desc"),
      )

      const querySnapshot = await getDocs(q)
      const weekVibes: Record<string, VibeImage[]> = {}

      console.log("Week query returned", querySnapshot.size, "documents")

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        const vibeImage: VibeImage = {
          id: doc.id,
          venueId: data.venueId,
          imageUrl: data.imageUrl,
          vibeRating: data.vibeRating,
          uploadedAt: data.uploadedAt.toDate(),
          uploadedBy: data.uploadedBy,
          analysisData: data.analysisData,
        }

        // Group by date string
        const dateString = vibeImage.uploadedAt.toISOString().split("T")[0]
        if (!weekVibes[dateString]) {
          weekVibes[dateString] = []
        }
        weekVibes[dateString].push(vibeImage)
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

      const vibeImagesRef = collection(db, "vibeImages")
      const q = query(vibeImagesRef, where("venueId", "==", venueId), orderBy("uploadedAt", "desc"))

      const querySnapshot = await getDocs(q)

      if (querySnapshot.empty) {
        return null
      }

      const latestVibe = querySnapshot.docs[0].data()
      return latestVibe.vibeRating
    } catch (error) {
      console.error("Error getting latest vibe rating:", error)
      return null
    }
  }

  // Image upload methods - Web-friendly versions
  async uploadVenueImage(uri: string): Promise<string> {
    try {
      console.log("FirebaseService: Uploading venue image")
      // For web, we'll just return the URL directly if it's already a URL
      if (uri.startsWith("http") && !uri.startsWith("data:")) {
        console.log("FirebaseService: Image is already a URL, returning directly")
        return uri
      }

      // For development or testing on web
      if (isDevelopment()) {
        return "https://images.unsplash.com/photo-1566737236500-c8ac43014a67?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80"
      }

      // Generate a unique filename
      const filename = `venues/${uuidv4()}`
      const storageRef = ref(storage, filename)

      // Handle data URLs (from web file picker)
      if (uri.startsWith("data:")) {
        // Upload data URL directly
        await uploadString(storageRef, uri, "data_url")
        const downloadUrl = await getDownloadURL(storageRef)
        return downloadUrl
      }

      // Otherwise, we need to upload the file
      // Convert URI to blob
      const response = await fetch(uri)
      const blob = await response.blob()

      // Upload blob to Firebase Storage
      const uploadResult = await uploadBytes(storageRef, blob)

      // Get download URL
      const downloadUrl = await getDownloadURL(uploadResult.ref)
      return downloadUrl
    } catch (error) {
      console.error("FirebaseService: Error uploading venue image:", error)
      // Return a placeholder in case of error
      return "https://images.unsplash.com/photo-1566737236500-c8ac43014a67?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80"
    }
  }

  async uploadEventImage(uri: string): Promise<string> {
    try {
      console.log("FirebaseService: Uploading event image", uri.substring(0, 50) + "...")

      // For web, we'll just return the URL directly if it's already a URL and not a data URI
      if (uri.startsWith("http") && !uri.startsWith("data:")) {
        console.log("FirebaseService: Image is already a URL, returning directly")
        return uri
      }

      // Generate a unique filename
      const filename = `events/${uuidv4()}`
      const storageRef = ref(storage, filename)

      // Handle data URLs (from web file picker)
      if (uri.startsWith("data:")) {
        console.log("FirebaseService: Uploading data URL")
        // Upload data URL directly
        await uploadString(storageRef, uri, "data_url")
        const downloadUrl = await getDownloadURL(storageRef)
        console.log("FirebaseService: Upload successful, URL:", downloadUrl.substring(0, 50) + "...")
        return downloadUrl
      }

      // Otherwise, we need to upload the file
      console.log("FirebaseService: Fetching image data")
      // Convert URI to blob
      const response = await fetch(uri)
      const blob = await response.blob()

      console.log("FirebaseService: Uploading blob to Firebase Storage")
      // Upload blob to Firebase Storage
      const uploadResult = await uploadBytes(storageRef, blob)

      // Get download URL
      const downloadUrl = await getDownloadURL(uploadResult.ref)
      console.log("FirebaseService: Upload successful, URL:", downloadUrl.substring(0, 50) + "...")
      return downloadUrl
    } catch (error) {
      console.error("FirebaseService: Error uploading event image:", error)

      // In development mode, return a placeholder but log the error
      if (isDevelopment()) {
        console.warn("FirebaseService: Using placeholder image due to error")
        return "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80"
      }

      // In production, rethrow the error
      throw error
    }
  }

  async uploadVibeImage(uri: string): Promise<string> {
    try {
      console.log("FirebaseService: Uploading vibe image")

      // For web, we'll just return the URL directly if it's already a URL and not a data URI
      if (uri.startsWith("http") && !uri.startsWith("data:")) {
        console.log("FirebaseService: Image is already a URL, returning directly")
        return uri
      }

      // Generate a unique filename
      const filename = `vibes/${uuidv4()}`
      const storageRef = ref(storage, filename)

      // Handle data URLs (from web file picker)
      if (uri.startsWith("data:")) {
        console.log("FirebaseService: Uploading vibe data URL")
        // Upload data URL directly
        await uploadString(storageRef, uri, "data_url")
        const downloadUrl = await getDownloadURL(storageRef)
        console.log("FirebaseService: Vibe upload successful")
        return downloadUrl
      }

      // Otherwise, we need to upload the file
      console.log("FirebaseService: Fetching vibe image data")
      // Convert URI to blob
      const response = await fetch(uri)
      const blob = await response.blob()

      console.log("FirebaseService: Uploading vibe blob to Firebase Storage")
      // Upload blob to Firebase Storage
      const uploadResult = await uploadBytes(storageRef, blob)

      // Get download URL
      const downloadUrl = await getDownloadURL(uploadResult.ref)
      console.log("FirebaseService: Vibe upload successful")
      return downloadUrl
    } catch (error) {
      console.error("FirebaseService: Error uploading vibe image:", error)

      // In development mode, return a placeholder but log the error
      if (isDevelopment()) {
        console.warn("FirebaseService: Using placeholder vibe image due to error")
        return "https://images.unsplash.com/photo-1571204829887-3b8d69e23af5?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80"
      }

      // In production, rethrow the error
      throw error
    }
  }

  // Admin methods
  async getAllUsers(): Promise<User[]> {
    try {
      const usersRef = collection(db, "users")
      const querySnapshot = await getDocs(usersRef)
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

      return users
    } catch (error) {
      console.error("Error getting all users:", error)
      throw error
    }
  }

  async getClubOwners(): Promise<User[]> {
    try {
      const usersRef = collection(db, "users")
      const q = query(usersRef, where("userType", "==", "club_owner"))
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

      return users
    } catch (error) {
      console.error("Error getting club owners:", error)
      throw error
    }
  }

  async freezeUser(userId: string, isFrozen: boolean): Promise<void> {
    try {
      const userRef = doc(db, "users", userId)
      await updateDoc(userRef, { isFrozen })
      return
    } catch (error) {
      console.error("Error freezing/unfreezing user:", error)
      throw error
    }
  }

  // Enhance the deleteUser method to also delete user's content
  async deleteUser(userId: string): Promise<void> {
    try {
      console.log("FirebaseService: Deleting user", userId)

      // Get user data to check if they're a venue owner
      const userRef = doc(db, "users", userId)
      const userDoc = await getDoc(userRef)

      if (userDoc.exists()) {
        const userData = userDoc.data()

        // If user is a club owner, delete their venues
        if (userData.userType === "club_owner") {
          // Get all venues owned by this user
          const venuesRef = collection(db, "venues")
          const q = query(venuesRef, where("ownerId", "==", userId))
          const venueSnapshot = await getDocs(q)

          // Delete each venue and its events
          const venueDeletePromises: Promise<void>[] = []
          venueSnapshot.forEach((venueDoc) => {
            // Delete events for this venue
            venueDeletePromises.push(this.deleteEventsByVenue(venueDoc.id))
            // Delete the venue itself
            venueDeletePromises.push(deleteDoc(venueDoc.ref))
          })

          await Promise.all(venueDeletePromises)
          console.log(`FirebaseService: Deleted ${venueSnapshot.size} venues for user ${userId}`)
        }

        // Delete user's events (if they created any as a regular user)
        const eventsRef = collection(db, "events")
        const eventsQuery = query(eventsRef, where("createdBy", "==", userId))
        const eventsSnapshot = await getDocs(eventsQuery)

        const eventDeletePromises: Promise<void>[] = []
        eventsSnapshot.forEach((eventDoc) => {
          eventDeletePromises.push(deleteDoc(eventDoc.ref))
        })

        await Promise.all(eventDeletePromises)
        console.log(`FirebaseService: Deleted ${eventsSnapshot.size} events created by user ${userId}`)
      }

      // Finally delete the user document
      await deleteDoc(userRef)
      console.log("FirebaseService: User deleted successfully")
      return
    } catch (error) {
      console.error("Error deleting user:", error)
      throw error
    }
  }
}

export default new FirebaseService()
