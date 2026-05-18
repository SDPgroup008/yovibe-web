"use client";

import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from "react-native";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { RouterProvider, RouteRenderer } from "./utils/URLRouter";
import { routes } from "./utils/routes";
import { DesktopLayout, MobileLayout } from "./components/Navigation";
import { LayoutProvider } from "./contexts/LayoutContext";

// 🔔 Import Firebase helpers for notifications
import { requestNotificationPermission, getWebFcmToken, messaging } from "./config/firebase";
import { onMessage } from "firebase/messaging";
import NotificationService from "./services/NotificationService";
import TokenService from "./services/TokenService";

// Store messaging instance in a ref to handle async initialization
let messagingInstance = null;

// 🔔 Persistent Permission Banner that floats at the top
function PermissionBanner({ onAllow, onBlock }) {
  const [slideAnim, setSlideAnim] = useState(0);

  useEffect(() => {
    setSlideAnim(0); // Slide in
  }, []);

  const handleAction = (callback) => {
    setSlideAnim(-100); // Slide out
    setTimeout(callback, 300);
  };

  return (
    <View style={[styles.permissionBanner, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.permissionContent}>
        <Text style={styles.permissionTitle}>📢 Stay Updated!</Text>
        <Text style={styles.permissionBody}>Enable notifications to get updates about events and vibes</Text>
      </View>
      <View style={styles.permissionActions}>
        <TouchableOpacity onPress={() => handleAction(onBlock)} style={styles.blockButton}>
          <Text style={styles.blockButtonText}>Block</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleAction(onAllow)} style={styles.allowButton}>
          <Text style={styles.allowButtonText}>Allow</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// 🔔 Temporary notification banner with auto-dismiss
function NotificationBanner({ title, body, onClose }) {
  const [slideAnim, setSlideAnim] = useState(0);

  useEffect(() => {
    setSlideAnim(0); // Slide in
    const timer = setTimeout(() => {
      handleClose();
    }, 15000);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setSlideAnim(-100); // Slide out
    setTimeout(onClose, 300);
  };

  return (
    <View style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.bannerContent}>
        <Text style={styles.bannerTitle}>{title}</Text>
        <Text style={styles.bannerBody}>{body}</Text>
      </View>
      <TouchableOpacity onPress={handleClose} style={styles.bannerClose}>
        <Text style={styles.bannerCloseText}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

// 🔔 Trigger GitHub Action via repository_dispatch AND save to Firestore with topic subscription
async function saveTokenToRepo(token: string, userId: string | null = null, userEmail?: string, userName?: string) {
  try {
    const res = await fetch("/.netlify/functions/save-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, userId, userEmail, userName }),
    });

    if (!res.ok) {
      console.error("Failed to save token:", await res.text());
    } else {
      const result = await res.json();
      console.log("[App] Token saved and subscribed to all-users:", result);
    }
  } catch (err) {
    console.error("Error calling Netlify function:", err);
  }
}

// Main app component with URL routing
function AppContent() {
  const { user, loading } = useAuth();
  const [initializing, setInitializing] = useState(true);
  const [banner, setBanner] = useState<{ title: string; body: string } | null>(null);
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);

  useEffect(() => {
    if (!loading) {
      setInitializing(false);
    }
  }, [loading]);

  // Let the router handle all routes - authentication is managed by individual screens

  // 🔔 Register service worker and show permission banner after 5 seconds
  useEffect(() => {
    (async () => {
      if ("serviceWorker" in navigator) {
        try {
          const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
          console.log("[iOS-NOTIF] Service worker registered:", registration.scope);
          await navigator.serviceWorker.ready;
          console.log("[iOS-NOTIF] Service worker is active and ready");
        } catch (err) {
          console.warn("[iOS-NOTIF] Service worker registration failed:", err);
        }
      } else {
        console.warn("[iOS-NOTIF] Service worker not supported in this browser");
      }
    })();

    let currentPermission = "default";
    if (typeof Notification !== 'undefined' && Notification.permission) {
      currentPermission = Notification.permission;
    }

    if (currentPermission === "default") {
      const bannerTimer = setTimeout(() => {
        setShowPermissionBanner(true);
      }, 5000);
      return () => clearTimeout(bannerTimer);
    }

    if (currentPermission === "granted") {
      (async () => {
        try {
          const token = await getWebFcmToken();
          if (token) {
            console.log("Web FCM token retrieved:", token);
            const userId = user?.uid || null;
            const userEmail = user?.email;
            const userName = user?.displayName || null;
            await saveTokenToRepo(token, userId, userEmail ?? undefined, userName ?? undefined);
          }
        } catch (tokenErr) {
          console.warn("Error getting FCM token:", tokenErr);
        }
      })();
    }
  }, [user]);

  // 🔔 Listen for foreground notifications
  useEffect(() => {
    if (!messaging) {
      return;
    }

    const unsubscribe = onMessage(messaging, async (payload) => {
      console.log("[iOS-NOTIF] Foreground notification received");
      console.log("[iOS-NOTIF] Title:", payload.notification?.title);

      try {
        await NotificationService.processIncomingNotification(payload, user?.uid);
      } catch (error) {
        console.error("❌ ERROR saving notification to Firestore:", error);
      }

      setBanner({
        title: payload.notification?.title || "Notification",
        body: payload.notification?.body || "",
      });
    });

    return () => unsubscribe();
  }, [user]);

  // 🔔 Handle permission banner actions
  const handleAllowNotifications = async () => {
    setShowPermissionBanner(false);
    console.log("[iOS-NOTIF] User tapped Allow - requesting permission...");
    try {
      const granted = await requestNotificationPermission();
      console.log("[iOS-NOTIF] Permission result:", granted ? 'granted' : 'denied');

      if (granted) {
        try {
          console.log("[iOS-NOTIF] Getting FCM token...");
          const token = await getWebFcmToken();
          console.log("[iOS-NOTIF] Token received:", token ? 'YES' : 'NO');

          if (token) {
            console.log("[iOS-NOTIF] FCM Token (first 20 chars):", token.substring(0, 20) + "...");
            const userId = user?.uid || null;
            const userEmail = user?.email;
            const userName = user?.displayName || undefined;
            console.log("[iOS-NOTIF] Saving token to Firestore...");
            await saveTokenToRepo(token, userId, userEmail, userName);
            console.log("[iOS-NOTIF] Token saved successfully!");

            await NotificationService.trackNewSubscription();
          } else {
            console.warn("[iOS-NOTIF] No FCM token received - browser permission was granted but FCM is not supported on this browser. In-app notifications will still work.");
          }
        } catch (tokenErr) {
          console.error("[iOS-NOTIF] Error getting/saving token:", tokenErr);
        }
      } else {
        console.error("[iOS-NOTIF] ERROR: Permission not granted");
      }
    } catch (err) {
      console.error("[iOS-NOTIF] Unexpected error in permission flow:", err);
    }
  };

  const handleBlockNotifications = () => {
    setShowPermissionBanner(false);
    console.log("[iOS-NOTIF] User tapped Block");
  };

  if (initializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading YoVibe...</Text>
      </View>
    );
  }

  // Always render the main router - screens handle their own authentication
  return (
    <View style={{ flex: 1 }}>
      {/* Permission banner at the very top */}
      {showPermissionBanner && (
        <PermissionBanner
          onAllow={handleAllowNotifications}
          onBlock={handleBlockNotifications}
        />
      )}

      {/* URL-based routing with navigation */}
      <RouterProvider routes={routes}>
        <DesktopLayout>
          <MobileLayout>
            <RouteRenderer routes={routes} />
          </MobileLayout>
        </DesktopLayout>
      </RouterProvider>

      {/* Temporary notification banner */}
      {banner && (
        <NotificationBanner
          title={banner.title}
          body={banner.body}
          onClose={() => setBanner(null)}
        />
      )}
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LayoutProvider>
        <AppContent />
      </LayoutProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
  },
  loadingText: {
    color: "#FFFFFF",
    marginTop: 16,
    fontSize: 16,
  },
  permissionBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#2196F3",
    padding: 8,
    elevation: 10,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  permissionContent: {
    marginBottom: 6,
  },
  permissionTitle: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
    marginBottom: 2,
  },
  permissionBody: {
    color: "#fff",
    fontSize: 12,
    lineHeight: 16,
  },
  permissionActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  blockButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  blockButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 12,
  },
  allowButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: "#fff",
  },
  allowButtonText: {
    color: "#2196F3",
    fontWeight: "bold",
    fontSize: 12,
  },
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#2196F3",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    elevation: 4,
    zIndex: 999,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  bannerBody: {
    color: "#fff",
    fontSize: 14,
  },
  bannerClose: {
    marginLeft: 8,
    padding: 4,
  },
  bannerCloseText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
});