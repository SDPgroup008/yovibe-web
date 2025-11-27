"use client";

import { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AuthNavigator, MainTabNavigator } from "./navigation/AppNavigator.web";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { navigationRef } from "./utils/navigationRef";

// Create the stack navigator
const Stack = createStackNavigator();

// Main app component with auth state handling
function AppContent() {
  const { user, loading, consumeRedirectIntent } = useAuth();
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    // After auth state is determined, set initializing to false
    if (!loading) {
      setInitializing(false);
    }
  }, [loading]);

  // Post-login: consume any saved redirect intent and navigate there
  useEffect(() => {
    // Only attempt redirect when auth has settled and we have a user
    if (!loading && user) {
      try {
        const intent = consumeRedirectIntent?.();
        if (intent && intent.routeName) {
          // Reset to Main stack first so nested navigation works predictably,
          // then navigate to the intended route. Small timeout ensures reset completes.
          navigationRef.current?.reset({
            index: 0,
            routes: [{ name: "Main" }],
          });

          setTimeout(() => {
            try {
              // If params exist, pass them; otherwise navigate by route name only
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

  if (initializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading YoVibe...</Text>
      </View>
    );
  }

  // NOTE: Soft-auth behavior — always render Main so users can browse without signing in.
  // Auth stack remains available and can be navigated to when needed (e.g., AddEvent/AddVenue).
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Main">
      <Stack.Screen name="Main" component={MainTabNavigator} />
      <Stack.Screen name="Auth" component={AuthNavigator} />
    </Stack.Navigator>
  );
}

// Root component with providers
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
