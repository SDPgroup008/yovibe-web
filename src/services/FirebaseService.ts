import { initializeApp } from "firebase/app"
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  orderBy,
} from "firebase/firestore"
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage"
import type { Event } from "../models/Event"
import type { Venue } from "../models/Venue"

class FirebaseService {
  private db: any
  private storage: any

  constructor() {
    const firebaseApp = initializeApp({
      apiKey: "YOUR_API_KEY",
      authDomain: "YOUR_AUTH_DOMAIN",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_STORAGE_BUCKET",
      messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
      appId: "YOUR_APP_ID",
    })
    this.db = getFirestore(firebaseApp)
    this.storage = getStorage(firebaseApp)
  }

  // Event methods
  async addEvent(eventData: Omit<Event, "id">): Promise<string> {
    try {
      const docRef = await addDoc(collection(this.db, "events"), {
        ...eventData,
        createdAt: new Date(),
      })
      return docRef.id
    } catch (error) {
      console.error("Error adding event:", error)
      throw error
    }
  }

  async getEventById(eventId: string): Promise<Event | null> {
    try {
      const eventDoc = await getDoc(doc(this.db, "events", eventId))
      if (eventDoc.exists()) {
        const data = eventDoc.data()
        return {
          id: eventDoc.id,
          ...data,
          date: data.date.toDate(),
          createdAt: data.createdAt.toDate(),
        } as Event
      }
      return null
    } catch (error) {
      console.error("Error getting event:", error)
      throw error
    }
  }

