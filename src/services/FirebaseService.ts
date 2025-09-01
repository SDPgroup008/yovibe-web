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

  // Venue methods
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

  // Other methods can be added here as needed
}

export default new FirebaseService()
