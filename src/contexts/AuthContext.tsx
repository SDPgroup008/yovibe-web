"use client"

import type React from "react"
import { createContext, useState, useEffect, useContext } from "react"
import { onAuthStateChanged } from "firebase/auth"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { auth, isFirebaseConfigured } from "../config/firebase"
import FirebaseService from "../services/FirebaseService"
import type { User, UserType } from "../models/User"

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
          const parsedUser = JSON.parse(storedUser)
          // Convert date strings back to Date objects
          parsedUser.createdAt = new Date(parsedUser.createdAt)
          parsedUser.lastLoginAt = new Date(parsedUser.lastLoginAt)
          setUser(parsedUser)
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

    if (!isFirebaseConfigured) {
      console.log("Firebase not configured - skipping auth state listener")
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("Auth state changed:", firebaseUser ? firebaseUser.email : "No user")

      if (firebaseUser) {
        try {
          const userProfile = await FirebaseService.getUserProfile(firebaseUser.uid)
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
      if (!isFirebaseConfigured) {
        console.log("Development mode: Creating mock user for signin")
        // Create a mock user for development
        const mockUser = {
          id: "dev-user-id",
          uid: "dev-uid",
          email: email,
          userType: "user" as UserType,
          createdAt: new Date(),
          lastLoginAt: new Date(),
        }
        setUser(mockUser)
        await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(mockUser))
        console.log("Development signin successful")
        return
      }

      await FirebaseService.signIn(email, password)
      console.log("Sign in successful")
      // The onAuthStateChanged listener will update the user state
    } catch (error) {
      console.error("Error signing in:", error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const signUp = async (email: string, password: string, userType: UserType) => {
    console.log("Attempting to sign up:", email, "as", userType)
    setLoading(true)
    try {
      if (!isFirebaseConfigured) {
        console.log("Development mode: Creating mock user for signup")
        // Create a mock user for development
        const mockUser = {
          id: "dev-user-id",
          uid: "dev-uid",
          email: email,
          userType: userType,
          createdAt: new Date(),
          lastLoginAt: new Date(),
        }
        setUser(mockUser)
        await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(mockUser))
        console.log("Development signup successful")
        return
      }

      await FirebaseService.signUp(email, password, userType)
      console.log("Sign up successful")
      // The onAuthStateChanged listener will update the user state
    } catch (error) {
      console.error("Error signing up:", error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    console.log("Attempting to sign out")
    setLoading(true)
    try {
      if (!isFirebaseConfigured) {
        console.log("Development mode: Simulating signout")
        await AsyncStorage.removeItem(USER_STORAGE_KEY)
        setUser(null)
        console.log("Development signout successful")
        return
      }

      await FirebaseService.signOut()
      // Clear stored user data
      await AsyncStorage.removeItem(USER_STORAGE_KEY)
      setUser(null)
      console.log("Sign out successful")
    } catch (error) {
      console.error("Error signing out:", error)
      // Clear user state even if there was an error
      await AsyncStorage.removeItem(USER_STORAGE_KEY)
      setUser(null)
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
      if (!isFirebaseConfigured) {
        console.log("Development mode: Simulating profile update")
        const updatedUser = { ...user, ...data }
        setUser(updatedUser)
        await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser))
        console.log("Development profile update successful")
        return
      }

      await FirebaseService.updateUserProfile(user.id, data)

      // Update local user state
      const updatedUser = { ...user, ...data }
      setUser(updatedUser)

      // Update stored user data
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser))
      console.log("Profile update successful")
    } catch (error) {
      console.error("Error updating profile:", error)
      throw error
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
