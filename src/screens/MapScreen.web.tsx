"use client"

import type React from "react"
import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, RefreshControl, TextInput, Dimensions } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useIsFocused } from "../utils/compatNavigation";
import { useCompatNavigation } from "../utils/compatNavigation";
import SupabaseService from "../services/SupabaseService";
import VibeAnalysisService from "../services/VibeAnalysisService";
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore"
import { db } from "../config/firebase"
import type { Venue } from "../models/Venue"
import type { MapScreenProps } from "../navigation/types"
import { SEOMetadata, SCREEN_SEO } from "../components/SEOMetadata"
import { useMapScroll } from "../hooks/useScrollPersistence";

// ─── Module-level cache: survives component remounts ─────────────
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry {
  venues: Venue[];
  vibeRatings: Record<string, number>;
  timestamp: number;
}

let mapCache: CacheEntry | null = null;

function isCacheValid(): boolean {
  if (!mapCache) return false;
  return Date.now() - mapCache.timestamp < CACHE_DURATION_MS;
}

function updateCache(venues: Venue[], vibeRatings: Record<string, number>) {
  mapCache = { venues, vibeRatings, timestamp: Date.now() };
}

// ─── Module-level ref to track if we already set up listeners ────
let listenersSetup = false;
let vibeUnsubscribers: (() => void)[] = [];

// ─────────────────────────────────────────────────────────────────

