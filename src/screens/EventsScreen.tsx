"use client"

import type React from "react"
import { useState, useEffect } from "react"
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ImageBackground,
  Platform,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../services/FirebaseService"
import { useAuth } from "../contexts/AuthContext"
import type { Event } from "../models/Event"
import type { EventsScreenProps } from "../navigation/types"

const EventsScreen: React.FC<EventsScreenProps> = ({ navigation }) => {
  const { user } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [featuredEvents, setFeaturedEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadEvents()
    })

    return unsubscribe
  }, [navigation])

  const loadEvents = async () => {
    try {
      setLoading(true)

      // Automatically delete past events
      await FirebaseService.deletePastEvents()

      // Get all events
      const allEvents = await FirebaseService.getEvents()

      // Sort events by date (closest to today first)
      const sortedEvents = [...allEvents].sort((a, b) => {
        const today = new Date()
        const diffA = Math.abs(a.date.getTime() - today.getTime())
        const diffB = Math.abs(b.date.getTime() - today.getTime())
        return diffA - diffB
      })

      setEvents(sortedEvents)

      // Get featured events and sort them as well
      const featured = await FirebaseService.getFeaturedEvents()
      const sortedFeatured = [...featured].sort((a, b) => {
        const today = new Date()
        const diffA = Math.abs(a.date.getTime() - today.getTime())
        const diffB = Math.abs(b.date.getTime() - today.getTime())
        return diffA - diffB
      })

      setFeaturedEvents(sortedFeatured)
    } catch (error) {
      console.error("Error loading events:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleEventSelect = (eventId: string) => {
    navigation.navigate("EventDetail", { eventId })
  }

  const handleAddEvent = () => {
    // Use type assertion to work around the navigation type limitations
    ;(navigation as any).navigate("AddEvent")
  }

  const formatDateRange = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
    const formattedDate = date.toLocaleDateString("en-US", options).toUpperCase()

    // Get day of week
    const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()

    return `${dayOfWeek} ${formattedDate}`
  }

  const getAttendeeCount = (event: Event) => {
    return event.attendees ? event.attendees.length : 0
  }

  const renderPriceIndicator = (priceIndicator = 1) => {
    // Instead of dollar signs, use a more descriptive price indicator
    switch (priceIndicator) {
      case 3:
        return "PREMIUM"
      case 2:
        return "MID-RANGE"
      case 1:
      default:
        return "BUDGET"
    }
  }

  const renderEventItem = ({ item }: { item: Event }) => (
    <TouchableOpacity style={styles.eventCard} onPress={() => handleEventSelect(item.id)}>
      <ImageBackground source={{ uri: item.posterImageUrl }} style={styles.eventImage}>
        <View style={styles.eventOverlay}>
          <Text style={styles.eventName}>{item.name}</Text>
          <View style={styles.eventDetails}>
            <Text style={styles.eventLocation}>
              {item.location || item.venueName.split(" ")[0]} • {formatDateRange(item.date)}
            </Text>

            <View style={styles.eventMeta}>
              {getAttendeeCount(item) > 0 && (
                <View style={styles.attendeeCount}>
                  <Ionicons name="people" size={14} color="#FFFFFF" />
                  <Text style={styles.attendeeCountText}>{getAttendeeCount(item)}</Text>
                </View>
              )}
              <Text style={styles.entryFee}>{item.entryFee || "Free Entry"}</Text>
            </View>
          </View>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Upcoming Events</Text>
        <TouchableOpacity style={styles.searchButton}>
          <Ionicons name="search" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Add Event Button for Regular Users */}
      {user && (user.userType === "user" || user.userType === "admin") && (
        <TouchableOpacity style={styles.addEventButton} onPress={handleAddEvent}>
          <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
          <Text style={styles.addEventButtonText}>Add New Event</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Loading events...</Text>
        </View>
      ) : events.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No events found</Text>
          <Text style={styles.emptySubtext}>Check back later for upcoming events</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={renderEventItem}
          ListEmptyComponent={<Text style={styles.emptyText}>No upcoming events found</Text>}
          contentContainerStyle={styles.eventsList}
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingTop: Platform.OS === "ios" ? 50 : 16,
    backgroundColor: "#121212",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  searchButton: {
    padding: 8,
  },
  addEventButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2196F3",
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    justifyContent: "center",
  },
  addEventButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    marginLeft: 8,
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
    textAlign: "center",
  },
  emptySubtext: {
    color: "#999999",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  eventsList: {
    paddingBottom: 16,
  },
  eventCard: {
    marginBottom: 1,
    height: 200,
  },
  eventImage: {
    width: "100%",
    height: "100%",
  },
  eventOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
    padding: 16,
  },
  eventName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  eventDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eventLocation: {
    fontSize: 14,
    color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  eventMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  attendeeCount: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  attendeeCountText: {
    color: "#FFFFFF",
    fontSize: 12,
    marginLeft: 4,
  },
  entryFee: {
    color: "#FFD700",
    fontWeight: "bold",
    fontSize: 14,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
})

export default EventsScreen
