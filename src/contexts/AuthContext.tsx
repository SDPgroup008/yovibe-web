"use client"

import type React from "react"
import { createContext, useState, useEffect, useContext } from "react"
import { onAuthStateChanged } from "firebase/auth"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { auth } from "../config/firebase"
import FirebaseService from "../services/FirebaseService"
import type { User, UserType } from "../models/User"
import { reset, navigate } from "../utils/navigationRef"
import { isDevelopment } from "../utils/env"

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, userType: UserType) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (data: Partial<User>) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Key for storing user data in AsyncStorage
const USER_STORAGE_KEY = "yovibe_user_data"

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Load user from AsyncStorage on initial load
  useEffect(() => {
    const loadStoredUser = async () => {
      try {
        const storedUser = await AsyncStorage.getItem(USER_STORAGE_KEY)
        if (storedUser) {
          setUser(JSON.parse(storedUser))
        }
      } catch (error) {
        console.error("Error loading stored user:", error)
      } finally {
        setLoading(false)
      }
    }

    loadStoredUser()
  }, [])

  useEffect(() => {
    console.log("Setting up auth state listener")
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true)
      console.log("Auth state changed:", firebaseUser ? firebaseUser.email : "No user")

      if (firebaseUser) {
        try {
          // For development/testing, create a mock user if Firebase is not properly configured
          let userProfile
          try {
            userProfile = await FirebaseService.getUserProfile(firebaseUser.uid)
          } catch (error) {
            console.warn("Error fetching user profile, using mock data:", error)
            // Create a mock user for development
            userProfile = {
              id: "mock-id",
              uid: firebaseUser.uid,
              email: firebaseUser.email || "test@example.com",
              userType: "user" as UserType,
              createdAt: new Date(),
              lastLoginAt: new Date(),
            }
          }

          setUser(userProfile)
          console.log("User profile loaded:", userProfile.email)

          // Store user data in AsyncStorage
          await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userProfile))
        } catch (error) {
          console.error("Error in auth state change handler:", error)
          setUser(null)
          await AsyncStorage.removeItem(USER_STORAGE_KEY)
        }
      } else {
        console.log("No user found, clearing user state")
        setUser(null)
        await AsyncStorage.removeItem(USER_STORAGE_KEY)

        // Ensure we're on the auth screen when no user is present
        setTimeout(() => {
          try {
            reset({
              index: 0,
              routes: [{ name: "Auth", params: { screen: "Login" } }],
            })
          } catch (navError) {
            console.warn("Navigation error during auth state cleanup:", navError)
          }
        }, 100)
      }

      setLoading(false)
    })

    return () => {
      console.log("Cleaning up auth state listener")
      unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    console.log("Attempting to sign in:", email)
    setLoading(true)
    try {
      await FirebaseService.signIn(email, password)
      console.log("Sign in successful")
      // The onAuthStateChanged listener will update the user state

      // For development/testing, create a mock user if Firebase is not properly configured
      if (isDevelopment()) {
        console.log("Development mode: Creating mock user")
        const mockUser = {
          id: "mock-id",
          uid: "mock-uid",
          email: email,
          userType: "user" as UserType,
          createdAt: new Date(),
          lastLoginAt: new Date(),
        }
        setUser(mockUser)
        await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(mockUser))
      }

      // Navigate to main app after successful login
      try {
        reset({
          index: 0,
          routes: [{ name: "Main" }],
        })
      } catch (navError) {
        console.warn("Navigation error:", navError)
      }
    } catch (error) {
      console.error("Error signing in:", error)

      // For development/testing, create a mock user if Firebase is not properly configured
      if (isDevelopment()) {
        console.log("Development mode: Creating mock user")
        const mockUser = {
          id: "mock-id",
          uid: "mock-uid",
          email: email,
          userType: "user" as UserType,
          createdAt: new Date(),
          lastLoginAt: new Date(),
        }
        setUser(mockUser)
        await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(mockUser))
      } else {
        throw error
      }
    } finally {
      setLoading(false)
    }
  }

  const signUp = async (email: string, password: string, userType: UserType) => {
    console.log("Attempting to sign up:", email, "as", userType)
    setLoading(true)
    try {
      await FirebaseService.signUp(email, password, userType)
      console.log("Sign up successful")
      // The onAuthStateChanged listener will update the user state

      // For development/testing, create a mock user if Firebase is not properly configured
      if (isDevelopment()) {
        console.log("Development mode: Creating mock user")
        const mockUser = {
          id: "mock-id",
          uid: "mock-uid",
          email: email,
          userType: userType,
          createdAt: new Date(),
          lastLoginAt: new Date(),
        }
        setUser(mockUser)
        await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(mockUser))
      }

      // Navigate to main app after successful signup
      try {
        reset({
          index: 0,
          routes: [{ name: "Main" }],
        })
      } catch (navError) {
        console.warn("Navigation error:", navError)
      }
    } catch (error) {
      console.error("Error signing up:", error)

      // For development/testing, create a mock user if Firebase is not properly configured
      if (isDevelopment()) {
        console.log("Development mode: Creating mock user")
        const mockUser = {
          id: "mock-id",
          uid: "mock-uid",
          email: email,
          userType: userType,
          createdAt: new Date(),
          lastLoginAt: new Date(),
        }
        setUser(mockUser)
        await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(mockUser))
      } else {
        throw error
      }
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    console.log("Attempting to sign out")
    setLoading(true)
    try {
      // Clear user state immediately to prevent any lingering access
      setUser(null)

      // Clear stored user data first
      await AsyncStorage.removeItem(USER_STORAGE_KEY)

      // Sign out from Firebase
      await FirebaseService.signOut()

      console.log("Sign out successful")

      // Navigate to Auth/Login screen after sign out with complete reset
      try {
        reset({
          index: 0,
          routes: [{ name: "Auth", params: { screen: "Login" } }],
        })
      } catch (navError) {
        console.warn("Navigation error:", navError)
        // Fallback navigation
        navigate("Auth")
      }
    } catch (error) {
      console.error("Error signing out:", error)

      // Even if Firebase sign out fails, clear local state and navigate to login
      setUser(null)
      await AsyncStorage.removeItem(USER_STORAGE_KEY)

      // Still navigate to Auth screen even if there was an error
      try {
        reset({
          index: 0,
          routes: [{ name: "Auth", params: { screen: "Login" } }],
        })
      } catch (navError) {
        console.warn("Navigation error:", navError)
        // Fallback navigation
        navigate("Auth")
      }
    } finally {
      setLoading(false)
    }
  }

  const updateProfile = async (data: Partial<User>) => {
    if (!user) {
      throw new Error("No user logged in")
    }

    console.log("Updating user profile:", data)
    setLoading(true)
    try {
      await FirebaseService.updateUserProfile(user.id, data)

      // Update local user state
      const updatedUser = { ...user, ...data }
      setUser(updatedUser)

      // Update stored user data
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser))
      console.log("Profile update successful")
    } catch (error) {
      console.error("Error updating profile:", error)

      // For development/testing, update local state even if Firebase fails
      if (isDevelopment()) {
        const updatedUser = { ...user, ...data }
        setUser(updatedUser)
        await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser))
      } else {
        throw error
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