const MapScreen: React.FC<MapScreenProps> = ({ navigation, route }) => {
  console.log('[MapScreen.web] 🏗️ RENDER/MOUNT');
  // SEO Metadata for Map page
  const mapSeo = SCREEN_SEO.map;
  const isFocused = useIsFocused();
  
  const { onScroll, onContentSizeChange, restorePosition, scrollRef } = useMapScroll();

  // Detect desktop viewport (>=1024px)
  const screenWidth = Dimensions.get("window").width;
  const isDesktop = screenWidth >= 1024;

  // ─── Initialise state from cache if available ─────────────────
  const [venues, setVenues] = useState<Venue[]>(() => isCacheValid() ? mapCache!.venues : []);
  const [loading, setLoading] = useState(() => !isCacheValid());
  const [refreshing, setRefreshing] = useState(false)
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [venueVibeRatings, setVenueVibeRatings] = useState<Record<string, number>>(() => isCacheValid() ? mapCache!.vibeRatings : {})
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // ─── Hydrate once from cache on first mount (if cached) ────────
  const initialisedRef = useRef(false);
  useEffect(() => {
    if (!initialisedRef.current && isCacheValid() && mapCache) {
      console.log('[MapScreen.web] 💾 Hydrating from module-level cache, venue count:', mapCache.venues.length);
      setVenues(mapCache.venues);
      setVenueVibeRatings(mapCache.vibeRatings);
      setLoading(false);
      initialisedRef.current = true;
    }
    initialisedRef.current = true;
  }, []);

  // Restore scroll position when screen regains focus
  useEffect(() => {
    console.log('[MapScreen.web] 👁️ focus effect - isFocused=', isFocused);
    if (isFocused) restorePosition();
  }, [isFocused]);

  // Debounced search handler for performance
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text)
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      // Search is applied in real-time via the memoized filtered venues
    }, 300)
  }, [])

  // Toggle search visibility
  const toggleSearch = useCallback(() => {
    setShowSearch(prev => !prev)
    if (showSearch) {
      setSearchQuery("")
    }
  }, [showSearch])

  // Check if we need to show directions to a specific venue
  const destinationVenueId = route.params?.destinationVenueId

  // ─── Load data only once (module-level guard) ──────────────────
  useEffect(() => {
    if (isCacheValid()) {
      console.log('[MapScreen.web] ⏭️ Skipping initial load — cache is valid');
      if (!listenersSetup) {
        listenersSetup = true;
        setupVibeListeners();
      }
      return;
    }

    // Cache invalid or empty — load fresh
    loadVenues();

    if (!listenersSetup) {
      listenersSetup = true;
      setupVibeListeners();
    }

    return () => {
      // NOTE: We do NOT tear down vibe listeners on unmount anymore —
      // they stay alive & update the cache. The module-level
      // `vibeUnsubscribers` array lets us clean up only on full page
      // unload (handled below).
    };
  }, []);

  // ─── Full-cleanup on page unload (not component unmount) ──────
  useEffect(() => {
    return () => {
      // On component unmount update the cache so next mount has data
      if (venues.length > 0) {
        updateCache(venues, venueVibeRatings);
      }
    };
  }, [venues, venueVibeRatings]);

  // Set up real-time vibe listeners (called once)
  const setupVibeListeners = async () => {
    try {
      const venuesList = await SupabaseService.getVenues()
      for (const venue of venuesList) {
        // CRITICAL: skip venues without a valid id — Firebase will crash
        // with "Unsupported field value: undefined" on where("==", undefined)
        if (!venue?.id) {
          console.warn(`[MapScreen.web] ⚠️ Skipping vibe listener setup for venue without id:`, venue?.name || 'unknown');
          continue;
        }

        const vibeRatingsRef = collection(db, "YoVibe/data/vibeRatings")
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

        const venueId = venue.id; // capture in closure
        const unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === "added" || change.type === "modified") {
                const data = change.doc.data()
                const rating = data.rating || 0.0
                setVenueVibeRatings((prev) => ({
                  ...prev,
                  [venueId]: rating,
                }))
              } else if (change.type === "removed") {
                setVenueVibeRatings((prev) => ({
                  ...prev,
                  [venueId]: 0.0,
                }))
              }
            })
          },
          (error) => {
            console.error(`FirebaseService: Error listening to vibe ratings for venue ${venueId}:`, error)
            setVenueVibeRatings((prev) => ({
              ...prev,
              [venueId]: 0.0,
            }))
          }
        )
        vibeUnsubscribers.push(unsubscribe)
      }
    } catch (error) {
      console.error("Error setting up vibe listeners:", error)
    }
  }

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadVenues()
    setRefreshing(false)
  }, [])

  useEffect(() => {
    // If a destination venue ID is provided, highlight it
    if (destinationVenueId && venues.length > 0) {
      const venue = venues.find((v) => v.id === destinationVenueId)
      if (venue) {
        setSelectedVenue(venue)
      }
    }
  }, [destinationVenueId, venues])

  const loadVenues = async () => {
    try {
      setLoading(true);
      
      let allVenues: any[] = [];
      let currentLastCreatedAt: string | undefined = undefined;
      let fetchCount = 0;
      const BATCH_SIZE = 5;
      const DELAY_MS = 3000;
      
      while (true) {
        fetchCount++;
        const { venues: paginatedVenues, lastCreatedAt: newLastCreatedAt } = await SupabaseService.getVenuesPaginated(BATCH_SIZE, currentLastCreatedAt);
        
        if (paginatedVenues.length === 0) {
          break;
        }
        
        allVenues = [...allVenues, ...paginatedVenues];
        currentLastCreatedAt = newLastCreatedAt ?? undefined;
        
        setVenues(allVenues);
        
        const today = new Date();
        for (const venue of paginatedVenues) {
          const vibeImages = await SupabaseService.getVibeImagesByVenueAndDate(venue.id, today);
          if (vibeImages.length > 0) {
            const latestVibe = vibeImages.reduce((latest, image) => {
              return image.uploadedAt > latest.uploadedAt ? image : latest;
            });
            setVenueVibeRatings(prev => ({ ...prev, [venue.id]: latestVibe.vibeRating || 0.0 }));
          } else {
            setVenueVibeRatings(prev => ({ ...prev, [venue.id]: 0.0 }));
          }
        }
        
        if (fetchCount === 1) {
          setLoading(false);
        }
        
        if (!newLastCreatedAt) {
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
      
      setVenues(allVenues);
      updateCache(allVenues, venueVibeRatings);
    } catch (error) {
      const errorRatings: Record<string, number> = {};
      venues.forEach((venue) => {
        errorRatings[venue.id] = 0.0;
      });
      setVenueVibeRatings(errorRatings);
    } finally {
      setLoading(false);
    }
  }

  const handleVenueSelect = (venueId: string) => {
    navigation.navigate("VenueDetail", { venueId })
  }

  const openGoogleMaps = (venue: Venue) => {
    let url: string
    
    // Prioritize using venue name for better search results
    if (venue.name && venue.location) {
      // Use venue name and location for more accurate search
      const searchQuery = encodeURIComponent(`${venue.name} ${venue.location}`)
      url = `https://www.google.com/maps/dir/?api=1&destination=${searchQuery}`
    } else if (venue.name) {
      // Use venue name only if location is not available
      const searchQuery = encodeURIComponent(venue.name)
      url = `https://www.google.com/maps/dir/?api=1&destination=${searchQuery}`
    } else if (venue.latitude && venue.longitude) {
      // Fallback to coordinates if venue name is not available
      url = `https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`
    } else {
      // Final fallback: search mode if nothing else is available
      const searchQuery = encodeURIComponent(venue.location || "Unknown Location")
      url = `https://www.google.com/maps/search/?api=1&query=${searchQuery}`
    }
    
    Linking.openURL(url)
  }

  // Memoized sorted and filtered venues
  const filteredAndSortedVenues = useMemo(() => {
    const searchTerm = searchQuery.toLowerCase().trim()
    
    // Filter venues based on search query
    let filtered = venues
    if (searchTerm) {
      filtered = venues.filter((venue) => {
        const nameMatch = venue.name?.toLowerCase().includes(searchTerm)
        const locationMatch = venue.location?.toLowerCase().includes(searchTerm)
        const categoryMatch = venue.categories?.some((cat) => 
          cat.toLowerCase().includes(searchTerm)
        )
        return nameMatch || locationMatch || categoryMatch
      })
    }
    
    // Sort by vibe rating (highest first)
    return [...filtered].sort((a, b) => {
      const aVibe = venueVibeRatings[a.id] || 0.0
      const bVibe = venueVibeRatings[b.id] || 0.0
      return bVibe - aVibe
    })
  }, [venues, venueVibeRatings, searchQuery])

  // Get venue count for display
  const venueCount = filteredAndSortedVenues.length

  return (
    <View style={styles.container}>
      {/* SEO Metadata for Map page */}
      <SEOMetadata
        title={mapSeo.title}
        description={mapSeo.description}
        keywords={mapSeo.keywords}
        type={mapSeo.type}
      />
      {/* Screen reader only heading for SEO */}
      <Text style={styles.srOnly} accessibilityRole="header">
        {mapSeo.title}
      </Text>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Venue Locations</Text>
            <Text style={styles.headerSubtitle}>
              {searchQuery 
                ? `${venueCount} venue${venueCount !== 1 ? 's' : ''} found`
                : `Here's a list of all our venues, sorted by vibe:`
              }
            </Text>
          </View>
          <TouchableOpacity 
            style={[styles.searchButton, showSearch && styles.searchButtonActive]} 
            onPress={toggleSearch}
            accessibilityRole="button"
            accessibilityLabel={showSearch ? "Close search" : "Search venues"}
            accessibilityHint="Double tap to search for venues by name or location"
          >
            <Ionicons name={showSearch ? "close" : "search"} size={22} color={showSearch ? "#FF6B6B" : "#FFFFFF"} />
          </TouchableOpacity>
        </View>
        {showSearch && (
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search venues by name or location..."
              placeholderTextColor="#888888"
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              accessibilityLabel="Search input"
              accessibilityHint="Type venue name or location to filter results"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity 
                style={styles.searchClearButton}
                onPress={() => setSearchQuery("")}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={20} color="#666666" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading venues...</Text>
        </View>
      ) : venues.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={64} color="#666666" />
          <Text style={styles.emptyText}>No venues found</Text>
        </View>
      ) : (
<ScrollView
          ref={scrollRef}
          style={styles.venueList}
          contentContainerStyle={isDesktop ? styles.venueGrid : undefined}
          onContentSizeChange={onContentSizeChange}
          onScroll={onScroll}
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
          {filteredAndSortedVenues.map((venue) => (
            <View key={venue?.id || venue?.slug || `map-venue-${Math.random()}`} style={[styles.venueCard, isDesktop && styles.venueCardDesktop, selectedVenue?.id === venue.id && styles.selectedVenueCard]}>
              <View style={styles.venueCardRow}>
                <View style={styles.venueInfo}>
                  <Text style={styles.venueName}>{venue.name}</Text>
                  <Text style={styles.venueAddress}>{venue.location}</Text>
                  <Text style={styles.venueCategories}>
                    {venue.categories && venue.categories.length > 0 ? venue.categories.join(", ") : "Other"}
                  </Text>
                  <View style={styles.vibeRatingContainer}>
                    <Text style={styles.vibeRatingLabel}>Current Vibe: </Text>
                    <Text
                      style={[
                        styles.vibeRatingValue,
                        { color: VibeAnalysisService.getVibeColor(venueVibeRatings[venue.id] || 0.0) },
                      ]}
                    >
                      {(venueVibeRatings[venue.id] || 0.0).toFixed(1)}
                    </Text>
                    <Text style={styles.vibeRatingDescription}>
                      {" "}
                      - {VibeAnalysisService.getVibeDescription(venueVibeRatings[venue.id] || 0.0)}
                    </Text>
                  </View>
                </View>
                <View style={styles.venueActions}>
                  <TouchableOpacity style={styles.actionButton} onPress={() => handleVenueSelect(venue.slug || venue.id)}>
                    <Ionicons name="information-circle" size={16} color="#2196F3" />
                    <Text style={styles.actionText}>Details</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton} onPress={() => openGoogleMaps(venue)}>
                    <Ionicons name="navigate" size={16} color="#2196F3" />
                    <Text style={styles.actionText}>Directions</Text>
                  </TouchableOpacity>
                </View>
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
  // Screen reader only style for SEO
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    opacity: 0.001,
    zIndex: -1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerTextContainer: {
    flex: 1,
    marginRight: 12,
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
  searchButton: {
    padding: 10,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  searchButtonActive: {
    backgroundColor: "rgba(255, 107, 107, 0.2)",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 30, 30, 0.95)",
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(33, 150, 243, 0.3)",
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    height: 44,
    color: "#FFFFFF",
    fontSize: 15,
    paddingVertical: 0,
  },
  searchClearButton: {
    padding: 6,
    justifyContent: "center",
    alignItems: "center",
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
    padding: 8,
  },
  venueGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  venueCard: {
    backgroundColor: "#1E1E1E",
    borderRadius: 6,
    padding: 8,
    marginBottom: 5,
  },
  venueCardDesktop: {
    width: "49%",
    marginBottom: 6,
  },
  venueCardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectedVenueCard: {
    backgroundColor: "#2a2a2a",
    borderWidth: 1,
    borderColor: "#2196F3",
  },
  venueInfo: {
    flex: 1,
    marginBottom: 6,
  },
  venueName: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  venueAddress: {
    fontSize: 11,
    color: "#BBBBBB",
    marginBottom: 2,
  },
  venueCategories: {
    fontSize: 11,
    color: "#2196F3",
    marginBottom: 4,
  },
  vibeRatingContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  vibeRatingLabel: {
    fontSize: 11,
    color: "#BBBBBB",
  },
  vibeRatingValue: {
    fontSize: 11,
    fontWeight: "bold",
  },
  vibeRatingDescription: {
    fontSize: 10,
    color: "#BBBBBB",
  },
  venueActions: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
    gap: 4,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  actionText: {
    color: "#2196F3",
    marginLeft: 3,
    fontSize: 10,
  },
})

export default MapScreen
