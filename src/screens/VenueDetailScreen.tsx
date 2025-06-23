"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Alert } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../services/FirebaseService"
import { useAuth } from "../contexts/AuthContext"
import type { Venue } from "../models/Venue"
import type { Event } from "../models/Event"
import type { VenueDetailScreenProps } from "../navigation/types"
import VibeAnalysisService from "../services/VibeAnalysisService"

const VenueDetailScreen: React.FC<VenueDetailScreenProps> = ({ route, navigation }) => {
  const { venueId } = route.params
  const { user } = useAuth()
  const [venue, setVenue] = useState<Venue | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [latestVibeRating, setLatestVibeRating] = useState<number | null>(null)

  useEffect(() => {
    const loadVenueAndEvents = async () => {
      try {
        const venueData = await FirebaseService.getVenueById(venueId)
        setVenue(venueData)

        // Check if current user is the owner or an admin
        if (user) {
          setIsOwner(venueData?.ownerId === user.id)
          setIsAdmin(user.userType === "admin")
        }

        if (venueData) {
          const venueEvents = await FirebaseService.getEventsByVenue(venueId)
          setEvents(venueEvents)
          // Get latest vibe rating
          const vibeRating = await FirebaseService.getLatestVibeRating(venueId)
          setLatestVibeRating(vibeRating)
        }
      } catch (error) {
        console.error("Error loading venue details:", error)
      } finally {
        setLoading(false)
      }
    }

    loadVenueAndEvents()
  }, [venueId, user])

  // Add focus listener to refresh data when returning from other screens
  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      // Refresh venue data when screen comes into focus
      const refreshVenueData = async () => {
        try {
          const venueData = await FirebaseService.getVenueById(venueId)
          setVenue(venueData)

          if (venueData) {
            // Get latest vibe rating
            const vibeRating = await FirebaseService.getLatestVibeRating(venueId)
            setLatestVibeRating(vibeRating)
          }
        } catch (error) {
          console.error("Error refreshing venue data:", error)
        }
      }

      refreshVenueData()
    })

    return unsubscribe
  }, [navigation, venueId])

  const handleManagePrograms = () => {
    navigation.navigate("ManagePrograms", { venueId, weeklyPrograms: venue?.weeklyPrograms || {} })
  }

  const handleAddEvent = () => {
    navigation.navigate("AddEvent", { venueId, venueName: venue?.name || "" })
  }

  const handleDeleteVenue = async () => {
    Alert.alert("Delete Venue", "Are you sure you want to delete this venue? This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true)
            // Delete all events associated with this venue
            await FirebaseService.deleteEventsByVenue(venueId)
            // Then delete the venue itself
            await FirebaseService.deleteVenue(venueId)
            Alert.alert("Success", "Venue and associated events deleted successfully")
            navigation.goBack()
          } catch (error) {
            console.error("Error deleting venue:", error)
            Alert.alert("Error", "Failed to delete venue")
            setLoading(false)
          }
        },
      },
    ])
  }

  const handleTodaysVibe = () => {
    navigation.navigate("TodaysVibe", { venueId, venueName: venue?.name || "" })
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading venue details...</Text>
      </View>
    )
  }

  if (!venue) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Venue not found</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container}>
      <Image source={{ uri: venue.backgroundImageUrl }} style={styles.headerImage} />

      <View style={styles.contentContainer}>
        <Text style={styles.venueName}>{venue.name}</Text>
        <Text style={styles.venueLocation}>{venue.location}</Text>

        <View style={styles.ratingContainer}>
          <Text style={styles.ratingText}>Vibe Rating: {venue.vibeRating.toFixed(1)}⭐️</Text>
          <View style={styles.categoriesContainer}>
            {venue.categories.map((category, index) => (
              <View key={index} style={styles.categoryTag}>
                <Text style={styles.categoryText}>{category}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Owner/Admin Actions */}
        {(isOwner || isAdmin) && (
          <View style={styles.actionButtonsContainer}>
            {isOwner && (
              <>
                <TouchableOpacity style={styles.actionButton} onPress={handleManagePrograms}>
                  <Ionicons name="calendar-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.actionButtonText}>Manage Programs</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={handleAddEvent}>
                  <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.actionButtonText}>Add Event</Text>
                </TouchableOpacity>
              </>
            )}
            {isAdmin && (
              <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={handleDeleteVenue}>
                <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>Delete Venue</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Today's Vibe Section */}
        <View style={styles.vibeSection}>
          <View style={styles.vibeSectionHeader}>
            <Text style={styles.vibeSectionTitle}>Current Vibe</Text>
            {latestVibeRating && (
              <View style={styles.currentVibeRating}>
                <Text style={[styles.vibeRatingText, { color: VibeAnalysisService.getVibeColor(latestVibeRating) }]}>
                  {latestVibeRating.toFixed(1)}
                </Text>
                <Text style={styles.vibeRatingLabel}>/5.0</Text>
              </View>
            )}
          </View>

          {latestVibeRating && (
            <Text style={styles.vibeDescription}>{VibeAnalysisService.getVibeDescription(latestVibeRating)}</Text>
          )}

          <TouchableOpacity style={styles.todaysVibeButton} onPress={handleTodaysVibe}>
            <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
            <Text style={styles.todaysVibeButtonText}>Today's Vibe</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.description}>{venue.description}</Text>

        {venue.todayImages && venue.todayImages.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Today at {venue.name}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesContainer}>
              {venue.todayImages.map((image, index) => (
                <Image key={index} source={{ uri: image }} style={styles.todayImage} />
              ))}
            </ScrollView>
          </>
        )}

        {venue.weeklyPrograms && Object.keys(venue.weeklyPrograms).length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Weekly Program</Text>
            <View style={styles.programContainer}>
              {Object.entries(venue.weeklyPrograms).map(([day, program]) => (
                <View key={day} style={styles.programItem}>
                  <Text style={styles.programDay}>{day}</Text>
                  <Text style={styles.programDescription}>{program}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {events.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Upcoming Events</Text>
            {events.map((event) => (
              <TouchableOpacity
                key={event.id}
                style={styles.eventCard}
                onPress={() => {
                  navigation.navigate("EventDetail", { eventId: event.id })
                }}
              >
                <Image source={{ uri: event.posterImageUrl }} style={styles.eventImage} />
                <View style={styles.eventInfo}>
                  <Text style={styles.eventName}>{event.name}</Text>
                  <Text style={styles.eventDate}>{event.date.toDateString()}</Text>
                  <Text style={styles.eventArtists}>{event.artists.join(", ")}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Show directions button */}
        <TouchableOpacity
          style={styles.directionsButton}
          onPress={() => {
            // Use type assertion to work around the navigation type limitations
            ;(navigation as any).navigate("Map", {
              screen: "MapView",
              params: { destinationVenueId: venueId },
            })
          }}
        >
          <Ionicons name="navigate-outline" size={20} color="#FFFFFF" />
          <Text style={styles.directionsButtonText}>Get Directions</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
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
  headerImage: {
    width: "100%",
    height: 200,
  },
  contentContainer: {
    padding: 16,
  },
  venueName: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  venueLocation: {
    fontSize: 16,
    color: "#BBBBBB",
    marginBottom: 12,
  },
  ratingContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  ratingText: {
    fontSize: 16,
    color: "#FFFFFF",
  },
  categoriesContainer: {
    flexDirection: "row",
  },
  categoryTag: {
    backgroundColor: "#2196F3",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  categoryText: {
    color: "#FFFFFF",
    fontSize: 12,
  },
  actionButtonsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginVertical: 16,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2196F3",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    marginRight: 8,
    marginBottom: 8,
  },
  deleteButton: {
    backgroundColor: "#FF3B30",
  },
  actionButtonText: {
    color: "#FFFFFF",
    marginLeft: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: 16,
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: "#DDDDDD",
    lineHeight: 24,
  },
  imagesContainer: {
    flexDirection: "row",
    marginVertical: 12,
  },
  todayImage: {
    width: 150,
    height: 150,
    borderRadius: 8,
    marginRight: 12,
  },
  programContainer: {
    marginTop: 8,
  },
  programItem: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  programDay: {
    width: 100,
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  programDescription: {
    flex: 1,
    fontSize: 16,
    color: "#DDDDDD",
  },
  eventCard: {
    flexDirection: "row",
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
  },
  eventImage: {
    width: 80,
    height: 80,
  },
  eventInfo: {
    flex: 1,
    padding: 12,
  },
  eventName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  eventDate: {
    fontSize: 14,
    color: "#BBBBBB",
    marginTop: 4,
  },
  eventArtists: {
    fontSize: 14,
    color: "#2196F3",
    marginTop: 4,
  },
  directionsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
  },
  directionsButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  vibeSection: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
  },
  vibeSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  vibeSectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  currentVibeRating: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  vibeRatingText: {
    fontSize: 24,
    fontWeight: "bold",
  },
  vibeRatingLabel: {
    fontSize: 16,
    color: "#666666",
    marginLeft: 2,
  },
  vibeDescription: {
    fontSize: 16,
    color: "#FFFFFF",
    marginBottom: 12,
    textAlign: "center",
  },
  todaysVibeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    paddingVertical: 12,
    borderRadius: 8,
  },
  todaysVibeButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
})

export default VenueDetailScreen
