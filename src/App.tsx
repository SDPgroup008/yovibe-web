"use client";

import { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AuthNavigator, MainTabNavigator } from "./navigation/AppNavigator";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";

function AppContent() {
  const { user, loading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<"loading" | "auth" | "main">("loading");

  useEffect(() => {
    console.log("App: Auth state effect triggered", {
      hasUser: !!user,
      userEmail: user?.email,
      userType: user?.userType,
      loading,
      timestamp: new Date().toISOString(),
    });

    if (loading) {
      console.log("App: Setting screen to loading");
      setCurrentScreen("loading");
    } else if (user) {
      console.log("App: User authenticated, setting screen to main for:", user.email);
      setCurrentScreen("main");
    } else {
      console.log("App: No user, setting screen to auth");
      setCurrentScreen("auth");
    }
  }, [user, loading]); // Ensure dependencies are correct

  useEffect(() => {
    console.log("App: Current screen changed to:", currentScreen);
  }, [currentScreen]);

  switch (currentScreen) {
    case "loading":
      console.log("App: Rendering loading screen");
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Loading YoVibe...</Text>
        </View>
      );
    case "main":
      console.log("App: Rendering main app for user:", user?.email);
      return <MainTabNavigator />;
    case "auth":
    default:
      console.log("App: Rendering auth screens");
      return <AuthNavigator />;
  }
}

export default function App() {
  console.log("App: Root component rendering at", new Date().toISOString());
  return (
    <AuthProvider>
      <NavigationContainer>
        <View style={styles.container}>
          <AppContent />
        </View>
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
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