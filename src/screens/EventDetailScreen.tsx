"use client"

import type React from "react"
import { useState, useEffect, useMemo, useCallback } from "react"
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
  Modal,
  Image,
  Dimensions,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../services/FirebaseService"
import { useAuth } from "../contexts/AuthContext"
import type { Event } from "../models/Event"
import type { EventDetailScreenProps } from "../navigation/types"
import TicketService from "../services/TicketService"
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore"
import { db } from "../config/firebase"

// Responsive setup for EventDetailScreen
const { width: screenWidth } = Dimensions.get('window');
const isSmallDevice = screenWidth < 380;
const isTablet = screenWidth >= 768;
const isLargeScreen = screenWidth >= 1024;

console.log("[v0] EventDetailScreen responsiveness initialized - Screen width:", screenWidth, "px | Device type:", isLargeScreen ? "Large/Desktop" : isTablet ? "Tablet" : "Mobile");

const EventDetailScreen: React.FC<EventDetailScreenProps> = ({ route, navigation }) => {
  const { eventId } = route.params
  const { user } = useAuth()
  
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [isGoing, setIsGoing] = useState(false)
  const [attendeeCount, setAttendeeCount] = useState(0)
  const [showFullImage, setShowFullImage] = useState(false)

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

  const handleBuyTicket = () => {
    if (!event) return

    // Navigate to TicketPurchaseScreen for actual ticket purchase
    // Both authenticated and unauthenticated users can access this screen
    navigation.navigate("TicketPurchase", { event })
  }

  const handleViewTicketContacts = () => {
    if (!event) return

    navigation.navigate("TicketContactScreen", { ticketContacts: event.ticketContacts })
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

  const handleImageDoubleTap = () => {
    setShowFullImage(true)
  }

  const formatDateRange = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }
    return date.toLocaleDateString("en-US", options).toUpperCase()
  }

  // Handle delete event for admin
  const handleDeleteEvent = async () => {
    if (!event) return
    
    try {
      console.log("[EventDetailScreen] Deleting event:", event.id)
      await FirebaseService.deleteEvent(event.id)
      console.log("[EventDetailScreen] Event deleted successfully")
      Alert.alert("Success", "Event deleted successfully")
      navigation.goBack()
    } catch (error) {
      console.error("[EventDetailScreen] Error deleting event:", error)
      Alert.alert("Error", "Failed to delete event")
    }
  }

  // Load event creator's payment details (for admin view)
  const loadEventCreatorPaymentDetails = async (creatorId: string) => {
    try {
      const userData = await FirebaseService.getUserProfile(creatorId)
      return userData?.paymentDetails || null
    } catch (error) {
      console.error("Error loading organizer payment details:", error)
      return null
    }
  }

  // Inject JSON-LD structured data for SEO
  useEffect(() => {
    if (!event) return
    
    const eventJsonLd = {
      "@context": "https://schema.org",
      "@type": "Event",
      "name": event.name,
      "description": event.description || `Join us at ${event.venueName} for an amazing event`,
      "startDate": event.date.toISOString(),
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
      "eventStatus": "https://schema.org/EventScheduled",
      "location": {
        "@type": "Place",
        "name": event.venueName,
        "address": {
          "@type": "PostalAddress",
          "addressLocality": event.location || "Kampala",
          "addressCountry": "UG"
        }
      },
      "image": event.posterImageUrl,
      "offers": event.isFreeEntry ? {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "UGX",
        "availability": "https://schema.org/InStock"
      } : {
        "@type": "Offer",
        "price": event.entryFees[0]?.amount || "0",
        "priceCurrency": "UGX",
        "availability": "https://schema.org/InStock"
      },
      "organizer": {
        "@type": "Organization",
        "name": "YoVibe",
        "url": "https://yovibe.net"
      }
    }
    
    // Create or update JSON-LD script
    const scriptId = 'event-json-ld'
    let script = document.getElementById(scriptId) as HTMLScriptElement | null
    if (!script) {
      script = document.createElement('script')
      script.id = scriptId
      script.type = 'application/ld+json'
      document.head.appendChild(script)
    }
    script.textContent = JSON.stringify(eventJsonLd)
    
    return () => {
      const existingScript = document.getElementById(scriptId)
      if (existingScript) {
        existingScript.remove()
      }
    }
  }, [event])

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

  const isEventOwner = user && event && (event.createdBy === user.id)
  const canManageEvent = isEventOwner || user?.userType === "admin"

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity onPress={handleImageDoubleTap} activeOpacity={0.9}>
        <ImageBackground 
          source={{ uri: event.posterImageUrl }} 
          style={styles.headerImage}
          aria-label={`Event poster for ${event.name}`}
          accessibilityLabel={`Event poster for ${event.name}`}
        >
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
                <Text style={styles.entryFee}>
                  {event.isFreeEntry ? "Free" : event.entryFees.map((fee) => `${fee.name}: ${fee.amount}`).join(", ")}
                </Text>
              </View>
            </View>
          </View>
        </ImageBackground>
      </TouchableOpacity>

      {/* Full Image Modal */}
      <Modal visible={showFullImage} transparent={true} animationType="fade">
        <View style={styles.fullImageModal}>
          <TouchableOpacity style={styles.fullImageCloseButton} onPress={() => setShowFullImage(false)}>
            <Ionicons name="close" size={30} color="#FFFFFF" />
          </TouchableOpacity>
          <Image source={{ uri: event.posterImageUrl }} style={styles.fullImage} resizeMode="contain" />
        </View>
      </Modal>

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

        {/* Organiser Dashboard - Show for event owners AND admins */}
        {canManageEvent && (
          <View style={styles.ownerControls}>
            <TouchableOpacity style={styles.ownerButton} onPress={() => navigation.navigate("OrganiserDashboard", { eventId })}>
              <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
              <Text style={styles.ownerButtonText}>Organiser Dashboard</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {/* Delete Event - Admin only */}
        {user?.userType === "admin" && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => {
              // Use a simple confirm dialog instead of Alert.alert for web compatibility
              const confirmed = window.confirm("Are you sure you want to delete this event? This action cannot be undone.")
              
              if (confirmed) {
                handleDeleteEvent()
              }
            }}
          >
            <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
            <Text style={styles.deleteButtonText}>Delete Event</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.venueContainer}
          onPress={() => {
            const venueId = event.venueId

            // Preferred: navigate directly to VenueDetail if it's registered in the same navigator
            try {
              navigation.navigate("VenueDetail", { venueId })
              return
            } catch (e) {
              // ignore and try nested navigation below
            }

            // Fallback for cross-stack navigation: cast to any to satisfy TypeScript
            // (keeps runtime behavior of navigating to Venues -> VenueDetail)
            ;(navigation as any).navigate("Venues", {
              screen: "VenueDetail",
              params: { venueId },
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

        {/* Ticket Contact Button - Now above Buy Tickets */}
        <TouchableOpacity style={styles.button} onPress={handleViewTicketContacts}>
          <Ionicons name="call-outline" size={20} color="#FFFFFF" />
          <Text style={styles.buttonText}>Ticket Contact</Text>
        </TouchableOpacity>

        {/* Buy Tickets Button - Only visible to Admins */}
        {user?.userType === "admin" && (
        <TouchableOpacity style={styles.button} onPress={handleBuyTicket}>
          <Ionicons name="ticket-outline" size={20} color="#FFFFFF" />
          <Text style={styles.buttonText}>Buy Tickets</Text>
        </TouchableOpacity>
        )}

      </View>
    </ScrollView>
  )
}

// Responsive helper function (uses already-declared breakpoints from line 26-29)
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
    height: responsiveSize(240, 300, 360),
  },
  headerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "space-between",
    padding: responsiveSize(12, 14, 18),
    paddingTop: Platform.OS === "ios" ? responsiveSize(40, 50, 60) : responsiveSize(12, 14, 18),
  },
  backButton: {
    width: responsiveSize(36, 40, 48),
    height: responsiveSize(36, 40, 48),
    borderRadius: responsiveSize(18, 20, 24),
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.3)",
  },
  eventHeaderInfo: {
    marginBottom: responsiveSize(12, 14, 18),
  },
  eventName: {
    fontSize: responsiveSize(22, 26, 32),
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: responsiveSize(6, 8, 12),
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  eventLocation: {
    fontSize: responsiveSize(13, 15, 17),
    color: "#FFFFFF",
    marginBottom: responsiveSize(6, 8, 10),
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  eventMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  attendeeCount: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: responsiveSize(8, 10, 12),
    marginBottom: responsiveSize(4, 6, 8),
  },
  attendeeCountText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(12, 13, 14),
    marginLeft: responsiveSize(4, 5, 6),
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  entryFee: {
    color: "#FFD700",
    fontWeight: "bold",
    fontSize: responsiveSize(13, 15, 17),
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  fullImageModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullImageCloseButton: {
    position: "absolute",
    top: responsiveSize(30, 40, 50),
    right: responsiveSize(15, 20, 25),
    zIndex: 1,
    padding: responsiveSize(8, 10, 12),
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: responsiveSize(20, 24, 28),
  },
  // Scanner Modal Styles
  scannerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  scannerModalContent: {
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 24,
    width: "85%",
    maxWidth: 400,
  },
  scannerModalTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  scannerModalSubtitle: {
    color: "#888888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  scannerModalInput: {
    backgroundColor: "#333333",
    color: "#FFFFFF",
    padding: 16,
    borderRadius: 8,
    fontSize: 16,
    marginBottom: 20,
  },
  scannerModalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  scannerModalCancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#333333",
    alignItems: "center",
  },
  scannerModalCancelText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  scannerModalValidateButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#00D4FF",
    alignItems: "center",
  },
  scannerModalValidateText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  fullImage: {
    width: "100%",
    height: "100%",
  },
  contentContainer: {
    padding: responsiveSize(12, 16, 24),
    paddingBottom: responsiveSize(54, 60, 68), // Match bottom navbar height
    maxWidth: isLargeScreen ? 900 : "100%",
    alignSelf: "center",
    width: "100%",
  },
  actionButtons: {
    flexDirection: "row",
    marginBottom: responsiveSize(14, 18, 24),
    gap: responsiveSize(8, 10, 12),
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E1E1E",
    paddingVertical: responsiveSize(10, 12, 16),
    paddingHorizontal: responsiveSize(14, 18, 24),
    borderRadius: responsiveSize(6, 8, 12),
    marginRight: 0,
    flex: 1,
  },
  goingButton: {
    backgroundColor: "#2196F3",
  },
  actionButtonText: {
    color: "#2196F3",
    fontWeight: "bold",
    marginLeft: responsiveSize(6, 8, 10),
    fontSize: responsiveSize(12, 14, 15),
  },
  goingButtonText: {
    color: "#FFFFFF",
  },
  ownerControls: {
    marginBottom: responsiveSize(14, 18, 24),
  },
  ownerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    paddingVertical: responsiveSize(10, 12, 16),
    paddingHorizontal: responsiveSize(14, 18, 24),
    borderRadius: responsiveSize(6, 8, 12),
    marginBottom: responsiveSize(8, 10, 12),
  },
  ownerButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    marginLeft: responsiveSize(6, 8, 10),
    fontSize: responsiveSize(13, 14, 15),
  },
  scannerButton: {
    alignItems: "center",
    padding: 20,
    backgroundColor: "rgba(0, 212, 255, 0.1)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.3)",
  },
  scannerButtonTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: 12,
  },
  scannerButtonText: {
    fontSize: 13,
    color: "#AAAAAA",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 12,
  },
  scannerButtonArrow: {
    position: "absolute",
    right: 16,
    top: "50%",
    marginTop: -12,
  },
  venueContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: responsiveSize(8, 10, 14),
    paddingVertical: responsiveSize(6, 8, 10),
    paddingHorizontal: responsiveSize(8, 10, 12),
    backgroundColor: "rgba(33, 150, 243, 0.1)",
    borderRadius: responsiveSize(6, 8, 12),
    borderWidth: 1,
    borderColor: "rgba(33, 150, 243, 0.2)",
  },
  venueName: {
    fontSize: responsiveSize(13, 15, 17),
    color: "#2196F3",
    marginLeft: responsiveSize(6, 8, 10),
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: responsiveSize(12, 16, 20),
    paddingVertical: responsiveSize(6, 8, 10),
    paddingHorizontal: responsiveSize(8, 10, 12),
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: responsiveSize(6, 8, 12),
  },
  dateText: {
    fontSize: responsiveSize(13, 15, 17),
    color: "#FFFFFF",
    marginLeft: responsiveSize(6, 8, 10),
  },
  sectionTitle: {
    fontSize: responsiveSize(16, 20, 24),
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: responsiveSize(12, 16, 20),
    marginBottom: responsiveSize(6, 8, 12),
  },
  description: {
    fontSize: responsiveSize(13, 15, 16),
    color: "#DDDDDD",
    lineHeight: responsiveSize(20, 22, 26),
  },
  artistsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: responsiveSize(6, 8, 12),
    gap: responsiveSize(6, 8, 10),
  },
  artistTag: {
    backgroundColor: "#2196F3",
    paddingHorizontal: responsiveSize(10, 12, 16),
    paddingVertical: responsiveSize(5, 6, 8),
    borderRadius: responsiveSize(16, 18, 20),
  },
  artistText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(12, 13, 14),
  },
  button: {
    backgroundColor: "#2196F3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: responsiveSize(44, 48, 54),
    borderRadius: responsiveSize(6, 8, 12),
    marginTop: responsiveSize(16, 20, 28),
    marginBottom: responsiveSize(16, 20, 28),
  },
  buttonText: {
    color: "white",
    fontSize: responsiveSize(13, 15, 16),
    fontWeight: "bold",
    marginLeft: responsiveSize(6, 8, 10),
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF3B30",
    paddingVertical: responsiveSize(10, 12, 16),
    paddingHorizontal: responsiveSize(14, 18, 24),
    borderRadius: responsiveSize(6, 8, 12),
    marginTop: responsiveSize(12, 16, 20),
  },
  deleteButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    marginLeft: responsiveSize(6, 8, 10),
    fontSize: responsiveSize(13, 14, 15),
  },
})

export default EventDetailScreen
