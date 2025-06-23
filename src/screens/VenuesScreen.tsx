"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ImageBackground, ActivityIndicator } from "react-native"
import FirebaseService from "../services/FirebaseService"
import type { Venue } from "../models/Venue"
import VibeAnalysisService from "../services/VibeAnalysisService"

interface VenuesScreenProps {
  navigation: any
}

const VenuesScreen: React.FC<VenuesScreenProps> = ({ navigation }) => {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [venueVibeRatings, setVenueVibeRatings] = useState<Record<string, number>>({})

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadVenues()
    })

    return unsubscribe
  }, [navigation])

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
      console.error("Error loading venues:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleVenueSelect = (venueId: string) => {
    navigation.navigate("VenueDetail", { venueId })
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Night Clubs & Bars</Text>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Loading venues...</Text>
        </View>
      ) : venues.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No venues found</Text>
          <Text style={styles.emptySubtext}>Check back later for new venues</Text>
        </View>
      ) : (
        <FlatList
          data={venues}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.venueCard} onPress={() => handleVenueSelect(item.id)}>
              <ImageBackground source={{ uri: item.backgroundImageUrl }} style={styles.venueImage} resizeMode="cover">
                <View style={styles.venueGradient}>
                  <Text style={styles.venueName}>{item.name}</Text>
                  <Text style={styles.venueInfo}>
                    {item.categories.join(", ")} • Vibe Rating: {item.vibeRating.toFixed(1)}⭐️
                  </Text>
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
                    </View>
                  )}
                </View>
              </ImageBackground>
            </TouchableOpacity>
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
  header: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#FFFFFF",
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  emptySubtext: {
    color: "#999999",
    fontSize: 14,
    marginTop: 8,
  },
  venueCard: {
    height: 200,
    marginBottom: 16,
    borderRadius: 12,
    overflow: "hidden",
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
  },
  vibeRatingLabel: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
  },
  vibeRatingValue: {
    fontSize: 14,
    fontWeight: "bold",
  },
})

export default VenuesScreen
