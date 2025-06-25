import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { getStorage } from "firebase/storage"

// Check if we're in development and missing env vars
const isDevelopment = process.env.NODE_ENV === "development"
const hasFirebaseConfig = process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo-project.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-project",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "demo-project.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:demo",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-DEMO",
}

// Initialize Firebase
let app, auth, db, storage

try {
  if (hasFirebaseConfig) {
    // Initialize Firebase with real config
    app = initializeApp(firebaseConfig)
    auth = getAuth(app)
    db = getFirestore(app)
    storage = getStorage(app)
    console.log("Firebase initialized successfully with real config")
  } else {
    console.warn("Firebase environment variables not found. Using mock implementations for development.")
    throw new Error("Firebase not configured")
  }
} catch (error) {
  console.error("Error initializing Firebase:", error)

  // Create mock implementations for development
  auth = {
    currentUser: null,
    onAuthStateChanged: (callback) => {
      // Simulate no user for development
      setTimeout(() => callback(null), 100)
      return () => {}
    },
    signInWithEmailAndPassword: () => {
      console.log("Mock: Sign in attempted")
      return Promise.reject(new Error("Firebase not configured - using mock auth"))
    },
    createUserWithEmailAndPassword: () => {
      console.log("Mock: Sign up attempted")
      return Promise.reject(new Error("Firebase not configured - using mock auth"))
    },
    signOut: () => {
      console.log("Mock: Sign out attempted")
      return Promise.resolve()
    },
  } as any

  db = {
    // Mock Firestore methods
    collection: () => ({}),
    doc: () => ({}),
  } as any

  storage = {} as any
}

// Export the Firebase services
export { auth, db, storage }
export { hasFirebaseConfig }
