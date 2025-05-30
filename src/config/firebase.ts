import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { getStorage } from "firebase/storage"

// Your web app's Firebase configuration
// Replace with your actual Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCu3hXDaqQ58VvHNQ1On5wxcgaU0CIXCo8",
  authDomain: "eco-guardian-bd74f.firebaseapp.com",
  projectId: "eco-guardian-bd74f",
  storageBucket: "eco-guardian-bd74f.firebasestorage.app",
  messagingSenderId: "917905910857",
  appId: "1:917905910857:android:5886ab1db46cec56912398",
}
// Initialize Firebase
let app, auth, db, storage

try {
  // Initialize Firebase
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getFirestore(app)
  storage = getStorage(app)

  console.log("Firebase initialized successfully")
} catch (error) {
  console.error("Error initializing Firebase:", error)

  // Create mock implementations for development
  auth = {
    currentUser: null,
    onAuthStateChanged: (callback) => {
      callback(null)
      return () => {}
    },
    signInWithEmailAndPassword: () => Promise.reject(new Error("Firebase not initialized")),
    createUserWithEmailAndPassword: () => Promise.reject(new Error("Firebase not initialized")),
    signOut: () => Promise.reject(new Error("Firebase not initialized")),
  } as any

  db = {} as any
  storage = {} as any
}

// Export the Firebase services
export { auth, db, storage }
