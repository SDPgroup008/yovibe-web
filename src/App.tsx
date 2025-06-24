"use client"

import { useEffect, useState } from "react"
import { NavigationContainer } from "@react-navigation/native"
import { createStackNavigator } from "@react-navigation/stack"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import { AuthNavigator, MainTabNavigator } from "./"
import { View, Text, ActivityIndicator, StyleSheet } from "react-native"
import { navigationRef } from "./utils/navigationRef"

// Create the stack navigator
const Stack = createStackNavigator()

// Main app component with auth state handling
function AppContent() {
  const { user, loading } = useAuth()
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    // After auth state is determined, set initializing to false
    if (!loading) {
      setInitializing(false)
    }
  }, [loading])

  // Additional safety check - if user is null, always show auth
  useEffect(() => {
    if (!loading && !user) {
      // Ensure we're on the auth screen when no user is present
      setTimeout(() => {
        try {
          navigationRef.current?.reset({
            index: 0,
            routes: [{ name: "Auth" }],
          })
        } catch (error) {
          console.warn("Navigation reset error:", error)
        }
      }, 100)
    }
  }, [user, loading])

  if (initializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading YoVibe...</Text>
      </View>
    )
  }

  // Force auth screen if no user - additional safety measure
  if (!user) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Auth" component={AuthNavigator} />
      </Stack.Navigator>
    )
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabNavigator} />
    </Stack.Navigator>
  )
}

// Root component with providers
export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer ref={navigationRef}>
        <AppContent />
      </NavigationContainer>
    </AuthProvider>
  )
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
})
