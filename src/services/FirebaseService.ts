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
        console.log("FirebaseService: Signi