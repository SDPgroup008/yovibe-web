"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../services/FirebaseService"
import VibeAnalysisService from "../services/VibeAnalysisService"
import type { Venue } from "../models/Venue"
import type { MapScreenProps } from "../navigation/types"

// This is a web-specific implementation of the MapScreen
const MapScreen: React.FC<MapScreenProps> = ({ navigation, route }) => {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [venueVibeRatings, setVenueVibeRatings] = useState<Record<string, number>>({})

  // Check if we need to show directions to a specific venue
  const destinationVenueId = route.params?.destinationVenueId

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadVenues()
    })

    return unsubscribe
  }, [navigation])

  useEffect(() => {
    // If a destination venue ID is provided, highlight it
    if (destinationVenueId && venues.length > 0) {
      const venue = venues.find((v) => v.id === destinationVenueId)
      if (venue) {
        setSelectedVenue(venue)
      }
    }
  }, [destinationVenueId, venues])

  const loadVenues = async () => {
    try {
      setLoading(true)
      const venuesList = await FirebaseService.getVenues()
      setVenues(venuesList)

      // Load vibe ratings for each venue
      const vibeRatings: Record<string, number> = {}
      for (const venue of venuesList) {
        const rating = await FirebaseService.getLatestVibeRating(venue.id)
        if (rating !== null) {
          vibeRatings[venue.id] = rating
        }
      }
      setVenueVibeRatings(vibeRatings)
    } catch (error) {
      console.error("Error loading venues for map:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleVenueSelect = (venueId: string) => {
    navigation.navigate("VenueDetail", { venueId })
  }

  const openGoogleMaps = (venue: Venue) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}&destination_place_id=${venue.name}`
    Linking.openURL(url)
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Venue Locations</Text>
        <Text style={styles.headerSubtitle}>Here's a list of all our venues:</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading venues...</Text>
        </View>
      ) : venues.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={64} color="#666666" />
          <Text style={styles.emptyText}>No venues found</Text>
        </View>
      ) : (
        <ScrollView style={styles.venueList}>
          {venues.map((venue) => (
            <View key={venue.id} style={[styles.venueCard, selectedVenue?.id === venue.id && styles.selectedVenueCard]}>
              <View style={styles.venueInfo}>
                <Text style={styles.venueName}>{venue.name}</Text>
                <Text style={styles.venueAddress}>{venue.location}</Text>
                <Text style={styles.venueCategories}>{venue.categories.join(", ")}</Text>
                {venueVibeRatings[venue.id] && (
                  <View style={styles.vibeRatingContainer}>
                    <Text style={styles.vibeRatingLabel}>Current Vibe: </Text>
                    <Text
                      style={[
                        styles.vibeRatingValue,
                        { color: VibeAnalysisService.getVibeColor(venueVibeRatings[venue.id]) },
                      ]}
                    >
                      {venueVibeRatings[venue.id].toFixed(1)}
                    </Text>
                    <Text style={styles.vibeRatingDescription}>
                      {" "}
                      - {VibeAnalysisService.getVibeDescription(venueVibeRatings[venue.id])}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.venueActions}>
                <TouchableOpacity style={styles.actionButton} onPress={() => handleVenueSelect(venue.id)}>
                  <Ionicons name="information-circle" size={20} color="#2196F3" />
                  <Text style={styles.actionText}>Details</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={() => openGoogleMaps(venue)}>
                  <Ionicons name="navigate" size={20} color="#2196F3" />
                  <Text style={styles.actionText}>Directions</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: "#BBBBBB",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#FFFFFF",
    textAlign: "center",
    marginTop: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyText: {
    color: "#FFFFFF",
    fontSize: 18,
    marginTop: 16,
  },
  venueList: {
    flex: 1,
    padding: 16,
  },
  venueCard: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  selectedVenueCard: {
    backgroundColor: "#2a2a2a",
    borderWidth: 1,
    borderColor: "#2196F3",
  },
  venueInfo: {
    flex: 1,
    marginBottom: 12,
  },
  venueName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  venueAddress: {
    fontSize: 14,
    color: "#BBBBBB",
    marginBottom: 4,
  },
  venueCategories: {
    fontSize: 14,
    color: "#2196F3",
    marginBottom: 8,
  },
  vibeRatingContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  vibeRatingLabel: {
    fontSize: 14,
    color: "#BBBBBB",
  },
  vibeRatingValue: {
    fontSize: 14,
    fontWeight: "bold",
  },
  vibeRatingDescription: {
    fontSize: 12,
    color: "#BBBBBB",
  },
  venueActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  actionText: {
    color: "#2196F3",
    marginLeft: 4,
    fontSize: 14,
  },
})

export default MapScreen
