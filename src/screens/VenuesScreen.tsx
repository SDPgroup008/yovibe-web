"use client";

import type React from "react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ImageBackground, ActivityIndicator, RefreshControl, Dimensions, TextInput } from "react-native";
import { useIsFocused } from "../utils/compatNavigation";
import { useCompatNavigation } from "../utils/compatNavigation";
import { useCachedVenues } from "../hooks/useDataCache";
import { useVenuesScroll } from "../hooks/useScrollPersistence";
import type { Venue } from "../models/Venue";
import VibeAnalysisService from "../services/VibeAnalysisService";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { SEOMetadata, SCREEN_SEO } from "../components/SEOMetadata";

// Responsive design hooks
import { useGridColumns, useLayoutDimensions, useTypography, useSpacing, useDeviceType, BREAKPOINTS } from "../utils/ResponsiveDesign";

interface VenuesScreenProps {
  navigation: any;
}

// Static responsive function for StyleSheet - uses current dimensions
const responsiveSize = (mobile: number, tablet: number, desktop: number): number => {
  const { width } = Dimensions.get('window');
  if (width >= BREAKPOINTS.LARGE_TABLET) return desktop;
  if (width >= BREAKPOINTS.TABLET) return tablet;
  return mobile;
};

type VenuesScreenPropsInternal = {
  initialSearchQuery?: string;
};

