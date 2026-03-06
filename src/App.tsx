"use client";

import { useEffect, useState, useRef } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AuthNavigator, MainTabNavigator } from "./navigation/AppNavigator.web";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from "react-native";
import { navigationRef } from "./utils/navigationRef";

// 🔔 Import Firebase helpers for notifications
import { requestNotificationPermission, getWebFcmToken, messaging } from "./config/firebase";
import { onMessage } from "firebase/messaging";
import NotificationService from "./services/NotificationService";
import TokenService from "./services/TokenService";

// Store messaging instance in a ref to handle async initialization
let messagingInstance = null;

const Stack = createStackNavigator();

// 🔔 Persistent Permission Banner that floats at the top
function PermissionBanner({ onAllow, onBlock }) {
  const slideAnim = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleAction = (callback) => {
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      callback();
    });
  };

  return (
    <Animated.View style={[styles.permissionBanner, { transform: [{ translateY: slideAnim }] }]}>
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
    </Animated.View>
  );
}

// 🔔 Temporary notification banner with auto-dismiss
function NotificationBanner({ title, body, onClose }) {
  const slideAnim = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      handleClose();
    }, 15000);

    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  };

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.bannerContent}>
        <Text style={styles.bannerTitle}>{title}</Text>
        <Text style={styles.bannerBody}>{body}</Text>
      </View>
      <TouchableOpacity onPress={handleClose} style={styles.bannerClose}>
        <Text style={styles.bannerCloseText}>×</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// 🔔 Trigger GitHub Action via repository_dispatch AND save to Firestore with topic subscription
async function saveTokenToRepo(token: string, userId: string | null = null, userEmail?: string, userName?: string) {
  try {
    // Save to Firestore AND subscribe to "all-users" topic via Netlify function
    // This handles both storage and topic subscription in one place
    const res = await fetch("/.netlify/functions/save-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, userId, userEmail, userName }),
    });

    if (!res.ok) {
      // console.error("Failed to save token:", await res.text());
    } else {
      const result = await res.json();
      // console.log("[App] Token saved and subscribed to all-users:", result);
    }
    
    // Also save to tokens.json (legacy - for GitHub workflow and backward compatibility)
    const legacyRes = await fetch("/.netlify/functions/append-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    if (!legacyRes.ok) {
      // console.error("Failed to trigger Netlify function:", await legacyRes.text());
    } else {
      // console.log("Legacy Netlify function triggered successfully");
    }
  } catch (err) {
    // console.error("Error calling Netlify function:", err);
  }
}


// Main app component with auth state handling
function AppContent() {
  const { user, loading, consumeRedirectIntent } = useAuth();
  const [initializing, setInitializing] = useState(true);
  const [banner, setBanner] = useState<{ title: string; body: string } | null>(null);
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);

  useEffect(() => {
    if (!loading) {
      setInitializing(false);
    }
  }, [loading]);

  useEffect(() => {
    if (!loading && user) {
      try {
        const intent = consumeRedirectIntent?.();
        if (intent && intent.routeName) {
          navigationRef.current?.reset({
            index: 0,
            routes: [{ name: "Main" }],
          });

          setTimeout(() => {
            try {
              if (intent.params) {
                navigationRef.current?.navigate(intent.routeName as any, intent.params);
              } else {
                navigationRef.current?.navigate(intent.routeName as any);
              }
            } catch (navErr) {
              // console.warn("Post-login navigation error:", navErr);
            }
          }, 50);
        }
      } catch (err) {
        // console.warn("Failed to consume redirect intent:", err);
      }
    }
  }, [user, loading, consumeRedirectIntent]);

  // 🔔 Register service worker and show permission banner after 5 seconds
  useEffect(() => {
    // Register service worker immediately
    (async () => {
      if ("serviceWorker" in navigator) {
        try {
          const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
          // 🔔 iOS Debug: Service worker registered
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

    // Check if permission has already been granted or denied
    // First check if Notification API exists (required for iOS Safari)
    // On iOS Safari, Notification.permission may be undefined until requestPermission is called
    let currentPermission = "default";
    if (typeof Notification !== 'undefined' && Notification.permission) {
      currentPermission = Notification.permission;
    }
    
    if (currentPermission === "default") {
      // Show banner after 5 seconds if permission hasn't been decided
      const bannerTimer = setTimeout(() => {
        setShowPermissionBanner(true);
      }, 5000);
      return () => clearTimeout(bannerTimer);
    }

    // If already granted, get token (wrapped in try-catch for safety)
    if (currentPermission === "granted") {
      (async () => {
        try {
          const token = await getWebFcmToken();
          if (token) {
            console.log("Web FCM token retrieved:", token);
            // Pass user info if authenticated
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
    // Only set up listener if messaging is available
    if (!messaging) {
      // console.log("Messaging not available, skipping foreground notification listener");
      return;
    }
    
    const unsubscribe = onMessage(messaging, async (payload) => {
      // 🔔 iOS Debug: Foreground notification
      console.log("[iOS-NOTIF] Foreground notification received");
      console.log("[iOS-NOTIF] Title:", payload.notification?.title);
      console.log("[iOS-NOTIF] Data:", payload.data);
      
      try {
        // Save notification to Firestore (will handle broadcast vs user-specific)
        await NotificationService.processIncomingNotification(payload, user?.uid);
      } catch (error) {
        // console.error("❌ ERROR saving notification to Firestore:", error);
      }
      
      // Show foreground banner
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
    const granted = await requestNotificationPermission();
    console.log("[iOS-NOTIF] Permission result:", granted ? 'granted' : 'denied');
    
    if (granted) {
      console.log("[iOS-NOTIF] Getting FCM token...");
      const token = await getWebFcmToken();
      console.log("[iOS-NOTIF] Token received:", token ? 'YES' : 'NO');
      
      if (token) {
        console.log("[iOS-NOTIF] FCM Token (first 20 chars):", token.substring(0, 20) + "...");
        // Pass user info if authenticated
        const userId = user?.uid || null;
        const userEmail = user?.email;
        const userName = user?.displayName || undefined;
        console.log("[iOS-NOTIF] Saving token to Firestore...");
        await saveTokenToRepo(token, userId, userEmail, userName);
        console.log("[iOS-NOTIF] Token saved successfully!");
        
        // Track new subscription in daily stats
        await NotificationService.trackNewSubscription();
      } else {
        console.warn("[iOS-NOTIF] No FCM token received - browser permission was granted but FCM is not supported on this browser. In-app notifications will still work.");
        // Still save a placeholder or show in-app notifications
        // For now, we just log this - the user can still receive in-app notifications
      }
    } else {
      console.error("[iOS-NOTIF] ERROR: Permission not granted");
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

  return (
    <View style={{ flex: 1 }}>
      {/* Permission banner at the very top */}
      {showPermissionBanner && (
        <PermissionBanner
          onAllow={handleAllowNotifications}
          onBlock={handleBlockNotifications}
        />
      )}
      
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Main">
        <Stack.Screen name="Main" component={MainTabNavigator} />
        <Stack.Screen name="Auth" component={AuthNavigator} />
      </Stack.Navigator>

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
      <NavigationContainer ref={navigationRef}>
        <AppContent />
      </NavigationContainer>
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
