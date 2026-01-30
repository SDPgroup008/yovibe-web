"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../services/FirebaseService"
import type { Venue } from "../models/Venue"
import type { MapScreenProps } from "../navigation/types"

// This is a web-only implementation of the MapScreen
const MapScreen: React.FC<MapScreenProps> = ({ navigation, route }) => {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [displayedVenues, setDisplayedVenues] = useState<Venue[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [lastDoc, setLastDoc] = useState<any>(null)
  const [hasMore, setHasMore] = useState(true)
  const [dataCache, setDataCache] = useState<{data: Venue[], timestamp: number} | null>(null)
  const ITEMS_PER_PAGE = 5
  const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

  // Check if we need to show directions to a specific venue
  const destinationVenueId = route.params?.destinationVenueId

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadVenues()
    })

    return unsubscribe
  }, [navigation])

  useEffect(() => {
    // If a destination venue ID is provided, highlight it
    if (destinationVenueId && venues.length > 0) {
      const venue = venues.find((v) => v.id === destinationVenueId)
      if (venue) {
        setSelectedVenue(venue)
      }
    }
  }, [destinationVenueId, venues])

  useEffect(() => {
    // Reset pagination when venues change
    setCurrentPage(1);
    setDisplayedVenues(venues.slice(0, ITEMS_PER_PAGE));
  }, [venues]);

  const isCacheValid = () => {
    if (!dataCache) return false;
    return Date.now() - dataCache.timestamp < CACHE_DURATION;
  };

  const loadVenues = async () => {
    try {
      // Check cache first
      if (isCacheValid()) {
        console.log("Using cached venues data for map");
        setVenues(dataCache!.data);
        setLoading(false);
        return;
      }
      
      setLoading(true);
      
      // AUTO-LOAD ALL VENUES: Fetch all data in batches with 7-second delays
      console.log("\n🚀 MAP AUTO-LOAD: Fetching ALL venues from Firebase in batches...\n");
      
      let allVenues: any[] = [];
      let currentLastDoc = null;
      let fetchCount = 0;
      const BATCH_SIZE = 5;
      const DELAY_MS = 3000;
      
      while (true) {
        fetchCount++;
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🗺️  MAP BATCH #${fetchCount}: Requesting ${BATCH_SIZE} venues...`);
        console.log(`${'='.repeat(60)}`);
        
        const { venues: paginatedVenues, lastDoc: newLastDoc } = await FirebaseService.getVenuesPaginated(BATCH_SIZE, currentLastDoc);
        
        console.log(`\n✅ BATCH #${fetchCount} RESULTS:`);
        console.log(`   • Received: ${paginatedVenues.length} venues`);
        console.log(`   • Has more data: ${newLastDoc ? 'YES' : 'NO'}`);
        
        if (paginatedVenues.length === 0) {
          console.log(`\n⛔ BATCH #${fetchCount}: No venues returned - End of data`);
          break;
        }
        
        allVenues = [...allVenues, ...paginatedVenues];
        currentLastDoc = newLastDoc;
        
        // 🚀 IMMEDIATELY DISPLAY the batch to users
        setVenues(allVenues);
        console.log(`🎨 DISPLAYED: Batch #${fetchCount} now visible to users (${allVenues.length} venues)`);
        
        // Hide loading spinner after first batch is displayed
        if (fetchCount === 1) {
          console.log("🎬 First batch complete - hiding loading spinner");
          setLoading(false);
        }
        
        console.log(`\n📊 RUNNING TOTALS AFTER BATCH #${fetchCount}:`);
        console.log(`   • Total venues loaded: ${allVenues.length}`);
        
        if (!newLastDoc) {
          console.log(`\n✅ BATCH #${fetchCount}: Last document is NULL - All venues loaded!`);
          break;
        }
        
        console.log(`\n⏳ Waiting ${DELAY_MS / 1000} seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🎉 MAP AUTO-LOAD COMPLETE!`);
      console.log(`${'='.repeat(60)}`);
      console.log(`   • Total batches: ${fetchCount}`);
      console.log(`   • Total venues: ${allVenues.length}`);
      console.log(`${'='.repeat(60)}\n`);
      
      setVenues(allVenues);
      setLastDoc(null);
      setHasMore(false);
      
      // Cache the complete data
      setDataCache({ data: allVenues, timestamp: Date.now() });
      console.log("💾 Complete venues dataset cached for map");
    } catch (error) {
      console.error("Error loading venues for map:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadMoreVenues = async () => {
    if (displayedVenues.length >= venues.length && hasMore) {
      // Need to fetch more from Firebase
      if (!lastDoc || !hasMore) return;
      
      try {
        const { venues: moreVenues, lastDoc: newLastDoc } = await FirebaseService.getVenuesPaginated(ITEMS_PER_PAGE, lastDoc);
        
        if (moreVenues.length > 0) {
          const updatedVenues = [...venues, ...moreVenues];
          setVenues(updatedVenues);
          setLastDoc(newLastDoc);
          setHasMore(moreVenues.length === ITEMS_PER_PAGE);
          
          // Update cache
          setDataCache({ data: updatedVenues, timestamp: Date.now() });
        } else {
          setHasMore(false);
        }
      } catch (error) {
        console.error("Error loading more venues:", error);
      }
      return;
    }
    
    if (displayedVenues.length >= venues.length) {
      return; // No more items to load
    }
    const nextPage = currentPage + 1;
    const startIndex = 0;
    const endIndex = nextPage * ITEMS_PER_PAGE;
    setDisplayedVenues(venues.slice(startIndex, endIndex));
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
          style={styles.venueList}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            const paddingToBottom = 20;
            if (layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom) {
              loadMoreVenues();
            }
          }}
          scrollEventThrottle={400}
        >
          {displayedVenues.map((venue) => (
            <View key={venue.id} style={[styles.venueCard, selectedVenue?.id === venue.id && styles.selectedVenueCard]}>
              <View style={styles.venueInfo}>
                <Text style={styles.venueName}>{venue.name}</Text>
                <Text style={styles.venueAddress}>{venue.location}</Text>
                <Text style={styles.venueCategories}>{venue.categories.join(", ")}</Text>
              </View>
              <View style={styles.venueRating}>
                <Text style={styles.ratingText}>{venue.vibeRating.toFixed(1)}</Text>
                <Ionicons name="star" size={16} color="#FFD700" />
              </View>
              <View style={styles.venueActions}>
                <TouchableOpacity style={styles.actionButton} onPress={() => handleVenueSelect(venue.id)}>
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
