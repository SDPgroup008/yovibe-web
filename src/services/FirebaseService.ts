import "react-native-get-random-values"
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth"
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  setDoc,
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
import { Dimensions } from "react-native"
import { auth, db } from "../config/firebase"
import type { User, UserType } from "../models/User"
import type { Venue } from "../models/Venue"
import type { Event } from "../models/Event"
import type { VibeImage } from "../models/VibeImage"

// Responsive breakpoints for image loading optimization
const { width: screenWidth } = Dimensions.get('window');
const isSmallDevice = screenWidth < 380;
const isTablet = screenWidth >= 768;
const isLargeScreen = screenWidth >= 1024;

// Determine optimal image size based on device
const getOptimalImageSize = (): { width: number; quality: number } => {
  if (isSmallDevice) return { width: 400, quality: 75 };   // Phones: smaller, faster
  if (isTablet) return { width: 800, quality: 85 };         // Tablets: medium
  return { width: 1200, quality: 90 };                      // Desktop: high quality
};

class FirebaseService {
  private static instance: FirebaseService

  private constructor() {
    // FirebaseService initialized
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
      // Signing up user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const { uid } = userCredential.user

      // Create user profile in Firestore
      const userRef = await addDoc(collection(db, "YoVibe/data/users"), {
        uid,
        email,
        userType,
        createdAt: Timestamp.now(),
        lastLoginAt: Timestamp.now(),
        isDeleted: false,
      })
      // User profile created

      return
    } catch (error) {
      // Error signing up
      throw error
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    console.log("FirebaseService.signIn: Starting sign in for", email);
    try {
      console.log("FirebaseService.signIn: Calling Firebase Auth signInWithEmailAndPassword");
      const result = await signInWithEmailAndPassword(auth, email, password);
      console.log("FirebaseService.signIn: Sign in successful, UID:", result.user.uid);
    } catch (error) {
      console.error("FirebaseService.signIn: Error signing in:", error);
      throw error;
    }
  }

  async signOut(): Promise<void> {
    try {
      // Starting sign out process

      // Clear any cached auth state
      if (auth.currentUser) {
        // Signing out current user
      }

      // Additional cleanup - clear any persisted auth state
      if (typeof window !== "undefined" && window.localStorage) {
        // Clearing localStorage
        // Clear any Firebase auth persistence
        const firebaseKeys = Object.keys(window.localStorage).filter(
          (key) => key.startsWith("firebase:") || key.includes("firebaseLocalStorageDb"),
        )
        firebaseKeys.forEach((key) => {
          // Removing key
        })
      }

      // Sign out completed
    } catch (error) {
      // Error during sign out
    }
  }

