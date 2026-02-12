"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Modal,
  RefreshControl,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { NativeStackScreenProps } from "@react-navigation/native-stack"
import FirebaseService from "../services/FirebaseService"
import VibeAnalysisService from "../services/VibeAnalysisService"
import type { VibeImage } from "../models/VibeImage"
import { VenuesStackParamList, ProfileStackParamList } from "../navigation/types"

type TodaysVibeScreenProps = NativeStackScreenProps<
  VenuesStackParamList | ProfileStackParamList,
  "TodaysVibe"
>

const TodaysVibeScreen: React.FC<TodaysVibeScreenProps> = ({ navigation, route }) => {
  const { venueId, venueName } = route.params
  const [activeTab, setActiveTab] = useState<"today" | "week">("today")
  const [todayVibes, setTodayVibes] = useState<VibeImage[]>([])
  const [weekVibes, setWeekVibes] = useState<Record<string, VibeImage[]>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<VibeImage | null>(null)
  const [displayedTodayVibes, setDisplayedTodayVibes] = useState<VibeImage[]>([])
  const [currentTodayPage, setCurrentTodayPage] = useState(1)
  const ITEMS_PER_PAGE = 5;

  const screenWidth = Dimensions.get("window").width
  const imageSize = (screenWidth - 48) / 2 // 2 columns with padding

  // Initial data load only
  useEffect(() => {
    loadVibeData()
  }, [venueId])

  useEffect(() => {
    // Reset pagination when todayVibes changes
    setCurrentTodayPage(1);
    setDisplayedTodayVibes(todayVibes.slice(0, ITEMS_PER_PAGE));
  }, [todayVibes]);

  const loadMoreTodayVibes = () => {
    if (displayedTodayVibes.length >= todayVibes.length) {
      return; // No more items to load
    }
    const nextPage = currentTodayPage + 1;
    const startIndex = 0;
    const endIndex = nextPage * ITEMS_PER_PAGE;
    setDisplayedTodayVibes(todayVibes.slice(startIndex, endIndex));
    setCurrentTodayPage(nextPage);
  };

  const loadVibeData = async (isRefresh: boolean = false) => {
    try {
      if (!isRefresh) {
        setLoading(true)
      }

      // Load today's vibes
      const today = new Date()
      console.log("Loading vibes for today:", today.toDateString())
      const todayVibeImages = await FirebaseService.getVibeImagesByVenueAndDate(venueId, today)
      // Sort by uploadedAt in descending order (most recent first)
      const sortedTodayVibes = todayVibeImages.sort(
        (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()
      )
      console.log("Today's vibes loaded:", sortedTodayVibes.length)
      setTodayVibes(sortedTodayVibes)

      // Load week's vibes
      console.log("Loading week's vibes...")
      const weekData = await FirebaseService.getVibeImagesByVenueAndWeek(venueId)
      // Sort vibes within each day by uploadedAt in descending order
      const sortedWeekData = Object.fromEntries(
        Object.entries(weekData).map(([day, vibes]) => [
          day,
          vibes.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()),
        ])
      )
      console.log("Week's vibes loaded:", Object.keys(sortedWeekData).length, "days")
      setWeekVibes(sortedWeekData)
    } catch (error) {
      console.error("Error loading vibe data:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    await loadVibeData(true)
  }, [venueId])

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  const formatDay = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return "Today"
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday"
    } else {
      return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })
    }
  }

  const renderVibeImage = ({ item }: { item: VibeImage }) => (
    <TouchableOpacity
      style={styles.vibeImageCard}
      onPress={() => setSelectedImage(item)}
    >
      <Image source={{ uri: item.imageUrl }} style={[styles.vibeImage, { width: imageSize, height: imageSize }]} />
      <View style={styles.vibeOverlay}>
        <View style={styles.vibeRatingBadge}>
          <Text style={[styles.vibeRatingText, { color: VibeAnalysisService.getVibeColor(item.vibeRating) }]}>
            {item.vibeRating.toFixed(1)}
          </Text>
        </View>
        <Text style={styles.vibeTime}>{formatTime(item.uploadedAt)}</Text>
      </View>
    </TouchableOpacity>
  )

  const renderWeekDay = ({ item: [day, vibes] }: { item: [string, VibeImage[]] }) => (
    <TouchableOpacity
      style={[styles.weekDayCard, selectedDay === day && styles.selectedWeekDayCard]}
      onPress={() => setSelectedDay(selectedDay === day ? null : day)}
    >
      <View style={styles.weekDayHeader}>
        <Text style={styles.weekDayTitle}>{formatDay(day)}</Text>
        <View style={styles.weekDayMeta}>
          <Text style={styles.weekDayCount}>
            {vibes.length} vibe{vibes.length !== 1 ? "s" : ""}
          </Text>
          <Ionicons name={selectedDay === day ? "chevron-up" : "chevron-down"} size={20} color="#FFFFFF" />
        </View>
      </View>

      {selectedDay === day && (
        <FlatList
          key={`week-vibes-${day}`}
          data={vibes}
          renderItem={renderVibeImage}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.vibeRow}
          style={styles.weekDayVibes}
        />
      )}
    </TouchableOpacity>
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading vibe data...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{venueName}</Text>
        <Text style={styles.headerSubtitle}>Vibe Gallery</Text>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "today" && styles.activeTab]}
          onPress={() => setActiveTab("today")}
        >
          <Text style={[styles.tabText, activeTab === "today" && styles.activeTabText]}>Today's Vibe</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === "week" && styles.activeTab]}
          onPress={() => setActiveTab("week")}
        >
          <Text style={[styles.tabText, activeTab === "week" && styles.activeTabText]}>Week's Vibe</Text>
        </TouchableOpacity>
      </View>

      {activeTab === "today" ? (
        <View style={styles.content}>
          {todayVibes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="camera-outline" size={64} color="#666666" />
              <Text style={styles.emptyText}>No vibes captured today</Text>
              <Text style={styles.emptySubtext}>Check back later for today's atmosphere</Text>
            </View>
          ) : (
            <FlatList
              key="today-vibes"
              data={displayedTodayVibes}
              renderItem={renderVibeImage}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={styles.vibeRow}
              contentContainerStyle={styles.vibeGrid}
              onEndReached={loadMoreTodayVibes}
              onEndReachedThreshold={0.5}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={["#2196F3"]}
                  tintColor="#2196F3"
                />
              }
            />
          )}
        </View>
      ) : (
        <View style={styles.content}>
          {Object.keys(weekVibes).length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={64} color="#666666" />
              <Text style={styles.emptyText}>No vibes captured this week</Text>
              <Text style={styles.emptySubtext}>Check back later for weekly vibes</Text>
            </View>
          ) : (
            <FlatList
              key="week-days"
              data={Object.entries(weekVibes).sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())}
              renderItem={renderWeekDay}
              keyExtractor={([day]) => day}
              contentContainerStyle={styles.weekList}
              numColumns={1}
            />
          )}
        </View>
      )}

      <Modal
        visible={selectedImage !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedImage(null)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.modalCloseButton}
            onPress={() => setSelectedImage(null)}
          >
            <Ionicons name="close" size={30} color="#FFFFFF" />
          </TouchableOpacity>
          {selectedImage && (
            <View style={styles.modalContent}>
              <Image
                source={{ uri: selectedImage.imageUrl }}
                style={[styles.fullSizeImage, { width: screenWidth - 40, height: (screenWidth - 40) * 1.5 }]}
                resizeMode="contain"
              />
              <View style={styles.modalOverlay}>
                <View style={styles.vibeRatingBadge}>
                  <Text style={[styles.vibeRatingText, { color: VibeAnalysisService.getVibeColor(selectedImage.vibeRating) }]}>
                    {selectedImage.vibeRating.toFixed(1)}
                  </Text>
                </View>
                <Text style={styles.vibeTime}>{formatTime(selectedImage.uploadedAt)}</Text>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
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
    marginTop: 16,
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
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: "#2196F3",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#1E1E1E",
    margin: 16,
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: "#2196F3",
  },
  tabText: {
    fontSize: 16,
    color: "#BBBBBB",
    fontWeight: "bold",
  },
  activeTabText: {
    color: "#FFFFFF",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 16,
  },
  emptySubtext: {
    color: "#BBBBBB",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  vibeGrid: {
    paddingBottom: 16,
  },
  vibeRow: {
    justifyContent: "space-between",
    marginBottom: 16,
  },
  vibeImageCard: {
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  vibeImage: {
    borderRadius: 12,
  },
  vibeOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  vibeRatingBadge: {
    backgroundColor: "rgba(0,0,0,0.8)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  vibeRatingText: {
    fontSize: 14,
    fontWeight: "bold",
  },
  vibeTime: {
    color: "#FFFFFF",
    fontSize: 12,
  },
  weekList: {
    paddingBottom: 16,
  },
  weekDayCard: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
  },
  selectedWeekDayCard: {
    borderWidth: 1,
    borderColor: "#2196F3",
  },
  weekDayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  weekDayTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  weekDayMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  weekDayCount: {
    fontSize: 14,
    color: "#BBBBBB",
    marginRight: 8,
  },
  weekDayVibes: {
    padding: 16,
    paddingTop: 0,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    position: "relative",
    alignItems: "center",
  },
  fullSizeImage: {
    borderRadius: 12,
  },
  modalCloseButton: {
    position: "absolute",
    top: 40,
    right: 20,
    zIndex: 1,
  },
  modalOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
})

export default TodaysVibeScreen