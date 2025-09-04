"use client"

import type React from "react"
import { useState, useEffect } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Image,
  Modal,
  ScrollView,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../contexts/AuthContext"
import FirebaseService from "../services/FirebaseService"
import ImagePickerService from "../services/ImagePickerService"
import type { ProfileScreenProps } from "../navigation/types"

const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const { user, signOut, updateProfile } = useAuth()
  const [loading, setLoading] = useState(false)

  // Edit profile states
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [displayName, setDisplayName] = useState(user?.displayName || "")
  const [photoURL, setPhotoURL] = useState(user?.photoURL || "")
  const [editProfileLoading, setEditProfileLoading] = useState(false)

  // Load user data on mount
  useEffect(() => {
    if (user && (user.displayName || user.photoURL)) {
      setDisplayName(user.displayName || "")
      setPhotoURL(user.photoURL || "")
    }
  }, [user])

  const handleSignOut = async () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          setLoading(true)
          try {
            console.log("ProfileScreen: Starting sign out process")
            await signOut()
            console.log("ProfileScreen: Sign out completed")
            navigation.reset({ index: 0, routes: [{ name: "Auth" }] })
          } catch (error) {
            console.error("ProfileScreen: Sign out error:", error)
            Alert.alert("Error", "Failed to sign out. Please try again.")
          } finally {
            setLoading(false)
          }
        },
      },
    ])
  }

  const navigateToMyVenues = () => {
    if (user?.userType === "club_owner") {
      navigation.navigate("MyVenues")
    }
  }

  const navigateToAdminUsers = () => {
    if (user?.userType === "admin") {
      navigation.navigate("AdminUsers")
    }
  }

  const navigateToAdminVenues = () => {
    if (user?.userType === "admin") {
      navigation.navigate("AdminVenues")
    }
  }

  const navigateToAdminEvents = () => {
    if (user?.userType === "admin") {
      navigation.navigate("AdminEvents")
    }
  }

  const handleToggleEditProfile = () => {
    setShowEditProfile(!showEditProfile)
  }

  const handleUpdateProfile = async () => {
    if (!user) return

    setEditProfileLoading(true)
    try {
      await updateProfile({
        displayName,
        photoURL,
      })

      setShowEditProfile(false)
      Alert.alert("Success", "Profile updated successfully")
    } catch (error) {
      Alert.alert("Error", "Failed to update profile")
    } finally {
      setEditProfileLoading(false)
    }
  }

  const handlePickProfileImage = async () => {
    try {
      // Request permissions first (no-op on web)
      await ImagePickerService.requestMediaLibraryPermissionsAsync()

      // Launch image picker
      const result = await ImagePickerService.launchImageLibraryAsync({
        mediaTypes: "Images",
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      })

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri
        setPhotoURL(imageUri)

        // If we're not in edit mode, auto-save the profile image
        if (!showEditProfile) {
          setEditProfileLoading(true)
          try {
            // Upload image and get URL
            const uploadedUrl = await FirebaseService.uploadEventImage(imageUri)
            await updateProfile({ photoURL: uploadedUrl })
            Alert.alert("Success", "Profile image updated successfully")
          } catch (error) {
            Alert.alert("Error", "Failed to update profile image")
          } finally {
            setEditProfileLoading(false)
          }
        }
      }
    } catch (error) {
      console.error("Error picking image:", error)
      Alert.alert("Error", "Failed to pick image")
    }
  }

  const openNotifications = () => {
    // This would navigate to a notifications screen in a real app
    Alert.alert("Notifications", "You have no new notifications")
  }

  const openSettings = () => {
    // This would navigate to a settings screen in a real app
    Alert.alert("Settings", "Settings functionality coming soon")
  }

  const openHelpSupport = () => {
    // This would navigate to a help/support screen in a real app
    Alert.alert("Help & Support", "For help or support, please contact support@yovibe.com")
  }

  return (
    <View style={styles.container}>
      <View style={styles.profileHeader}>
        <TouchableOpacity style={styles.avatarContainer} onPress={handlePickProfileImage}>
          {photoURL ? (
            <Image source={{ uri: photoURL }} style={styles.avatar} />
          ) : (
            <Text style={styles.avatarText}>{user?.email.charAt(0).toUpperCase() || "U"}</Text>
          )}
          <View style={styles.avatarEditBadge}>
            <Ionicons name="camera" size={16} color="#FFFFFF" />
          </View>
        </TouchableOpacity>

        <Text style={styles.emailText}>{user?.email}</Text>
        {displayName && <Text style={styles.displayNameText}>{displayName}</Text>}
        <Text style={styles.userTypeText}>
          {user?.userType === "user" ? "Regular User" : user?.userType === "club_owner" ? "Club Owner" : "Admin"}
        </Text>
      </View>

      <ScrollView style={styles.menuContainer}>
        <TouchableOpacity style={styles.menuItem} onPress={handleToggleEditProfile}>
          <Ionicons name="person-outline" size={24} color="#FFFFFF" />
          <Text style={styles.menuText}>Edit Profile</Text>
          <Ionicons name="chevron-forward" size={24} color="#666666" />
        </TouchableOpacity>

        {user?.userType === "club_owner" && (
          <TouchableOpacity style={styles.menuItem} onPress={navigateToMyVenues}>
            <Ionicons name="business-outline" size={24} color="#FFFFFF" />
            <Text style={styles.menuText}>My Venues</Text>
            <Ionicons name="chevron-forward" size={24} color="#666666" />
          </TouchableOpacity>
        )}

        {/* Admin Options */}
        {user?.userType === "admin" && (
          <>
            <TouchableOpacity style={styles.menuItem} onPress={navigateToAdminUsers}>
              <Ionicons name="people-outline" size={24} color="#FFFFFF" />
              <Text style={styles.menuText}>Manage Users</Text>
              <Ionicons name="chevron-forward" size={24} color="#666666" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={navigateToAdminVenues}>
              <Ionicons name="business-outline" size={24} color="#FFFFFF" />
              <Text style={styles.menuText}>Manage Venues</Text>
              <Ionicons name="chevron-forward" size={24} color="#666666" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={navigateToAdminEvents}>
              <Ionicons name="calendar-outline" size={24} color="#FFFFFF" />
              <Text style={styles.menuText}>Manage Events</Text>
              <Ionicons name="chevron-forward" size={24} color="#666666" />
            </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.menuItem} onPress={openNotifications}>
          <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
          <Text style={styles.menuText}>Notifications</Text>
          <Ionicons name="chevron-forward" size={24} color="#666666" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={openSettings}>
          <Ionicons name="settings-outline" size={24} color="#FFFFFF" />
          <Text style={styles.menuText}>Settings</Text>
          <Ionicons name="chevron-forward" size={24} color="#666666" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={openHelpSupport}>
          <Ionicons name="help-circle-outline" size={24} color="#FFFFFF" />
          <Text style={styles.menuText}>Help & Support</Text>
          <Ionicons name="chevron-forward" size={24} color="#666666" />
        </TouchableOpacity>
      </ScrollView>

      <TouchableOpacity
        style={[styles.signOutButton, loading && styles.disabledButton]}
        onPress={handleSignOut}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#FF3B30" /> : <Text style={styles.signOutText}>Sign Out</Text>}
      </TouchableOpacity>

      {/* Edit Profile Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showEditProfile}
        onRequestClose={handleToggleEditProfile}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Profile</Text>

            <TouchableOpacity style={styles.profileImageContainer} onPress={handlePickProfileImage}>
              {photoURL ? (
                <Image source={{ uri: photoURL }} style={styles.profileImage} />
              ) : (
                <View style={styles.profileImagePlaceholder}>
                  <Ionicons name="person" size={60} color="#666666" />
                </View>
              )}
              <View style={styles.profileImageEditBadge}>
                <Ionicons name="camera" size={20} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            <Text style={styles.inputLabel}>Display Name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Enter your name"
              placeholderTextColor="#999"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={handleToggleEditProfile}
                disabled={editProfileLoading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton, editProfileLoading && styles.disabledButton]}
                onPress={handleUpdateProfile}
                disabled={editProfileLoading}
              >
                {editProfileLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
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
    position: "relative",
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#2196F3",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#121212",
  },
  emailText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  displayNameText: {
    fontSize: 16,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  userTypeText: {
    fontSize: 16,
    color: "#BBBBBB",
  },
  menuContainer: {
    flex: 1,
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
    backgroundColor: "#FF3B30",
    borderRadius: 8,
    alignItems: "center",
  },
  signOutText: {
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalContent: {
    width: "90%",
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 20,
  },
  profileImageContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#2196F3",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    position: "relative",
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  profileImagePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
  },
  profileImageEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#2196F3",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#1E1E1E",
  },
  inputLabel: {
    alignSelf: "flex-start",
    fontSize: 16,
    color: "#FFFFFF",
    marginBottom: 8,
  },
  input: {
    width: "100%",
    backgroundColor: "#121212",
    borderRadius: 8,
    padding: 12,
    color: "#FFFFFF",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#333",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginHorizontal: 8,
  },
  cancelButton: {
    backgroundColor: "#333",
  },
  cancelButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  saveButton: {
    backgroundColor: "#2196F3",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  disabledButton: {
    opacity: 0.6,
  },
})

export default ProfileScreen