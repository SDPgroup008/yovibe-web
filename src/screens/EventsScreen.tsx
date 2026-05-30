"use client";

import type React from "react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  RefreshControl,
  Dimensions,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "../utils/compatNavigation";
import { useCompatNavigation } from "../utils/compatNavigation";
import { useCachedEvents } from "../hooks/useDataCache";
import { useEventsScroll } from "../hooks/useScrollPersistence";
import SupabaseService from "../services/SupabaseService";
import NotificationService from "../services/NotificationService";
import { useAuth } from "../contexts/AuthContext";
import type { Event } from "../models/Event";
import { SEOMetadata, SCREEN_SEO } from "../components/SEOMetadata";

// Responsive design hooks
import { useGridColumns, useLayoutDimensions, useTypography, useSpacing, useDeviceType, BREAKPOINTS } from "../utils/ResponsiveDesign";

// Static responsive function for StyleSheet - uses current dimensions
const responsiveSize = (mobile: number, tablet: number, desktop: number): number => {
  const { width } = Dimensions.get('window');
  if (width >= BREAKPOINTS.LARGE_TABLET) return desktop;
  if (width >= BREAKPOINTS.TABLET) return tablet;
  return mobile;
};

type EventsScreenProps = {
  initialSearchQuery?: string;
};

