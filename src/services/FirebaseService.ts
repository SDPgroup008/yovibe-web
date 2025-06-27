import { initializeApp } from "firebase/app"
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth"
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore"
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { firebaseConfig } from "../config/firebase"
import type { User as AppUser } from "../models/User"
import type { Venue } from "../models/Venue"
import type { Event } from "../models/Event"
import type { VibeImage } from "../models/VibeImage"
import type { Ticket } from "../models/Ticket"

class FirebaseService {
  private static instance: FirebaseService
  private app
  private auth
  private db
  private storage

  private constructor() {
    console.log("Firebase service initialized")
    this.app = initializeApp(firebaseConfig)
    this.auth = getAuth(this.app)
    this.db = getFirestore(this.app)
    this.storage = getStorage(this.app)
  }

  static getInstance(): FirebaseService {
    if (!FirebaseService.instance) {
      FirebaseService.instance = new FirebaseService()
    }
    return FirebaseService.instance
  }

  // Auth methods
  async signIn(email: string, password: string): Promise<AppUser> {
    try {
      console.log(`FirebaseService: Signing in user ${email}`)
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password)
      const user = userCredential.user

      // Get user profile from Firestore
      const userDoc = await getDoc(doc(this.db, "users", user.uid))
      if (userDoc.exists()) {
        const userData = userDoc.data()
        return {
          id: user.uid,
          email: user.email!,
          displayName: user.displayName || userData.displayName || "",
          photoURL: user.photoURL || userData.photoURL || "",
          userType: userData.userType || "user",
        }
      } else {
        // Create user profile if it doesn't exist
        const newUser: AppUser = {
          id: user.uid,
          email: user.email!,
          displayName: user.displayName || "",
          photoURL: user.photoURL || "",
          userType: "user",
        }
        await this.createUserProfile(newUser)
        return newUser
      }
    } catch (error) {
      console.error("FirebaseService: Error signing in:", error)
      throw error
    }
  }

  async signUp(
    email: string,
    password: string,
    displayName: string,
    userType: "user" | "club_owner" = "user",
  ): Promise<AppUser> {
    try {
      console.log(`FirebaseService: Creating user ${email}`)
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password)
      const user = userCredential.user

      // Update the user's display name
      await updateProfile(user, { displayName })

      // Create user profile in Firestore
      const newUser: AppUser = {
        id: user.uid,
        email: user.email!,
        displayName,
        photoURL: "",
        userType,
      }

      await this.createUserProfile(newUser)
      return newUser
    } catch (error) {
      console.error("FirebaseService: Error creating user:", error)
      throw error
    }
  }

  async signOut(): Promise<void> {
    try {
      await signOut(this.auth)
    } catch (error) {
      console.error("FirebaseService: Error signing out:", error)
      throw error
    }
  }

  onAuthStateChanged(callback: (user: AppUser | null) => void): () => void {
    return onAuthStateChanged(this.auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(this.db, "users", user.uid))
          if (userDoc.exists()) {
            const userData = userDoc.data()
            callback({
              id: user.uid,
              email: user.email!,
              displayName: user.displayName || userData.displayName || "",
              photoURL: user.photoURL || userData.photoURL || "",
              userType: userData.userType || "user",
            })
          } else {
            callback({
              id: user.uid,
              email: user.email!,
              displayName: user.displayName || "",
              photoURL: user.photoURL || "",
              userType: "user",
            })
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

  async updateUserProfile(userId: string, updates: Partial<AppUser>): Promise<void> {
    try {
      const userRef = doc(this.db, "users", userId)
      await updateDoc(userRef, updates)

      // Also update Firebase Auth profile if displayName or photoURL changed
      if (this.auth.currentUser && (updates.displayName !== undefined || updates.photoURL !== undefined)) {
        const profileUpdates: { displayName?: string; photoURL?: string } = {}
        if (updates.displayName !== undefined) profileUpdates.displayName = updates.displayName
        if (updates.photoURL !== undefined) profileUpdates.photoURL = updates.photoURL
        await updateProfile(this.auth.currentUser, profileUpdates)
      }
    } catch (error) {
      console.error("Error updating user profile:", error)
      throw error
    }
  }

  private async createUserProfile(user: AppUser): Promise<void> {
    try {
      await addDoc(collection(this.db, "users"), {
        ...user,
        createdAt: serverTimestamp(),
      })
    } catch (error) {
      console.error("Error creating user profile:", error)
      throw error
    }
  }

  // Venue methods
  async createVenue(venue: Omit<Venue, "id">): Promise<string> {
    try {
      const docRef = await addDoc(collection(this.db, "venues"), {
        ...venue,
        createdAt: serverTimestamp(),
      })
      return docRef.id
    } catch (error) {
      console.error("Error creating venue:", error)
      throw error
    }
  }

  async getVenues(): Promise<Venue[]> {
    try {
      const querySnapshot = await getDocs(collection(this.db, "venues"))
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
      const docRef = doc(this.db, "venues", venueId)
      const docSnap = await getDoc(docRef)

      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data(),
        } as Venue
      } else {
        return null
      }
    } catch (error) {
      console.error("Error getting venue:", error)
      throw error
    }
  }

  async updateVenue(venueId: string, updates: Partial<Venue>): Promise<void> {
    try {
      const venueRef = doc(this.db, "venues", venueId)
      await updateDoc(venueRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      })
    } catch (error) {
      console.error("Error updating venue:", error)
      throw error
    }
  }

  async deleteVenue(venueId: string): Promise<void> {
    try {
      await deleteDoc(doc(this.db, "venues", venueId))
    } catch (error) {
      console.error("Error deleting venue:", error)
      throw error
    }
  }

  async getVenuesByOwner(ownerId: string): Promise<Venue[]> {
    try {
      const q = query(collection(this.db, "venues"), where("ownerId", "==", ownerId))
      const querySnapshot = await getDocs(q)
      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Venue[]
    } catch (error) {
      console.error("Error getting venues by owner:", error)
      throw error
    }
  }

  // Event methods
  async createEvent(event: Omit<Event, "id">): Promise<string> {
    try {
      const docRef = await addDoc(collection(this.db, "events"), {
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
      const querySnapshot = await getDocs(collection(this.db, "events"))
      return querySnapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          ...data,
          date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
        }
      }) as Event[]
    } catch (error) {
      console.error("Error getting events:", error)
      throw error
    }
  }

  async getEventById(eventId: string): Promise<Event | null> {
    try {
      const docRef = doc(this.db, "events", eventId)
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
      const eventRef = doc(this.db, "events", eventId)
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
      await deleteDoc(doc(this.db, "events", eventId))
    } catch (error) {
      console.error("Error deleting event:", error)
      throw error
    }
  }

  async getEventsByVenue(venueId: string): Promise<Event[]> {
    try {
      const q = query(collection(this.db, "events"), where("venueId", "==", venueId))
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
      const q = query(collection(this.db, "events"), where("isFeatured", "==", true))
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
      console.error("Error getting featured events:", error)
      throw error
    }
  }

  async deleteEventsByVenue(venueId: string): Promise<void> {
    try {
      const q = query(collection(this.db, "events"), where("venueId", "==", venueId))
      const querySnapshot = await getDocs(q)
      const batch = writeBatch(this.db)

      querySnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref)
      })

      await batch.commit()
    } catch (error) {
      console.error("Error deleting events by venue:", error)
      throw error
    }
  }

  async deletePastEvents(): Promise<void> {
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const q = query(collection(this.db, "events"))
      const querySnapshot = await getDocs(q)
      const batch = writeBatch(this.db)

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
      const storageRef = ref(this.storage, filename)
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
      const storageRef = ref(this.storage, filename)
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
      const storageRef = ref(this.storage, filename)
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
      const querySnapshot = await getDocs(collection(this.db, "users"))
      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as AppUser[]
    } catch (error) {
      console.error("Error getting users:", error)
      throw error
    }
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      await deleteDoc(doc(this.db, "users", userId))
    } catch (error) {
      console.error("Error deleting user:", error)
      throw error
    }
  }

  // Vibe methods
  async saveVibeImage(vibeImage: Omit<VibeImage, "id">): Promise<string> {
    try {
      const docRef = await addDoc(collection(this.db, "vibeImages"), {
        ...vibeImage,
        createdAt: serverTimestamp(),
      })
      return docRef.id
    } catch (error) {
      console.error("Error saving vibe image:", error)
      throw error
    }
  }

  async getVibeImagesByVenueAndDate(venueId: string, date: Date): Promise<VibeImage[]> {
    try {
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)

      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      const q = query(
        collection(this.db, "vibeImages"),
        where("venueId", "==", venueId),
        where("createdAt", ">=", startOfDay),
        where("createdAt", "<=", endOfDay),
        orderBy("createdAt", "desc"),
      )

      const querySnapshot = await getDocs(q)
      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      })) as VibeImage[]
    } catch (error) {
      console.error("Error getting vibe images by venue and date:", error)
      throw error
    }
  }

  async getVibeImagesByVenueAndWeek(venueId: string, startDate: Date): Promise<VibeImage[]> {
    try {
      const endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 7)

      const q = query(
        collection(this.db, "vibeImages"),
        where("venueId", "==", venueId),
        where("createdAt", ">=", startDate),
        where("createdAt", "<=", endDate),
        orderBy("createdAt", "desc"),
      )

      const querySnapshot = await getDocs(q)
      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      })) as VibeImage[]
    } catch (error) {
      console.error("Error getting vibe images by venue and week:", error)
      throw error
    }
  }

  async saveVibeRating(venueId: string, rating: number): Promise<void> {
    try {
      await addDoc(collection(this.db, "vibeRatings"), {
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
      console.log(`FirebaseService: Getting latest vibe rating for venue ${venueId}`)
      const q = query(
        collection(this.db, "vibeRatings"),
        where("venueId", "==", venueId),
        orderBy("createdAt", "desc"),
        limit(1),
      )

      const querySnapshot = await getDocs(q)
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0]
        return doc.data().rating
      }
      return null
    } catch (error) {
      console.error("Error getting latest vibe rating:", error)
      throw error
    }
  }

  // Ticket methods
  async saveTicket(ticket: Omit<Ticket, "id">): Promise<string> {
    try {
      const docRef = await addDoc(collection(this.db, "tickets"), {
        ...ticket,
        createdAt: serverTimestamp(),
      })
      return docRef.id
    } catch (error) {
      console.error("Error saving ticket:", error)
      throw error
    }
  }

  async getTicketById(ticketId: string): Promise<Ticket | null> {
    try {
      const docRef = doc(this.db, "tickets", ticketId)
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

  async getTicketsByEvent(eventId: string): Promise<Ticket[]> {
    try {
      const q = query(collection(this.db, "tickets"), where("eventId", "==", eventId))
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

  async getTicketsByUser(userId: string): Promise<Ticket[]> {
    try {
      const q = query(collection(this.db, "tickets"), where("buyerId", "==", userId))
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

  async updateTicket(ticketId: string, updates: Partial<Ticket>): Promise<void> {
    try {
      const ticketRef = doc(this.db, "tickets", ticketId)
      await updateDoc(ticketRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      })
    } catch (error) {
      console.error("Error updating ticket:", error)
      throw error
    }
  }

  async saveTicketValidation(validation: {
    ticketId: string
    eventId: string
    validatedBy: string
    validatedAt: Date
    biometricData?: string
  }): Promise<void> {
    try {
      await addDoc(collection(this.db, "ticketValidations"), {
        ...validation,
        createdAt: serverTimestamp(),
      })
    } catch (error) {
      console.error("Error saving ticket validation:", error)
      throw error
    }
  }
}

export default FirebaseService.getInstance()
