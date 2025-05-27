"use client"

import { useEffect } from "react"
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

  useEffect(() => {
    // Debug logging with more detail
    console.log("App render state:", {
      hasUser: !!user,
      userEmail: user?.email,
      userId: user?.id,
      loading,
      timestamp: new Date().toISOString(),
    })
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

  // Determine which navigator to show
  const showMainApp = !!user
  console.log("App: Navigation decision:", {
    showMainApp,
    userExists: !!user,
    userEmail: user?.email,
  })

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animationEnabled: false, // Disable animations for immediate navigation
      }}
      initialRouteName={showMainApp ? "Main" : "Auth"}
    >
      {showMainApp ? (
        <Stack.Screen name="Main" component={MainTabNavigator} />
      ) : (
        <Stack.Screen name="Auth" component={AuthNavigator} />
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
