import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { getStorage } from "firebase/storage"

// Your web app's Firebase configuration
// Replace these with your actual Firebase project credentials
const firebaseConfig = {
  apiKey: "AIzaSyBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", // Replace with your actual API key
  authDomain: "your-project.firebaseapp.com", // Replace with your actual auth domain
  projectId: "your-project-id", // Replace with your actual project ID
  storageBucket: "your-project.appspot.com", // Replace with your actual storage bucket
  messagingSenderId: "123456789012", // Replace with your actual messaging sender ID
  appId: "1:123456789012:web:abcdef123456789012345", // Replace with your actual app ID
  measurementId: "G-XXXXXXXXXX", // Replace with your actual measurement ID (optional)
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)
const storage = getStorage(app)

// Export the Firebase services
export { auth, db, storage }
export const hasFirebaseConfig = true
