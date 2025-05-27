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
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    // After auth state is determined, set initializing to false
    if (!loading) {
      const timer = setTimeout(() => {
        setInitializing(false)
      }, 100) // Small delay to ensure state is properly set

      return () => clearTimeout(timer)
    }
  }, [loading])

  useEffect(() => {
    // Debug logging
    console.log("App state:", {
      user: !!user,
      userEmail: user?.email,
      loading,
      initializing,
      shouldShowMain: !!user && !loading && !initializing,
      shouldShowAuth: !user && !loading && !initializing,
    })
  }, [user, loading, initializing])

  if (initializing || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading YoVibe...</Text>
      </View>
    )
  }

  console.log("Rendering navigation with user:", user ? user.email : "No user")

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <Stack.Screen
          name="Main"
          component={MainTabNavigator}
          options={{
            animationEnabled: false, // Disable animation for smoother transition
          }}
        />
      ) : (
        <Stack.Screen
          name="Auth"
          component={AuthNavigator}
          options={{
            animationEnabled: false, // Disable animation for smoother transition
          }}
        />
      )}
    </Stack.Navigator>
  )
}

// Root component with providers
export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
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
