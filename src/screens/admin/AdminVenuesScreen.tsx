"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Alert, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../../services/FirebaseService"
import { useAuth } from "../../contexts/AuthContext"
import type { Venue } from "../../models/Venue"
import type { AdminVenuesScreenProps } from "../../navigation/types"

const AdminVenuesScreen: React.FC<AdminVenuesScreenProps> = ({ navigation }) => {
  const { user: currentUser } = useAuth()
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (currentUser?.userType !== "admin") {
      Alert.alert("Access Denied", "You don't have permission to access this page")
      navigation.goBack()
      return
    }

    loadVenues()
  }, [currentUser, navigation])

  const loadVenues = async () => {
    try {
      setLoading(true)
      const venuesList = await FirebaseService.getVenues()
      setVenues(venuesList)
    } catch (error) {
      console.error("Error loading venues:", error)
      Alert.alert("Error", "Failed to load venues")
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteVenue = (venueId: string) => {
    Alert.alert("Delete Venue", "Are you sure you want to delete this venue? This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true)
            await FirebaseService.deleteVenue(venueId)

            // Also delete all events associated with this venue
            await FirebaseService.deleteEventsByVenue(venueId)

            Alert.alert("Success", "Venue and associated events deleted successfully")
            loadVenues()
          } catch (error) {
            console.error("Error deleting venue:", error)
            Alert.alert("Error", "Failed to delete venue")
            setLoading(false)
          }
        },
      },
    ])
  }

  const handleViewVenue = (venueId: string) => {
    navigation.navigate("VenueDetail", { venueId })
  }

  const renderVenueItem = ({ item }: { item: Venue }) => (
    <View style={styles.venueCard}>
      <Image source={{ uri: item.backgroundImageUrl }} style={styles.venueImage} />
      <View style={styles.venueContent}>
        <Text style={styles.venueName}>{item.name}</Text>
        <Text style={styles.venueLocation}>{item.location}</Text>
        <Text style={styles.venueCategories}>{item.categories.join(", ")}</Text>

        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.actionButton, styles.viewButton]} onPress={() => handleViewVenue(item.id)}>
            <Ionicons name="eye-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>View</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => handleDeleteVenue(item.id)}
          >
            <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading venues...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>Manage Venues</Text>
      <Text style={styles.subHeaderText}>Total Venues: {venues.length}</Text>

      <FlatList
        data={venues}
        keyExtractor={(item) => item.id}
        renderItem={renderVenueItem}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No venues found</Text>
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
  venueCard: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 16,
  },
  venueImage: {
    width: "100%",
    height: 120,
  },
  venueContent: {
    padding: 16,
  },
  venueName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  venueLocation: {
    fontSize: 14,
    color: "#BBBBBB",
    marginBottom: 4,
  },
  venueCategories: {
    fontSize: 14,
    color: "#2196F3",
    marginBottom: 16,
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
  viewButton: {
    backgroundColor: "#2196F3",
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

export default AdminVenuesScreen
