"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ImageBackground, ActivityIndicator } from "react-native"
import FirebaseService from "../services/FirebaseService"
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore"
import { db } from "../config/firebase"
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
    // Load venues and initial vibe ratings
    loadVenues()

    // Set up real-time listeners for vibe ratings
    const unsubscribeVibeListeners: (() => void)[] = []

    const setupVibeListeners = async () => {
      try {
        const venuesList = await FirebaseService.getVenues()
        for (const venue of venuesList) {
          const vibeRatingsRef = collection(db, "vibeRatings")
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const tomorrow = new Date(today)
          tomorrow.setDate(tomorrow.getDate() + 1)

          const q = query(
            vibeRatingsRef,
            where("venueId", "==", venue.id),
            where("createdAt", ">=", today),
            where("createdAt", "<", tomorrow),
            orderBy("createdAt", "desc"),
            limit(1)
          )

          const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
              snapshot.docChanges().forEach((change) => {
                if (change.type === "added" || change.type === "modified") {
                  const data = change.doc.data()
                  const rating = data.rating || 0.0
                  setVenueVibeRatings((prev) => ({
                    ...prev,
                    [venue.id]: rating,
                  }))
                } else if (change.type === "removed") {
                  // If the latest vibe rating is removed, check for today's vibe images
                  setVenueVibeRatings((prev) => ({
                    ...prev,
                    [venue.id]: 0.0,
                  }))
                }
              })
            },
            (error) => {
              console.error(`FirebaseService: Error listening to vibe ratings for venue ${venue.id}:`, error)
              // Default to 0.0 on error
              setVenueVibeRatings((prev) => ({
                ...prev,
                [venue.id]: 0.0,
              }))
            }
          )
          unsubscribeVibeListeners.push(unsubscribe)
        }
      } catch (error) {
        console.error("Error setting up vibe listeners:", error)
      }
    }

    setupVibeListeners()

    // Handle navigation focus to refresh venues
    const unsubscribeNavigation = navigation.addListener("focus", () => {
      loadVenues()
    })

    // Cleanup listeners on unmount
    return () => {
      unsubscribeNavigation()
      unsubscribeVibeListeners.forEach((unsubscribe) => unsubscribe())
    }
  }, [navigation])

  const loadVenues = async () => {
    try {
      setLoading(true)
      const venuesList = await FirebaseService.getVenues()
      setVenues(venuesList)

      // Load initial vibe ratings for today
      const vibeRatings: Record<string, number> = {}
      const today = new Date()
      for (const venue of venuesList) {
        const vibeImages = await FirebaseService.getVibeImagesByVenueAndDate(venue.id, today)
        if (vibeImages.length > 0) {
          // Use the latest vibe rating for today
          const latestVibe = vibeImages.reduce((latest, image) => {
            return image.uploadedAt > latest.uploadedAt ? image : latest
          })
          vibeRatings[venue.id] = latestVibe.vibeRating || 0.0
        } else {
          vibeRatings[venue.id] = 0.0 // Default to 0.0 if no vibe images for today
        }
      }
      setVenueVibeRatings(vibeRatings)
    } catch (error) {
      console.error("Error loading venues:", error)
      // Set all ratings to 0.0 on error
      const errorRatings: Record<string, number> = {}
      venues.forEach((venue) => {
        errorRatings[venue.id] = 0.0
      })
      setVenueVibeRatings(errorRatings)
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
        ["nightclub", "bar", "club", "lounge", "pub", "disco"].includes(cat.toLowerCase())
      )
      return activeTab === "nightlife" ? isNightlife : !isNightlife
    })

    // Sort by current vibe rating (highest first)
    return filtered.sort((a, b) => {
      const aVibe = venueVibeRatings[a.id] || 0.0
      const bVibe = venueVibeRatings[b.id] || 0.0
      return bVibe - aVibe
    })
  }

  const renderVenueCard = ({ item }: { item: Venue }) => (
    <TouchableOpacity style={styles.venueCard} onPress={() => handleVenueSelect(item.id)}>
      <ImageBackground source={{ uri: item.backgroundImageUrl }} style={styles.venueImage} resizeMode="cover">
        <View style={styles.venueGradient}>
          <Text style={styles.venueName}>{item.name}</Text>
          <Text style={styles.venueInfo}>{item.categories.join(", ")}</Text>
          <View style={styles.vibeRatingContainer}>
            <Text style={styles.vibeRatingLabel}>Current Vibe: </Text>
            <Text
              style={[styles.vibeRatingValue, { color: VibeAnalysisService.getVibeColor(venueVibeRatings[item.id] || 0.0) }]}
            >
              {(venueVibeRatings[item.id] || 0.0).toFixed(1)}
            </Text>
            <Text style={styles.vibeRatingDescription}>
              {" "}
              - {VibeAnalysisService.getVibeDescription(venueVibeRatings[item.id] || 0.0)}
            </Text>
          </View>
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