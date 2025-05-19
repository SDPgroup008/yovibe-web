"use client"

import type React from "react"
import { useState, useEffect } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
  Platform,
  ImageBackground,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../services/FirebaseService"
import { useAuth } from "../contexts/AuthContext"
import type { Event } from "../models/Event"
import type { EventDetailScreenProps } from "../navigation/types"

const EventDetailScreen: React.FC<EventDetailScreenProps> = ({ route, navigation }) => {
  const { eventId } = route.params
  const { user } = useAuth()
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [isGoing, setIsGoing] = useState(false)
  const [attendeeCount, setAttendeeCount] = useState(0)

  useEffect(() => {
    const loadEvent = async () => {
      try {
        const eventData = await FirebaseService.getEventById(eventId)
        setEvent(eventData)

        // Check if current user is attending
        if (user && eventData?.attendees) {
          setIsGoing(eventData.attendees.includes(user.id))
        }

        // Set attendee count
        setAttendeeCount(eventData?.attendees?.length || 0)
      } catch (error) {
        console.error("Error loading event details:", error)
      } finally {
        setLoading(false)
      }
    }

    loadEvent()
  }, [eventId, user])

  const handleToggleGoing = async () => {
    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to mark yourself as attending this event.")
      return
    }

    if (!event) return

    try {
      const updatedIsGoing = !isGoing
      setIsGoing(updatedIsGoing)

      // Update attendee count optimistically
      setAttendeeCount((prevCount) => (updatedIsGoing ? prevCount + 1 : prevCount - 1))

      // Update in database
      const updatedAttendees = updatedIsGoing
        ? [...(event.attendees || []), user.id]
        : (event.attendees || []).filter((id) => id !== user.id)

      await FirebaseService.updateEvent(event.id, { attendees: updatedAttendees })

      // Update local event state
      setEvent({
        ...event,
        attendees: updatedAttendees,
      })
    } catch (error) {
      console.error("Error updating attendance:", error)
      // Revert optimistic update on error
      setIsGoing(!isGoing)
      setAttendeeCount(event.attendees?.length || 0)
      Alert.alert("Error", "Failed to update attendance status")
    }
  }

  const handleShare = async () => {
    if (!event) return

    try {
      const result = await Share.share({
        title: event.name,
        message: `Check out ${event.name} at ${event.venueName} on ${event.date.toDateString()}! ${event.description}`,
        url: event.posterImageUrl, // This will only work on iOS
      })

      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          console.log(`Shared via ${result.activityType}`)
        } else {
          console.log("Shared successfully")
        }
      } else if (result.action === Share.dismissedAction) {
        console.log("Share dismissed")
      }
    } catch (error) {
      console.error("Error sharing event:", error)
      Alert.alert("Error", "Failed to share event")
    }
  }

  const formatDateRange = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }
    return date.toLocaleDateString("en-US", options).toUpperCase()
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading event details...</Text>
      </View>
    )
  }

  if (!event) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Event not found</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container}>
      <ImageBackground source={{ uri: event.posterImageUrl }} style={styles.headerImage}>
        <View style={styles.headerOverlay}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.eventHeaderInfo}>
            <Text style={styles.eventName}>{event.name}</Text>
            <Text style={styles.eventLocation}>
              {event.location || event.venueName.toUpperCase()} • {formatDateRange(event.date)}
            </Text>

            <View style={styles.eventMeta}>
              {attendeeCount > 0 && (
                <View style={styles.attendeeCount}>
                  <Ionicons name="people" size={16} color="#FFFFFF" />
                  <Text style={styles.attendeeCountText}>{attendeeCount} going</Text>
                </View>
              )}
              <Text style={styles.entryFee}>{event.entryFee}</Text>
            </View>
          </View>
        </View>
      </ImageBackground>

      <View style={styles.contentContainer}>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.actionButton, isGoing && styles.goingButton]} onPress={handleToggleGoing}>
            <Ionicons
              name={isGoing ? "checkmark-circle" : "calendar-outline"}
              size={20}
              color={isGoing ? "#FFFFFF" : "#2196F3"}
            />
            <Text style={[styles.actionButtonText, isGoing && styles.goingButtonText]}>
              {isGoing ? "I'm Going" : "I'm Going"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <Ionicons name="share-social-outline" size={20} color="#2196F3" />
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>
        </View>

        {user?.userType === "admin" && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => {
              Alert.alert("Delete Event", "Are you sure you want to delete this event? This action cannot be undone.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await FirebaseService.deleteEvent(event.id)
                      Alert.alert("Success", "Event deleted successfully")
                      navigation.goBack()
                    } catch (error) {
                      console.error("Error deleting event:", error)
                      Alert.alert("Error", "Failed to delete event")
                    }
                  },
                },
              ])
            }}
          >
            <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
            <Text style={styles.deleteButtonText}>Delete Event</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.venueContainer}
          onPress={() => {
            // Use the correct navigation approach for cross-stack navigation
            navigation.navigate("Venues", {
              screen: "VenueDetail",
              params: { venueId: event.venueId },
            })
          }}
        >
          <Ionicons name="location" size={20} color="#2196F3" />
          <Text style={styles.venueName}>{event.venueName}</Text>
        </TouchableOpacity>

        <View style={styles.dateContainer}>
          <Ionicons name="calendar" size={20} color="#FFFFFF" />
          <Text style={styles.dateText}>{event.date.toDateString()}</Text>
        </View>

        <Text style={styles.sectionTitle}>About this event</Text>
        <Text style={styles.description}>{event.description}</Text>

        <Text style={styles.sectionTitle}>Artists</Text>
        <View style={styles.artistsContainer}>
          {event.artists.map((artist, index) => (
            <View key={index} style={styles.artistTag}>
              <Text style={styles.artistText}>{artist}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>
            {event.entryFee === "Free Entry" ? "Get Free Entry" : `Buy Ticket (${event.entryFee})`}
          </Text>
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
    height: 300,
  },
  headerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "space-between",
    padding: 16,
    paddingTop: Platform.OS === "ios" ? 50 : 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  eventHeaderInfo: {
    marginBottom: 16,
  },
  eventName: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  eventLocation: {
    fontSize: 16,
    color: "#FFFFFF",
    marginBottom: 8,
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
    marginRight: 12,
  },
  attendeeCountText: {
    color: "#FFFFFF",
    fontSize: 14,
    marginLeft: 6,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  entryFee: {
    color: "#FFD700",
    fontWeight: "bold",
    fontSize: 16,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  contentContainer: {
    padding: 16,
  },
  actionButtons: {
    flexDirection: "row",
    marginBottom: 20,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E1E1E",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginRight: 12,
    flex: 1,
  },
  goingButton: {
    backgroundColor: "#2196F3",
  },
  actionButtonText: {
    color: "#2196F3",
    fontWeight: "bold",
    marginLeft: 8,
  },
  goingButtonText: {
    color: "#FFFFFF",
  },
  venueContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  venueName: {
    fontSize: 16,
    color: "#2196F3",
    marginLeft: 8,
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  dateText: {
    fontSize: 16,
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
  artistsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
  artistTag: {
    backgroundColor: "#2196F3",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
  },
  artistText: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  button: {
    backgroundColor: "#2196F3",
    height: 50,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF3B30",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 16,
  },
  deleteButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    marginLeft: 8,
  },
})

export default EventDetailScreen
