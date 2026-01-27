"use client"

import type React from "react"
import { useState, useEffect } from "react"
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  Alert,
  ActivityIndicator,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../services/FirebaseService"
import VibeAnalysisService from "../services/VibeAnalysisService"
import { useAuth } from "../contexts/AuthContext"
import type { Venue } from "../models/Venue"

interface MyVenuesScreenProps {
  navigation: any
}

const MyVenuesScreen: React.FC<MyVenuesScreenProps> = ({ navigation }) => {
  const { user } = useAuth()
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [venueVibeRatings, setVenueVibeRatings] = useState<Record<string, number>>({})

  useEffect(() => {
    loadVenues()
  }, [])

  const loadVenues = async () => {
    if (!user) return

    setLoading(true)
    try {
      const venuesList = await FirebaseService.getVenuesByOwner(user.id)
      setVenues(venuesList)

      // Load current vibe ratings for each venue
      const vibeRatings: Record<string, number> = {}
      for (const venue of venuesList) {
        const rating = await FirebaseService.getLatestVibeRating(venue.id)
        if (rating !== null) {
          vibeRatings[venue.id] = rating
        }
      }
      setVenueVibeRatings(vibeRatings)
    } catch (error) {
      console.error("Error loading venues:", error)
      Alert.alert("Error", "Failed to load venues")
    } finally {
      setLoading(false)
    }
  }

  const handleVenueSelect = (venueId: string) => {
    navigation.navigate("VenueDetail", { venueId })
  }

  const handleAddVenue = () => {
    navigation.navigate("AddVenue")
  }

  const handleDeleteVenue = async (venueId: string) => {
    Alert.alert("Delete Venue", "Are you sure you want to delete this venue? This action can be undone by an admin.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setLoading(true)
          try {
            await FirebaseService.deleteVenue(venueId)
            Alert.alert("Success", "Venue deleted successfully")
            // Refresh the list
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
      <TouchableOpacity style={styles.addButton} onPress={handleAddVenue}>
        <Ionicons name="add" size={24} color="#FFFFFF" />
        <Text style={styles.addButtonText}>Add New Venue</Text>
      </TouchableOpacity>

      {venues.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="business-outline" size={64} color="#666666" />
          <Text style={styles.emptyText}>You don't have any venues yet</Text>
          <Text style={styles.emptySubtext}>Add your first venue to get started</Text>
        </View>
      ) : (
        <FlatList
          data={venues}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.venueCard}>
              <TouchableOpacity style={styles.venueContent} onPress={() => handleVenueSelect(item.id)}>
                <ImageBackground source={{ uri: item.backgroundImageUrl }} style={styles.venueImage} resizeMode="cover">
                  <View style={styles.venueGradient}>
                    <Text style={styles.venueName}>{item.name}</Text>
                    <Text style={styles.venueInfo}>{item.categories.join(", ")}</Text>
                    {venueVibeRatings[item.id] && (
                      <View style={styles.vibeRatingContainer}>
                        <Text style={styles.vibeRatingLabel}>Current Vibe: </Text>
                        <Text
                          style={[
                            styles.vibeRatingValue,
                            { color: VibeAnalysisService.getVibeColor(venueVibeRatings[item.id]) },
                          ]}
                        >
                          {venueVibeRatings[item.id].toFixed(1)}
                        </Text>
                        <Text style={styles.vibeRatingDescription}>
                          {" "}
                          - {VibeAnalysisService.getVibeDescription(venueVibeRatings[item.id])}
                        </Text>
                      </View>
                    )}
                  </View>
                </ImageBackground>
              </TouchableOpacity>

              <View style={styles.venueActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => navigation.navigate("AddEvent", { venueId: item.id, venueName: item.name })}
                >
                  <Ionicons name="calendar" size={20} color="#2196F3" />
                  <Text style={styles.actionText}>Add Event</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => navigation.navigate("AddVibe", { venueId: item.id, venueName: item.name })}
                >
                  <Ionicons name="camera" size={20} color="#2196F3" />
                  <Text style={styles.actionText}>Add Vibe</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={() => handleDeleteVenue(item.id)}
                >
                  <Ionicons name="trash" size={20} color="#FF3B30" />
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    padding: 16,
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
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2196F3",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    justifyContent: "center",
  },
  addButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 16,
  },
  emptySubtext: {
    color: "#999999",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  venueCard: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1E1E1E",
  },
  venueContent: {
    height: 180,
  },
  venueImage: {
    flex: 1,
    justifyContent: "space-between",
  },
  venueGradient: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  venueName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
  },
  venueInfo: {
    fontSize: 16,
    color: "rgba(255,255,255,0.8)",
    marginTop: 4,
  },
  vibeRatingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    flexWrap: "wrap",
  },
  vibeRatingLabel: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
  },
  vibeRatingValue: {
    fontSize: 14,
    fontWeight: "bold",
  },
  vibeRatingDescription: {
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
  },
  venueActions: {
    flexDirection: "row",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  actionText: {
    color: "#2196F3",
    marginLeft: 4,
  },
  deleteButton: {
    marginLeft: "auto",
  },
  deleteText: {
    color: "#FF3B30",
    marginLeft: 4,
  },
})

export default MyVenuesScreen