const VenuesScreen: React.FC<VenuesScreenPropsInternal> = ({ initialSearchQuery = "" }) => {
  const navigation = useCompatNavigation()
  const { data: venues = [], loading, refetch } = useCachedVenues()
  const { onScroll, restorePosition, scrollRef } = useVenuesScroll()
  // SEO Metadata for Venues page
  const venueSeo = SCREEN_SEO.venues;
  const seoUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}`
      : "https://yovibe.net/venues";

  // Get responsive values using hooks
  const gridColumns = useGridColumns();
  const layout = useLayoutDimensions();
  const typography = useTypography();
  const spacing = useSpacing();
  const deviceType = useDeviceType();

  // Memoize card dimensions to prevent recalculation on every render
  const { cardWidth, cardHeight } = useMemo(() => {
    const width = (layout.width - (spacing.md * (gridColumns + 1))) / gridColumns;
    const height = deviceType.isLargeScreen ? layout.imageHeight.small : layout.imageHeight.medium;
    return { cardWidth: width, cardHeight: height };
  }, [layout.width, layout.imageHeight, spacing.md, gridColumns, deviceType.isLargeScreen]);

  const { user, setRedirectIntent } = useAuth();
  const isFocused = useIsFocused();

  // Restore scroll position when screen regains focus
  useEffect(() => {
    if (isFocused) {
      restorePosition();
    }
  }, [isFocused]);

  const [refreshing, setRefreshing] = useState(false);
  const [venueVibeRatings, setVenueVibeRatings] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<"all" | "nightlife" | "recreation">("all");
  const [displayedVenues, setDisplayedVenues] = useState<Venue[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  useEffect(() => {
    const normalized = initialSearchQuery.trim();
    if (!normalized) return;

    setSearchQuery(normalized);
    setShowSearch(true);
  }, [initialSearchQuery]);


  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search handler for performance
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    
    // Debounce: clear previous timeout and set new one
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      // Search is applied in real-time via the memoized filteredVenues
    }, 300);
  }, []);

  // Toggle search visibility
  const toggleSearch = useCallback(() => {
    setShowSearch(prev => !prev);
    if (showSearch) {
      setSearchQuery("");
    }
  }, [showSearch]);


  // Update displayed venues when data changes
  useEffect(() => {
    if (venues) {
      setDisplayedVenues(venues);
    }
  }, [venues]);





  const handleVenueSelect = (venueId: string) => {
    navigation.navigate("VenueDetail", { venueId });
  };

  const getFilteredVenues = () => {
    // Handle search query filtering
    const searchTerm = searchQuery.toLowerCase().trim();

    // Ensure venues is always an array
    const venuesArray = venues || [];

    // Handle "all" tab - return all venues without filtering
    if (activeTab === "all") {
      let filtered = venuesArray;

      // Apply search filter if search term exists
      if (searchTerm) {
        filtered = venuesArray.filter((venue) => {
          const nameMatch = venue.name?.toLowerCase().includes(searchTerm);
          const locationMatch = venue.location?.toLowerCase().includes(searchTerm);
          const categoryMatch = venue.categories?.some((cat) => 
            cat.toLowerCase().includes(searchTerm)
          );
          return nameMatch || locationMatch || categoryMatch;
        });
      }
      
      const sorted = [...filtered].sort((a, b) => {
        const aVibe = venueVibeRatings[a.id] || 0.0;
        const bVibe = venueVibeRatings[b.id] || 0.0;
        return bVibe - aVibe;
      });
      return sorted;
    }
    
    let nightlifeCount = 0
    let recreationCount = 0
    let noCategoryCount = 0

    const filtered = venuesArray.filter((venue) => {
      const venueName = venue.name || "Unnamed"
      const categories = venue.categories || []
      
      // Safety check: ensure categories exists and is an array, fallback to "Other"
      if (!venue.categories || !Array.isArray(venue.categories) || venue.categories.length === 0) {
        noCategoryCount++
        const included = activeTab === "recreation"
        return included;
      }
      
      const isNightlife = venue.categories.some((cat) =>
        ["nightclub", "bar", "club", "lounge", "pub", "disco"].includes(cat.toLowerCase())
      );
      
      if (isNightlife) {
        nightlifeCount++
        return activeTab === "nightlife";
      } else {
        recreationCount++
        return activeTab === "recreation";
      }
    });

    // Apply search filter to the tab-filtered results
    let searchFiltered = filtered;
    if (searchTerm) {
      searchFiltered = filtered.filter((venue) => {
        const nameMatch = venue.name?.toLowerCase().includes(searchTerm);
        const locationMatch = venue.location?.toLowerCase().includes(searchTerm);
        const categoryMatch = venue.categories?.some((cat) => 
          cat.toLowerCase().includes(searchTerm)
        );
        return nameMatch || locationMatch || categoryMatch;
      });
    }
    
    // Sort by current vibe rating (highest first)
    const sorted = searchFiltered.sort((a, b) => {
      const aVibe = venueVibeRatings[a.id] || 0.0;
      const bVibe = venueVibeRatings[b.id] || 0.0;
      return bVibe - aVibe;
    });
    
    return sorted;
  };

  // Memoize filtered and sorted venues to prevent recalculation on every render
  // Only recalculate when venues, activeTab, or searchQuery changes
  const filteredVenues = useMemo(() => getFilteredVenues(), [venues, activeTab, searchQuery]);

  useEffect(() => {
    const venuesToDisplay = Array.isArray(filteredVenues) ? filteredVenues : [];
    setDisplayedVenues(venuesToDisplay);
  }, [filteredVenues]);



  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch(); // Force refresh cached data
    setRefreshing(false);
  }, [refetch]);

  // Memoize renderVenueCard to prevent recreation on every render
  const renderVenueCard = useCallback(({ item }: { item: Venue }) => {
    return (
    <TouchableOpacity 
      style={[styles.venueCard, { width: cardWidth, paddingHorizontal: spacing.md }]}
      onPress={() => handleVenueSelect(item.slug || item.id)}
      accessibilityLabel={`View venue: ${item.name}`}
      accessibilityRole="button"
    >
      <ImageBackground 
        source={{ uri: item.backgroundImageUrl }} 
        style={[styles.venueImage, { width: cardWidth, height: cardHeight }]}
        resizeMode="cover"
        accessibilityLabel={`Venue image for ${item.name}`}
      >
        <View style={styles.venueGradient}>
          <Text style={styles.venueName}>{item.name}</Text>
          <Text style={styles.venueInfo}>
            {item.categories && item.categories.length > 0 ? item.categories.join(", ") : "Other"}
          </Text>
          <View style={styles.vibeRatingContainer}>
            <Text style={styles.vibeRatingLabel}>Current Vibe: </Text>
            <Text
              style={[styles.vibeRatingValue, { color: VibeAnalysisService.getVibeColor(venueVibeRatings[item.id] || 0.0) }]}
            >
              {(venueVibeRatings[item.id] || 0.0).toFixed(1)}
            </Text>
            <Text style={styles.vibeRatingDescription}>
              {" "}
              - {VibeAnalysisService.getVibeDescription(venueVibeRatings[item.id] || 0.0)}
            </Text>
          </View>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );
  }, [cardWidth, cardHeight, spacing.md, venueVibeRatings]);

  /**
   * handleAddVenue
   *
   * Soft-auth behavior:
   * - If user is not authenticated: save redirect intent and open Login (Auth stack).
   * - If user is authenticated and NOT a 'user' (i.e., club_owner or admin): navigate to AddVenue.
   * - If user is authenticated and a 'user': do nothing (button is hidden for 'user').
   */
  const handleAddVenue = () => {
    if (!user) {
      try {
        setRedirectIntent({
          routeName: "AddVenue",
          params: {},
        });
      } catch (err) {
        console.warn("Failed to set redirect intent:", err);
      }

      // Navigate to Auth -> Login
      ;(navigation as any).navigate("Auth", { screen: "Login" });
      return;
    }

    // If logged in as a regular 'user', do nothing (button should be hidden)
    if (user.userType === "regular_user") {
      return;
    }

    // Authenticated and allowed (club_owner or admin) -> open AddVenue
    navigation.navigate('/profile/add-venue');
  };

  return (
    <View style={[
      styles.container, 
      activeTab === "recreation" && styles.recreationContainer
    ]}>
      {/* SEO Metadata for Venues page */}
      <SEOMetadata
        title={venueSeo.title}
        description={venueSeo.description}
        keywords={venueSeo.keywords}
        type={venueSeo.type}
        url={seoUrl}
      />
      {/* Screen reader only heading for SEO */}
      <Text style={styles.srOnly} accessibilityRole="header">
        {venueSeo.title}
      </Text>
      <View style={styles.header}>
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "all" && styles.activeTab]}
            onPress={() => setActiveTab("all")}
            accessibilityRole="button"
            accessibilityLabel="All venues"
            accessibilityState={{ selected: activeTab === "all" }}
          >
            <Text style={[styles.tabText, activeTab === "all" && styles.activeTabText]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "nightlife" && styles.activeTab]}
            onPress={() => setActiveTab("nightlife")}
            accessibilityRole="button"
            accessibilityLabel="Night clubs"
            accessibilityState={{ selected: activeTab === "nightlife" }}
          >
            <Text style={[styles.tabText, activeTab === "nightlife" && styles.activeTabText]}>Night Clubs</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "recreation" && styles.activeTab]}
            onPress={() => setActiveTab("recreation")}
            accessibilityRole="button"
            accessibilityLabel="Recreation centers"
            accessibilityState={{ selected: activeTab === "recreation" }}
          >
            <Text style={[styles.tabText, activeTab === "recreation" && styles.activeTabText]}>Recreation Centers</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.searchButton, showSearch && styles.searchButtonActive]} 
            onPress={toggleSearch}
            accessibilityRole="button"
            accessibilityLabel={showSearch ? "Close search" : "Search venues"}
            accessibilityHint="Double tap to search for venues by name or location"
          >
            <Ionicons name={showSearch ? "close" : "search"} size={responsiveSize(18, 20, 22)} color={showSearch ? "#FF6B6B" : "#FFFFFF"} />
          </TouchableOpacity>
        </View>
      </View>

      {showSearch && (
        <View style={styles.searchContainer}>
          <TextInput
            style={[styles.searchInput, activeTab === "recreation" && styles.recreationSearchInput]}
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

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={[styles.loadingText, activeTab === "recreation" && styles.recreationText]}>
            Loading venues...
          </Text>
        </View>
      ) : displayedVenues.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, activeTab === "recreation" && styles.recreationText]}>No venues found</Text>
          <Text style={[styles.emptySubtext, activeTab === "recreation" && styles.recreationSubtext]}>
            Check back later for new venues
          </Text>
        </View>
      ) : (
        <FlatList
          ref={scrollRef}
          data={displayedVenues}
          keyExtractor={(item) => item.id}
          renderItem={renderVenueCard}
          numColumns={gridColumns}
          getItemLayout={(_: any, index: number) => ({
            length: cardHeight + spacing.md * 2,
            offset: (cardHeight + spacing.md * 2) * Math.floor(index / gridColumns),
            index,
          })}
          contentContainerStyle={[
            styles.venuesList,
            { paddingHorizontal: spacing.md, paddingRight: spacing.md }
          ]}

          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#2196F3"]}
              tintColor="#2196F3"
            />
          }
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews={true}
          updateCellsBatchingPeriod={50}
          onScroll={onScroll}
        />
      )}

      {/* Floating Add Venue Button
          Soft-auth rules:
          - Visible to unauthenticated users (so they can tap and be prompted to login)
          - Visible to authenticated 'club_owner' and 'admin'
          - Hidden for authenticated 'user' type
      */}
      {(!user || user.userType === "club_owner" || user.userType === "admin") && (
        <TouchableOpacity 
          style={styles.floatingAddButton}
          onPress={handleAddVenue}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  // Screen reader only style for SEO - React Native compatible
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
  recreationContainer: {
    backgroundColor: "#F5F5F5",
  },
  header: {
    padding: responsiveSize(12, 20, 8),
    paddingBottom: 0,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(20, 25, 35, 0.95)",
    borderRadius: responsiveSize(20, 28, 32),
    padding: responsiveSize(3, 6, 4),
    borderWidth: 1,
    borderColor: "rgba(0, 255, 255, 0.2)",
    shadowColor: "#00FFFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: responsiveSize(6, 8, 12),
    elevation: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: responsiveSize(8, 12, 7),
    paddingHorizontal: responsiveSize(8, 14, 9),
    alignItems: "center",
    justifyContent: "center",
    borderRadius: responsiveSize(14, 20, 24),
    marginHorizontal: responsiveSize(2, 3, 4),
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  activeTab: {
    backgroundColor: "rgba(0, 210, 255, 0.15)",
    borderColor: "rgba(0, 210, 255, 0.6)",
  },
  tabText: {
    fontSize: responsiveSize(10, 12, 10),
    color: "rgba(255, 255, 255, 0.5)",
    fontWeight: "500",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  activeTabText: {
    color: "#00D4FF",
    fontWeight: "700",
  },
  searchButton: {
    paddingVertical: responsiveSize(8, 12, 7),
    paddingHorizontal: responsiveSize(8, 10, 6),
    justifyContent: "center",
    alignItems: "center",
    marginLeft: responsiveSize(2, 4, 6),
  },
  searchButtonActive: {
    backgroundColor: "rgba(255, 107, 107, 0.2)",
    borderRadius: responsiveSize(14, 20, 24),
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 30, 30, 0.95)",
    marginHorizontal: responsiveSize(12, 16, 20),
    marginTop: responsiveSize(8, 12, 16),
    marginBottom: responsiveSize(4, 8, 12),
    borderRadius: responsiveSize(12, 16, 20),
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.3)",
    paddingHorizontal: responsiveSize(12, 14, 16),
  },
  recreationSearchContainer: {
    backgroundColor: "rgba(245, 245, 245, 0.95)",
    borderColor: "rgba(0, 0, 0, 0.1)",
  },
  searchInput: {
    flex: 1,
    height: responsiveSize(40, 44, 48),
    color: "#FFFFFF",
    fontSize: responsiveSize(14, 15, 16),
    paddingVertical: 0,
  },
  recreationSearchInput: {
    color: "#333333",
  },
  searchClearButton: {
    padding: responsiveSize(4, 6, 8),
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
    marginTop: responsiveSize(12, 16, 20),
    fontSize: responsiveSize(14, 16, 18),
  },
  recreationText: {
    color: "#333333",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: responsiveSize(16, 20, 24),
  },
  emptyText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(16, 20, 24),
    fontWeight: "bold",
    textAlign: "center",
  },
  emptySubtext: {
    color: "#999999",
    fontSize: responsiveSize(12, 14, 16),
    marginTop: responsiveSize(6, 8, 12),
    textAlign: "center",
  },
  recreationSubtext: {
    color: "#666666",
  },
  venuesList: {
    padding: responsiveSize(12, 16, 20),
    paddingBottom: responsiveSize(100, 120, 140),
  },
  venueCard: {
    height: responsiveSize(160, 200, 240),
    marginBottom: responsiveSize(12, 16, 20),
    borderRadius: responsiveSize(10, 14, 16),
    overflow: "hidden",
    shadowColor: "rgba(0, 212, 255, 0.3)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: responsiveSize(6, 8, 10),
    elevation: 6,
  },
  venueImage: {
    flex: 1,
    justifyContent: "space-between",
  },
  venueGradient: {
    flex: 1,
    justifyContent: "flex-end",
    padding: responsiveSize(12, 14, 16),
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  venueName: {
    fontSize: responsiveSize(18, 22, 26),
    fontWeight: "bold",
    color: "white",
    marginBottom: responsiveSize(2, 4, 6),
  },
  venueInfo: {
    fontSize: responsiveSize(12, 14, 16),
    color: "rgba(255,255,255,0.85)",
    marginTop: responsiveSize(2, 4, 6),
  },
  vibeRatingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: responsiveSize(4, 6, 8),
    flexWrap: "wrap",
  },
  vibeRatingLabel: {
    fontSize: responsiveSize(11, 13, 14),
    color: "rgba(255,255,255,0.85)",
  },
  vibeRatingValue: {
    fontSize: responsiveSize(12, 14, 16),
    fontWeight: "bold",
  },
  vibeRatingDescription: {
    fontSize: responsiveSize(10, 12, 13),
    color: "rgba(255,255,255,0.75)",
  },
  floatingAddButton: {
    position: "absolute",
    bottom: responsiveSize(20, 25, 30),
    right: responsiveSize(15, 20, 25),
    width: responsiveSize(48, 56, 64),
    height: responsiveSize(48, 56, 64),
    borderRadius: responsiveSize(24, 28, 32),
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#00D4FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: responsiveSize(8, 12, 16),
    elevation: 12,
    borderWidth: 2,
    borderColor: "rgba(0, 212, 255, 0.6)",
    transform: [{ translateY: -responsiveSize(48, 56, 64) }],
  },
  floatingPlus: {
    color: "#FFFFFF",
    fontSize: responsiveSize(24, 28, 32),
    lineHeight: responsiveSize(24, 28, 32),
    fontWeight: "700",
  },
})

export default VenuesScreen
