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
  const [activeTab, setActiveTab] = useState<"nightlife" | "recreation">("nightlife")

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

  const getFilteredVenues = () => {
    const filtered = venues.filter((venue) => {
      const isNightlife = venue.categories.some((cat) =>
        ["nightclub", "bar", "club", "lounge", "pub", "disco"].includes(cat.toLowerCase()),
      )
      return activeTab === "nightlife" ? isNightlife : !isNightlife
    })

    // Sort by current vibe rating (highest first)
    return filtered.sort((a, b) => {
      const aVibe = venueVibeRatings[a.id] || 0
      const bVibe = venueVibeRatings[b.id] || 0
      return bVibe - aVibe
    })
  }

  const renderVenueCard = ({ item }: { item: Venue }) => (
    <TouchableOpacity style={styles.venueCard} onPress={() => handleVenueSelect(item.id)}>
      <ImageBackground source={{ uri: item.backgroundImageUrl }} style={styles.venueImage} resizeMode="cover">
        <View style={styles.venueGradient}>
          <Text style={styles.venueName}>{item.name}</Text>
          <Text style={styles.venueInfo}>{item.categories.join(", ")}</Text>
          {venueVibeRatings[item.id] && (
            <View style={styles.vibeRatingContainer}>
              <Text style={styles.vibeRatingLabel}>Current Vibe: </Text>
              <Text
                style={[styles.vibeRatingValue, { color: VibeAnalysisService.getVibeColor(venueVibeRatings[item.id]) }]}
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
  )

  const filteredVenues = getFilteredVenues()

  return (
    <View style={[styles.container, activeTab === "recreation" && styles.recreationContainer]}>
      <View style={styles.header}>
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "nightlife" && styles.activeTab]}
            onPress={() => setActiveTab("nightlife")}
          >
            <Text style={[styles.tabText, activeTab === "nightlife" && styles.activeTabText]}>Night Clubs & Bars</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "recreation" && styles.activeTab]}
            onPress={() => setActiveTab("recreation")}
          >
            <Text style={[styles.tabText, activeTab === "recreation" && styles.activeTabText]}>Recreation Centers</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={[styles.loadingText, activeTab === "recreation" && styles.recreationText]}>
            Loading venues...
          </Text>
        </View>
      ) : filteredVenues.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, activeTab === "recreation" && styles.recreationText]}>No venues found</Text>
          <Text style={[styles.emptySubtext, activeTab === "recreation" && styles.recreationSubtext]}>
            Check back later for new venues
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredVenues}
          keyExtractor={(item) => item.id}
          renderItem={renderVenueCard}
          refreshing={loading}
          onRefresh={loadVenues}
          contentContainerStyle={styles.venuesList}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  recreationContainer: {
    backgroundColor: "#F5F5F5",
  },
  header: {
    padding: 16,
    paddingBottom: 0,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: "#2196F3",
  },
  tabText: {
    fontSize: 16,
    color: "#BBBBBB",
    fontWeight: "bold",
  },
  activeTabText: {
    color: "#FFFFFF",
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
  recreationText: {
    color: "#333333",
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
  recreationSubtext: {
    color: "#666666",
  },
  venuesList: {
    padding: 16,
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
})

export default VenuesScreen
