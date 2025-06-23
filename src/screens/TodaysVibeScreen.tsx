"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator, Dimensions } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../services/FirebaseService"
import VibeAnalysisService from "../services/VibeAnalysisService"
import type { VibeImage } from "../models/VibeImage"

interface TodaysVibeScreenProps {
  navigation: any
  route: {
    params: {
      venueId: string
      venueName: string
    }
  }
}

const TodaysVibeScreen: React.FC<TodaysVibeScreenProps> = ({ navigation, route }) => {
  const { venueId, venueName } = route.params
  const [activeTab, setActiveTab] = useState<"today" | "week">("today")
  const [todayVibes, setTodayVibes] = useState<VibeImage[]>([])
  const [weekVibes, setWeekVibes] = useState<Record<string, VibeImage[]>>({})
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const screenWidth = Dimensions.get("window").width
  const imageSize = (screenWidth - 48) / 2 // 2 columns with padding

  useEffect(() => {
    loadVibeData()  
  }, [venueId])

  const loadVibeData = async () => {
    try {
      setLoading(true)

      // Load today's vibes
      const today = new Date()
      const todayVibeImages = await FirebaseService.getVibeImagesByVenueAndDate(venueId, today)
      setTodayVibes(todayVibeImages)

      // Load week's vibes
      const weekData = await FirebaseService.getVibeImagesByVenueAndWeek(venueId)
      setWeekVibes(weekData)
    } catch (error) {
      console.error("Error loading vibe data:", error)
    } finally {
      setLoading(false)
    }
  }

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
    <View style={styles.vibeImageCard}>
      <Image source={{ uri: item.imageUrl }} style={[styles.vibeImage, { width: imageSize, height: imageSize }]} />
      <View style={styles.vibeOverlay}>
        <View style={styles.vibeRatingBadge}>
          <Text style={[styles.vibeRatingText, { color: VibeAnalysisService.getVibeColor(item.vibeRating) }]}>
            {item.vibeRating.toFixed(1)}
          </Text>
        </View>
        <Text style={styles.vibeTime}>{formatTime(item.uploadedAt)}</Text>
      </View>
    </View>
  )

  const renderWeekDay = (day: string, vibes: VibeImage[]) => (
    <TouchableOpacity
      key={day}
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
              data={todayVibes}
              renderItem={renderVibeImage}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={styles.vibeRow}
              contentContainerStyle={styles.vibeGrid}
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
              data={Object.entries(weekVibes).sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())}
              renderItem={({ item: [day, vibes] }) => renderWeekDay(day, vibes)}
              keyExtractor={([day]) => day}
              contentContainerStyle={styles.weekList}
            />
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
})

export default TodaysVibeScreen
