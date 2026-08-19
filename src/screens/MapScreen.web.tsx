"use client"

import type React from "react"
import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, RefreshControl, TextInput, ActivityIndicator } from "react-native"
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
import { useDeviceType, COLORS } from "../utils/ResponsiveDesign"

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

// Traffic-light vibe colouring shared across the map and lists.
function vibeColor(rating: number): string {
  return rating >= 4 ? "#4CAF50" : rating >= 3 ? "#FFC107" : "#F44336"
}

// Venues are identified by `slug` (the venues table PK). `id` is often
// undefined, so never compare bare `id` fields.
const venueKey = (v?: { id?: string; slug?: string } | null) => (v?.slug || v?.id || "")

const sameVenue = (
  a?: { id?: string; slug?: string } | null,
  b?: { id?: string; slug?: string } | null,
) => !!a && !!b && venueKey(a) === venueKey(b)

const MapScreen: React.FC<MapScreenProps> = ({ navigation, route }) => {
  console.log('[MapScreen.web] 🏗️ RENDER/MOUNT');
  // SEO Metadata for Map page
  const mapSeo = SCREEN_SEO.map;
  const isFocused = useIsFocused();
  
  const { onScroll, onContentSizeChange, restorePosition, scrollRef } = useMapScroll();

  // Detect desktop viewport (>=1024px)
  const { isLargeScreen: isDesktop } = useDeviceType();

  // ─── Initialise state from cache if available ─────────────────
  const [venues, setVenues] = useState<Venue[]>(() => isCacheValid() ? mapCache!.venues : []);
  const [loading, setLoading] = useState(() => !isCacheValid());
  const [refreshing, setRefreshing] = useState(false)
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [venueVibeRatings, setVenueVibeRatings] = useState<Record<string, number>>(() => isCacheValid() ? mapCache!.vibeRatings : {})
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [showList, setShowList] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [lastCreatedAt, setLastCreatedAt] = useState<string | undefined>(undefined)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadingMoreRef = useRef(false)
  const hasMoreRef = useRef(true)
  const lastCreatedAtRef = useRef<string | undefined>(undefined)
  const autoLoadAllRef = useRef(false)

  // Keep refs in sync so the auto-load loop always reads fresh state.
  useEffect(() => {
    hasMoreRef.current = hasMore
  }, [hasMore])
  useEffect(() => {
    lastCreatedAtRef.current = lastCreatedAt
  }, [lastCreatedAt])

  // ─── Hydrate once from cache on first mount (if cached) ────────
  const initialisedRef = useRef(false);
  useEffect(() => {
    if (!initialisedRef.current && isCacheValid() && mapCache) {
      console.log('[MapScreen.web] 💾 Hydrating from module-level cache, venue count:', mapCache.venues.length);
      setVenues(mapCache.venues);
      setVenueVibeRatings(mapCache.vibeRatings);
      setHasMore(false);
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

    // Cache invalid or empty — load fresh, then auto-load every remaining
    // batch so the full venue list is available without scrolling.
    loadVenues({ reset: true }).then(() => {
      autoLoadAll()
    });

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

  useEffect(() => {
    // If a destination venue ID is provided, highlight it
    if (destinationVenueId && venues.length > 0) {
      const venue = venues.find((v) => v.id === destinationVenueId || v.slug === destinationVenueId)
      if (venue) {
        setSelectedVenue(venue)
      }
    }
  }, [destinationVenueId, venues])

  const loadVenues = useCallback(async (opts?: { reset?: boolean }): Promise<boolean> => {
    const reset = opts?.reset ?? false
    const BATCH_SIZE = 25
    if (reset) {
      setLoading(true)
    } else {
      // Another load is already in flight (or nothing left) — signal "continue"
      // so an auto-load loop doesn't stop because a scroll-triggered load won.
      if (loadingMoreRef.current || !hasMoreRef.current) return true
      loadingMoreRef.current = true
      setLoadingMore(true)
    }
    try {
      const cursor = reset ? undefined : lastCreatedAtRef.current
      const { venues: batch, lastCreatedAt: newLastCreatedAt } = await SupabaseService.getVenuesPaginated(BATCH_SIZE, cursor);

      setVenues((prev) => (reset ? batch : [...prev, ...batch]));
      setLastCreatedAt(newLastCreatedAt ?? undefined);
      lastCreatedAtRef.current = newLastCreatedAt ?? undefined;

      // Stop if the cursor didn't advance (protects against infinite loops
      // caused by duplicate created_at values).
      const advanced = !!reset || (!!newLastCreatedAt && newLastCreatedAt !== cursor)
      const more = advanced && !!newLastCreatedAt && batch.length > 0
      setHasMore(more);
      hasMoreRef.current = more;

      const today = new Date();
      for (const venue of batch) {
        try {
          const vibeImages = await SupabaseService.getVibeImagesByVenueAndDate(venue.id, today);
          if (vibeImages.length > 0) {
            const latestVibe = vibeImages.reduce((latest, image) => {
              return image.uploadedAt > latest.uploadedAt ? image : latest;
            });
            setVenueVibeRatings(prev => ({ ...prev, [venue.id]: latestVibe.vibeRating || 0.0 }));
          } else {
            setVenueVibeRatings(prev => ({ ...prev, [venue.id]: 0.0 }));
          }
        } catch {
          setVenueVibeRatings(prev => ({ ...prev, [venue.id]: 0.0 }));
        }
      }
      return true
    } catch (error) {
      console.error("[MapScreen.web] Error loading venues:", error);
      return false
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, []);

  // Load the next page (resolves true when a batch was fetched).
  const loadMore = useCallback(() => {
    return loadVenues({ reset: false })
  }, [loadVenues])

  // Load every remaining page back-to-back, without needing to scroll.
  const autoLoadAll = useCallback(async () => {
    if (autoLoadAllRef.current) return
    autoLoadAllRef.current = true
    try {
      // Small pause between batches so we don't hammer the API.
      while (hasMoreRef.current) {
        const ok = await loadMore()
        if (!ok) break
        await new Promise((resolve) => setTimeout(resolve, 350))
      }
    } finally {
      autoLoadAllRef.current = false
    }
  }, [loadMore])

  // Pull-to-refresh handler — reloads everything, including all batches.
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadVenues({ reset: true })
    await autoLoadAll()
    setRefreshing(false)
  }, [loadVenues, autoLoadAll])

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

  // ─── Real map (Leaflet iframe) bridge ──────────────────────────
  const mapIframeRef = useRef<HTMLIFrameElement | null>(null)

  const postToMap = (msg: any) => {
    const win = mapIframeRef.current?.contentWindow
    if (win) win.postMessage(msg, "*")
  }

  const mapVenuesPayload = () => ({
    type: "venues",
    venues: venues.map((v) => ({
      id: venueKey(v),
      name: v.name,
      lat: v.latitude ?? v.coordinates?.latitude,
      lng: v.longitude ?? v.coordinates?.longitude,
    })),
  })

  // Push venue markers whenever the loaded list changes.
  useEffect(() => {
    const withCoords = venues.filter((v) =>
      v.latitude != null || v.coordinates?.latitude != null).length
    console.log(`[MapScreen.web] posting ${venues.length} venues to map (${withCoords} with coords)`)
    postToMap(mapVenuesPayload())
  }, [venues])

  // Highlight the selected venue on the map (or clear it when null).
  useEffect(() => {
    postToMap({ type: "select", id: selectedVenue ? venueKey(selectedVenue) : null })
  }, [selectedVenue])

  // Listen for messages from the map iframe: marker clicks and readiness.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const d = e.data || {}
      if (d.type === "venue-select") {
        const venue = venues.find((v) => venueKey(v) === d.id)
        if (venue) setSelectedVenue(venue)
      } else if (d.type === "map-ready") {
        // The map just finished booting — push the current venues + selection
        // so markers render even if earlier posts were dropped by the iframe.
        postToMap(mapVenuesPayload())
        postToMap({ type: "select", id: selectedVenue ? venueKey(selectedVenue) : null })
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [venues, selectedVenue])

  const handleMapLoad = () => {
    postToMap(mapVenuesPayload())
    postToMap({ type: "select", id: selectedVenue ? venueKey(selectedVenue) : null })
  }

  // ─── Scroll → load more ────────────────────────────────────────
  // Resolve the underlying scrollable DOM element on web so we can read
  // scrollTop/scrollHeight reliably (RNW scroll events often omit
  // contentSize/layoutMeasurement, which breaks the usual threshold check).
  const getScrollNode = () => {
    const sc = scrollRef.current as any
    if (!sc) return null
    if (typeof sc.getScrollableNode === "function") return sc.getScrollableNode()
    if (sc._listRef?._scrollRef && typeof sc._listRef._scrollRef.getScrollableNode === "function") {
      return sc._listRef._scrollRef.getScrollableNode()
    }
    if (typeof sc.getScrollResponder === "function") {
      const responder = sc.getScrollResponder()
      if (responder && typeof responder.getScrollableNode === "function") return responder.getScrollableNode()
    }
    return sc._node || sc._scrollNodeRef || null
  }

  const maybeLoadMore = () => {
    if (loadingMoreRef.current || !hasMore) return
    const node = getScrollNode()
    if (node && node.scrollHeight && node.clientHeight &&
        node.scrollTop + node.clientHeight >= node.scrollHeight - 200) {
      loadMore()
    }
  }

  const handleListScroll = (event: any) => {
    onScroll(event)
    maybeLoadMore()
  }

  const handleListContentSize = (w?: number, h?: number) => {
    onContentSizeChange(w, h)
    // If the loaded items don't fill the viewport, keep fetching until they
    // do (or until there are no more), so all venues load even without scrolling.
    const node = getScrollNode()
    if (node && node.scrollHeight && node.clientHeight &&
        node.scrollHeight <= node.clientHeight + 5 && hasMore && !loadingMore) {
      loadMore()
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: COLORS.background }]}>
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

      {isDesktop ? (
        <View style={styles.desktopMapContainer}>
          <View style={styles.desktopSidebar}>
            <View style={styles.header}>
              <View style={styles.headerTop}>
                <View style={styles.headerTextContainer}>
                  <Text style={styles.headerTitle}>Venue Locations</Text>
                  <Text style={styles.headerSubtitle}>
                    {searchQuery 
                      ? `${venueCount} venue${venueCount !== 1 ? 's' : ''} found`
                      : `Here's all our venues, sorted by vibe:`
                    }
                  </Text>
                </View>
                <TouchableOpacity 
                  style={[styles.searchButton, showSearch && styles.searchButtonActive]} 
                  onPress={toggleSearch}
                  accessibilityRole="button"
                  accessibilityLabel={showSearch ? "Close search" : "Search venues"}
                >
                  <Ionicons name={showSearch ? "close" : "search"} size={22} color={showSearch ? "#FF6B6B" : "#FFFFFF"} />
                </TouchableOpacity>
              </View>
              {showSearch && (
                <View style={styles.searchContainer}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search venues by name..."
                    placeholderTextColor="#888888"
                    value={searchQuery}
                    onChangeText={handleSearchChange}
                    autoFocus
                    autoCorrect={false}
                    autoCapitalize="none"
                    returnKeyType="search"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity 
                      style={styles.searchClearButton}
                      onPress={() => setSearchQuery("")}
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
                showsVerticalScrollIndicator={false}
                onContentSizeChange={handleListContentSize}
                onScroll={handleListScroll}
                scrollEventThrottle={16}
              >
                {filteredAndSortedVenues.map((venue, index) => {
                  const venueId = venue.id || venue.slug || `desktop-venue-${index}`;
                  return (
                    <TouchableOpacity
                      key={venueId}
                      style={[
                        styles.venueCard, 
                        styles.venueCardDesktopFull,
                        sameVenue(selectedVenue, venue) && styles.selectedVenueCard
                      ]}
                      onPress={() => handleVenueSelect(venue.slug || venue.id)}
                    >
                      <View style={styles.venueCardRow}>
                        <View style={styles.venueInfo}>
                          <Text style={styles.venueName}>{venue.name}</Text>
                          <Text style={styles.venueAddress}>{venue.location}</Text>
                          <Text style={styles.venueCategories}>{venue.categories.join(", ")}</Text>
                          <View style={styles.vibeRatingContainer}>
                            <Text style={styles.vibeRatingLabel}>Vibe: </Text>
                            <Text style={[styles.vibeRatingValue, { color: (venueVibeRatings[venue.id] ?? venue.vibeRating) >= 4 ? "#4CAF50" : (venueVibeRatings[venue.id] ?? venue.vibeRating) >= 3 ? "#FFC107" : "#F44336" }]}>
                              {(venueVibeRatings[venue.id] ?? venue.vibeRating).toFixed(1)}
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
                    </TouchableOpacity>
                  );
                })}
                {loadingMore && (
                  <View style={styles.listFooter}>
                    <ActivityIndicator size="small" color="#22d3ee" />
                    <Text style={styles.listFooterText}>Loading more venues…</Text>
                  </View>
                )}
                {hasMore && !loadingMore && venues.length > 0 && (
                  <TouchableOpacity style={styles.loadMoreButton} onPress={loadMore}>
                    <Text style={styles.loadMoreButtonText}>Load more venues</Text>
                  </TouchableOpacity>
                )}
                {!hasMore && venues.length > 0 && (
                  <View style={styles.listFooter}>
                    <Text style={styles.listFooterText}>All venues loaded</Text>
                  </View>
                )}
              </ScrollView>
            )}
            </View>
            <View style={styles.desktopMapViewport}>
              <iframe
                ref={mapIframeRef}
                src="/map.html"
                title="Venue map"
                style={{ width: "100%", height: "100%", border: "none", background: "#0a0a12" } as any}
                onLoad={handleMapLoad}
              />
              {selectedVenue ? (
                <View style={styles.mapHudCard}>
                  <View pointerEvents="none" style={styles.hudGlow} />
                  <TouchableOpacity
                    style={styles.hudCloseBtn}
                    onPress={() => setSelectedVenue(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Close venue details"
                  >
                    <Ionicons name="close" size={18} color="#8b8b9e" />
                  </TouchableOpacity>
                  <Text style={styles.hudEyebrow}>SELECTED VENUE</Text>
                  <Text style={styles.hudTitle}>{selectedVenue.name}</Text>
                  <Text style={styles.hudAddress}>{selectedVenue.location}</Text>
                  <View style={styles.hudVibeRow}>
                    <Text style={styles.hudVibeLabel}>Live Vibe: </Text>
                    <Text style={[styles.hudVibeValue, { color: vibeColor(venueVibeRatings[selectedVenue.id] ?? selectedVenue.vibeRating) }]}>
                      {(venueVibeRatings[selectedVenue.id] ?? selectedVenue.vibeRating).toFixed(1)}
                    </Text>
                  </View>
                  <View style={styles.hudButtonsRow}>
                    <TouchableOpacity style={styles.hudDirectionsBtn} onPress={() => openGoogleMaps(selectedVenue)}>
                      <Ionicons name="navigate" size={15} color="#03121a" />
                      <Text style={styles.hudDirectionsText}>Directions</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.hudButton} onPress={() => handleVenueSelect(selectedVenue.slug || selectedVenue.id)}>
                      <Text style={styles.hudButtonText}>View Details</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.mapHudHint}>
                  <Ionicons name="map-outline" size={20} color="#22d3ee" />
                  <Text style={styles.mapHudHintText}>Select a venue to see its live vibe and directions</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.mobileContainer}>
            {/* Full-screen map is the default mobile view */}
            <View style={styles.mobileMapWrap}>
              <iframe
                ref={mapIframeRef}
                src="/map.html"
                title="Venue map"
                style={{ width: "100%", height: "100%", border: "none", background: "#0a0a12" } as any}
                onLoad={handleMapLoad}
              />
              {selectedVenue ? (
                <View style={styles.mapHudCard}>
                  <View pointerEvents="none" style={styles.hudGlow} />
                  <TouchableOpacity
                    style={styles.hudCloseBtn}
                    onPress={() => setSelectedVenue(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Close venue details"
                  >
                    <Ionicons name="close" size={18} color="#8b8b9e" />
                  </TouchableOpacity>
                  <Text style={styles.hudEyebrow}>SELECTED VENUE</Text>
                  <Text style={styles.hudTitle}>{selectedVenue.name}</Text>
                  <Text style={styles.hudAddress}>{selectedVenue.location}</Text>
                  <View style={styles.hudVibeRow}>
                    <Text style={styles.hudVibeLabel}>Live Vibe: </Text>
                    <Text style={[styles.hudVibeValue, { color: vibeColor(venueVibeRatings[selectedVenue.id] ?? selectedVenue.vibeRating) }]}>
                      {(venueVibeRatings[selectedVenue.id] ?? selectedVenue.vibeRating).toFixed(1)}
                    </Text>
                  </View>
                  <View style={styles.hudButtonsRow}>
                    <TouchableOpacity style={styles.hudDirectionsBtn} onPress={() => openGoogleMaps(selectedVenue)}>
                      <Ionicons name="navigate" size={15} color="#03121a" />
                      <Text style={styles.hudDirectionsText}>Directions</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.hudButton} onPress={() => handleVenueSelect(selectedVenue.slug || selectedVenue.id)}>
                      <Text style={styles.hudButtonText}>View Details</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.mapHudHint}>
                  <Ionicons name="map-outline" size={20} color="#22d3ee" />
                  <Text style={styles.mapHudHintText}>Select a venue to see its live vibe and directions</Text>
                </View>
              )}
            </View>

            {/* Toggle button (top-right) to overlay the list */}
            <TouchableOpacity
              style={[styles.mobileToggleBtn, showList && styles.mobileToggleBtnActive]}
              onPress={() => setShowList((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel={showList ? "Close venue list" : "Show venue list"}
            >
              <Ionicons name={showList ? "close" : "list"} size={20} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Overlay list on top of the map */}
            {showList && (
              <View style={styles.mobileListOverlay}>
                <View style={styles.header}>
                  <View style={[styles.headerTop, { paddingRight: 52 }]}>
                    <View style={styles.headerTextContainer}>
                      <Text style={styles.headerTitle}>Venue Locations</Text>
                      <Text style={styles.headerSubtitle}>
                        {searchQuery 
                          ? `${venueCount} venue${venueCount !== 1 ? 's' : ''} found`
                          : `Here's all our venues, sorted by vibe:`
                        }
                      </Text>
                    </View>
                    <TouchableOpacity 
                      style={[styles.searchButton, showSearch && styles.searchButtonActive]} 
                      onPress={toggleSearch}
                      accessibilityRole="button"
                      accessibilityLabel={showSearch ? "Close search" : "Search venues"}
                    >
                      <Ionicons name={showSearch ? "close" : "search"} size={22} color={showSearch ? "#FF6B6B" : "#FFFFFF"} />
                    </TouchableOpacity>
                  </View>
                  {showSearch && (
                    <View style={styles.searchContainer}>
                      <TextInput
                        style={styles.searchInput}
                        placeholder="Search venues by name..."
                        placeholderTextColor="#888888"
                        value={searchQuery}
                        onChangeText={handleSearchChange}
                        autoFocus
                        autoCorrect={false}
                        autoCapitalize="none"
                        returnKeyType="search"
                      />
                      {searchQuery.length > 0 && (
                        <TouchableOpacity 
                          style={styles.searchClearButton}
                          onPress={() => setSearchQuery("")}
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
                    showsVerticalScrollIndicator={false}
                    onContentSizeChange={handleListContentSize}
                    onScroll={handleListScroll}
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
                    {filteredAndSortedVenues.map((venue, index) => {
                      const venueId = venue.id || venue.slug || `mobile-venue-${index}`
                      return (
                        <TouchableOpacity
                          key={venueId}
                          style={[
                            styles.venueCard,
                            sameVenue(selectedVenue, venue) && styles.selectedVenueCard,
                          ]}
                          onPress={() => {
                            setSelectedVenue(venue)
                            setShowList(false)
                          }}
                        >
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
                                    { color: (venueVibeRatings[venue.id] ?? venue.vibeRating) >= 4 ? "#4CAF50" : (venueVibeRatings[venue.id] ?? venue.vibeRating) >= 3 ? "#FFC107" : "#F44336" },
                                  ]}
                                >
                                  {(venueVibeRatings[venue.id] ?? venue.vibeRating).toFixed(1)}
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
                        </TouchableOpacity>
                      )
                    })}
                    {loadingMore && (
                      <View style={styles.listFooter}>
                        <ActivityIndicator size="small" color="#22d3ee" />
                        <Text style={styles.listFooterText}>Loading more venues…</Text>
                      </View>
                    )}
                    {hasMore && !loadingMore && venues.length > 0 && (
                      <TouchableOpacity style={styles.loadMoreButton} onPress={loadMore}>
                        <Text style={styles.loadMoreButtonText}>Load more venues</Text>
                      </TouchableOpacity>
                    )}
                    {!hasMore && venues.length > 0 && (
                      <View style={styles.listFooter}>
                        <Text style={styles.listFooterText}>All venues loaded</Text>
                      </View>
                    )}
                  </ScrollView>
                )}
              </View>
            )}
          </View>
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
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "rgba(18, 18, 26, 0.5)",
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
    backgroundColor: "rgba(30, 30, 30, 0.6)",
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
  desktopMapContainer: {
    flexDirection: "row",
    flex: 1,
    height: "100%",
  },
  desktopSidebar: {
    width: "30%",
    height: "100%",
    backgroundColor: "rgba(10, 12, 22, 0.6)",
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 255, 255, 0.08)",
  },
  desktopMapViewport: {
    width: "70%",
    height: "100%",
    backgroundColor: "#050508",
    position: "relative",
    overflow: "hidden",
  },
  mobileContainer: {
    flex: 1,
    backgroundColor: "#050508",
    position: "relative",
  },
  mobileMapWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  mobileToggleBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 40,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(18, 18, 26, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(34, 211, 238, 0.4)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 5,
  },
  mobileToggleBtnActive: {
    backgroundColor: "rgba(34, 211, 238, 0.25)",
    borderColor: "#22d3ee",
  },
  mobileListOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    backgroundColor: "rgba(10, 12, 22, 0.72)",
  },
  mapHudCard: {
    position: "absolute",
    bottom: 24,
    left: 24,
    right: 24,
    backgroundColor: "rgba(10, 12, 22, 0.85)",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(34, 211, 238, 0.35)",
    shadowColor: "#22d3ee",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
    overflow: "hidden",
  },
  hudGlow: {
    position: "absolute",
    top: -60,
    right: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "transparent",
    shadowColor: "#22d3ee",
    shadowOpacity: 0.25,
    shadowRadius: 90,
    elevation: 0,
  },
  hudCloseBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    zIndex: 30,
  },
  hudEyebrow: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: "#22d3ee",
    fontWeight: "bold",
    marginBottom: 6,
    paddingRight: 32,
  },
  hudTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
    paddingRight: 32,
  },
  hudAddress: {
    fontSize: 13,
    color: "#BBBBBB",
    marginBottom: 10,
  },
  hudVibeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  hudVibeLabel: {
    fontSize: 13,
    color: "#888888",
  },
  hudVibeValue: {
    fontSize: 13,
    fontWeight: "bold",
  },
  hudButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  hudDirectionsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#22d3ee",
    shadowColor: "#22d3ee",
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 5,
  },
  hudDirectionsText: {
    color: "#03121a",
    fontSize: 12,
    fontWeight: "bold",
  },
  hudButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  hudButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  mapHudHint: {
    position: "absolute",
    bottom: 24,
    left: 24,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(18, 18, 26, 0.7)",
    borderWidth: 1,
    borderColor: "rgba(34, 211, 238, 0.2)",
  },
  mapHudHintText: {
    color: "#a5a5b8",
    fontSize: 13,
    flex: 1,
  },
  venueCardDesktopFull: {
    width: "100%",
  },
  listFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  listFooterText: {
    color: "#8b8b9e",
    fontSize: 12,
  },
  loadMoreButton: {
    marginVertical: 12,
    marginHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(34, 211, 238, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(34, 211, 238, 0.4)",
  },
  loadMoreButtonText: {
    color: "#22d3ee",
    fontSize: 13,
    fontWeight: "bold",
  },
})

export default MapScreen