const EventsScreen: React.FC<EventsScreenProps> = ({ initialSearchQuery = "" }) => {
  const navigation = useCompatNavigation()
  const { data: cachedEvents, loading, error, refetch } = useCachedEvents()
  const { scrollRef, onScroll } = useEventsScroll()
  // SEO Metadata for Events page
  const eventSeo = SCREEN_SEO.events;
  const seoUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}`
      : "https://yovibe.net/events";

  // Get responsive values using hooks
  const gridColumns = useGridColumns();
  const layout = useLayoutDimensions();
  const typography = useTypography();
  const spacing = useSpacing();
  const deviceType = useDeviceType();

  // Memoize card dimensions to prevent recalculation on every render
  const { cardWidth, cardHeight } = useMemo(() => {
    // Account for navbar offset on desktop (80px)
    const navbarOffset = deviceType.isLargeScreen ? 80 : 0;
    const availableWidth = layout.width - navbarOffset;
    const width = (availableWidth - (spacing.md * (gridColumns + 1))) / gridColumns;
    const height = deviceType.isLargeScreen ? layout.imageHeight.small : layout.imageHeight.medium;
    return { cardWidth: width, cardHeight: height };
  }, [layout.width, layout.imageHeight, spacing.md, gridColumns, deviceType.isLargeScreen]);

  const { user, setRedirectIntent } = useAuth();
  const isFocused = useIsFocused();

  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [featuredEvents, setFeaturedEvents] = useState<Event[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [displayedEvents, setDisplayedEvents] = useState<Event[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const events = useMemo<Event[]>(() => {
    return Array.isArray(cachedEvents) ? cachedEvents : [];
  }, [cachedEvents]);
  useEffect(() => {
    const normalized = initialSearchQuery.trim();
    if (!normalized) return;

    setSearchQuery(normalized);
    setShowSearch(true);
  }, [initialSearchQuery]);



  // Initial data load only - no reload on focus
  // Update filtered events when events data changes
  useEffect(() => {
    if (events) {
      setFilteredEvents(events);
      setDisplayedEvents(events.slice(0, 20)); // Show first 20 events initially
    }
  }, [events]);

  // Update notification badge when screen is focused
  useEffect(() => {
    if (isFocused) {
      loadUnreadCount();
    }
  }, [isFocused]);

  // Listen for new notifications
  useEffect(() => {
    const unsubscribe = NotificationService.addNotificationListener(() => {
      // console.log("EventsScreen: New notification received, updating badge count");
      loadUnreadCount();
    });

    return unsubscribe;
  }, [user]);

  const loadUnreadCount = async () => {
    try {
      const count = await NotificationService.getUnreadCount(user?.uid);
      setUnreadCount(count);
    } catch (error) {
      // console.error("Error loading unread count:", error);
    }
  };

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredEvents(events || [])
      return
    }

    const query = searchQuery.toLowerCase().trim()

    const filtered = (events || []).filter((event) => {
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
    setDisplayedEvents(filteredEvents || []);
  }, [filteredEvents]);

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch(); // Force refresh cached data
    setRefreshing(false);
  }, [refetch]);

  const handleEventSelect = (eventId: string) => {
    navigation.navigate("EventDetail", { eventId });
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

  // Check if event is today or tomorrow
  const getDateLabel = (eventDate: Date): { label: string; isSpecial: boolean } => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const eventDay = new Date(eventDate);
    eventDay.setHours(0, 0, 0, 0);

    if (eventDay.getTime() === today.getTime()) {
      return { label: "TODAY", isSpecial: true };
    } else if (eventDay.getTime() === tomorrow.getTime()) {
      return { label: "TOMORROW", isSpecial: true };
    }
    return { label: formatDateRange(eventDate), isSpecial: false };
  };

  const getAttendeeCount = (event: Event) => {
    return event.attendees ? event.attendees.length : 0;
  };

  // Memoize renderEventItem to prevent recreation on every render
  const renderEventItem = useCallback(({ item }: { item: Event }) => {
    const dateInfo = getDateLabel(item.date);
    
    return (
    <TouchableOpacity 
      style={[styles.eventCard, { width: cardWidth }]} 
      onPress={() => handleEventSelect(item.slug || item.id)}
      accessibilityLabel={`View event: ${item.name}`}
      accessibilityRole="button"
    >
      <ImageBackground 
        source={{ uri: item.posterImageUrl }} 
        style={[styles.eventImage, { height: cardHeight }]}
        accessibilityLabel={`Event poster for ${item.name}`}
      >
        <View style={styles.eventOverlay}>
          <View style={styles.eventHeader}>
            <View style={[styles.dateChip, dateInfo.isSpecial && styles.dateChipSpecial]}>
              <Text style={[styles.dateChipText, dateInfo.isSpecial && styles.dateChipTextSpecial]}>{dateInfo.label}</Text>
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
  }, [cardWidth, cardHeight, spacing.md]);

  return (
    <View style={styles.container}>
      {/* SEO Metadata for Events page */}
      <SEOMetadata
        title={eventSeo.title}
        description={eventSeo.description}
        keywords={eventSeo.keywords}
        type={eventSeo.type}
        url={seoUrl}
      />
      {/* Screen reader only heading for SEO */}
      <Text style={styles.srOnly} accessibilityRole="header">
        {eventSeo.title}
      </Text>
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
      ) : !filteredEvents || filteredEvents.length === 0 ? (
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
          ref={scrollRef}
          data={displayedEvents || []}
          keyExtractor={(item) => item.id}
          renderItem={renderEventItem}
          numColumns={gridColumns}
          getItemLayout={(_: any, index: number) => ({
            length: cardHeight + spacing.md * 2,
            offset: (cardHeight + spacing.md * 2) * Math.floor(index / gridColumns),
            index,
          })}
          ListEmptyComponent={<Text style={styles.emptyText}>No upcoming events found</Text>}
          contentContainerStyle={[
            styles.eventsList,
            { 
              paddingHorizontal: spacing.md,
              paddingLeft: deviceType.isLargeScreen ? 80 : 0,
              paddingRight: deviceType.isLargeScreen ? 80 : 0,
              columnGap: gridColumns > 1 ? spacing.md : 0
            }
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: responsiveSize(14, 18, 24),
    paddingTop: Platform.OS === "ios" ? responsiveSize(40, 50, 60) : responsiveSize(20, 30, 40),
    backgroundColor: "#1A1A2E",
  },
  headerTitle: {
    fontSize: responsiveSize(20, 24, 28),
    fontWeight: "800",
    color: "#FFFFFF",
    textShadowColor: "rgba(0, 212, 255, 0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  searchButton: {
    padding: responsiveSize(8, 12, 14),
    backgroundColor: "rgba(0, 212, 255, 0.2)",
    borderRadius: responsiveSize(8, 12, 14),
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.3)",
  },
  headerActions: {
    flexDirection: "row",
    gap: responsiveSize(6, 8, 10),
  },
  notificationButton: {
    padding: responsiveSize(8, 12, 14),
    backgroundColor: "rgba(0, 212, 255, 0.2)",
    borderRadius: responsiveSize(8, 12, 14),
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.3)",
    position: "relative",
  },
  notificationBadge: {
    position: "absolute",
    top: responsiveSize(2, 3, 4),
    right: responsiveSize(2, 3, 4),
    backgroundColor: "#FF6B6B",
    borderRadius: responsiveSize(8, 10, 12),
    minWidth: responsiveSize(18, 20, 24),
    height: responsiveSize(18, 20, 24),
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: responsiveSize(4, 6, 8),
    borderWidth: 2,
    borderColor: "#0A0A0A",
  },
  notificationBadgeText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(8, 9, 10),
    fontWeight: "bold",
  },
  searchContainer: {
    padding: responsiveSize(14, 18, 24),
    paddingTop: responsiveSize(8, 10, 12),
  },
  searchInput: {
    backgroundColor: "#1E1E1E",
    borderRadius: responsiveSize(8, 12, 14),
    padding: responsiveSize(12, 14, 16),
    color: "#FFFFFF",
    fontSize: responsiveSize(14, 15, 16),
    borderWidth: 1,
    borderColor: "#333",
  },
  eventCard: {
    marginHorizontal: responsiveSize(12, 16, 24),
    marginBottom: responsiveSize(16, 20, 28),
    borderRadius: responsiveSize(14, 18, 24),
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: responsiveSize(12, 14, 18),
    elevation: 10,
  },
  eventImage: {
    width: "100%",
    height: responsiveSize(220, 260, 320),
  },
  eventOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: responsiveSize(14, 18, 24),
    justifyContent: "space-between",
  },
  eventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  dateChip: {
    backgroundColor: "rgba(0, 212, 255, 0.9)",
    paddingHorizontal: responsiveSize(8, 10, 12),
    paddingVertical: responsiveSize(4, 5, 6),
    borderRadius: responsiveSize(14, 16, 20),
  },
  dateChipText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(10, 11, 12),
    fontWeight: "700",
  },
  // Special styles for TODAY/TOMORROW date chips
  dateChipSpecial: {
    backgroundColor: "rgba(0, 212, 255, 0.95)",
    shadowColor: "#00D4FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 6,
  },
  dateChipTextSpecial: {
    color: "#FFFFFF",
    fontWeight: "800",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  feeChip: {
    backgroundColor: "rgba(255, 215, 0, 0.9)",
    paddingHorizontal: responsiveSize(8, 10, 12),
    paddingVertical: responsiveSize(4, 5, 6),
    borderRadius: responsiveSize(14, 16, 20),
  },
  feeChipText: {
    color: "#000000",
    fontSize: responsiveSize(10, 11, 12),
    fontWeight: "700",
  },
  eventContent: {
    flex: 1,
    justifyContent: "flex-end",
  },
  eventName: {
    fontSize: responsiveSize(18, 22, 26),
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: responsiveSize(6, 8, 10),
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  eventLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: responsiveSize(8, 10, 12),
  },
  eventLocation: {
    fontSize: responsiveSize(13, 15, 16),
    color: "#FFFFFF",
    marginLeft: responsiveSize(4, 6, 8),
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
    paddingHorizontal: responsiveSize(8, 10, 12),
    paddingVertical: responsiveSize(3, 4, 5),
    borderRadius: responsiveSize(8, 10, 12),
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.3)",
  },
  attendeeText: {
    color: "#00D4FF",
    fontSize: responsiveSize(10, 11, 12),
    fontWeight: "600",
    marginLeft: responsiveSize(3, 4, 5),
  },
  artistsPreview: {
    flexDirection: "row",
    alignItems: "center",
  },
  artistPreviewText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(10, 11, 12),
    marginRight: responsiveSize(6, 8, 10),
    opacity: 0.8,
  },
  moreArtistsText: {
    color: "#00D4FF",
    fontSize: responsiveSize(10, 11, 12),
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
    marginTop: responsiveSize(12, 14, 16),
    fontSize: responsiveSize(14, 15, 16),
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: responsiveSize(24, 32, 40),
  },
  emptyText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(16, 18, 20),
    fontWeight: "700",
    textAlign: "center",
    marginBottom: responsiveSize(6, 8, 10),
  },
  emptySubtext: {
    color: "#999999",
    fontSize: responsiveSize(13, 15, 16),
    textAlign: "center",
    lineHeight: responsiveSize(20, 22, 26),
  },
  eventsList: {
    paddingBottom: responsiveSize(80, 100, 120),
    alignItems: 'center',
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
    transform: [{ translateY: -responsiveSize(48, 56, 64) }],
    borderWidth: 2,
    borderColor: "rgba(0, 212, 255, 0.6)",
  },
})

export default EventsScreen
