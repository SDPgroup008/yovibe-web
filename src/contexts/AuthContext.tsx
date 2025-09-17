"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { onAuthStateChanged } from "firebase/auth"
import { auth } from "../config/firebase"
import FirebaseService from "../services/FirebaseService"
import type { User } from "../models/User"

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, userType: "user" | "club_owner" | "admin") => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (data: { displayName?: string; photoURL?: string }) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log("AuthContext: Setting up auth state listener")
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("AuthContext: Auth state changed", firebaseUser?.email || "null")

      if (firebaseUser) {
        try {
          console.log("AuthContext: Loading user profile for", firebaseUser.email)
          const userProfile = await FirebaseService.getUserProfile(firebaseUser.uid)
          console.log("AuthContext: User profile loaded", userProfile.email)
          setUser(userProfile)
        } catch (error) {
          console.error("AuthContext: Error loading user profile:", error)
          setUser(null)
        }
      } else {
        console.log("AuthContext: No user, clearing state")
        setUser(null)
      }

      setLoading(false)
    })

    return () => {
      console.log("AuthContext: Cleaning up auth listener")
      unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    try {
      console.log("AuthContext: Starting sign in for", email)
      setLoading(true)
      await FirebaseService.signIn(email, password)
      console.log("AuthContext: Sign in completed")
    } catch (error) {
      console.error("AuthContext: Sign in error:", error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const signUp = async (email: string, password: string, userType: "user" | "club_owner" | "admin") => {
    try {
      console.log("AuthContext: Starting sign up for", email, "as", userType)
      setLoading(true)
      await FirebaseService.signUp(email, password, userType)
      console.log("AuthContext: Sign up completed")
    } catch (error) {
      console.error("AuthContext: Sign up error:", error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    try {
      console.log("AuthContext: Starting sign out process")
      setLoading(true)

      // Add timeout to prevent hanging
      const signOutPromise = FirebaseService.signOut()
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Sign out timed out after 5 seconds")), 5000)
      })
      await Promise.race([signOutPromise, timeoutPromise])

      // Clear user state after successful sign out
      setUser(null)

      console.log("AuthContext: Sign out process completed")
    } catch (error: any) {
      console.error("AuthContext: Sign out error:", error.message)
      setUser(null) // Ensure user is cleared even on error
      throw new Error(`Sign out failed: ${error.message}`)
    } finally {
      setLoading(false)
      console.log("AuthContext: Loading reset to false")
    }
  }

  const updateProfile = async (data: { displayName?: string; photoURL?: string }) => {
    if (!user) {
      throw new Error("No user logged in")
    }

    try {
      console.log("AuthContext: Updating user profile")
      await FirebaseService.updateUserProfile(user.id, data)

      // Update local user state
      setUser({
        ...user,
        ...data,
      })

      console.log("AuthContext: Profile updated successfully")
    } catch (error) {
      console.error("AuthContext: Error updating profile:", error)
      throw error
    }
  }

  const value: AuthContextType = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    updateProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}