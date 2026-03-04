import { initializeApp, getApps } from "firebase/app";
import { getAuth, setPersistence, browserSessionPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported, getToken } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyCu3hXDaqQ58VvHNQ1On5wxcgaU0CIXCo8",
  authDomain: "eco-guardian-bd74f.firebaseapp.com",
  projectId: "eco-guardian-bd74f",
  storageBucket: "eco-guardian-bd74f.appspot.com",
  messagingSenderId: "917905910857",
  appId: "1:917905910857:web:a1b2c3d4e5f6g7h8i9j0", // Web app ID
};

// Initialize Firebase only once
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize services with error handling
let auth, db, storage, messaging;

try {
  auth = getAuth(app);
  setPersistence(auth, browserSessionPersistence);
} catch (err) {
  console.error("Error initializing Firebase Auth:", err);
}

try {
  db = getFirestore(app);
} catch (err) {
  console.error("Error initializing Firebase Firestore:", err);
}

try {
  storage = getStorage(app);
} catch (err) {
  console.error("Error initializing Firebase Storage:", err);
}

// Initialize messaging only if supported (browser check for web platform)
let messagingSupported = false;

async function initializeMessaging(): Promise<typeof messaging> {
  if (typeof window === 'undefined') {
    // Server-side rendering - don't initialize
    return null;
  }
  
  try {
    // Check if FCM is supported in this browser
    messagingSupported = await isSupported();
    
    if (messagingSupported) {
      messaging = getMessaging(app);
      return messaging;
    } else {
      console.log("Firebase Messaging is not supported in this browser");
      return null;
    }
  } catch (err) {
    console.error("Error checking messaging support:", err);
    return null;
  }
}

// Try to initialize messaging, but don't fail if it doesn't work
initializeMessaging().catch(err => {
  console.warn("Firebase messaging initialization skipped:", err);
});

// --- Notification helpers ---
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    // Check if messaging is supported first
    if (!messagingSupported) {
      const supported = await isSupported();
      if (!supported) {
        console.log("Notifications not supported in this browser");
        return false;
      }
      messagingSupported = true;
      messaging = getMessaging(app);
    }
    
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch (err) {
    console.error("Error requesting notification permission:", err);
    return false;
  }
}

export async function getWebFcmToken(): Promise<string | null> {
  try {
    // Check if messaging is supported
    if (!messaging) {
      const supported = await isSupported();
      if (!supported) {
        console.log("FCM not supported, skipping token generation");
        return null;
      }
      messagingSupported = true;
      messaging = getMessaging(app);
    }
    
    const token = await getToken(messaging, {
      vapidKey:
        process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ||
        "BD83GLw_GOOOYCBboNNyNvop26X_URchVjoAfavvU230_7IbQUl2JFCtRWe4RPhe3bfsMRF9KBEOHSStvfG7p7s",
    });
    return token || null;
  } catch (err) {
    console.error("Error getting web FCM token:", err);
    return null;
  }
}

// Export Firebase services with null checks
export { app, auth, db, storage, messaging };

export const hasFirebaseConfig = true;
