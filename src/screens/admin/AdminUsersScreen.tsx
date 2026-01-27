"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../../services/FirebaseService"
import { useAuth } from "../../contexts/AuthContext"
import type { User } from "../../models/User"
import type { AdminUsersScreenProps } from "../../navigation/types"

const AdminUsersScreen: React.FC<AdminUsersScreenProps> = ({ navigation }) => {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (currentUser?.userType !== "admin") {
      Alert.alert("Access Denied", "You don't have permission to access this page")
      navigation.goBack()
      return
    }

    loadUsers()
  }, [currentUser, navigation])

  const loadUsers = async () => {
    try {
      setLoading(true)
      const allUsers = await FirebaseService.getAllUsers()
      setUsers(allUsers)
    } catch (error) {
      console.error("Error loading users:", error)
      Alert.alert("Error", "Failed to load users")
    } finally {
      setLoading(false)
    }
  }

  const handleFreezeUser = async (userId: string, isFrozen: boolean) => {
    try {
      await FirebaseService.freezeUser(userId, isFrozen)
      Alert.alert("Success", `User ${isFrozen ? "frozen" : "unfrozen"} successfully`)
      loadUsers()
    } catch (error) {
      console.error("Error freezing/unfreezing user:", error)
      Alert.alert("Error", `Failed to ${isFrozen ? "freeze" : "unfreeze"} user`)
    }
  }

  const handleDeleteUser = (userId: string) => {
    Alert.alert("Delete User", "Are you sure you want to delete this user? This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true)
            await FirebaseService.deleteUser(userId)
            Alert.alert("Success", "User deleted successfully")
            // Refresh the list after deletion
            loadUsers()
          } catch (error) {
            console.error("Error deleting user:", error)
            Alert.alert("Error", "Failed to delete user")
            setLoading(false)
          }
        },
      },
    ])
  }

  const renderUserItem = ({ item }: { item: User }) => (
    <View style={styles.userCard}>
      <View style={styles.userInfo}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>{item.email.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.userDetails}>
          <Text style={styles.userEmail}>{item.email}</Text>
          <Text style={styles.userType}>
            {item.userType === "user" ? "Regular User" : item.userType === "club_owner" ? "Club Owner" : "Admin"}
          </Text>
          <Text style={styles.userDate}>Joined: {item.createdAt.toDateString()}</Text>
        </View>
      </View>

      <View style={styles.actionButtons}>
        {item.userType !== "admin" && (
          <>
            <TouchableOpacity
              style={[styles.actionButton, item.isFrozen ? styles.unfreezeButton : styles.freezeButton]}
              onPress={() => handleFreezeUser(item.id, !item.isFrozen)}
            >
              <Ionicons
                name={item.isFrozen ? "snow-outline" : "snow"}
                size={20}
                color={item.isFrozen ? "#2196F3" : "#FFFFFF"}
              />
              <Text style={styles.actionButtonText}>{item.isFrozen ? "Unfreeze" : "Freeze"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => handleDeleteUser(item.id)}
            >
              <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Delete</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading users...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>Manage Users</Text>
      <Text style={styles.subHeaderText}>Total Users: {users.length}</Text>

      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        renderItem={renderUserItem}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No users found</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    padding: 16,
  },
  headerText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  subHeaderText: {
    fontSize: 16,
    color: "#BBBBBB",
    marginBottom: 16,
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
  },
  listContainer: {
    paddingBottom: 16,
  },
  userCard: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  avatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#2196F3",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  userDetails: {
    flex: 1,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  userType: {
    fontSize: 14,
    color: "#2196F3",
    marginBottom: 4,
  },
  userDate: {
    fontSize: 12,
    color: "#BBBBBB",
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  freezeButton: {
    backgroundColor: "#2196F3",
  },
  unfreezeButton: {
    backgroundColor: "#333333",
    borderWidth: 1,
    borderColor: "#2196F3",
  },
  deleteButton: {
    backgroundColor: "#FF3B30",
  },
  actionButtonText: {
    color: "#FFFFFF",
    marginLeft: 4,
    fontSize: 14,
  },
  emptyContainer: {
    padding: 24,
    alignItems: "center",
  },
  emptyText: {
    color: "#FFFFFF",
    fontSize: 16,
  },
})

export default AdminUsersScreen
