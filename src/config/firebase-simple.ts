import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserSessionPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, getToken } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyCu3hXDaqQ58VvHNQ1On5wxcgaU0CIXCo8",
  authDomain: "eco-guardian-bd74f.firebaseapp.com",
  projectId: "eco-guardian-bd74f",
  storageBucket: "eco-guardian-bd74f.appspot.com",
  messagingSenderId: "917905910857",
  appId: "1:917905910857:android:5886ab1db46cec56912398",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const messaging = getMessaging(app);

setPersistence(auth, browserSessionPersistence);

// --- Notification helpers ---
export async function requestNotificationPermission(): Promise<boolean> {
  const result = await Notification.requestPermission();
  return result === "granted";
}

export async function getWebFcmToken(): Promise<string | null> {
  try {
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

// Export Firebase services
export { app, auth, db, storage, messaging };