  async updateEvent(eventId: string, updates: Partial<Event>): Promise<void> {
    try {
      await updateDoc(doc(this.db, "events", eventId), updates)
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

  async getEvents(): Promise<Event[]> {
    try {
      const eventsQuery = query(collection(this.db, "events"), orderBy("date", "desc"))
      const querySnapshot = await getDocs(eventsQuery)

      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate(),
        createdAt: doc.data().createdAt.toDate(),
      })) as Event[]
    } catch (error) {
      console.error("Error getting events:", error)
      throw error
    }
  }

  async getEventsByVenue(venueId: string): Promise<Event[]> {
    try {
      const eventsQuery = query(collection(this.db, "events"), where("venueId", "==", venueId), orderBy("date", "desc"))
      const querySnapshot = await getDocs(eventsQuery)

      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate(),
        createdAt: doc.data().createdAt.toDate(),
      })) as Event[]
    } catch (error) {
      console.error("Error getting events by venue:", error)
      throw error
    }
  }

  async getFeaturedEvents(): Promise<Event[]> {
    try {
      const eventsQuery = query(collection(this.db, "events"), where("featured", "==", true), orderBy("date", "desc"))
      const querySnapshot = await getDocs(eventsQuery)

      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate(),
        createdAt: doc.data().createdAt.toDate(),
      })) as Event[]
    } catch (error) {
      console.error("Error getting featured events:", error)
      return []
    }
  }

  async deletePastEvents(): Promise<void> {
    try {
      const now = new Date()
      const eventsQuery = query(collection(this.db, "events"), where("date", "<", now))
      const querySnapshot = await getDocs(eventsQuery)

      const deletePromises = querySnapshot.docs.map((doc) => deleteDoc(doc.ref))
      await Promise.all(deletePromises)
    } catch (error) {
      console.error("Error deleting past events:", error)
      throw error
    }
  }

  async deleteEventsByVenue(venueId: string): Promise<void> {
    try {
      const eventsQuery = query(collection(this.db, "events"), where("venueId", "==", venueId))
      const querySnapshot = await getDocs(eventsQuery)

      const deletePromises = querySnapshot.docs.map((doc) => deleteDoc(doc.ref))
      await Promise.all(deletePromises)
    } catch (error) {
      console.error("Error deleting events by venue:", error)
      throw error
    }
  }

  // Venue methods
  async addVenue(venueData: Omit<Venue, "id">): Promise<string> {
    try {
      const docRef = await addDoc(collection(this.db, "venues"), {
        ...venueData,
        createdAt: new Date(),
      })
      return docRef.id
    } catch (error) {
      console.error("Error adding venue:", error)
      throw error
    }
  }

  async getVenueById(venueId: string): Promise<Venue | null> {
    try {
      const venueDoc = await getDoc(doc(this.db, "venues", venueId))
      if (venueDoc.exists()) {
        const data = venueDoc.data()
        return {
          id: venueDoc.id,
          ...data,
          createdAt: data.createdAt?.toDate(),
        } as Venue
      }
      return null
    } catch (error) {
      console.error("Error getting venue:", error)
      throw error
    }
  }

  async getVenues(): Promise<Venue[]> {
    try {
      const venuesQuery = query(collection(this.db, "venues"), orderBy("name"))
      const querySnapshot = await getDocs(venuesQuery)

      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Venue[]
    } catch (error) {
      console.error("Error getting venues:", error)
      throw error
    }
  }

  async getVenuesByOwner(ownerId: string): Promise<Venue[]> {
    try {
      const venuesQuery = query(collection(this.db, "venues"), where("ownerId", "==", ownerId))
      const querySnapshot = await getDocs(venuesQuery)

      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
      })) as Venue[]
    } catch (error) {
      console.error("Error getting venues by owner:", error)
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

  async updateVenuePrograms(venueId: string, programs: any[]): Promise<void> {
    try {
      await updateDoc(doc(this.db, "venues", venueId), { programs })
    } catch (error) {
      console.error("Error updating venue programs:", error)
      throw error
    }
  }

  // Image upload methods
  async uploadEventImage(imageUri: string): Promise<string> {
    try {
      const response = await fetch(imageUri)
      const blob = await response.blob()

      const filename = `events/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`
      const storageRef = ref(this.storage, filename)

      await uploadBytes(storageRef, blob)
      const downloadURL = await getDownloadURL(storageRef)

      return downloadURL
    } catch (error) {
      console.error("Error uploading event image:", error)
      throw error
    }
  }

  async uploadVenueImage(imageUri: string): Promise<string> {
    try {
      const response = await fetch(imageUri)
      const blob = await response.blob()

      const filename = `venues/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`
      const storageRef = ref(this.storage, filename)

      await uploadBytes(storageRef, blob)
      const downloadURL = await getDownloadURL(storageRef)

      return downloadURL
    } catch (error) {
      console.error("Error uploading venue image:", error)
      throw error
    }
  }

  async uploadVibeImage(imageUri: string): Promise<string> {
    try {
      const response = await fetch(imageUri)
      const blob = await response.blob()

      const filename = `vibes/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`
      const storageRef = ref(this.storage, filename)

      await uploadBytes(storageRef, blob)
      const downloadURL = await getDownloadURL(storageRef)

      return downloadURL
    } catch (error) {
      console.error("Error uploading vibe image:", error)
      throw error
    }
  }

  // Vibe and rating methods
  async addVibeImage(vibeData: any): Promise<string> {
    try {
      const docRef = await addDoc(collection(this.db, "vibes"), {
        ...vibeData,
        createdAt: new Date(),
      })
      return docRef.id
    } catch (error) {
      console.error("Error adding vibe image:", error)
      throw error
    }
  }

  async getLatestVibeRating(venueId: string): Promise<number> {
    try {
      const vibesQuery = query(
        collection(this.db, "vibes"),
        where("venueId", "==", venueId),
        orderBy("createdAt", "desc"),
      )
      const querySnapshot = await getDocs(vibesQuery)

      if (querySnapshot.empty) return 0

      const ratings = querySnapshot.docs.map((doc) => doc.data().rating || 0)
      return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
    } catch (error) {
      console.error("Error getting latest vibe rating:", error)
      return 0
    }
  }

  async getVibeImagesByVenueAndDate(venueId: string, date: Date): Promise<any[]> {
    try {
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      const vibesQuery = query(
        collection(this.db, "vibes"),
        where("venueId", "==", venueId),
        where("createdAt", ">=", startOfDay),
        where("createdAt", "<=", endOfDay),
      )
      const querySnapshot = await getDocs(vibesQuery)

      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt.toDate(),
      }))
    } catch (error) {
      console.error("Error getting vibe images by venue and date:", error)
      return []
    }
  }

  async getVibeImagesByVenueAndWeek(venueId: string, startDate: Date): Promise<any[]> {
    try {
      const endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 7)

      const vibesQuery = query(
        collection(this.db, "vibes"),
        where("venueId", "==", venueId),
        where("createdAt", ">=", startDate),
        where("createdAt", "<=", endDate),
      )
      const querySnapshot = await getDocs(vibesQuery)

      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt.toDate(),
      }))
    } catch (error) {
      console.error("Error getting vibe images by venue and week:", error)
      return []
    }
  }
}

export default new FirebaseService()
