import { initializeApp, getApps } from "firebase/app";
import { getAuth, setPersistence, browserSessionPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported, getToken } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyBYNPWQj74P7EpmbVxX6ETVHEPayu2-UpE",
  authDomain: "eco-guardian-bd74f.firebaseapp.com",
  projectId: "eco-guardian-bd74f",
  storageBucket: "eco-guardian-bd74f.appspot.com",
  messagingSenderId: "917905910857",
  appId: "1:917905910857:web:6a0a450f36d2cbb6912398",
  measurementId: "G-8PRQWEZP8L"
};

// Initialize Firebase only once
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize services with error handling
let auth, db, storage, messaging;

try {
  auth = getAuth(app);
  setPersistence(auth, browserSessionPersistence);
} catch (err) {
  // console.error("Error initializing Firebase Auth:", err);
}

try {
  db = getFirestore(app);
} catch (err) {
  // console.error("Error initializing Firebase Firestore:", err);
}

try {
  storage = getStorage(app);
} catch (err) {
  // console.error("Error initializing Firebase Storage:", err);
}

// Initialize messaging only if supported (browser check for web platform)
let messagingSupported = false;

// Check if this is iOS Safari - special handling needed
// iOS Safari 16.4+ supports web push but Firebase's isSupported() may not detect it correctly
function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|EdgiOS/.test(ua);
  const isMac = /Macintosh/.test(ua);
  
  // Also check for macOS Safari
  if (isMac && isSafari) {
    return true;
  }
  
  return isIOS && isSafari;
}

// Check iOS version
function getIOSVersion(): number | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  const match = ua.match(/OS (\d+)_/);
  return match ? parseInt(match[1], 10) : null;
}

async function initializeMessaging(): Promise<typeof messaging> {
  if (typeof window === 'undefined') {
    // Server-side rendering - don't initialize
    return null;
  }
  
  try {
    // Wait for service worker to be ready (important for iOS Safari)
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        console.log("[iOS-NOTIF] Service worker ready, scope:", registration.scope);
      } catch (swErr) {
        console.log("[iOS-NOTIF] Service worker not ready yet:", swErr);
      }
    }
    
    // On iOS Safari 16.4+ or macOS Safari 16.1+, we need to try directly 
    // since isSupported() might not detect it correctly
    const isSafari = isIOSSafari();
    const iosVersion = getIOSVersion();
    
    if (isSafari) {
      console.log("[iOS-NOTIF] Safari detected (iOS version:", iosVersion, ")");
      
      // iOS Safari 16.4+ is required for push notifications
      if (iosVersion !== null && iosVersion < 16) {
        console.log("[iOS-NOTIF] iOS version", iosVersion, "is below 16.4 - push not supported");
        return null;
      }
      
      try {
        messaging = getMessaging(app);
        messagingSupported = true;
        console.log("[iOS-NOTIF] FCM initialized successfully on iOS Safari");
        return messaging;
      } catch (e) {
        console.log("[iOS-NOTIF] Direct FCM init failed on iOS Safari:", e);
      }
    }
    
    // Standard FCM support check
    messagingSupported = await isSupported();
    
    if (messagingSupported) {
      messaging = getMessaging(app);
      return messaging;
    } else {
      console.log("[iOS-NOTIF] Firebase Messaging is not supported in this browser");
      return null;
    }
  } catch (err) {
    console.error("[iOS-NOTIF] Error checking messaging support:", err);
    return null;
  }
}

// Try to initialize messaging, but don't fail if it doesn't work
// Don't call at module load - wait for service worker to be ready
// initializeMessaging().catch(err => {
//   // console.warn("Firebase messaging initialization skipped:", err);
// });

// Export a function to initialize messaging when needed (after service worker is ready)
export async function ensureMessagingInitialized(): Promise<typeof messaging> {
  if (messaging) {
    return messaging;
  }
  return initializeMessaging();
}

// --- Notification helpers ---
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    // Check if Notification API exists first (required for iOS Safari)
    if (typeof Notification === 'undefined' || !Notification.requestPermission) {
      console.log("[iOS-NOTIF] Notification API not available in this browser");
      return false;
    }
    
    // Request permission from the browser first
    console.log("[iOS-NOTIF] Requesting notification permission from browser...");
    const result = await Notification.requestPermission();
    console.log("[iOS-NOTIF] Browser permission result:", result);
    
    if (result !== "granted") {
      console.log("[iOS-NOTIF] Browser denied permission");
      return false;
    }
    
    // Browser granted permission, now try to get FCM working
    console.log("[iOS-NOTIF] Browser granted permission, initializing FCM...");
    
    // Try to initialize messaging - this handles iOS Safari specially
    const messagingInstance = await initializeMessaging();
    
    if (messagingInstance) {
      console.log("[iOS-NOTIF] FCM initialized successfully");
      return true;
    } else {
      // FCM not available but browser permission was granted
      console.log("[iOS-NOTIF] FCM not available but browser permission granted - push notifications won't work but in-app will");
      return true; // Still return true since browser permission was granted
    }
  } catch (err) {
    console.error("[iOS-NOTIF] Error requesting notification permission:", err);
    return false;
  }
}

export async function getWebFcmToken(): Promise<string | null> {
  try {
    // Try to get messaging - this handles iOS Safari specially
    if (!messaging) {
      console.log("[iOS-NOTIF] Messaging not initialized, initializing...");
      const messagingInstance = await initializeMessaging();
      if (!messagingInstance) {
        console.log("[iOS-NOTIF] FCM not supported, skipping token generation");
        return null;
      }
    }
    
    console.log("[iOS-NOTIF] Getting FCM token with VAPID key...");
    const token = await getToken(messaging!, {
      vapidKey:
        process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ||
        "BD83GLw_GOOOYCBboNNyNvop26X_URchVjoAfavvU230_7IbQUl2JFCtRWe4RPhe3bfsMRF9KBEOHSStvfG7p7s",
    });
    console.log("[iOS-NOTIF] Token generated successfully:", token ? 'YES' : 'NO');
    return token || null;
  } catch (err) {
    console.error("[iOS-NOTIF] Error getting web FCM token:", err);
    return null;
  }
}

// Export Firebase services with null checks
export { app, auth, db, storage, messaging };

export const hasFirebaseConfig = true;
