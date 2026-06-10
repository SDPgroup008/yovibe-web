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

// Store messaging promise to avoid duplicate initialization
let messagingPromise: Promise<typeof messaging> | null = null;

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
    
    console.log("[iOS-NOTIF] isSupported() result:", messagingSupported);
    
    if (messagingSupported) {
      messaging = getMessaging(app);
      return messaging;
    } else {
      console.log("[iOS-NOTIF] Firebase Messaging reported not supported, trying direct init...");
      try {
        messaging = getMessaging(app);
        messagingSupported = true;
        console.log("[iOS-NOTIF] Direct FCM init succeeded");
        return messaging;
      } catch (e) {
        console.log("[iOS-NOTIF] Direct FCM init also failed:", e);
        return null;
      }
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
    
    // Add timeout to prevent hanging
    const permissionPromise = Notification.requestPermission();
    const timeoutPromise = new Promise<string>((_, reject) => 
      setTimeout(() => reject(new Error("Permission request timeout")), 10000)
    );
    
    let result: string;
    try {
      result = await Promise.race([permissionPromise, timeoutPromise]) as string;
    } catch (timeoutErr) {
      console.error("[iOS-NOTIF] Permission request timed out:", timeoutErr);
      return false;
    }
    
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
    console.log("[iOS-NOTIF] getWebFcmToken called, messaging:", !!messaging);
    // Ensure messaging is initialized
    if (!messaging) {
      console.log("[iOS-NOTIF] Messaging not initialized, initializing...");
      const messagingInstance = await initializeMessaging();
      console.log("[iOS-NOTIF] initializeMessaging returned:", !!messagingInstance, "messaging var:", !!messaging);
      if (!messagingInstance && !messaging) {
        console.log("[iOS-NOTIF] FCM not supported, skipping token generation");
        return null;
      }
    }
    
    // Ensure service worker is fully active before requesting token
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        // If SW is not active yet, wait for it
        if (!registration.active) {
          console.log("[iOS-NOTIF] Service worker not active yet, waiting...");
          await new Promise<void>((resolve) => {
            const handler = () => {
              if (registration.active) {
                registration.removeEventListener('activate', handler);
                resolve();
              }
            };
            registration.addEventListener('activate', handler);
            // Timeout after 10 seconds
            setTimeout(() => resolve(), 10000);
          });
        }
        console.log("[iOS-NOTIF] Service worker active state:", !!registration.active);
      } catch (swErr) {
        console.warn("[iOS-NOTIF] Service worker check failed:", swErr);
        // Continue anyway - getToken might still work
      }
    }
    
    console.log("[iOS-NOTIF] Getting FCM token with VAPID key...");
    console.log("[iOS-NOTIF] Using messaging instance:", !!messaging);
    
    // Retry logic: try up to 3 times with 1-second gap for SW to become fully active
    let lastError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        console.log(`[iOS-NOTIF] Retry attempt ${attempt + 1}/3...`);
        await new Promise(r => setTimeout(r, 1000));
      }
      try {
        const token = await getToken(messaging!, {
          vapidKey:
            process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ||
            "BD83GLw_GOOOYCBboNNyNvop26X_URchVjoAfavvU230_7IbQUl2JFCtRWe4RPhe3bfsMRF9KBEOHSStvfG7p7s",
        });
        if (token) {
          console.log("[iOS-NOTIF] Token generated successfully: YES");
          return token;
        }
        console.log("[iOS-NOTIF] Token was empty on attempt", attempt + 1);
      } catch (err) {
        lastError = err;
        console.warn(`[iOS-NOTIF] Token attempt ${attempt + 1}/3 failed:`, err);
      }
    }
    
    console.error("[iOS-NOTIF] All 3 token attempts failed. Last error:", lastError);
    return null;
  } catch (err) {
    console.error("[iOS-NOTIF] Error getting web FCM token:", err);
    return null;
  }
}

// Export Firebase services with null checks
export { app, auth, db, storage, messaging };

export const hasFirebaseConfig = true;
