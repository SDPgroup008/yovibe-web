"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Alert, Linking, RefreshControl, Dimensions } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useIsFocused } from "@react-navigation/native"
import FirebaseService from "../services/FirebaseService"
import { useAuth } from "../contexts/AuthContext"
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore"
import { db } from "../config/firebase"
import type { Venue } from "../models/Venue"
import type { Event } from "../models/Event"
import type { VenueDetailScreenProps } from "../navigation/types"
import VibeAnalysisService from "../services/VibeAnalysisService"
const VenueDetailScreen: React.FC<VenueDetailScreenProps> = ({ route, navigation }) => {
  const { venueId } = route.params
  const { user } = useAuth()
  const isFocused = useIsFocused()
  const scrollViewRef = useRef<ScrollView>(null)
  
  const [venue, setVenue] = useState<Venue | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isCustomVenue, setIsCustomVenue] = useState(false)
  const [vibeRating, setVibeRating] = useState<number>(0.0)

  const openInGoogleMaps = async () => {
    if (!venue) return

    try {
      // Encode venue name for URL
      const venueName = encodeURIComponent(venue.name)
      
      // Use Google Maps URL scheme (works on both iOS and Android)
      const url = `https://www.google.com/maps/search/?api=1&query=${venueName}`
      
      // Check if the URL can be opened
      const supported = await Linking.canOpenURL(url)
      
      if (supported) {
        await Linking.openURL(url)
      } else {
        Alert.alert(
          "Cannot Open Maps",
          "Unable to open Google Maps. Please ensure you have Google Maps installed.",
          [{ text: "OK" }]
        )
      }
    } catch (error) {
      console.error("Error opening Google Maps:", error)
      Alert.alert(
        "Error",
        "Failed to open Google Maps. Please try again.",
        [{ text: "OK" }]
      )
    }
  }

  useEffect(() => {
    const loadVenueAndEvents = async () => {
      try {
        setLoading(true)
        const venueData = await FirebaseService.getVenueById(venueId)
        setVenue(venueData)

        // Check if current user is the owner or an admin
        if (user && venueData) {
          setIsOwner(venueData.ownerId === user.id)
          setIsAdmin(user.userType === "admin")

          // Check if venue is a custom venue (tied to one event and owned by event creator)
          const venueEvents = await FirebaseService.getEventsByVenue(venueId)
          setEvents(venueEvents)
          if (venueEvents.length === 1 && venueData.ownerId === venueEvents[0].createdBy) {
            setIsCustomVenue(true)
          } else {
            setIsCustomVenue(false)
          }

          // Load initial vibe rating for today
          const today = new Date()
          const vibeImages = await FirebaseService.getVibeImagesByVenueAndDate(venueId, today)
          if (vibeImages.length > 0) {
            const latestVibe = vibeImages.reduce((latest, image) => {
              return image.uploadedAt > latest.uploadedAt ? image : latest
            })
            setVibeRating(latestVibe.vibeRating || 0.0)
          } else {
            setVibeRating(0.0)
          }
        }
      } catch (error) {
        console.error("Error loading venue details:", error)
        setVibeRating(0.0) // Default to 0.0 on error
      } finally {
        setLoading(false)
      }
    }

    loadVenueAndEvents()

    // Set up real-time listener for vibe ratings
    const vibeRatingsRef = collection(db, "YoVibe/data/vibeRatings")
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const q = query(
      vibeRatingsRef,
      where("venueId", "==", venueId),
      where("createdAt", ">=", today),
      where("createdAt", "<", tomorrow),
      orderBy("createdAt", "desc"),
      limit(1)
    )

    const unsubscribeVibe = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added" || change.type === "modified") {
            const data = change.doc.data()
            const rating = data.rating || 0.0
            setVibeRating(rating)
          } else if (change.type === "removed") {
            setVibeRating(0.0) // Default to 0.0 if rating is removed
          }
        })
      },
      (error) => {
        console.error(`FirebaseService: Error listening to vibe ratings for venue ${venueId}:`, error)
        setVibeRating(0.0) // Default to 0.0 on error
      }
    )

    // Cleanup listeners on unmount
    return () => {
      unsubscribeVibe()
    }
  }, [venueId, user])

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const venueData = await FirebaseService.getVenueById(venueId)
      setVenue(venueData)
      
      if (user && venueData) {
        setIsOwner(venueData.ownerId === user.id)
        setIsAdmin(user.userType === "admin")
        
        const venueEvents = await FirebaseService.getEventsByVenue(venueId)
        setEvents(venueEvents)
        
        if (venueEvents.length === 1 && venueData.ownerId === venueEvents[0].createdBy) {
          setIsCustomVenue(true)
        } else {
          setIsCustomVenue(false)
        }
      }
    } catch (error) {
      console.error("Error refreshing venue details:", error)
    } finally {
      setRefreshing(false)
    }
  }, [venueId, user])

  const handleManagePrograms = () => {
    (navigation as any).navigate("ManagePrograms", { venueId, weeklyPrograms: venue?.weeklyPrograms || {} })
  }

  const handleAddEvent = () => {
    (navigation as any).navigate("AddEvent", { venueId, venueName: venue?.name || "" })
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
            const venueEvents = await FirebaseService.getEventsByVenue(venueId)
            for (const event of venueEvents) {
              await FirebaseService.deleteEvent(event.id)
            }
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
    (navigation as any).navigate("TodaysVibe", { venueId, venueName: venue?.name || "" })
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
    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={["#2196F3"]}
          tintColor="#2196F3"
        />
      }
    >
      <Image source={{ uri: venue.backgroundImageUrl }} style={styles.headerImage} />

      <View style={styles.contentContainer}>
        <Text style={styles.venueName}>{venue.name}</Text>
        <Text style={styles.venueLocation}>{venue.location}</Text>

        <View style={styles.categoriesContainer}>
          {venue.categories.map((category, index) => (
            <View key={index} style={styles.categoryTag}>
              <Text style={styles.categoryText}>{category}</Text>
            </View>
          ))}
        </View>

        {(isOwner || isAdmin) && (
          <View style={styles.actionButtonsContainer}>
            {isOwner && !isCustomVenue && (
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

        <View style={styles.vibeSection}>
          <View style={styles.vibeSectionHeader}>
            <Text style={styles.vibeSectionTitle}>Current Vibe: </Text>
            <View style={styles.currentVibeRating}>
              <Text style={[styles.vibeRatingText, { color: VibeAnalysisService.getVibeColor(vibeRating) }]}>
                {vibeRating.toFixed(1)}
              </Text>
              <Text style={styles.vibeRatingLabel}>/5.0</Text>
            </View>
          </View>

          <Text style={styles.vibeDescription}>{VibeAnalysisService.getVibeDescription(vibeRating)}</Text>

          <TouchableOpacity style={styles.todaysVibeButton} onPress={handleTodaysVibe}>
            <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
            <Text style={styles.todaysVibeButtonText}>See Today's Vibe</Text>
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
                  <Text style={styles.eventDate}>
                    {event.date && typeof (event.date as any).toDate === "function"
                      ? (event.date as any).toDate().toDateString()
                      : new Date(event.date).toDateString()}
                  </Text>
                  <Text style={styles.eventArtists}>{event.artists.join(", ")}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        <TouchableOpacity
          style={styles.directionsButton}
          onPress={openInGoogleMaps}
        >
          <Ionicons name="navigate-outline" size={20} color="#FFFFFF" />
          <Text style={styles.directionsButtonText}>Get Directions</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const { width, height } = Dimensions.get('window');

// Responsive breakpoints
const isSmallDevice = width < 380;
const isTablet = width >= 768;
const isLargeScreen = width >= 1024;

console.log("[v0] VenueDetailScreen responsiveness initialized - Screen width:", width, "px | Device type:", isLargeScreen ? "Large/Desktop" : isTablet ? "Tablet" : "Mobile");

// Responsive helper function
const responsiveSize = (small: number, medium: number, large: number) => {
  if (isLargeScreen) return large;
  if (isTablet) return medium;
  return small;
};

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
    fontSize: responsiveSize(14, 16, 18),
  },
  headerImage: {
    width: "100%",
    height: responsiveSize(180, 240, 300),
  },
  contentContainer: {
    padding: responsiveSize(12, 16, 24),
    maxWidth: isLargeScreen ? 900 : "100%",
    alignSelf: "center",
    width: "100%",
  },
  venueName: {
    fontSize: responsiveSize(22, 26, 32),
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: responsiveSize(4, 6, 8),
  },
  venueLocation: {
    fontSize: responsiveSize(13, 15, 17),
    color: "#BBBBBB",
    marginBottom: responsiveSize(10, 12, 16),
  },
  categoriesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: responsiveSize(12, 14, 18),
  },
  categoryTag: {
    backgroundColor: "#2196F3",
    paddingHorizontal: responsiveSize(6, 8, 12),
    paddingVertical: responsiveSize(3, 4, 6),
    borderRadius: responsiveSize(3, 4, 6),
    marginRight: responsiveSize(6, 8, 10),
    marginBottom: responsiveSize(6, 8, 10),
  },
  categoryText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(10, 12, 14),
  },
  actionButtonsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginVertical: responsiveSize(12, 16, 20),
    gap: responsiveSize(6, 8, 10),
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2196F3",
    paddingHorizontal: responsiveSize(10, 12, 16),
    paddingVertical: responsiveSize(6, 8, 12),
    borderRadius: responsiveSize(4, 6, 8),
    marginRight: 0,
    marginBottom: 0,
    flex: isTablet ? 0.48 : undefined,
  },
  deleteButton: {
    backgroundColor: "#FF3B30",
  },
  actionButtonText: {
    color: "#FFFFFF",
    marginLeft: responsiveSize(6, 8, 10),
    fontSize: responsiveSize(12, 14, 16),
  },
  sectionTitle: {
    fontSize: responsiveSize(16, 20, 24),
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: responsiveSize(12, 16, 20),
    marginBottom: responsiveSize(6, 8, 12),
  },
  description: {
    fontSize: responsiveSize(14, 15, 16),
    color: "#DDDDDD",
    lineHeight: responsiveSize(20, 22, 26),
  },
  imagesContainer: {
    flexDirection: "row",
    marginVertical: responsiveSize(8, 12, 16),
  },
  todayImage: {
    width: responsiveSize(120, 150, 180),
    height: responsiveSize(120, 150, 180),
    borderRadius: responsiveSize(6, 8, 12),
    marginRight: responsiveSize(8, 10, 12),
  },
  programContainer: {
    marginTop: responsiveSize(6, 8, 12),
  },
  programItem: {
    flexDirection: "row" as const,
    paddingVertical: responsiveSize(6, 8, 12),
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  programDay: {
    width: responsiveSize(80, 100, 120),
    fontSize: responsiveSize(14, 15, 16),
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  programDescription: {
    flex: 1,
    fontSize: responsiveSize(13, 15, 16),
    color: "#DDDDDD",
  },
  eventCard: {
    flexDirection: "row",
    backgroundColor: "#1E1E1E",
    borderRadius: responsiveSize(6, 8, 12),
    overflow: "hidden",
    marginBottom: responsiveSize(10, 12, 16),
  },
  eventImage: {
    width: responsiveSize(60, 80, 100),
    height: responsiveSize(60, 80, 100),
  },
  eventInfo: {
    flex: 1,
    padding: responsiveSize(8, 10, 12),
  },
  eventName: {
    fontSize: responsiveSize(14, 15, 16),
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  eventDate: {
    fontSize: responsiveSize(12, 13, 14),
    color: "#BBBBBB",
    marginTop: responsiveSize(2, 3, 4),
  },
  eventArtists: {
    fontSize: responsiveSize(12, 13, 14),
    color: "#2196F3",
    marginTop: responsiveSize(2, 3, 4),
  },
  directionsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    paddingVertical: responsiveSize(10, 12, 16),
    borderRadius: responsiveSize(6, 8, 12),
    marginTop: responsiveSize(16, 20, 28),
    marginBottom: responsiveSize(16, 20, 28),
  },
  directionsButtonText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(14, 15, 16),
    fontWeight: "bold",
    marginLeft: responsiveSize(6, 8, 10),
  },
  vibeSection: {
    backgroundColor: "#1E1E1E",
    borderRadius: responsiveSize(10, 12, 16),
    padding: responsiveSize(12, 14, 18),
    marginVertical: responsiveSize(12, 14, 18),
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.2)",
  },
  vibeSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: responsiveSize(6, 8, 12),
  },
  vibeSectionTitle: {
    fontSize: responsiveSize(16, 18, 20),
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  currentVibeRating: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  vibeRatingText: {
    fontSize: responsiveSize(20, 24, 28),
    fontWeight: "bold",
  },
  vibeRatingLabel: {
    fontSize: responsiveSize(12, 14, 16),
    color: "#666666",
    marginLeft: 2,
  },
  vibeDescription: {
    fontSize: responsiveSize(13, 15, 16),
    color: "#FFFFFF",
    marginBottom: responsiveSize(10, 12, 16),
    textAlign: "center",
  },
  todaysVibeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    paddingVertical: responsiveSize(10, 12, 16),
    borderRadius: responsiveSize(6, 8, 12),
  },
  todaysVibeButtonText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(14, 15, 16),
    fontWeight: "bold",
    marginLeft: responsiveSize(6, 8, 10),
  },
})

export default VenueDetailScreen
