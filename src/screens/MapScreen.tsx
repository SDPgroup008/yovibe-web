import { useMapVenues } from "../hooks/useMapVenues"
"use client"

import type React from "react"
import { useState, useEffect, useCallback, useMemo } from "react"
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, RefreshControl } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import SupabaseService from "../services/SupabaseService"
import type { Venue } from "../models/Venue"
import type { MapScreenProps } from "../navigation/types"
import { useMapScroll } from "../hooks/useScrollPersistence"
import { useIsFocused } from "../utils/compatNavigation"
import { ResponsiveSkeleton } from "../components/SkeletonLoader"
import { getLocalVibeDayKey, getMillisecondsUntilNextLocalDay } from "../utils/dailyVibe"
import { useCountry } from "../contexts/CountryContext"

// This is a web-only implementation of the MapScreen
const MapScreen: React.FC<MapScreenProps> = ({ navigation, route }) => {
  /* console.log('[MapScreen] 🏗️ RENDER/MOUNT'); */
  const { onScroll, onContentSizeChange, restorePosition, scrollRef } = useMapScroll()
  const isFocused = useIsFocused()
  const { country } = useCountry()

  const destinationVenueId = route.params?.destinationVenueId
  const { venues, loading, refreshing, onRefresh } = useMapVenues(destinationVenueId)
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [displayedVenues, setDisplayedVenues] = useState<Venue[]>([])
  const [venueVibeRatings, setVenueVibeRatings] = useState<Record<string, number>>({})
  const [vibeDayKey, setVibeDayKey] = useState(() => getLocalVibeDayKey())

  useEffect(() => {
    const timer = setTimeout(() => setVibeDayKey(getLocalVibeDayKey()), getMillisecondsUntilNextLocalDay())
    return () => clearTimeout(timer)
  }, [vibeDayKey])
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 5
  // Restore scroll position when screen regains focus
  useEffect(() => {
    /* console.log('[MapScreen] 👁️ focus effect - isFocused=', isFocused); */
    if (isFocused) restorePosition()
  }, [isFocused])

  // Load today's canonical vibe image rating for every venue. This keeps the
  // list and its ordering in sync after a venue owner posts a new vibe.
  useEffect(() => {
    let cancelled = false

    const loadCurrentVibes = async () => {
      if (!venues.length) {
        setVenueVibeRatings({})
        return
      }

      const today = new Date()
      const ratings: Record<string, number> = {}
      await Promise.all(venues.map(async (venue) => {
        const key = venue.slug || venue.id
        if (!key) return

        try {
          const vibeImages = await SupabaseService.getVibeImagesByVenueAndDate(key, today)
          const latestVibe = vibeImages.reduce((latest, image) => (
            !latest || image.uploadedAt > latest.uploadedAt ? image : latest
          ), null as (typeof vibeImages[number] | null))
          ratings[key] = latestVibe?.vibeRating ?? 0
        } catch {
          ratings[key] = 0
        }
      }))

      if (!cancelled) setVenueVibeRatings(ratings)
    }

    loadCurrentVibes()
    return () => { cancelled = true }
  }, [venues, vibeDayKey])

  // Pull-to-refresh handler
  useEffect(() => {
    // If a destination venue ID is provided, highlight it
    if (destinationVenueId && venues.length > 0) {
      const venue = venues.find((v) => v.id === destinationVenueId)
      if (venue) {
        setSelectedVenue(venue)
      }
    }
  }, [destinationVenueId, venues])

  const getCurrentVibe = (venue: Venue) =>
    venueVibeRatings[venue.slug || venue.id] ?? 0

  const sortedVenues = useMemo(() => venues.filter((venue) => country === 'ALL' || (venue.countryCode || 'UG') === country || venue.id === destinationVenueId || venue.slug === destinationVenueId).sort((a, b) => {
    return getCurrentVibe(b) - getCurrentVibe(a)
  }), [venues, venueVibeRatings, country, destinationVenueId])

  useEffect(() => {
    // Reset pagination when venues or their live ratings change.
    setCurrentPage(1);
    setDisplayedVenues(sortedVenues.slice(0, ITEMS_PER_PAGE));
  }, [sortedVenues]);

  const loadMoreVenues = () => {
    if (currentPage * ITEMS_PER_PAGE >= sortedVenues.length) return
    const nextPage = currentPage + 1;
    const endIndex = nextPage * ITEMS_PER_PAGE;
    setDisplayedVenues(sortedVenues.slice(0, endIndex));
    setCurrentPage(nextPage);
  };

  const handleVenueSelect = (venueId: string) => {
    navigation.navigate("VenueDetail", { venueId })
  }

  const openGoogleMaps = (venue: Venue) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}&destination_place_id=${venue.name}`
    Linking.openURL(url)
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Venue Locations</Text>
        <Text style={styles.headerSubtitle}>Here's a list of all our venues:</Text>
      </View>

      {loading ? (
        <ResponsiveSkeleton variant="list" />
      ) : venues.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={64} color="#666666" />
          <Text style={styles.emptyText}>No venues found</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.venueList}
          onContentSizeChange={onContentSizeChange}
          onScroll={(event) => {
            // Forward to scroll persistence
            onScroll(event)
            // Also handle infinite scroll
            const { nativeEvent } = event
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent
            const paddingToBottom = 20
            if (layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom) {
              loadMoreVenues()
            }
          }}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#2196F3"]}
              tintColor="#2196F3"
            />
          }
        >
          {displayedVenues.map((venue) => (
            <View key={venue.id} style={[styles.venueCard, selectedVenue?.id === venue.id && styles.selectedVenueCard]}>
              <View style={styles.venueInfo}>
                <Text style={styles.venueName}>{venue.name}</Text>
                <Text style={styles.venueAddress}>{venue.location}</Text>
                <Text style={styles.venueCategories}>{venue.categories.join(", ")}</Text>
              </View>
              <View style={styles.venueRating}>
                <Text style={styles.ratingText}>{getCurrentVibe(venue).toFixed(1)}</Text>
                <Ionicons name="star" size={16} color="#FFD700" />
              </View>
              <View style={styles.venueActions}>
                <TouchableOpacity style={styles.actionButton} onPress={() => handleVenueSelect(venue.slug || venue.id)}>
                  <Ionicons name="information-circle" size={20} color="#2196F3" />
                  <Text style={styles.actionText}>Details</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={() => openGoogleMaps(venue)}>
                  <Ionicons name="navigate" size={20} color="#2196F3" />
                  <Text style={styles.actionText}>Directions</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: "#BBBBBB",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#FFFFFF",
    textAlign: "center",
    marginTop: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyText: {
    color: "#FFFFFF",
    fontSize: 18,
    marginTop: 16,
  },
  venueList: {
    flex: 1,
    padding: 16,
  },
  venueCard: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  selectedVenueCard: {
    backgroundColor: "#2a2a2a",
    borderWidth: 1,
    borderColor: "#2196F3",
  },
  venueInfo: {
    flex: 1,
    marginBottom: 12,
  },
  venueName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  venueAddress: {
    fontSize: 14,
    color: "#BBBBBB",
    marginBottom: 4,
  },
  venueCategories: {
    fontSize: 14,
    color: "#2196F3",
  },
  venueRating: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  ratingText: {
    color: "#FFFFFF",
    marginRight: 4,
    fontWeight: "bold",
  },
  venueActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  actionText: {
    color: "#2196F3",
    marginLeft: 4,
    fontSize: 14,
  },
})

export default MapScreen
