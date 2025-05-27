"use client"

import { useEffect, useState } from "react"
import { NavigationContainer } from "@react-navigation/native"
import { createStackNavigator } from "@react-navigation/stack"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import { AuthNavigator, MainTabNavigator } from "./navigation/AppNavigator"
import { View, Text, ActivityIndicator, StyleSheet } from "react-native"

// Create the stack navigator
const Stack = createStackNavigator()

// Main app component with auth state handling
function AppContent() {
  const { user, loading } = useAuth()
  const [forceRender, setForceRender] = useState(0)

  // Force re-render when user state changes
  useEffect(() => {
    console.log("App: User state changed, forcing re-render", {
      hasUser: !!user,
      userEmail: user?.email,
      loading,
      forceRender,
    })
    setForceRender((prev) => prev + 1)
  }, [user, loading])

  // Show loading screen while determining auth state
  if (loading) {
    console.log("App: Showing loading screen")
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading YoVibe...</Text>
      </View>
    )
  }

  // If user is authenticated, show main app
  if (user) {
    console.log("App: User authenticated, showing main app for:", user.email)
    return (
      <View style={styles.container} key={`main-${forceRender}`}>
        <MainTabNavigator />
      </View>
    )
  }

  // If no user, show auth screens
  console.log("App: No user, showing auth screens")
  return (
    <View style={styles.container} key={`auth-${forceRender}`}>
      <AuthNavigator />
    </View>
  )
}

// Root component with providers
export default function App() {
  console.log("App: Root component rendering")
  return (
    <AuthProvider>
      <NavigationContainer>
        <AppContent />
      </NavigationContainer>
    </AuthProvider>
  )
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
})