  // User methods
  async getUserProfile(uid: string): Promise<User> {
    console.log("FirebaseService.getUserProfile: Looking for user with UID:", uid);
    try {
      console.log("FirebaseService.getUserProfile: Querying Firestore for user profile");
      const usersRef = collection(db, "YoVibe/data/users")
      const q = query(usersRef, where("uid", "==", uid))
      const querySnapshot = await getDocs(q)
      console.log("FirebaseService.getUserProfile: Query returned", querySnapshot.size, "documents");

      if (querySnapshot.empty) {
        console.log("FirebaseService.getUserProfile: User profile NOT FOUND in Firestore");
        throw new Error("User not found")
      }

      const userDoc = querySnapshot.docs[0]
      const userData = userDoc.data()
      console.log("FirebaseService.getUserProfile: User profile found:", userData.email);

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
      console.error("FirebaseService.getUserProfile: Error getting user profile:", error);
      throw error
    }
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      const currentUser = auth.currentUser
      if (!currentUser) {
        // No current user
        return null
      }

      // Getting current user profile
      return await this.getUserProfile(currentUser.uid)
    } catch (error) {
      // Error getting current user
      throw error
    }
  }

  async updateUserProfile(userId: string, data: Partial<User>): Promise<void> {
    try {
      // Updating user profile
      const userRef = doc(db, "YoVibe/data/users", userId)
      await updateDoc(userRef, {
        ...data,
        lastLoginAt: Timestamp.now(),
      })
      // User profile updated
    } catch (error) {
      // Error updating user profile
      throw error
    }
  }

  // Admin methods - User Management
  async getAllUsers(): Promise<User[]> {
    try {
      // Getting all users
      const usersRef = collection(db, "YoVibe/data/users")
      const querySnapshot = await getDocs(usersRef)
      const users: User[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        // Skip deleted users
        if (data.isDeleted === true) {
          return
        }
        users.push({
          id: doc.id,
          uid: data.uid,
          email: data.email,
          userType: data.userType,
          displayName: data.displayName,
          photoURL: data.photoURL,
          venueId: data.venueId,
          isFrozen: data.isFrozen || false,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          lastLoginAt: data.lastLoginAt?.toDate?.() || new Date(),
        })
      })

      // Found users
      return users
    } catch (error) {
      // Error getting all users
      throw error
    }
  }

  async freezeUser(userId: string, isFrozen: boolean): Promise<void> {
    try {
      // console.log("FirebaseService:", isFrozen ? "Freezing" : "Unfreezing", "user", userId)
      const userRef = doc(db, "YoVibe/data/users", userId)
      await updateDoc(userRef, {
        isFrozen: isFrozen,
        frozenAt: isFrozen ? Timestamp.now() : null,
      })
      // console.log("FirebaseService: User frozen status updated")
    } catch (error) {
      // console.error("FirebaseService: Error freezing/unfreezing user:", error)
      throw error
    }
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      // console.log("FirebaseService: Soft deleting user", userId)
      const userRef = doc(db, "YoVibe/data/users", userId)
      await updateDoc(userRef, {
        isDeleted: true,
        deletedAt: Timestamp.now(),
        email: `deleted_${Date.now()}@yovibe.app`, // Anonymize email
        displayName: "Deleted User",
      })
      // console.log("FirebaseService: User soft deleted successfully")
    } catch (error) {
      // console.error("FirebaseService: Error deleting user:", error)
      throw error
    }
  }

  // Venue methods
  async getVenues(): Promise<Venue[]> {
    try {
      // console.log("FirebaseService: Getting venues")
      const venuesRef = collection(db, "YoVibe/data/venues")
      const querySnapshot = await getDocs(venuesRef);
      // console.log("FirebaseService: Total venues in database:", querySnapshot.size);

      if (querySnapshot.empty) {
        // console.log("FirebaseService: No venues found in database, returning mock data for development");
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

      // console.log("FirebaseService: Found", venues.length, "active venues");

      if (venues.length === 0) {
        // console.log("FirebaseService: All venues are deleted, returning mock data for development");
        return this.getMockVenues()
      }

      return venues
    } catch (error) {
      // console.error("FirebaseService: Error getting venues:", error);
      // console.log("FirebaseService: Falling back to mock data due to error");
      return this.getMockVenues()
    }
  }

  async getVenuesPaginated(pageSize: number = 5, lastDoc?: DocumentSnapshot): Promise<{venues: Venue[], lastDoc: DocumentSnapshot | null}> {
    try {
      // console.log("\n========== FIREBASE VENUE PAGINATION ==========\nRequested page size:", pageSize)
      // if (lastDoc) {
      //   console.log("Continuing from last document (pagination cursor set)")
      // } else {
      //   console.log("Starting fresh fetch (first page)")
      // }
      
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
      // console.log("\nFirebase returned", querySnapshot.size, "venue documents")
      
      const venues: Venue[] = []
      let deletedCount = 0
      let loadedCount = 0
      let lastVisible = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null
      
      querySnapshot.forEach((doc) => {
        const data = doc.data()
        const venueName = data.name || "Unnamed Venue"
        
        if (data.isDeleted) {
          deletedCount++
          // console.log(`❌ EXCLUDED: "${venueName}" (ID: ${doc.id}) - Reason: Marked as deleted (isDeleted=true)`)
        } else {
          loadedCount++
          const categories = data.categories || []
          // console.log(`✅ LOADED: "${venueName}" (ID: ${doc.id}) - Categories: [${categories.join(", ")}], Type: ${data.venueType || "nightlife"}`)
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
      
      // console.log("\n--- FIREBASE FETCH SUMMARY ---")
      // console.log("Total documents from Firebase:", querySnapshot.size)
      // console.log("Loaded venues:", loadedCount)
      // console.log("Excluded (deleted):", deletedCount)
      // console.log("Returning", venues.length, "venues to screen")
      // console.log("Has more pages:", querySnapshot.docs.length === pageSize)
      // console.log("========================================\n")
      
      return { venues, lastDoc: lastVisible }
    } catch (error) {
      // console.error("❌ Error getting paginated venues from Firestore:", error)
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
      // console.error("Error getting venues by owner:", error)
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
      // console.error("Error getting venue by ID:", error)
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
      // console.error("Error adding venue:", error)
      throw error
    }
  }

  async uploadVenueImage(imageUri: string, venueId: string = `venue-${Date.now()}`): Promise<string> {
    try {
      // console.log("FirebaseService: Uploading venue background image for venue", venueId)
      const storage = getStorage()
      const storageRef = ref(storage, `venues/${venueId}/background.jpg`)

      await uploadString(storageRef, imageUri, "data_url")
      const downloadURL = await getDownloadURL(storageRef)
      // console.log("FirebaseService: Venue image uploaded, URL:", downloadURL)
      return downloadURL
    } catch (error) {
      // console.error("FirebaseService: Error uploading venue image:", error)
      throw error
    }
  }

  async updateVenue(venueId: string, data: Partial<Venue>): Promise<void> {
    try {
      const venueRef = doc(db, "YoVibe/data/venues", venueId)
      await updateDoc(venueRef, data)
      return
    } catch (error) {
      // console.error("Error updating venue:", error)
      throw error
    }
  }

  async updateVenuePrograms(venueId: string, programs: Record<string, string>): Promise<void> {
    try {
      const venueRef = doc(db, "YoVibe/data/venues", venueId)
      await updateDoc(venueRef, { weeklyPrograms: programs })
      return
    } catch (error) {
      // console.error("Error updating venue programs:", error)
      throw error
    }
  }

  async deleteVenue(venueId: string): Promise<void> {
    try {
      // console.log("FirebaseService: Soft deleting venue", venueId)
      const venueRef = doc(db, "YoVibe/data/venues", venueId)
      await updateDoc(venueRef, {
        isDeleted: true,
        deletedAt: Timestamp.now(),
      })
      // console.log("FirebaseService: Venue soft deleted successfully")
      return
    } catch (error) {
      // console.error("Error soft deleting venue:", error)
      throw error
    }
  }

  async restoreVenue(venueId: string): Promise<void> {
    try {
      // console.log("FirebaseService: Restoring venue", venueId)
      const venueRef = doc(db, "YoVibe/data/venues", venueId)
      await updateDoc(venueRef, {
        isDeleted: false,
        deletedAt: null,
      })
      // console.log("FirebaseService: Venue restored successfully")
      return
    } catch (error) {
      // console.error("Error restoring venue:", error)
      throw error
    }
  }

  async getDeletedVenues(): Promise<Venue[]> {
    try {
      // console.log("FirebaseService: Getting deleted venues")
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

      // console.log("FirebaseService: Found", venues.length, "deleted venues")
      return venues
    } catch (error) {
      // console.error("Error getting deleted venues:", error)
      throw error
    }
  }

  async deleteExpiredCustomVenues(): Promise<void> {
    try {
      // console.log("FirebaseService: Deleting expired custom venues")
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
          // console.log(`FirebaseService: Deleting custom venue ${venueId} for expired event ${doc.id}`)
          const venueRef = doc(db, "YoVibe/data/venues", venueId)
          deletePromises.push(deleteDoc(venueRef))
        }
      }

      await Promise.all(deletePromises)
      // console.log(`FirebaseService: Deleted ${deletePromises.length} custom venues`)
    } catch (error) {
      // console.error("FirebaseService: Error deleting expired custom venues:", error)
      throw error
    }
  }

  // Event methods
  async getEvents(): Promise<Event[]> {
    try {
      // console.log("FirebaseService: Getting events")
      
      // Clean up old events using existing function
      await this.deletePastEvents()
      
      const eventsRef = collection(db, "YoVibe/data/events")
      const querySnapshot = await getDocs(eventsRef)
      const events: Event[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        
        // Skip deleted events
        if (data.isDeleted === true) {
          return
        }
        
        if (!data.date || typeof data.date.toDate !== "function") {
          // console.warn(`FirebaseService: Skipping event ${doc.id} with invalid date field`, data.date)
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

      // console.log("FirebaseService: Found", events.length, "events")
      return events.sort((a, b) => a.date.getTime() - b.date.getTime())
    } catch (error) {
      // console.error("Error getting events from Firestore:", error)
      return []
    }
  }

  async getEventsPaginated(pageSize: number = 5, lastDoc?: DocumentSnapshot): Promise<{events: Event[], lastDoc: DocumentSnapshot | null}> {
    try {
      // console.log("FirebaseService: Getting paginated events, pageSize:", pageSize)
      
      // Clean up old events using existing function
      await this.deletePastEvents()
      
      const eventsRef = collection(db, "YoVibe/data/events")
      
      let q = query(
        eventsRef,
        where("isDeleted", "!=", true),
        orderBy("isDeleted", "asc"),
        orderBy("date", "asc"),
        limit(pageSize)
      )
      
      if (lastDoc) {
        q = query(
          eventsRef,
          where("isDeleted", "!=", true),
          orderBy("isDeleted", "asc"),
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
        
        if (!data.date || typeof data.date.toDate !== "function") {
          // console.warn(`FirebaseService: Skipping event ${doc.id} with invalid date field`, data.date)
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
      
      // console.log("FirebaseService: Found", events.length, "paginated events")
      return { events, lastDoc: lastVisible }
    } catch (error) {
      // console.error("Error getting paginated events from Firestore:", error)
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
        
        // Skip deleted events
        if (data.isDeleted === true) {
          return
        }
        
        if (!data.date || typeof data.date.toDate !== "function") {
          // console.warn(`FirebaseService: Skipping featured event ${doc.id} with invalid date field`, data.date)
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
          entryFees: data.entryFees || (data.entryFee ? [{ name: "General", amount: data.entryFee.toString() }] : []),
          ticketContacts: data.ticketContacts || [],
          attendees: data.attendees || [],
          createdAt: data.createdAt?.toDate?.() || new Date(),
          createdBy: data.createdBy,
          createdByType: data.createdByType,
          isFreeEntry: data.isFreeEntry ?? (data.entryFees?.length === 0),
        })
      })

      return events.sort((a, b) => a.date.getTime() - b.date.getTime())
    } catch (error) {
      // console.error("Error getting featured events:", error)
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
        
        // Skip deleted events
        if (data.isDeleted === true) {
          return
        }
        
        if (!data.date || typeof data.date.toDate !== "function") {
          // console.warn(`FirebaseService: Skipping event ${doc.id} with invalid date field`, data.date)
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
          entryFees: data.entryFees || (data.entryFee ? [{ name: "General", amount: data.entryFee.toString() }] : []),
          ticketContacts: data.ticketContacts || [],
          attendees: data.attendees || [],
          createdAt: data.createdAt?.toDate?.() || new Date(),
          createdBy: data.createdBy,
          createdByType: data.createdByType,
          isFreeEntry: data.isFreeEntry ?? (data.entryFees?.length === 0),
        })
      })

      return events.sort((a, b) => a.date.getTime() - b.date.getTime())
    } catch (error) {
      // console.error("Error getting events by venue:", error)
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
        // console.warn(`FirebaseService: Skipping event ${eventId} with invalid date field`, data.date)
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
        paymentMethods: data.paymentMethods || { mobileMoney: [], bankAccounts: [] },
      }
    } catch (error) {
      // console.error("Error getting event by ID:", error)
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
        paymentMethods: eventData.paymentMethods || { mobileMoney: [], bankAccounts: [] },
      }

      const eventRef = await addDoc(collection(db, "YoVibe/data/events"), firestoreEventData)
      return eventRef.id
    } catch (error) {
      // console.error("Error adding event:", error)
      throw error
    }
  }

  async updateEvent(eventId: string, data: Partial<Event>): Promise<void> {
    try {
      // console.log("FirebaseService: Updating event", eventId)
      const eventRef = doc(db, "YoVibe/data/events", eventId)
      const updateData: any = { ...data }
      if (data.date) {
        updateData.date = Timestamp.fromDate(data.date)
      }
      await updateDoc(eventRef, updateData)
      // console.log("FirebaseService: Event updated successfully")
    } catch (error) {
      // console.error("Error updating event:", error)
      throw error
    }
  }

  async deleteEvent(eventId: string): Promise<void> {
    try {
      // console.log("FirebaseService: Soft deleting event", eventId)
      const eventRef = doc(db, "YoVibe/data/events", eventId)
      await updateDoc(eventRef, {
        isDeleted: true,
        deletedAt: Timestamp.now(),
      })
      // console.log("FirebaseService: Event soft deleted successfully")
    } catch (error) {
      // console.error("Error soft deleting event:", error)
      throw error
    }
  }

  // Delete all events associated with a venue (cascade soft delete)
  async deleteEventsByVenue(venueId: string): Promise<void> {
    try {
      // console.log("FirebaseService: Soft deleting events for venue", venueId)
      const eventsRef = collection(db, "YoVibe/data/events")
      const q = query(eventsRef, where("venueId", "==", venueId))
      const querySnapshot = await getDocs(q)

      if (querySnapshot.empty) {
        // console.log("FirebaseService: No events found for venue", venueId)
        return
      }

      // Soft delete each event
      const deletePromises = querySnapshot.docs.map((eventDoc) => {
        const eventRef = doc(db, "YoVibe/data/events", eventDoc.id)
        return updateDoc(eventRef, {
          isDeleted: true,
          deletedAt: Timestamp.now(),
        })
      })

      await Promise.all(deletePromises)
      // console.log("FirebaseService: Soft deleted", deletePromises.length, "events for venue")
    } catch (error) {
      // console.error("Error soft deleting events by venue:", error)
      throw error
    }
  }

  async getLatestVibeRating(venueId: string): Promise<number | null> {
    try {
      // console.log("FirebaseService: Getting latest vibe rating for venue", venueId)
      const vibeRatingsRef = collection(db, "YoVibe/data/vibeRatings")
      const q = query(vibeRatingsRef, where("venueId", "==", venueId), orderBy("createdAt", "desc"), limit(1))
      const querySnapshot = await getDocs(q)

      if (querySnapshot.empty) {
        // console.log("FirebaseService: No vibe ratings found for venue", venueId)
        return null
      }

      const latestRating = querySnapshot.docs[0].data()
      // console.log("FirebaseService: Latest vibe rating found:", latestRating.rating)
      return latestRating.rating || null
    } catch (error) {
      // console.error("Error getting latest vibe rating:", error)
      return Math.random() * 5
    }
  }

  async deletePastEvents(): Promise<void> {
    try {
      // console.log("========================================")
      // console.log("🗑️  DELETE PAST EVENTS - STARTING")
      // console.log("========================================")
      
      const eventsRef = collection(db, "YoVibe/data/events")
      const querySnapshot = await getDocs(eventsRef)
      const now = new Date()
      
      // console.log(`📅 Current Date/Time: ${now.toLocaleString()}`)
      // console.log(`📊 Total Events in Database: ${querySnapshot.size}`)
      // console.log("----------------------------------------")

      const deletePromises: Promise<void>[] = []
      let deletedCount = 0
      let skippedCount = 0
      let alreadyDeletedCount = 0
      let invalidDateCount = 0

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        const eventId = doc.id
        const eventName = data.name || "Unnamed Event"
        
        // console.log(`\n📌 Event: "${eventName}" (ID: ${eventId})`)
        
        if (data.date && typeof data.date.toDate === "function") {
          const eventDate: Date = data.date.toDate()
          // console.log(`   📅 Event Date: ${eventDate.toLocaleString()}`)

          // Compute the "expiry" date = next day at 5:00 AM
          const expiryDate = new Date(eventDate)
          expiryDate.setDate(expiryDate.getDate() + 1)
          expiryDate.setHours(5, 0, 0, 0) // Set to 5:00 AM
          // console.log(`   ⏰ Expiry Date (Next day at 5:00 AM): ${expiryDate.toLocaleString()}`)
          // console.log(`   🔍 isDeleted flag: ${data.isDeleted}`)

          // Check if already deleted
          if (data.isDeleted) {
            // console.log(`   ⏭️  SKIPPED: Already marked as deleted`)
            alreadyDeletedCount++
          }
          // Only delete if we are past the expiry date
          else if (expiryDate <= now) {
            // console.log(`   ✅ WILL DELETE: Expiry date (${expiryDate.toLocaleString()}) <= Now (${now.toLocaleString()})`)
            deletedCount++
            deletePromises.push(
              updateDoc(doc.ref, {
                isDeleted: true,
                deletedAt: Timestamp.now(),
              })
            )
          } else {
            const timeUntilExpiry = expiryDate.getTime() - now.getTime()
            const hoursUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60 * 60))
            const minutesUntilExpiry = Math.floor((timeUntilExpiry % (1000 * 60 * 60)) / (1000 * 60))
            // console.log(`   ⏭️  SKIPPED: Event not expired yet (Expires in ${hoursUntilExpiry}h ${minutesUntilExpiry}m)`)
            skippedCount++
          }
        } else {
          // console.log(`   ❌ INVALID: No valid date field`)
          invalidDateCount++
        }
      })

      // console.log("\n----------------------------------------")
      // console.log("⏳ Executing deletion updates...")
      await Promise.all(deletePromises)
      
      // console.log("\n========================================")
      // console.log("📊 DELETE PAST EVENTS - SUMMARY")
      // console.log("========================================")
      // console.log(`✅ Events Marked as Deleted: ${deletedCount}`)
      // console.log(`⏭️  Events Skipped (Not Expired): ${skippedCount}`)
      // console.log(`🔄 Events Already Deleted: ${alreadyDeletedCount}`)
      // console.log(`❌ Events with Invalid Dates: ${invalidDateCount}`)
      // console.log(`📊 Total Events Processed: ${querySnapshot.size}`)
      // console.log("========================================\n")
    } catch (error) {
      // console.error("❌ Error deleting past events:", error)
    }
  }


  async getVibeImagesByVenueAndDate(venueId: string, date: Date): Promise<VibeImage[]> {
    try {
      // console.log("FirebaseService: Getting vibe images for venue", venueId, "on", date.toDateString())
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

      // console.log("FirebaseService: Found", vibeImages.length, "vibe images for today")
      return vibeImages
    } catch (error) {
      // console.error("Error getting vibe images by venue and date:", error)
      return []
    }
  }

  async getVibeImagesByVenueAndWeek(venueId: string): Promise<Record<string, VibeImage[]>> {
    try {
      // console.log("FirebaseService: Getting vibe images for venue", venueId, "for the week")
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

      // console.log("FirebaseService: Found vibe images for", Object.keys(weekData).length, "days")
      return weekData
    } catch (error) {
      // console.error("Error getting vibe images by venue and week:", error)
      return {}
    }
  }

  async uploadVibeImage(fileOrUrl: Blob | string, venueId: string = `vibe-${Date.now()}`): Promise<string> {
    try {
      // console.log("FirebaseService: Uploading vibe image for venue", venueId);

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
        // console.log("FirebaseService: Vibe image uploaded (data_url), URL:", downloadURL);
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
        // console.log("FirebaseService: Vibe image uploaded (blob), URL:", downloadURL);
        return downloadURL;
      }

      throw new Error("uploadVibeImage: unsupported file type");
    } catch (error) {
      // console.error("FirebaseService: Error uploading vibe image:", error);
      throw error;
    }
  }



  async uploadEventImage(imageUri: string, eventId: string = `event-${Date.now()}`): Promise<string> {
    try {
      // console.log("FirebaseService: Uploading event poster image for event", eventId)
      const storage = getStorage()
      const storageRef = ref(storage, `events/${eventId}/poster.jpg`)
      // console.log("Current user UID:", auth.currentUser?.uid)
      // console.log("Auth token exists:", !!await auth.currentUser?.getIdToken())

      await uploadString(storageRef, imageUri, "data_url")
      const downloadURL = await getDownloadURL(storageRef)
      // console.log("FirebaseService: Event image uploaded, URL:", downloadURL)
      return downloadURL
    } catch (error) {
      // console.error("FirebaseService: Error uploading event image:", error)
      throw error
    }
  }

  async addVibeImage(vibeImageData: Omit<VibeImage, "id">): Promise<string> {
    try {
      // console.log("FirebaseService: Adding vibe image for venue", vibeImageData.venueId)
      const vibeImageRef = await addDoc(collection(db, "YoVibe/data/vibeImages"), {
        ...vibeImageData,
        uploadedAt: Timestamp.fromDate(vibeImageData.uploadedAt),
      })
      // console.log("FirebaseService: Vibe image added with ID", vibeImageRef.id)

      const vibeRating = await this.getLatestVibeRating(vibeImageData.venueId)
      if (vibeRating !== null) {
        await this.updateVenue(vibeImageData.venueId, { vibeRating })
      }

      return vibeImageRef.id
    } catch (error) {
      // console.error("FirebaseService: Error adding vibe image:", error)
      throw error
    }
  }

  // ==================== TICKET METHODS ====================

  async saveTicket(ticket: any): Promise<string> {
    try {
      const ticketRef = await addDoc(collection(db, "YoVibe/data/tickets"), {
        ...ticket,
        purchaseDate: ticket.purchaseDate ? Timestamp.fromDate(ticket.purchaseDate) : Timestamp.now(),
        eventStartTime: ticket.eventStartTime ? Timestamp.fromDate(ticket.eventStartTime) : null,
        purchaseDeadline: ticket.purchaseDeadline ? Timestamp.fromDate(ticket.purchaseDeadline) : null,
        scannedAt: ticket.scannedAt ? Timestamp.fromDate(ticket.scannedAt) : null,
        payoutDate: ticket.payoutDate ? Timestamp.fromDate(ticket.payoutDate) : null,
      })
      return ticketRef.id
    } catch (error) {
      console.error("FirebaseService: Error saving ticket:", error)
      throw error
    }
  }

  async getTicketById(ticketId: string): Promise<any | null> {
    try {
      const ticketDoc = await getDoc(doc(db, "YoVibe/data/tickets", ticketId))
      if (!ticketDoc.exists()) {
        return null
      }
      const data = ticketDoc.data()
      return {
        id: ticketDoc.id,
        ...data,
        purchaseDate: data.purchaseDate?.toDate(),
        eventStartTime: data.eventStartTime?.toDate(),
        purchaseDeadline: data.purchaseDeadline?.toDate(),
        scannedAt: data.scannedAt?.toDate(),
        payoutDate: data.payoutDate?.toDate(),
        expiresAt: data.expiresAt?.toDate(),
      }
    } catch (error) {
      console.error("FirebaseService: Error getting ticket:", error)
      return null
    }
  }

  async getTicketByQRCode(qrCode: string): Promise<any | null> {
    try {
      const ticketsRef = collection(db, "YoVibe/data/tickets")
      const q = query(ticketsRef, where("qrCode", "==", qrCode))
      const querySnapshot = await getDocs(q)
      
      if (querySnapshot.empty) {
        console.log("FirebaseService: No ticket found with QR code:", qrCode)
        return null
      }
      
      const doc = querySnapshot.docs[0]
      const data = doc.data()
      return {
        id: doc.id,  // Use Firestore document ID, not the ticket's id field
        documentId: doc.id,
        qrCode: data.qrCode,
        eventId: data.eventId,
        eventName: data.eventName,
        buyerId: data.buyerId,
        buyerName: data.buyerName,
        buyerEmail: data.buyerEmail,
        quantity: data.quantity,
        totalAmount: data.totalAmount,
        basePrice: data.basePrice,
        lateFee: data.lateFee,
        venueRevenue: data.venueRevenue,
        appCommission: data.appCommission,
        purchaseDate: data.purchaseDate?.toDate(),
        eventStartTime: data.eventStartTime?.toDate(),
        purchaseDeadline: data.purchaseDeadline?.toDate(),
        scannedAt: data.scannedAt?.toDate(),
        payoutDate: data.payoutDate?.toDate(),
        expiresAt: data.expiresAt?.toDate(),
        status: data.status,
        entryFeeType: data.entryFeeType,
        paymentId: data.paymentId,
        paymentStatus: data.paymentStatus,
        pesapalTransactionId: data.pesapalTransactionId,
        isLatePurchase: data.isLatePurchase,
        isScanned: data.isScanned,
        payoutEligible: data.payoutEligible,
        payoutStatus: data.payoutStatus,
        paymentMethod: data.paymentMethod,
        paymentProvider: data.paymentProvider,
        paymentNumber: data.paymentNumber,
        paymentName: data.paymentName,
        validationHistory: data.validationHistory || [],
      }
    } catch (error) {
      console.error("FirebaseService: Error getting ticket by QR code:", error)
      return null
    }
  }

  async updateTicket(ticketId: string, data: any): Promise<void> {
    try {
      const updateData: any = { ...data }
      
      // Convert dates to timestamps
      if (data.purchaseDate) updateData.purchaseDate = Timestamp.fromDate(data.purchaseDate)
      if (data.eventStartTime) updateData.eventStartTime = Timestamp.fromDate(data.eventStartTime)
      if (data.purchaseDeadline) updateData.purchaseDeadline = Timestamp.fromDate(data.purchaseDeadline)
      if (data.scannedAt) updateData.scannedAt = Timestamp.fromDate(data.scannedAt)
      if (data.payoutDate) updateData.payoutDate = Timestamp.fromDate(data.payoutDate)
      
      await updateDoc(doc(db, "YoVibe/data/tickets", ticketId), updateData)
    } catch (error) {
      console.error("FirebaseService: Error updating ticket:", error)
      throw error
    }
  }

  async getTicketsByEvent(eventId: string): Promise<any[]> {
    try {
      const ticketsRef = collection(db, "YoVibe/data/tickets")
      const q = query(ticketsRef, where("eventId", "==", eventId))
      const querySnapshot = await getDocs(q)
      
      const tickets: any[] = []
      querySnapshot.forEach((doc) => {
        const data = doc.data()
        tickets.push({
          id: doc.id,
          ...data,
          purchaseDate: data.purchaseDate?.toDate(),
          eventStartTime: data.eventStartTime?.toDate(),
          purchaseDeadline: data.purchaseDeadline?.toDate(),
          scannedAt: data.scannedAt?.toDate(),
          payoutDate: data.payoutDate?.toDate(),
        })
      })
      
      return tickets
    } catch (error) {
      console.error("FirebaseService: Error getting tickets by event:", error)
      return []
    }
  }

  async getTicketsByUser(userId: string): Promise<any[]> {
    try {
      const ticketsRef = collection(db, "YoVibe/data/tickets")
      const q = query(ticketsRef, where("buyerId", "==", userId))
      const querySnapshot = await getDocs(q)
      
      const tickets: any[] = []
      querySnapshot.forEach((doc) => {
        const data = doc.data()
        tickets.push({
          id: doc.id,
          ...data,
          purchaseDate: data.purchaseDate?.toDate(),
          eventStartTime: data.eventStartTime?.toDate(),
          purchaseDeadline: data.purchaseDeadline?.toDate(),
          scannedAt: data.scannedAt?.toDate(),
          payoutDate: data.payoutDate?.toDate(),
        })
      })
      
      return tickets
    } catch (error) {
      console.error("FirebaseService: Error getting tickets by user:", error)
      return []
    }
  }

  async saveTicketValidation(validation: any): Promise<string> {
    try {
      const validationRef = await addDoc(collection(db, "YoVibe/data/ticketValidations"), {
        ...validation,
        validatedAt: validation.validatedAt ? Timestamp.fromDate(validation.validatedAt) : Timestamp.now(),
      })
      return validationRef.id
    } catch (error) {
      console.error("FirebaseService: Error saving ticket validation:", error)
      throw error
    }
  }

  // Email record storage for tracking sent emails
  async saveEmailRecord(record: any): Promise<string> {
    try {
      console.log("FirebaseService.saveEmailRecord: Saving email record:", record.type)
      const emailRef = await addDoc(collection(db, "YoVibe/data/emailRecords"), {
        ...record,
        sentAt: record.sentAt ? Timestamp.fromDate(record.sentAt) : Timestamp.now(),
      })
      console.log("FirebaseService.saveEmailRecord: Email record saved with ID:", emailRef.id)
      return emailRef.id
    } catch (error) {
      console.error("FirebaseService: Error saving email record:", error)
      throw error
    }
  }

  async getOrganizerWallet(organizerId: string): Promise<any | null> {
    try {
      const walletDoc = await getDoc(doc(db, `YoVibe/data/organizers/${organizerId}/wallet`, "main"))
      if (!walletDoc.exists()) {
        return null
      }
      const data = walletDoc.data()
      return {
        id: walletDoc.id,
        ...data,
        lastPayoutDate: data.lastPayoutDate?.toDate(),
        lastUpdated: data.lastUpdated?.toDate(),
      }
    } catch (error) {
      console.error("FirebaseService: Error getting organizer wallet:", error)
      return null
    }
  }

  async createOrUpdateOrganizerWallet(organizerId: string, walletData: any): Promise<void> {
    try {
      const walletRef = doc(db, `YoVibe/data/organizers/${organizerId}/wallet`, "main")
      const walletDoc = await getDoc(walletRef)
      
      if (walletDoc.exists()) {
        await updateDoc(walletRef, {
          ...walletData,
          lastUpdated: Timestamp.now(),
        })
      } else {
        await setDoc(walletRef, {
          ...walletData,
          organizerId,
          lastUpdated: Timestamp.now(),
        })
      }
    } catch (error) {
      console.error("FirebaseService: Error creating/updating organizer wallet:", error)
      throw error
    }
  }

  // ==================== PAYOUT METHODS ====================

  async savePayout(payout: any): Promise<string> {
    try {
      const payoutRef = await addDoc(collection(db, "YoVibe/data/payouts"), {
        ...payout,
        requestDate: payout.requestDate ? Timestamp.fromDate(payout.requestDate) : Timestamp.now(),
        processedDate: payout.processedDate ? Timestamp.fromDate(payout.processedDate) : null,
      })
      return payoutRef.id
    } catch (error) {
      console.error("FirebaseService: Error saving payout:", error)
      throw error
    }
  }

  async getPayoutById(payoutId: string): Promise<any | null> {
    try {
      const payoutDoc = await getDoc(doc(db, "YoVibe/data/payouts", payoutId))
      if (!payoutDoc.exists()) {
        return null
      }
      const data = payoutDoc.data()
      return {
        id: payoutDoc.id,
        ...data,
        requestDate: data.requestDate?.toDate(),
        processedDate: data.processedDate?.toDate(),
      }
    } catch (error) {
      console.error("FirebaseService: Error getting payout:", error)
      return null
    }
  }

  async getPayoutsByOrganizer(organizerId: string): Promise<any[]> {
    try {
      const payoutsRef = collection(db, "YoVibe/data/payouts")
      const q = query(payoutsRef, where("organizerId", "==", organizerId))
      const querySnapshot = await getDocs(q)
      
      const payouts: any[] = []
      querySnapshot.forEach((doc) => {
        const data = doc.data()
        payouts.push({
          id: doc.id,
          ...data,
          requestDate: data.requestDate?.toDate(),
          processedDate: data.processedDate?.toDate(),
        })
      })
      
      return payouts
    } catch (error) {
      console.error("FirebaseService: Error getting payouts by organizer:", error)
      return []
    }
  }

  async updatePayout(payoutId: string, data: any): Promise<void> {
    try {
      const updateData: any = { ...data }
      
      if (data.requestDate) updateData.requestDate = Timestamp.fromDate(data.requestDate)
      if (data.processedDate) updateData.processedDate = Timestamp.fromDate(data.processedDate)
      
      await updateDoc(doc(db, "YoVibe/data/payouts", payoutId), updateData)
    } catch (error) {
      console.error("FirebaseService: Error updating payout:", error)
      throw error
    }
  }

  async getEligibleTicketsForPayout(organizerId: string): Promise<any[]> {
    try {
      // Get events for this organizer
      const eventsRef = collection(db, "YoVibe/data/events")
      const eventsQuery = query(eventsRef, where("ownerId", "==", organizerId))
      const eventsSnapshot = await getDocs(eventsQuery)
      
      const eventIds: string[] = []
      eventsSnapshot.forEach((doc) => {
        eventIds.push(doc.id)
      })

      if (eventIds.length === 0) {
        return []
      }

      // Get eligible tickets (payoutEligible = true and payoutStatus = pending)
      const ticketsRef = collection(db, "YoVibe/data/tickets")
      const eligibleQuery = query(
        ticketsRef,
        where("eventId", "in", eventIds),
        where("payoutEligible", "==", true),
        where("payoutStatus", "==", "pending")
      )
      const ticketsSnapshot = await getDocs(eligibleQuery)
      
      const tickets: any[] = []
      ticketsSnapshot.forEach((doc) => {
        const data = doc.data()
        tickets.push({
          id: doc.id,
          ...data,
          purchaseDate: data.purchaseDate?.toDate(),
          eventStartTime: data.eventStartTime?.toDate(),
          scannedAt: data.scannedAt?.toDate(),
        })
      })
      
      return tickets
    } catch (error) {
      console.error("FirebaseService: Error getting eligible tickets for payout:", error)
      return []
    }
  }
}

const firebaseService = FirebaseService.getInstance()
export default firebaseService
