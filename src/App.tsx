"use client";

import { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AuthNavigator, MainTabNavigator } from "./navigation/AppNavigator.web";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { navigationRef } from "./utils/navigationRef";

// 🔔 Import Firebase helpers for notifications
import { requestNotificationPermission, getWebFcmToken, saveWebToken } from "./config/firebase";

const Stack = createStackNavigator();

// Main app component with auth state handling
function AppContent() {
  const { user, loading, consumeRedirectIntent } = useAuth();
  const [initializing, setInitializing] = useState(true);

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

  // 🔔 Subscribe to notifications for all users (soft-auth)
  useEffect(() => {
    (async () => {
      const granted = await requestNotificationPermission();
      if (granted) {
        const token = await getWebFcmToken();
        if (token) {
          await saveWebToken(token); // ✅ save directly to Firestore
          console.log("Web FCM token saved:", token);
        }
      }
    })();
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
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Main">
      <Stack.Screen name="Main" component={MainTabNavigator} />
      <Stack.Screen name="Auth" component={AuthNavigator} />
    </Stack.Navigator>
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
});
