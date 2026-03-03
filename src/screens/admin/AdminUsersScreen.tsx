"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../../services/FirebaseService"
import AnalyticsService, { type UserVisitData } from "../../services/AnalyticsService"
import { useAuth } from "../../contexts/AuthContext"
import type { User } from "../../models/User"
import type { AdminUsersScreenProps } from "../../navigation/types"

// User type for tab filtering
type UserCategoryTab = "all" | "club_owner" | "user" | "admin" | "viber"

const AdminUsersScreen = ({ navigation }: AdminUsersScreenProps) => {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [unauthenticatedVisitors, setUnauthenticatedVisitors] = useState<UserVisitData[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<UserCategoryTab>("all")

  useEffect(() => {
    if (currentUser?.userType !== "admin") {
      Alert.alert("Access Denied", "You don't have permission to access this page")
      navigation.goBack()
      return
    }

    loadUsers()
    loadUnauthenticatedVisitors()
  }, [currentUser, navigation])

  const loadUnauthenticatedVisitors = async () => {
    try {
      const visitors = await AnalyticsService.getAllUnauthenticatedVisitors()
      setUnauthenticatedVisitors(visitors)
      console.log('AdminUsersScreen: Loaded', visitors.length, 'unauthenticated visitors')
    } catch (error) {
      console.error('AdminUsersScreen: Error loading unauthenticated visitors:', error)
    }
  }

  const loadUsers = async () => {
    try {
      setLoading(true)
      console.log("AdminUsersScreen: Loading users...")
      const allUsers = await FirebaseService.getAllUsers()
      console.log("AdminUsersScreen: Loaded", allUsers.length, "users")
      setUsers(allUsers)
    } catch (error) {
      console.error("AdminUsersScreen: Error loading users:", error)
      Alert.alert("Error", "Failed to load users. Please try again.")
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

  // Get filtered users based on active tab
  const getFilteredUsers = (): User[] => {
    if (activeTab === "all") {
      return users
    }
    if (activeTab === "viber") {
      // Vibers are users without email (unauthenticated) - show visitors from analytics
      return []
    }
    return users.filter(user => user.userType === activeTab)
  }

  // Get count for each category
  const getCategoryCount = (category: UserCategoryTab): number => {
    if (category === "all") return users.length
    if (category === "viber") return unauthenticatedVisitors.length // Use visitor count for Vibers
    return users.filter(user => user.userType === category).length
  }

  // Render visitor item for Vibers tab
  const renderVisitorItem = ({ item, index }: { item: UserVisitData, index: number }) => (
    <View style={styles.tokenCard}>
      <View style={styles.userInfo}>
        <View style={[styles.avatarContainer, styles.viberAvatar]}>
          <Text style={styles.avatarText}>V</Text>
        </View>
        <View style={styles.userDetails}>
          <Text style={styles.userEmail}>Visitor #{index + 1}</Text>
          <Text style={styles.userType}>Viber (Unauthenticated)</Text>
          <Text style={styles.tokenText} numberOfLines={1}>{item.uniqueVisitorId}</Text>
          <Text style={styles.visitorCount}>Total Visits: {item.visitCount}</Text>
          <Text style={styles.userDate}>Last Visit: {item.lastVisit.toLocaleDateString()}</Text>
        </View>
      </View>
    </View>
  )

  // Render user item for other tabs
  const renderUserItem = ({ item }: { item: User }) => {
    // Defensive checks for missing data
    const email = item.email || ''
    const isViber = !email || email === ''
    
    // For display - Vibers show token, others show email
    const displayValue = isViber 
      ? (item.uid ? `Token: ${item.uid.substring(0, 20)}...` : 'No Token') 
      : email
    
    const avatarLetter = email ? email.charAt(0).toUpperCase() : '?'
    const userTypeLabel = item.userType === "user" ? "Regular User" : item.userType === "club_owner" ? "Club Owner" : item.userType === "admin" ? "Admin" : "Unknown"
    const joinDate = item.createdAt ? item.createdAt.toDateString() : (item.lastLoginAt ? item.lastLoginAt.toDateString() : 'Unknown')
    
    return (
      <View style={styles.userCard}>
        <View style={styles.userInfo}>
          <View style={[styles.avatarContainer, isViber && styles.viberAvatar]}>
            <Text style={styles.avatarText}>{avatarLetter}</Text>
          </View>
          <View style={styles.userDetails}>
            <Text style={styles.userEmail}>{displayValue}</Text>
            <Text style={styles.userType}>
              {isViber ? "Viber (Unauthenticated)" : userTypeLabel}
            </Text>
            <Text style={styles.userDate}>Joined: {joinDate}</Text>
            {item.userType === "club_owner" && item.venueId && (
              <Text style={styles.venueInfo}>Club ID: {item.venueId}</Text>
            )}
          </View>
        </View>

        <View style={styles.actionButtons}>
          {item.userType !== "admin" && !isViber && (
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
  }

  // Tab button component
  const renderTabButton = (tab: UserCategoryTab, label: string) => {
    const count = getCategoryCount(tab)
    const isActive = activeTab === tab
    
    return (
      <TouchableOpacity
        key={tab}
        style={[styles.tab, isActive && styles.activeTab]}
        onPress={() => setActiveTab(tab)}
      >
        <Text style={[styles.tabText, isActive && styles.activeTabText]}>{label}</Text>
        <View style={[styles.badge, isActive && styles.activeBadge]}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading users...</Text>
      </View>
    )
  }

  const filteredUsers = getFilteredUsers()
  
  // Determine what to show based on active tab
  const showVisitors = activeTab === "viber"
  const displayData = showVisitors ? unauthenticatedVisitors : filteredUsers

  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>Manage Users</Text>
      <Text style={styles.subHeaderText}>Total Users: {users.length}</Text>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.tabScrollView}
          contentContainerStyle={styles.tabScrollContent}
        >
          {renderTabButton("all", "All Users")}
          {renderTabButton("club_owner", "Club Owners")}
          {renderTabButton("user", "Regular Users")}
          {renderTabButton("admin", "Admins")}
          {renderTabButton("viber", "Vibers")}
        </ScrollView>
      </View>

      <FlatList
        data={displayData as any}
        keyExtractor={(item: any, index: number) => showVisitors ? `visitor-${item.uniqueVisitorId}` : item.id}
        renderItem={showVisitors ? renderVisitorItem as any : renderUserItem}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{showVisitors ? "No visitors found" : "No users found"}</Text>
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
  tabScrollView: {
    flexGrow: 0,
  },
  tabContainer: {
    marginBottom: 16,
  },
  tabScrollContent: {
    flexDirection: "row",
    gap: 8,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#1E1E1E",
    gap: 8,
  },
  activeTab: {
    backgroundColor: "#2196F3",
  },
  tabText: {
    color: "#BBBBBB",
    fontSize: 14,
  },
  activeTabText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  badge: {
    backgroundColor: "#333333",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: "center",
  },
  activeBadge: {
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
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
  tokenCard: {
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
  viberAvatar: {
    backgroundColor: "#FF9800",
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
  venueInfo: {
    fontSize: 12,
    color: "#FF9800",
    marginTop: 4,
  },
  tokenText: {
    fontSize: 12,
    color: "#FF9800",
    marginTop: 4,
    fontFamily: "monospace",
  },
  visitorCount: {
    fontSize: 12,
    color: "#FFD700",
    marginTop: 4,
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
