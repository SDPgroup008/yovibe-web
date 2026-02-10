"use client";

import type React from "react";
import { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ImageBackground,
  Platform,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import FirebaseService from "../services/FirebaseService";
import NotificationService from "../services/NotificationService";
import { useAuth } from "../contexts/AuthContext";
import type { Event } from "../models/Event";
import type { EventsScreenProps } from "../navigation/types";

const EventsScreen: React.FC<EventsScreenProps> = ({ navigation }) => {
  const { user, setRedirectIntent } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [featuredEvents, setFeaturedEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [displayedEvents, setDisplayedEvents] = useState<Event[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [dataCache, setDataCache] = useState<{data: Event[], timestamp: number} | null>(null);
  const ITEMS_PER_PAGE = 5;
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadEvents();
      loadUnreadCount();
    });

    return unsubscribe;
  }, [navigation]);

  // Listen for new notifications
  useEffect(() => {
    const unsubscribe = NotificationService.addNotificationListener(() => {
      console.log("EventsScreen: New notification received, updating badge count");
      loadUnreadCount();
    });

    return unsubscribe;
  }, [user]);

  const loadUnreadCount = async () => {
    try {
      const count = await NotificationService.getUnreadCount(user?.uid);
      setUnreadCount(count);
    } catch (error) {
      console.error("Error loading unread count:", error);
    }
  };

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredEvents(events)
      return
    }

    const query = searchQuery.toLowerCase().trim()

    const filtered = events.filter((event) => {
      // Safely handle possibly undefined/null fields
      const title = event.name?.toLowerCase() || ""
      const venue = event.venueName?.toLowerCase() || ""
      const description = event.description?.toLowerCase() || ""
      const location = event.location?.toLowerCase() || ""

      // Safely handle artists (most common crash source)
      const artistsMatch =
        Array.isArray(event.artists) &&
        event.artists.some((artist) => typeof artist === "string" && artist.toLowerCase().includes(query))

      return (
        title.includes(query) ||
        venue.includes(query) ||
        description.includes(query) ||
        location.includes(query) ||
        artistsMatch
      )
    })

    setFilteredEvents(filtered)
  }, [searchQuery, events])

  useEffect(() => {
    // Reset to first page and display first 5 items when filteredEvents changes
    setCurrentPage(1);
    setDisplayedEvents(filteredEvents.slice(0, ITEMS_PER_PAGE));
  }, [filteredEvents]);

  const isCacheValid = () => {
    if (!dataCache) return false;
    return Date.now() - dataCache.timestamp < CACHE_DURATION;
  };

  const loadEvents = async (isInitial: boolean = true) => {
    try {
      if (isInitial) {
        // Check cache first for initial load
        if (isCacheValid()) {
          console.log("Using cached events data");
          setEvents(dataCache!.data);
          setFilteredEvents(dataCache!.data);
          setLoading(false);
          return;
        }
        setLoading(true);
      }

      // AUTO-LOAD ALL EVENTS: Fetch all data in batches with 7-second delays
      if (isInitial) {
        console.log("\n🚀 EVENTS AUTO-LOAD: Fetching ALL events from Firebase in batches...\n");
        
        let allEvents: any[] = [];
        let currentLastDoc = null;
        let fetchCount = 0;
        const BATCH_SIZE = 5;
        const DELAY_MS = 3000;
        
        while (true) {
          fetchCount++;
          console.log(`\n${'='.repeat(60)}`);
          console.log(`📅 EVENT BATCH #${fetchCount}: Requesting ${BATCH_SIZE} events...`);
          console.log(`${'='.repeat(60)}`);
          
          const { events: paginatedEvents, lastDoc: newLastDoc } = await FirebaseService.getEventsPaginated(BATCH_SIZE, currentLastDoc);
          
          console.log(`\n✅ BATCH #${fetchCount} RESULTS:`);
          console.log(`   • Received: ${paginatedEvents.length} events`);
          console.log(`   • Has more data: ${newLastDoc ? 'YES' : 'NO'}`);
          
          if (paginatedEvents.length === 0) {
            console.log(`\n⛔ BATCH #${fetchCount}: No events returned - End of data`);
            break;
          }
          
          allEvents = [...allEvents, ...paginatedEvents];
          currentLastDoc = newLastDoc;
          
          // 🚀 IMMEDIATELY DISPLAY the batch to users
          const sortedSoFar = [...allEvents].sort((a, b) => {
            const today = new Date();
            const diffA = Math.abs(a.date.getTime() - today.getTime());
            const diffB = Math.abs(b.date.getTime() - today.getTime());
            return diffA - diffB;
          });
          setEvents(sortedSoFar);
          setFilteredEvents(sortedSoFar);
          console.log(`🎨 DISPLAYED: Batch #${fetchCount} sorted and visible (${sortedSoFar.length} events)`);
          
          // Hide loading spinner after first batch is displayed
          if (fetchCount === 1) {
            console.log("🎬 First batch complete - hiding loading spinner");
            setLoading(false);
          }
          
          console.log(`\n📊 RUNNING TOTALS AFTER BATCH #${fetchCount}:`);
          console.log(`   • Total events loaded: ${allEvents.length}`);
          console.log(`   • Displayed (sorted by date): ${sortedSoFar.length}`);
          
          if (!newLastDoc) {
            console.log(`\n✅ BATCH #${fetchCount}: Last document is NULL - All events loaded!`);
            break;
          }
          
          console.log(`\n⏳ Waiting ${DELAY_MS / 1000} seconds before next batch...`);
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🎉 EVENTS AUTO-LOAD COMPLETE!`);
        console.log(`${'='.repeat(60)}`);
        console.log(`   • Total batches: ${fetchCount}`);
        console.log(`   • Total events: ${allEvents.length}`);
        console.log(`${'='.repeat(60)}\n`);
        
        // Sort events by date (closest to today first)
        const sortedEvents = [...allEvents].sort((a, b) => {
          const today = new Date();
          const diffA = Math.abs(a.date.getTime() - today.getTime());
          const diffB = Math.abs(b.date.getTime() - today.getTime());
          return diffA - diffB;
        });

        setEvents(sortedEvents);
        setFilteredEvents(sortedEvents);
        setLastDoc(null);
        setHasMore(false);
        
        // Cache the complete data
        setDataCache({ data: sortedEvents, timestamp: Date.now() });
        console.log("💾 Complete events dataset cached");

        // Get featured events
        const featured = await FirebaseService.getFeaturedEvents();
        const sortedFeatured = [...featured].sort((a, b) => {
          const today = new Date();
          const diffA = Math.abs(a.date.getTime() - today.getTime());
          const diffB = Math.abs(b.date.getTime() - today.getTime());
          return diffA - diffB;
        });

        setFeaturedEvents(sortedFeatured);
      }
    } catch (error) {
      console.error("Error loading events:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEventSelect = (eventId: string) => {
    navigation.navigate("EventDetail", { eventId });
  };

  const loadMoreEvents = async () => {
    if (displayedEvents.length >= filteredEvents.length && hasMore) {
      // Need to fetch more from Firebase
      if (!lastDoc || !hasMore) return;
      
      try {
        const { events: moreEvents, lastDoc: newLastDoc } = await FirebaseService.getEventsPaginated(ITEMS_PER_PAGE, lastDoc);
        
        if (moreEvents.length > 0) {
          const sortedEvents = [...moreEvents].sort((a, b) => {
            const today = new Date();
            const diffA = Math.abs(a.date.getTime() - today.getTime());
            const diffB = Math.abs(b.date.getTime() - today.getTime());
            return diffA - diffB;
          });
          
          const updatedEvents = [...events, ...sortedEvents];
          setEvents(updatedEvents);
          setFilteredEvents(updatedEvents);
          setLastDoc(newLastDoc);
          setHasMore(moreEvents.length === ITEMS_PER_PAGE);
          
          // Update cache
          setDataCache({ data: updatedEvents, timestamp: Date.now() });
        } else {
          setHasMore(false);
        }
      } catch (error) {
        console.error("Error loading more events:", error);
      }
      return;
    }
    
    // Load more from existing filtered events
    if (displayedEvents.length >= filteredEvents.length) {
      return; // No more items to load
    }
    const nextPage = currentPage + 1;
    const startIndex = 0;
    const endIndex = nextPage * ITEMS_PER_PAGE;
    setDisplayedEvents(filteredEvents.slice(startIndex, endIndex));
    setCurrentPage(nextPage);
  };

  /**
   * handleAddEvent
   *
   * Soft-auth behavior:
   * - If user is not authenticated: save redirect intent and open Login (Auth stack).
   * - If user is authenticated and NOT a club_owner: navigate to AddEvent.
   * - If user is authenticated and a club_owner: do nothing (button will be hidden).
   */
  const handleAddEvent = () => {
    // If no user, save redirect intent and navigate to the Auth -> Login screen
    if (!user) {
      try {
        setRedirectIntent({
          routeName: "AddEvent",
          params: {},
        });
      } catch (err) {
        console.warn("Failed to set redirect intent:", err);
      }

      // Navigate to the Auth stack's Login screen (use any cast to avoid type issues)
      ;(navigation as any).navigate("Auth", { screen: "Login" });
      return;
    }

    // If user exists but is a club_owner, do nothing (button should be hidden anyway)
    if (user.userType === "club_owner") {
      return;
    }

    // Authenticated and allowed (user or admin) -> open AddEvent
    ;(navigation as any).navigate("AddEvent");
  };

  const toggleSearch = () => {
    setShowSearch(!showSearch);
    if (showSearch) {
      setSearchQuery("");
    }
  };

  const formatDateRange = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    const formattedDate = date.toLocaleDateString("en-US", options).toUpperCase();

    // Get day of week
    const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();

    return `${dayOfWeek} ${formattedDate}`;
  };

  const getAttendeeCount = (event: Event) => {
    return event.attendees ? event.attendees.length : 0;
  };

  const renderEventItem = ({ item }: { item: Event }) => (
    <TouchableOpacity style={styles.eventCard} onPress={() => handleEventSelect(item.id)}>
      <ImageBackground source={{ uri: item.posterImageUrl }} style={styles.eventImage}>
        <View style={styles.eventOverlay}>
          <View style={styles.eventHeader}>
            <View style={styles.dateChip}>
              <Text style={styles.dateChipText}>{formatDateRange(item.date)}</Text>
            </View>
            <View style={styles.feeChip}>
              <Text style={styles.feeChipText}>
                {item.isFreeEntry ? "Free" : item.entryFees.map((fee) => `${fee.name}: ${fee.amount}`).join(", ")}
              </Text>
            </View>
          </View>

          <View style={styles.eventContent}>
            <Text style={styles.eventName}>{item.name}</Text>
            <View style={styles.eventLocationRow}>
              <Ionicons name="location" size={16} color="#FFFFFF" />
              <Text style={styles.eventLocation}>
                {item.location ? `${item.location} • ${item.venueName}` : item.venueName}
              </Text>
            </View>

            <View style={styles.eventFooter}>
              {getAttendeeCount(item) > 0 && (
                <View style={styles.attendeeInfo}>
                  <Ionicons name="people" size={16} color="#00D4FF" />
                  <Text style={styles.attendeeText}>{getAttendeeCount(item)} going</Text>
                </View>
              )}
              <View style={styles.artistsPreview}>
                {item.artists.slice(0, 2).map((artist, index) => (
                  <Text key={index} style={styles.artistPreviewText}>
                    {artist}
                  </Text>
                ))}
                {item.artists.length > 2 && <Text style={styles.moreArtistsText}>+{item.artists.length - 2}</Text>}
              </View>
            </View>
          </View>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Upcoming Events</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.notificationButton} 
            onPress={() => navigation.navigate("Notification" as never)}
          >
            <Ionicons name="notifications" size={24} color="#FFFFFF" />
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.searchButton} onPress={toggleSearch}>
            <Ionicons name="search" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {showSearch && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search events, venues, or artists..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Loading events...</Text>
        </View>
      ) : filteredEvents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {searchQuery ? "No events found matching your search" : "No events found"}
          </Text>
          <Text style={styles.emptySubtext}>
            {searchQuery ? "Try a different search term" : "Check back later for upcoming events"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayedEvents}
          keyExtractor={(item) => item.id}
          renderItem={renderEventItem}
          ListEmptyComponent={<Text style={styles.emptyText}>No upcoming events found</Text>}
          contentContainerStyle={styles.eventsList}
          onEndReached={loadMoreEvents}
          onEndReachedThreshold={0.5}
        />
      )}

      {/* Floating Add Event Button
          Soft-auth rules:
          - Visible to unauthenticated users (so they can tap and be prompted to login)
          - Visible to authenticated users of type 'user' or 'admin'
          - Hidden for authenticated 'club_owner' users
      */}
      {(!user || user.userType === "user" || user.userType === "admin") && (
        <TouchableOpacity style={styles.floatingAddButton} onPress={handleAddEvent}>
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0A",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: Platform.OS === "ios" ? 60 : 30,
    backgroundColor: "#1A1A2E",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    textShadowColor: "rgba(0, 212, 255, 0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  searchButton: {
    padding: 12,
    backgroundColor: "rgba(0, 212, 255, 0.2)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.3)",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  notificationButton: {
    padding: 12,
    backgroundColor: "rgba(0, 212, 255, 0.2)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.3)",
    position: "relative",
  },
  notificationBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "#FF6B6B",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: "#0A0A0A",
  },
  notificationBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
  },
  searchContainer: {
    padding: 20,
    paddingTop: 0,
  },
  searchInput: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 16,
    color: "#FFFFFF",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  eventCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  eventImage: {
    width: "100%",
    height: 280,
  },
  eventOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 20,
    justifyContent: "space-between",
  },
  eventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  dateChip: {
    backgroundColor: "rgba(0, 212, 255, 0.9)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  dateChipText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  feeChip: {
    backgroundColor: "rgba(255, 215, 0, 0.9)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  feeChipText: {
    color: "#000000",
    fontSize: 12,
    fontWeight: "700",
  },
  eventContent: {
    flex: 1,
    justifyContent: "flex-end",
  },
  eventName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 8,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  eventLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  eventLocation: {
    fontSize: 16,
    color: "#FFFFFF",
    marginLeft: 6,
    opacity: 0.9,
  },
  eventFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  attendeeInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 212, 255, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.3)",
  },
  attendeeText: {
    color: "#00D4FF",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  artistsPreview: {
    flexDirection: "row",
    alignItems: "center",
  },
  artistPreviewText: {
    color: "#FFFFFF",
    fontSize: 12,
    marginRight: 8,
    opacity: 0.8,
  },
  moreArtistsText: {
    color: "#00D4FF",
    fontSize: 12,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0A0A0A",
  },
  loadingText: {
    color: "#FFFFFF",
    marginTop: 16,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  emptySubtext: {
    color: "#999999",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  eventsList: {
    paddingBottom: 100, // Add padding to account for floating button
  },
  floatingAddButton: {
    position: "absolute",
    bottom: 30, // Moved closer to profile icon
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#000000", // Changed to black
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#00D4FF", // Glowing effect color
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 12,
    // Add glowing border effect
    borderWidth: 2,
    borderColor: "rgba(0, 212, 255, 0.6)",
  },
})

export default EventsScreen