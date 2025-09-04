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
  TextInput,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../services/FirebaseService"
import { useAuth } from "../contexts/AuthContext"
import type { Event } from "../models/Event"
import type { EventsScreenProps } from "../navigation/types"

const EventsScreen: React.FC<EventsScreenProps> = ({ navigation }) => {
  const { user } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([])
  const [featuredEvents, setFeaturedEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadEvents()
    })

    return unsubscribe
  }, [navigation])

  useEffect(() => {
    // Filter events based on search query
    if (searchQuery.trim() === "") {
      setFilteredEvents(events)
    } else {
      const filtered = events.filter(
        (event) =>
          event.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          event.venueName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          event.artists.some((artist) => artist.toLowerCase().includes(searchQuery.toLowerCase())) ||
          event.description.toLowerCase().includes(searchQuery.toLowerCase()),
      )
      setFilteredEvents(filtered)
    }
  }, [searchQuery, events])

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
      setFilteredEvents(sortedEvents)

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

  const toggleSearch = () => {
    setShowSearch(!showSearch)
    if (showSearch) {
      setSearchQuery("")
    }
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

  const renderEventItem = ({ item }: { item: Event }) => (
    <TouchableOpacity style={styles.eventCard} onPress={() => handleEventSelect(item.id)}>
      <ImageBackground source={{ uri: item.posterImageUrl }} style={styles.eventImage}>
        <View style={styles.eventOverlay}>
          <View style={styles.eventHeader}>
            <View style={styles.dateChip}>
              <Text style={styles.dateChipText}>{formatDateRange(item.date)}</Text>
            </View>
            <View style={styles.feeChip}>
              <Text style={styles.feeChipText}>
                {item.isFreeEntry ? "Free" : item.entryFees.map((fee) => `${fee.name}: ${fee.amount}`).join(", ")}
              </Text>
            </View>
          </View>

          <View style={styles.eventContent}>
            <Text style={styles.eventName}>{item.name}</Text>
            <View style={styles.eventLocationRow}>
              <Ionicons name="location" size={16} color="#FFFFFF" />
              <Text style={styles.eventLocation}>
                {item.location ? `${item.location} • ${item.venueName}` : item.venueName}
              </Text>
            </View>

            <View style={styles.eventFooter}>
              {getAttendeeCount(item) > 0 && (
                <View style={styles.attendeeInfo}>
                  <Ionicons name="people" size={16} color="#00D4FF" />
                  <Text style={styles.attendeeText}>{getAttendeeCount(item)} going</Text>
                </View>
              )}
              <View style={styles.artistsPreview}>
                {item.artists.slice(0, 2).map((artist, index) => (
                  <Text key={index} style={styles.artistPreviewText}>
                    {artist}
                  </Text>
                ))}
                {item.artists.length > 2 && <Text style={styles.moreArtistsText}>+{item.artists.length - 2}</Text>}
              </View>
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
        <TouchableOpacity style={styles.searchButton} onPress={toggleSearch}>
          <Ionicons name="search" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {showSearch && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search events, venues, or artists..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Loading events...</Text>
        </View>
      ) : filteredEvents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {searchQuery ? "No events found matching your search" : "No events found"}
          </Text>
          <Text style={styles.emptySubtext}>
            {searchQuery ? "Try a different search term" : "Check back later for upcoming events"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredEvents}
          keyExtractor={(item) => item.id}
          renderItem={renderEventItem}
          ListEmptyComponent={<Text style={styles.emptyText}>No upcoming events found</Text>}
          contentContainerStyle={styles.eventsList}
        />
      )}

      {/* Floating Add Event Button */}
      {user && (user.userType === "user" || user.userType === "admin") && (
        <TouchableOpacity style={styles.floatingAddButton} onPress={handleAddEvent}>
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0A",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: Platform.OS === "ios" ? 60 : 30,
    backgroundColor: "#1A1A2E",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    textShadowColor: "rgba(0, 212, 255, 0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  searchButton: {
    padding: 12,
    backgroundColor: "rgba(0, 212, 255, 0.2)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.3)",
  },
  searchContainer: {
    padding: 20,
    paddingTop: 0,
  },
  searchInput: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 16,
    color: "#FFFFFF",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  eventCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  eventImage: {
    width: "100%",
    height: 280,
  },
  eventOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 20,
    justifyContent: "space-between",
  },
  eventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  dateChip: {
    backgroundColor: "rgba(0, 212, 255, 0.9)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  dateChipText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  feeChip: {
    backgroundColor: "rgba(255, 215, 0, 0.9)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  feeChipText: {
    color: "#000000",
    fontSize: 12,
    fontWeight: "700",
  },
  eventContent: {
    flex: 1,
    justifyContent: "flex-end",
  },
  eventName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 8,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  eventLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  eventLocation: {
    fontSize: 16,
    color: "#FFFFFF",
    marginLeft: 6,
    opacity: 0.9,
  },
  eventFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  attendeeInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 212, 255, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.3)",
  },
  attendeeText: {
    color: "#00D4FF",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  artistsPreview: {
    flexDirection: "row",
    alignItems: "center",
  },
  artistPreviewText: {
    color: "#FFFFFF",
    fontSize: 12,
    marginRight: 8,
    opacity: 0.8,
  },
  moreArtistsText: {
    color: "#00D4FF",
    fontSize: 12,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0A0A0A",
  },
  loadingText: {
    color: "#FFFFFF",
    marginTop: 16,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  emptySubtext: {
    color: "#999999",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  eventsList: {
    paddingBottom: 100, // Add padding to account for floating button
  },
  floatingAddButton: {
    position: "absolute",
    bottom: 30, // Moved closer to profile icon
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#000000", // Changed to black
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#00D4FF", // Glowing effect color
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 12,
    // Add glowing border effect
    borderWidth: 2,
    borderColor: "rgba(0, 212, 255, 0.6)",
  },
})

export default EventsScreen