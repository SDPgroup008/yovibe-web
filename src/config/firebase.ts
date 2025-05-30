import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { getStorage } from "firebase/storage"

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCu3hXDaqQ58VvHNQ1On5wxcgaU0CIXCo8",
  authDomain: "eco-guardian-bd74f.firebaseapp.com",
  projectId: "eco-guardian-bd74f",
  storageBucket: "eco-guardian-bd74f.firebasestorage.app",
  messagingSenderId: "917905910857",
  appId: "1:917905910857:android:5886ab1db46cec56912398",
}

// Check if we're in development mode and Firebase is not configured
const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY"

let app, auth, db, storage

if (isFirebaseConfigured) {
  try {
    // Initialize Firebase with real config
    app = initializeApp(firebaseConfig)
    auth = getAuth(app)
    db = getFirestore(app)
    storage = getStorage(app)
    console.log("Firebase initialized successfully with project:", firebaseConfig.projectId)
  } catch (error) {
    console.error("Error initializing Firebase:", error)
  }
} else {
  console.log("Firebase not configured - using development mode")
  // Create mock implementations for development
  auth = {
    currentUser: null,
    onAuthStateChanged: (callback) => {
      // Simulate no user initially
      callback(null)
      return () => {}
    },
    signInWithEmailAndPassword: () => Promise.reject(new Error("Firebase not configured")),
    createUserWithEmailAndPassword: () => Promise.reject(new Error("Firebase not configured")),
    signOut: () => Promise.resolve(),
  } as any

  db = {} as any
  storage = {} as any
}

// Export the Firebase services
export { auth, db, storage, isFirebaseConfigured }
