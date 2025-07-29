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
  Modal,
  Image,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../services/FirebaseService"
import TicketService from "../services/TicketService"
import { useAuth } from "../contexts/AuthContext"
import type { Event } from "../models/Event"
import type { Ticket } from "../models/Ticket"
import type { EventDetailScreenProps } from "../navigation/types"

const EventDetailScreen: React.FC<EventDetailScreenProps> = ({ route, navigation }) => {
  const { eventId } = route.params
  const { user } = useAuth()
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [isGoing, setIsGoing] = useState(false)
  const [attendeeCount, setAttendeeCount] = useState(0)
  const [showFullImage, setShowFullImage] = useState(false)
  const [eventTickets, setEventTickets] = useState<Ticket[]>([])
  const [showTicketsList, setShowTicketsList] = useState(false)

  useEffect(() => {
    const loadEvent = async () => {
      try {
        if (!eventId) {
          console.error("EventDetailScreen: No eventId provided")
          Alert.alert("Error", "Event ID is missing")
          navigation.goBack()
          return
        }

        const eventData = await FirebaseService.getEventById(eventId)
        if (!eventData) {
          Alert.alert("Error", "Event not found")
          navigation.goBack()
          return
        }

        setEvent(eventData)

        // Check if current user is attending
        if (user && eventData?.attendees) {
          setIsGoing(eventData.attendees.includes(user.id))
        }

        // Set attendee count
        setAttendeeCount(eventData?.attendees?.length || 0)

        // Load tickets if user is event owner
        if (user && eventData && eventData.createdBy === user.id) {
          try {
            const tickets = await TicketService.getTicketsByEvent(eventId)
            setEventTickets(tickets)
          } catch (error) {
            console.error("Error loading event tickets:", error)
            // Don't show error to user, just log it
          }
        }
      } catch (error) {
        console.error("Error loading event details:", error)
        Alert.alert("Error", "Failed to load event details")
        navigation.goBack()
      } finally {
        setLoading(false)
      }
    }

    loadEvent()
  }, [eventId, user, navigation])

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
    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to purchase tickets.")
      return
    }

    if (!event) return

    // Parse entry fee to get numeric value
    const entryFeeString = event.entryFee || "0"
    const ticketPrice = Number.parseFloat(entryFeeString.replace(/[^0-9.]/g, "")) || 0

    if (ticketPrice === 0) {
      Alert.alert("Free Event", "This is a free event. No tickets required!")
      return
    }

    // Navigate with eventId instead of event object
    navigation.navigate("TicketPurchase", { eventId: event.id })
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

  const renderTicketsList = () => {
    const totalRevenue = eventTickets.reduce((sum, ticket) => sum + (ticket.sellerRevenue || 0), 0)
    const totalTickets = eventTickets.reduce((sum, ticket) => sum + ticket.quantity, 0)

    return (
      <Modal visible={showTicketsList} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.ticketsModal}>
          <View style={styles.ticketsHeader}>
            <Text style={styles.ticketsTitle}>Ticket Sales</Text>
            <TouchableOpacity onPress={() => setShowTicketsList(false)}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.ticketsStats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalTickets}</Text>
              <Text style={styles.statLabel}>Tickets Sold</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>UGX {totalRevenue.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Your Revenue</Text>
            </View>
          </View>

          <ScrollView style={styles.ticketsList}>
            {eventTickets.map((ticket) => (
              <View key={ticket.id} style={styles.ticketItem}>
                <View style={styles.ticketInfo}>
                  <Text style={styles.ticketBuyer}>{ticket.buyerName}</Text>
                  <Text style={styles.ticketEmail}>{ticket.buyerEmail}</Text>
                  <Text style={styles.ticketDate}>Purchased: {ticket.purchaseDate.toLocaleDateString()}</Text>
                  <Text style={styles.ticketPayment}>Payment: {ticket.paymentMethod}</Text>
                </View>
                <View style={styles.ticketDetails}>
                  <Text style={styles.ticketQuantity}>{ticket.quantity}x</Text>
                  <Text style={styles.ticketAmount}>UGX {(ticket.sellerRevenue || 0).toLocaleString()}</Text>
                  <View style={[styles.ticketStatus, ticket.status === "used" && styles.ticketStatusUsed]}>
                    <Text style={styles.ticketStatusText}>{ticket.status === "used" ? "Used" : "Active"}</Text>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    )
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
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // Parse entry fee to get numeric value
  const entryFeeString = event.entryFee || "0"
  const ticketPrice = Number.parseFloat(entryFeeString.replace(/[^0-9.]/g, "")) || 0
  const isEventOwner = user && event.createdBy === user.id

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity onPress={handleImageDoubleTap} activeOpacity={0.9}>
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
                <Text style={styles.entryFee}>{event.entryFee || "Free"}</Text>
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

        {/* Event Owner Controls */}
        {isEventOwner && (
          <View style={styles.ownerControls}>
            <TouchableOpacity style={styles.ownerButton} onPress={() => setShowTicketsList(true)}>
              <Ionicons name="ticket-outline" size={20} color="#FFFFFF" />
              <Text style={styles.ownerButtonText}>View Ticket Sales ({eventTickets.length})</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.scannerButton}
              onPress={() => navigation.navigate("TicketScanner", { eventId: event.id })}
            >
              <Ionicons name="scan" size={20} color="#FFFFFF" />
              <Text style={styles.ownerButtonText}>Ticket Scanner</Text>
            </TouchableOpacity>
          </View>
        )}

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

        <TouchableOpacity style={styles.button} onPress={handleBuyTicket}>
          <Ionicons name="card" size={20} color="#FFFFFF" />
          <Text style={styles.buttonText}>{ticketPrice > 0 ? `Buy Ticket - ${event.entryFee}` : "Get Free Entry"}</Text>
        </TouchableOpacity>
      </View>

      {renderTicketsList()}
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  backButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
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
  fullImageModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullImageCloseButton: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 1,
    padding: 10,
  },
  fullImage: {
    width: "100%",
    height: "100%",
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
  ownerControls: {
    marginBottom: 20,
  },
  ownerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 12,
  },
  scannerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF9800",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  ownerButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    marginLeft: 8,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 50,
    borderRadius: 8,
    marginTop: 24,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
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
  ticketsModal: {
    flex: 1,
    backgroundColor: "#121212",
  },
  ticketsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  ticketsTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  ticketsStats: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: "#1E1E1E",
    margin: 16,
    borderRadius: 12,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2196F3",
  },
  statLabel: {
    fontSize: 14,
    color: "#DDDDDD",
    marginTop: 4,
  },
  ticketsList: {
    flex: 1,
    padding: 16,
  },
  ticketItem: {
    flexDirection: "row",
    backgroundColor: "#1E1E1E",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  ticketInfo: {
    flex: 1,
  },
  ticketBuyer: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  ticketEmail: {
    fontSize: 14,
    color: "#DDDDDD",
    marginBottom: 4,
  },
  ticketDate: {
    fontSize: 12,
    color: "#999999",
    marginBottom: 2,
  },
  ticketPayment: {
    fontSize: 12,
    color: "#2196F3",
  },
  ticketDetails: {
    alignItems: "flex-end",
  },
  ticketQuantity: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2196F3",
    marginBottom: 4,
  },
  ticketAmount: {
    fontSize: 14,
    color: "#4CAF50",
    marginBottom: 8,
  },
  ticketStatus: {
    backgroundColor: "#4CAF50",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ticketStatusUsed: {
    backgroundColor: "#666666",
  },
  ticketStatusText: {
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
})

export default EventDetailScreen
