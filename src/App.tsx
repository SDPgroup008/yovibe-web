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

const Stack = createStackNavigator();

// 🔔 Banner component with animation + auto-dismiss
function NotificationBanner({ title, body, onClose }) {
  const slideAnim = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    // Slide in
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Auto-dismiss after 3 seconds
    const timer = setTimeout(() => {
      handleClose();
    }, 3000);

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

// 🔔 Helper: Save token to GitHub repo (tokens.json) safely
async function saveTokenToRepo(token: string) {
  try {
    const fileUrl = "https://api.github.com/repos/SDPgroup008/yovibe-web/contents/tokens.json";

    // Step 1: Fetch existing tokens.json (if it exists)
    let tokens: string[] = [];
    let sha: string | undefined;

    const res = await fetch(fileUrl, {
      headers: {
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_GITHUB_PAT}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (res.ok) {
      const data = await res.json();
      sha = data.sha;
      const existingContent = JSON.parse(
        Buffer.from(data.content, "base64").toString("utf-8")
      );
      tokens = existingContent;
    }

    // Step 2: Append new token if not already present
    if (!tokens.includes(token)) {
      tokens.push(token);
    }

    // Step 3: PUT updated file back to GitHub
    const updateRes = await fetch(fileUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_GITHUB_PAT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Append new FCM token",
        content: Buffer.from(JSON.stringify(tokens)).toString("base64"),
        sha, // include SHA if file already existed
      }),
    });

    if (!updateRes.ok) {
      console.error("Failed to update tokens.json:", await updateRes.text());
    } else {
      console.log("Token appended successfully");
    }
  } catch (err) {
    console.error("Error saving token:", err);
  }
}

// Main app component with auth state handling
function AppContent() {
  const { user, loading, consumeRedirectIntent } = useAuth();
  const [initializing, setInitializing] = useState(true);
  const [banner, setBanner] = useState<{ title: string; body: string } | null>(null);

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
              console.warn("Post-login navigation error:", navErr);
            }
          }, 50);
        }
      } catch (err) {
        console.warn("Failed to consume redirect intent:", err);
      }
    }
  }, [user, loading, consumeRedirectIntent]);

  // 🔔 Register service worker + notifications
  useEffect(() => {
    (async () => {
      if ("serviceWorker" in navigator) {
        try {
          await navigator.serviceWorker.register("/firebase-messaging-sw.js");
          console.log("Service worker registered");
        } catch (err) {
          console.error("Service worker registration failed:", err);
        }
      }

      const granted = await requestNotificationPermission();
      if (granted) {
        const token = await getWebFcmToken();
        if (token) {
          console.log("Web FCM token retrieved:", token);
          // Save token to GitHub repo so Action can subscribe it
          await saveTokenToRepo(token);
        }
      }
    })();

    // Foreground notifications → show banner
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log("Foreground notification:", payload);
      setBanner({
        title: payload.notification?.title || "Notification",
        body: payload.notification?.body || "",
      });
    });

    return () => unsubscribe();
  }, []);

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
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Main">
        <Stack.Screen name="Main" component={MainTabNavigator} />
        <Stack.Screen name="Auth" component={AuthNavigator} />
      </Stack.Navigator>

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
