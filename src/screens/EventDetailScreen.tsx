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
import SupabaseService from "../services/SupabaseService"
import { useAuth } from "../contexts/AuthContext"
import type { Event } from "../models/Event"
import { useCompatNavigation } from "../utils/compatNavigation"
import { useRouter } from "../utils/URLRouter"
import { useDeviceType, COLORS } from "../utils/ResponsiveDesign"

import TicketService from "../services/TicketService"
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore"
import { db } from "../config/firebase"

// Responsive setup for EventDetailScreen
const { width: screenWidth } = Dimensions.get('window');
const isSmallDevice = screenWidth < 380;
const isTablet = screenWidth >= 768;
const isLargeScreen = screenWidth >= 1024;

console.log("[v0] EventDetailScreen responsiveness initialized - Screen width:", screenWidth, "px | Device type:", isLargeScreen ? "Large/Desktop" : isTablet ? "Tablet" : "Mobile");

const EventDetailScreen: React.FC = () => {
  const { isLargeScreen, isTablet } = useDeviceType()
  const navigation = useCompatNavigation()
  const { currentPath } = useRouter()

  // Extract eventId from current path: /events/:eventId
  const pathParts = currentPath.split('/').filter(Boolean)
  const eventId = pathParts[1] // events/:eventId, so [events, eventId]
  const { user } = useAuth()

  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)

  // Validate eventId
  const isValidEventId = eventId && eventId.length > 0 && eventId !== 'add' && eventId !== 'notifications' && eventId !== 'ticket-contacts' && eventId !== 'my-tickets'
  const [isGoing, setIsGoing] = useState(false)
  const [attendeeCount, setAttendeeCount] = useState(0)
  const [showFullImage, setShowFullImage] = useState(false)

  useEffect(() => {
    const loadEvent = async () => {
      if (!isValidEventId) {
        setLoading(false)
        return
      }

      try {
        const eventData = await SupabaseService.getEventById(eventId)
        if (eventData) {
          setEvent(eventData)

          // Check if current user is attending
          if (user && eventData?.attendees) {
            setIsGoing(eventData.attendees.includes(user.id))
          }

          // Set attendee count
          setAttendeeCount(eventData?.attendees?.length || 0)
        } else {
          console.warn("Event not found:", eventId)
        }
      } catch (error) {
        console.error("Error loading event details:", error)
      } finally {
        setLoading(false)
      }
    }

    loadEvent()
  }, [eventId, user, isValidEventId])

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

      await SupabaseService.updateEvent(event.id, { attendees: updatedAttendees })

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
    navigation.navigate("TicketPurchase", { eventId: event.slug || event.id })
  }

  const handleTicketContacts = () => {
    if (!event) return
    navigation.navigate("TicketContactScreen", { ticketContacts: event.ticketContacts || [] })
  }

  const handleShare = async () => {
     if (!event) return

     try {
       // Generate the event detail URL for deep linking
       const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://yovibe.net'
       const eventUrl = `${baseUrl}/events/${event.id}`

       // Check if we're in development and provide helpful message
       const isDevelopment = typeof window !== 'undefined' && window.location.hostname === 'localhost'

       const shareMessage = isDevelopment
         ? `Check out ${event.name} at ${event.venueName} on ${event.date.toDateString()}!\n\n${event.description}\n\nNote: For rich previews on social media, use a public URL (try ngrok for testing): ${eventUrl}`
         : `Check out ${event.name} at ${event.venueName} on ${event.date.toDateString()}! ${event.description}`

       const result = await Share.share({
         title: event.name,
         message: shareMessage,
         url: eventUrl,
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

   // Handle venue navigation
   const handleVenuePress = () => {
     if (!event) return

     // Use venueSlug if available, otherwise show error
     if (!event.venueSlug || event.venueSlug === 'undefined' || event.venueSlug === 'null') {
       Alert.alert("Venue Information", `This event is at ${event.venueName}. Venue details are not available.`)
       return
     }

     try {
       navigation.navigate("VenueDetail", { venueId: event.venueSlug })
     } catch (error) {
       console.error("[EventDetailScreen] Error navigating to venue:", error)
       Alert.alert("Error", "Failed to navigate to venue details")
     }
   }

   // Handle delete event for admin
   const handleDeleteEvent = async () => {
     if (!event) return
     
     try {
       console.log("[EventDetailScreen] Deleting event:", event.id)
       await SupabaseService.deleteEvent(event.id)
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
      const userData = await SupabaseService.getUserProfileOrNull(creatorId)
      return userData?.paymentDetails || null
    } catch (error) {
      console.error("Error loading organizer payment details:", error)
      return null
    }
  }

  // Inject JSON-LD structured data and Open Graph meta tags for SEO and social sharing
  useEffect(() => {
    if (!event) return

    // Generate the event URL for deep linking
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://yovibe.net'
    const eventUrl = `${baseUrl}/events/${event.id}`

    // Normalize the price to a clean numeric string for schema.org Offer.price
    const rawPrice = event.isFreeEntry ? "0" : (event.entryFees?.[0]?.amount || "0")
    const priceMatch = String(rawPrice).replace(/,/g, "").trim().match(/-?\d+(\.\d+)?/)
    const price = priceMatch ? priceMatch[0] : "0"

    // Compute an end date from the event time range (e.g. "08:00 PM - 11:00 PM")
    const endFromTime = () => {
      const d = new Date(event.date)
      const parts = String(event.time || "").split("-")
      const token = (parts.length > 1 ? parts[1] : parts[0]).trim()
      const m = token.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/)
      if (!m) return event.date
      let hour = parseInt(m[1], 10)
      const meridiem = (m[3] || "").toUpperCase()
      if (meridiem === "PM" && hour < 12) hour += 12
      if (meridiem === "AM" && hour === 12) hour = 0
      if (hour < 0 || hour > 23) return event.date
      d.setHours(hour, parseInt(m[2], 10), 0, 0)
      return d
    }

    const eventJsonLd = {
      "@context": "https://schema.org",
      "@type": "Event",
      "name": event.name,
      "description": event.description || `Join us at ${event.venueName} for an amazing event`,
      "startDate": event.date.toISOString(),
      "endDate": endFromTime().toISOString(),
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
      "eventStatus": event.eventStatus === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
      "eventUrl": eventUrl,
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
      "offers": {
        "@type": "Offer",
        "price": price,
        "priceCurrency": "UGX",
        "availability": "https://schema.org/InStock",
        "validFrom": new Date().toISOString(),
        "url": eventUrl
      },
      "performer": Array.isArray(event.artists) && event.artists.length > 0
        ? event.artists.map((artist) => ({ "@type": "MusicGroup", name: artist }))
        : [{ "@type": "Organization", "name": event.venueName || "YoVibe" }],
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

    // Inject Open Graph meta tags for social media sharing
    const ogMetaTags = [
      { property: 'og:title', content: `${event.name} - YoVibe` },
      { property: 'og:description', content: event.description || `Check out ${event.name} at ${event.venueName} on ${event.date.toDateString()}!` },
      { property: 'og:image', content: event.posterImageUrl },
      { property: 'og:url', content: eventUrl },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'YoVibe' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:locale', content: 'en_UG' },
      // Twitter Card meta tags for better Twitter sharing
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: `${event.name} - YoVibe` },
      { name: 'twitter:description', content: event.description || `Check out ${event.name} at ${event.venueName} on ${event.date.toDateString()}!` },
      { name: 'twitter:image', content: event.posterImageUrl },
      { name: 'twitter:site', content: '@yovibe' }
    ]

    // Remove existing OG meta tags
    const existingOgTags = document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')
    existingOgTags.forEach(tag => tag.remove())

    // Inject new OG meta tags
    ogMetaTags.forEach(tag => {
      const meta = document.createElement('meta')
      if (tag.property) {
        meta.setAttribute('property', tag.property)
        meta.setAttribute('content', tag.content)
      } else if (tag.name) {
        meta.setAttribute('name', tag.name)
        meta.setAttribute('content', tag.content)
      }
      document.head.appendChild(meta)
    })

    // For development/testing: Store meta tags in localStorage so they can be accessed by crawlers
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      try {
        const metaData = {
          title: `${event.name} - YoVibe`,
          description: event.description || `Check out ${event.name} at ${event.venueName} on ${event.date.toDateString()}!`,
          image: event.posterImageUrl,
          url: eventUrl,
          type: 'event'
        }
        localStorage.setItem(`yovibe_meta_${event.id}`, JSON.stringify(metaData))
      } catch (e) {
        // Ignore localStorage errors
      }
    }

    return () => {
      // Cleanup function
      const existingScript = document.getElementById(scriptId)
      if (existingScript) {
        existingScript.remove()
      }

      // Remove OG meta tags
      const ogTagsToRemove = document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')
      ogTagsToRemove.forEach(tag => tag.remove())

      // Clean up localStorage for development
      if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        try {
          localStorage.removeItem(`yovibe_meta_${event.id}`)
        } catch (e) {
          // Ignore localStorage errors
        }
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
    <View style={[styles.container, { backgroundColor: COLORS.background }]}>
      {isLargeScreen ? (
        <View style={styles.desktopContainer}>
          <ScrollView style={styles.desktopLeftColumn} showsVerticalScrollIndicator={false}>
            <TouchableOpacity onPress={handleImageDoubleTap} activeOpacity={0.9}>
              <ImageBackground 
                source={{ uri: event.posterImageUrl }} 
                style={styles.desktopHeaderImage}
                aria-label={`Event poster for ${event.name}`}
                accessibilityLabel={`Event poster for ${event.name}`}
              >
                <View style={styles.headerOverlay}>
                  <View style={styles.eventHeaderInfo}>
                    <Text style={styles.eventName} accessibilityRole="header">{event.name}</Text>
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

            <View style={styles.desktopLeftContent}>
              <Text style={styles.sectionTitle}>About this event</Text>
              <Text style={styles.description}>{event.description}</Text>

              <Text style={styles.sectionTitle}>Artists</Text>
              <View style={styles.artistsContainer}>
                {event.artists.map((artist, index) => (
                  <View key={index} style={[styles.artistTag, { backgroundColor: COLORS.accent }]}>
                    <Text style={styles.artistText}>{artist}</Text>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={styles.desktopRightColumn}>
            <View style={styles.stickyCard}>
              <TouchableOpacity
                style={styles.desktopVenueContainer}
                onPress={handleVenuePress}
              >
                <Ionicons name="location" size={20} color={COLORS.primary} />
                <Text style={styles.desktopVenueName}>{event.venueName}</Text>
              </TouchableOpacity>

              <View style={styles.desktopDateContainer}>
                <Ionicons name="calendar" size={20} color="#FFFFFF" />
                <Text style={styles.desktopDateText}>{event.date.toDateString()}</Text>
              </View>

              {/* Buy Tickets Button - For all featured events */}
              {event.isFeatured && (
                <TouchableOpacity style={styles.gradientButton} onPress={handleBuyTicket}>
                  <Ionicons name="ticket-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.buttonText}>Buy Tickets</Text>
                </TouchableOpacity>
              )}

              {/* Ticket Contacts Button - Only for unfeatured events */}
              {!event.isFeatured && (
                <TouchableOpacity style={styles.gradientButton} onPress={handleTicketContacts}>
                  <Ionicons name="call-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.buttonText}>Ticket Contacts</Text>
                </TouchableOpacity>
              )}

              <View style={styles.actionButtons}>
                <TouchableOpacity style={[styles.actionButton, isGoing && styles.goingButton]} onPress={handleToggleGoing}>
                  <Ionicons
                    name={isGoing ? "checkmark-circle" : "calendar-outline"}
                    size={20}
                    color={isGoing ? "#FFFFFF" : COLORS.primary}
                  />
                  <Text style={[styles.actionButtonText, { color: isGoing ? "#FFFFFF" : COLORS.primary }]}>
                    {isGoing ? "I'm Going" : "I'm Going"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
                  <Ionicons name="share-social-outline" size={20} color={COLORS.primary} />
                  <Text style={[styles.actionButtonText, { color: COLORS.primary }]}>Share</Text>
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
            </View>
          </View>
        </View>
      ) : (
        <ScrollView>
          <TouchableOpacity onPress={handleImageDoubleTap} activeOpacity={0.9}>
            <ImageBackground 
              source={{ uri: event.posterImageUrl }} 
              style={styles.headerImage}
              aria-label={`Event poster for ${event.name}`}
              accessibilityLabel={`Event poster for ${event.name}`}
            >
              <View style={styles.headerOverlay}>
                <View style={styles.eventHeaderInfo}>
                  <Text style={styles.eventName} accessibilityRole="header">{event.name}</Text>
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
                  color={isGoing ? "#FFFFFF" : COLORS.primary}
                />
                <Text style={[styles.actionButtonText, { color: isGoing ? "#FFFFFF" : COLORS.primary }]}>
                  {isGoing ? "I'm Going" : "I'm Going"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
                <Ionicons name="share-social-outline" size={20} color={COLORS.primary} />
                <Text style={[styles.actionButtonText, { color: COLORS.primary }]}>Share</Text>
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
              onPress={handleVenuePress}
            >
              <Ionicons name="location" size={20} color={COLORS.primary} />
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
                <View key={index} style={[styles.artistTag, { backgroundColor: COLORS.accent }]}>
                  <Text style={styles.artistText}>{artist}</Text>
                </View>
              ))}
            </View>

            {/* Buy Tickets Button - For all featured events */}
            {event.isFeatured && (
              <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.primary }]} onPress={handleBuyTicket}>
                <Ionicons name="ticket-outline" size={20} color="#FFFFFF" />
                <Text style={styles.buttonText}>Buy Tickets</Text>
              </TouchableOpacity>
            )}

            {/* Ticket Contacts Button - Only for unfeatured events */}
            {!event.isFeatured && (
              <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.primary }]} onPress={handleTicketContacts}>
                <Ionicons name="call-outline" size={20} color="#FFFFFF" />
                <Text style={styles.buttonText}>Ticket Contacts</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      )}
    </View>
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
    justifyContent: "flex-end",
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
  desktopContainer: {
    flexDirection: "row",
    flex: 1,
    padding: 24,
    gap: 24,
    maxWidth: 1200,
    width: "100%",
    alignSelf: "center",
  },
  desktopLeftColumn: {
    flex: 0.65,
  },
  desktopLeftContent: {
    paddingVertical: 20,
    paddingHorizontal: 8,
  },
  desktopHeaderImage: {
    width: "100%",
    height: 380,
    borderRadius: 16,
    overflow: "hidden",
  },
  desktopRightColumn: {
    width: "35%",
    paddingTop: 0,
  },
  stickyCard: {
    backgroundColor: "rgba(18, 18, 26, 0.85)",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  desktopVenueContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "rgba(0, 212, 255, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.2)",
  },
  desktopVenueName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#00D4FF",
    marginLeft: 10,
  },
  desktopDateContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
  },
  desktopDateText: {
    fontSize: 16,
    color: "#FFFFFF",
    marginLeft: 10,
  },
  gradientButton: {
    backgroundColor: "#00D4FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 16,
  },
})

export default EventDetailScreen
