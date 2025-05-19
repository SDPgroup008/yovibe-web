"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "./src/services/FirebaseService"
import type { User } from "./src/models/User"

const ProfileScreen: React.FC = () => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await FirebaseService.getCurrentUser()
        setUser(userData)
      } catch (error) {
        console.error("Error loading user profile:", error)
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [])

  const handleSignOut = async () => {
    try {
      await FirebaseService.signOut()
      // In a real app, this would trigger navigation back to the login screen
      Alert.alert("Success", "You have been signed out")
    } catch (error) {
      Alert.alert("Error", "Failed to sign out")
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    )
  }

  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>User not found</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>{user.email.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.emailText}>{user.email}</Text>
        <Text style={styles.userTypeText}>
          {user.userType === "user" ? "Regular User" : user.userType === "club_owner" ? "Club Owner" : "Admin"}
        </Text>
      </View>

      <View style={styles.menuContainer}>
        <TouchableOpacity style={styles.menuItem}>
          <Ionicons name="person-outline" size={24} color="#FFFFFF" />
          <Text style={styles.menuText}>Edit Profile</Text>
          <Ionicons name="chevron-forward" size={24} color="#666666" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
          <Text style={styles.menuText}>Notifications</Text>
          <Ionicons name="chevron-forward" size={24} color="#666666" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <Ionicons name="settings-outline" size={24} color="#FFFFFF" />
          <Text style={styles.menuText}>Settings</Text>
          <Ionicons name="chevron-forward" size={24} color="#666666" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <Ionicons name="help-circle-outline" size={24} color="#FFFFFF" />
          <Text style={styles.menuText}>Help & Support</Text>
          <Ionicons name="chevron-forward" size={24} color="#666666" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
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
    fontSize: 16,
  },
  profileHeader: {
    alignItems: "center",
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#2196F3",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  emailText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  userTypeText: {
    fontSize: 16,
    color: "#BBBBBB",
  },
  menuContainer: {
    marginTop: 24,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    color: "#FFFFFF",
    marginLeft: 16,
  },
  signOutButton: {
    margin: 24,
    padding: 16,
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    alignItems: "center",
  },
  signOutText: {
    fontSize: 16,
    color: "#FF3B30",
    fontWeight: "bold",
  },
})

export default ProfileScreen
