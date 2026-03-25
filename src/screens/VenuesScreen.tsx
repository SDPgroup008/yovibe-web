"use client";

import type React from "react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ImageBackground, ActivityIndicator, RefreshControl, Dimensions } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import FirebaseService from "../services/FirebaseService";
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

const VenuesScreen: React.FC<VenuesScreenProps> = ({ navigation }) => {
  // SEO Metadata for Venues page
  const venueSeo = SCREEN_SEO.venues;

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

  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [venueVibeRatings, setVenueVibeRatings] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<"all" | "nightlife" | "recreation">("all");
  const [displayedVenues, setDisplayedVenues] = useState<Venue[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [dataCache, setDataCache] = useState<{data: Venue[], timestamp: number, version: string} | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const ITEMS_PER_PAGE = 5;
  const INITIAL_FETCH_SIZE = 10; // Fetch 10 initially to ensure 5 per tab
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  const CACHE_VERSION = '2'; // Increment to bust cache

  // Initial data load only - no reload on focus
  useEffect(() => {
    if (venues.length === 0) {
      loadVenues();
    }
  }, []);

  const isCacheValid = () => {
    if (!dataCache) {
      // console.log("🔍 Cache check: No cache exists");
      return false;
    }
    // Check version match (invalidate old caches without version)
    if (!dataCache.version || dataCache.version !== CACHE_VERSION) {
      // console.log(`🔍 Cache check: Version mismatch (cached: ${dataCache.version}, current: ${CACHE_VERSION}) - invalidating cache`);
      setDataCache(null); // Clear old cache
      return false;
    }
    // Check timestamp
    const isValid = Date.now() - dataCache.timestamp < CACHE_DURATION;
    // console.log(`🔍 Cache check: Version OK, timestamp ${isValid ? 'valid' : 'expired'}`);
    return isValid;
  };

  const loadVenues = async (isInitial: boolean = true, isRefresh: boolean = false) => {
    // console.log(`\n🚀 loadVenues CALLED - isInitial: ${isInitial}, isRefresh: ${isRefresh}`);
    try {
      if (isInitial && !isRefresh) {
        // console.log("\n🔄 VENUES SCREEN: Loading venues (initial load - fetching venues for both tabs)...")
        // console.log(`📦 Current cache state:`, dataCache ? `exists (${dataCache.data?.length || 0} venues, version: ${dataCache.version})` : 'null');
        
        // Check cache first
        if (isCacheValid()) {
          // console.log("✅ Using cached venues data (cache is valid)");
          // console.log("Cached venues count:", dataCache!.data.length)
          setVenues(dataCache!.data);
          setLoading(false);
          return;
        }
        // console.log("⚠️ Cache invalid or empty, fetching from Firebase...")
        setLoading(true);
      }

      if (isRefresh) {
        setRefreshing(true);
      }

      // AUTO-LOAD ALL VENUES: Fetch all data in batches with 7-second delays
      if (isInitial) {
        // console.log("\n🚀 STARTING AUTO-LOAD: Will fetch ALL venues from Firebase in batches...\n");
        
        let allVenues: any[] = [];
        let currentLastDoc = null;
        let fetchCount = 0;
        const BATCH_SIZE = 10; // Fetch 10 venues per batch
        const DELAY_MS = 3000; // 3-second delay between batches
        
        // Keep fetching until Firebase has no more data
        while (true) {
          fetchCount++;
          // console.log(`\n${'='.repeat(60)}`);
          // console.log(`📥 BATCH #${fetchCount}: Requesting ${BATCH_SIZE} venues from Firebase...`);
          // console.log(`${'='.repeat(60)}`);
          
          const { venues: paginatedVenues, lastDoc: newLastDoc } = await FirebaseService.getVenuesPaginated(BATCH_SIZE, currentLastDoc);
          
          // console.log(`\n✅ BATCH #${fetchCount} RESULTS:`);
          // console.log(`   • Received: ${paginatedVenues.length} venues`);
          // console.log(`   • Has more data: ${newLastDoc ? 'YES' : 'NO'}`);
          
          // If no venues returned, we're done
          if (paginatedVenues.length === 0) {
            // console.log(`\n⛔ BATCH #${fetchCount}: No venues returned - End of data reached`);
            break;
          }
          
          // Add to our collection
          allVenues = [...allVenues, ...paginatedVenues];
          currentLastDoc = newLastDoc;
          
          // 🚀 IMMEDIATELY DISPLAY the batch to users
          setVenues(allVenues);
          // console.log(`🎨 DISPLAYED: Batch #${fetchCount} now visible to users (${allVenues.length} venues)`);
          
          // 🎵 Load vibe ratings for this batch BEFORE moving to next batch
          // console.log(`🎵 Loading vibe ratings for batch #${fetchCount} (${paginatedVenues.length} venues)...`);
          const today = new Date();
          for (const venue of paginatedVenues) {
            const vibeImages = await FirebaseService.getVibeImagesByVenueAndDate(venue.id, today);
            if (vibeImages.length > 0) {
              const latestVibe = vibeImages.reduce((latest, image) => {
                return image.uploadedAt > latest.uploadedAt ? image : latest;
              });
              setVenueVibeRatings(prev => ({ ...prev, [venue.id]: latestVibe.vibeRating || 0.0 }));
            } else {
              setVenueVibeRatings(prev => ({ ...prev, [venue.id]: 0.0 }));
            }
          }
          // console.log(`✅ Vibe ratings loaded for batch #${fetchCount}`);
          
          // Hide loading spinner after first batch is displayed
          if (fetchCount === 1) {
            // console.log("🎬 First batch complete - hiding loading spinner");
            setLoading(false);
          }
          
          // Show current totals
          const nightlifeVenues = allVenues.filter(v => {
            if (!v.categories || !Array.isArray(v.categories) || v.categories.length === 0) return false;
            return v.categories.some((cat: string) => ["nightclub", "bar", "club", "lounge", "pub", "disco"].includes(cat.toLowerCase()));
          });
          
          const recreationVenues = allVenues.filter(v => {
            if (!v.categories || !Array.isArray(v.categories) || v.categories.length === 0) return true;
            return !v.categories.some((cat: string) => ["nightclub", "bar", "club", "lounge", "pub", "disco"].includes(cat.toLowerCase()));
          });
          
          // console.log(`\n📊 RUNNING TOTALS AFTER BATCH #${fetchCount}:`);
          // console.log(`   • Total venues: ${allVenues.length}`);
          // console.log(`   • Nightlife: ${nightlifeVenues.length}`);
          // console.log(`   • Recreation: ${recreationVenues.length}`);
          
          // If Firebase says no more data (lastDoc is null), we're done
          if (!newLastDoc) {
            // console.log(`\n✅ BATCH #${fetchCount}: Last document is NULL - All data loaded!`);
            break;
          }
          
          // Wait 5 seconds before next batch
          // console.log(`\n⏳ Waiting ${DELAY_MS / 1000} seconds before fetching next batch...`);
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
        
        // console.log(`\n${'='.repeat(60)}`);
        // console.log(`🎉 AUTO-LOAD COMPLETE!`);
        // console.log(`${'='.repeat(60)}`);
        // console.log(`   • Total batches fetched: ${fetchCount}`);
        // console.log(`   • Total venues loaded: ${allVenues.length}`);
        // console.log(`   • Nightlife venues: ${allVenues.filter(v => v.categories?.some((c: string) => ["nightclub", "bar", "club", "lounge", "pub", "disco"].includes(c.toLowerCase()))).length}`);
        // console.log(`   • Recreation venues: ${allVenues.filter(v => !v.categories?.some((c: string) => ["nightclub", "bar", "club", "lounge", "pub", "disco"].includes(c.toLowerCase()))).length}`);
        // console.log(`${'='.repeat(60)}\n`);
        
        setVenues(allVenues);
        setLastDoc(null); // No more data to fetch
        setHasMore(false); // All data loaded
        
        // Cache the complete data with version
        setDataCache({ data: allVenues, timestamp: Date.now(), version: CACHE_VERSION });
        // console.log("💾 Complete dataset cached with version:", CACHE_VERSION)
        // console.log("✅ All vibe ratings already loaded per batch\n")
      }
    } catch (error) {
      // console.error("❌ Error loading venues:", error);
      const errorRatings: Record<string, number> = {};
      venues.forEach((venue) => {
        errorRatings[venue.id] = 0.0;
      });
      setVenueVibeRatings(errorRatings);
    } finally {
      setLoading(false);
    }
  };

  const handleVenueSelect = (venueId: string) => {
    navigation.navigate("VenueDetail", { venueId });
  };

  const getFilteredVenues = () => {
    // console.log("\n========== VENUE FILTERING (UI) ==========\nActive Tab:", activeTab.toUpperCase())
    // console.log("Total venues available for filtering:", venues.length)
    
    // Handle "all" tab - return all venues without filtering
    if (activeTab === "all") {
      // console.log("✅ All tab selected - showing all venues without filtering")
      const sorted = [...venues].sort((a, b) => {
        const aVibe = venueVibeRatings[a.id] || 0.0;
        const bVibe = venueVibeRatings[b.id] || 0.0;
        return bVibe - aVibe;
      });
      // console.log("========================================\n")
      return sorted;
    }
    
    let nightlifeCount = 0
    let recreationCount = 0
    let noCategoryCount = 0
    
    const filtered = venues.filter((venue) => {
      const venueName = venue.name || "Unnamed"
      const categories = venue.categories || []
      
      // Safety check: ensure categories exists and is an array, fallback to "Other"
      if (!venue.categories || !Array.isArray(venue.categories) || venue.categories.length === 0) {
        noCategoryCount++
        const included = activeTab === "recreation"
        // if (included) {
        //   console.log(`✅ "${venueName}" - Included in ${activeTab.toUpperCase()} (no categories, defaults to "Other")`)
        // } else {
        //   console.log(`❌ "${venueName}" - Excluded from ${activeTab.toUpperCase()} (no categories)`)
        // }
        return included;
      }
      
      const isNightlife = venue.categories.some((cat) =>
        ["nightclub", "bar", "club", "lounge", "pub", "disco"].includes(cat.toLowerCase())
      );
      
      if (isNightlife) {
        nightlifeCount++
        // if (activeTab === "nightlife") {
        //   console.log(`✅ "${venueName}" - Included in NIGHTLIFE - Categories: [${categories.join(", ")}]`)
        //   return true
        // } else {
        //   console.log(`❌ "${venueName}" - Excluded from RECREATION (is nightlife venue) - Categories: [${categories.join(", ")}]`)
        //   return false
        // }
        return activeTab === "nightlife";
      } else {
        recreationCount++
        // if (activeTab === "recreation") {
        //   console.log(`✅ "${venueName}" - Included in RECREATION - Categories: [${categories.join(", ")}]`)
        //   return true
        // } else {
        //   console.log(`❌ "${venueName}" - Excluded from NIGHTLIFE (is recreation venue) - Categories: [${categories.join(", ")}]`)
        //   return false
        // }
        return activeTab === "recreation";
      }
    });
    
    // console.log("\n--- FILTERING SUMMARY ---")
    // console.log("Total venues processed:", venues.length)
    // console.log("Nightlife venues found:", nightlifeCount)
    // console.log("Recreation venues found:", recreationCount)
    // console.log("No category venues found:", noCategoryCount)
    // console.log("Venues passing filter for", activeTab, "tab:", filtered.length)

    // Sort by current vibe rating (highest first)
    const sorted = filtered.sort((a, b) => {
      const aVibe = venueVibeRatings[a.id] || 0.0;
      const bVibe = venueVibeRatings[b.id] || 0.0;
      return bVibe - aVibe;
    });
    
    // console.log("\nAfter sorting by vibe rating (top 3):")
    // sorted.slice(0, 3).forEach((venue, idx) => {
    //   console.log(`${idx + 1}. "${venue.name}" - Vibe: ${(venueVibeRatings[venue.id] || 0.0).toFixed(1)}`)
    // })
    // console.log("========================================\n")
    
    return sorted;
  };

  // Memoize filtered and sorted venues to prevent recalculation on every render
  // Only recalculate when venues or activeTab changes, NOT when venueVibeRatings changes
  const filteredVenues = useMemo(() => getFilteredVenues(), [venues, activeTab]);

  useEffect(() => {
    setCurrentPage(1);
    const toDisplay = filteredVenues.slice(0, ITEMS_PER_PAGE);
    setDisplayedVenues(toDisplay);
  }, [filteredVenues]);

  // Memoize loadMoreVenues to prevent recreation on every render
  const loadMoreVenues = useCallback(async () => {
    const filtered = filteredVenues;
    
    // First check if we need to load more from existing filtered venues
    if (displayedVenues.length < filtered.length) {
      // We have more filtered venues in cache, show them first
      const nextPage = currentPage + 1;
      const startIndex = 0;
      const endIndex = nextPage * ITEMS_PER_PAGE;
      const newDisplayed = filtered.slice(startIndex, endIndex);
      // console.log(`✅ Displaying ${newDisplayed.length} venues from cache (page ${nextPage})`);
      setDisplayedVenues(newDisplayed);
      setCurrentPage(nextPage);
      return;
    }
    
    // All filtered venues are displayed, check if we can fetch more from Firebase
    if (displayedVenues.length >= filtered.length) {
      if (!hasMore || !lastDoc) {
        // console.log("⛔ All venues displayed and no more data available from Firebase");
        return;
      }
      
      // console.log("\n🔄 All filtered venues displayed. Fetching more from Firebase...\n");
      
      try {
        const { venues: moreVenues, lastDoc: newLastDoc } = await FirebaseService.getVenuesPaginated(ITEMS_PER_PAGE, lastDoc);
        
        if (moreVenues.length > 0) {
          const updatedVenues = [...venues, ...moreVenues];
          // console.log(`✅ Added ${moreVenues.length} more venues. Total venues: ${updatedVenues.length}`);
          
          setVenues(updatedVenues);
          setLastDoc(newLastDoc);
          setHasMore(newLastDoc !== null && moreVenues.length === ITEMS_PER_PAGE);
          
          // console.log(`Updated hasMore state: ${newLastDoc !== null && moreVenues.length === ITEMS_PER_PAGE}`);
          
          // Update cache
          setDataCache({ data: updatedVenues, timestamp: Date.now(), version: CACHE_VERSION });
          
          // Load vibe ratings for new venues
          // console.log("\n🎵 Loading vibe ratings for new venues...");
          const today = new Date();
          const newRatings = { ...venueVibeRatings };
          for (const venue of moreVenues) {
            const vibeImages = await FirebaseService.getVibeImagesByVenueAndDate(venue.id, today);
            if (vibeImages.length > 0) {
              const latestVibe = vibeImages.reduce((latest, image) => {
                return image.uploadedAt > latest.uploadedAt ? image : latest;
              });
              newRatings[venue.id] = latestVibe.vibeRating || 0.0;
              // console.log(`  "${venue.name}" - Vibe: ${newRatings[venue.id].toFixed(1)}`);
            } else {
              newRatings[venue.id] = 0.0;
              // console.log(`  "${venue.name}" - Vibe: 0.0`);
            }
          }
          setVenueVibeRatings(newRatings);
        } else {
          // console.log("⛔ No more venues available from Firebase");
          setHasMore(false);
        }
      } catch (error) {
        // console.error("❌ Error loading more venues:", error);
      } finally {
        setRefreshing(false);
      }
      return;
    }
  }, [filteredVenues, displayedVenues, currentPage, hasMore, lastDoc]);

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setDataCache(null); // Clear cache to force fresh load
    await loadVenues(true, true);
  }, []);

  // Memoize renderVenueCard to prevent recreation on every render
  const renderVenueCard = useCallback(({ item }: { item: Venue }) => {
    return (
    <TouchableOpacity 
      style={[styles.venueCard, { width: cardWidth, paddingHorizontal: spacing.md }]}
      onPress={() => handleVenueSelect(item.id)}
    >
      <ImageBackground 
        source={{ uri: item.backgroundImageUrl }} 
        style={[styles.venueImage, { width: cardWidth, height: cardHeight }]}
        resizeMode="cover"
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
    if (user.userType === "user") {
      return;
    }

    // Authenticated and allowed (club_owner or admin) -> open AddVenue
    ;(navigation as any).navigate("AddVenue");
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
        url="https://yovibe.net/venues"
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
          >
            <Text style={[styles.tabText, activeTab === "all" && styles.activeTabText]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "nightlife" && styles.activeTab]}
            onPress={() => setActiveTab("nightlife")}
          >
            <Text style={[styles.tabText, activeTab === "nightlife" && styles.activeTabText]}>Night Clubs</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "recreation" && styles.activeTab]}
            onPress={() => setActiveTab("recreation")}
          >
            <Text style={[styles.tabText, activeTab === "recreation" && styles.activeTabText]}>Recreation Centers</Text>
          </TouchableOpacity>
        </View>
      </View>

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
          ref={flatListRef}
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
          onEndReached={loadMoreVenues}
          onEndReachedThreshold={0.5}
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
    padding: responsiveSize(12, 20, 24),
    paddingBottom: 0,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(20, 25, 35, 0.95)",
    borderRadius: responsiveSize(20, 28, 32),
    padding: responsiveSize(3, 6, 8),
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
    paddingVertical: responsiveSize(8, 12, 14),
    paddingHorizontal: responsiveSize(8, 14, 18),
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
    fontSize: responsiveSize(10, 12, 13),
    color: "rgba(255, 255, 255, 0.5)",
    fontWeight: "500",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  activeTabText: {
    color: "#00D4FF",
    fontWeight: "700",
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
