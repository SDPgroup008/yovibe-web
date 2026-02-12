"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from "react-native"
import { Calendar } from "react-native-calendars"
import { Ionicons } from "@expo/vector-icons"
import { useIsFocused } from "@react-navigation/native"
import FirebaseService from "../services/FirebaseService"
import type { Event } from "../models/Event"
import type { CalendarScreenProps } from "../navigation/types"

type CalendarTheme = {
  backgroundColor?: string
  calendarBackground?: string
  textSectionTitleColor?: string
  selectedDayBackgroundColor?: string
  selectedDayTextColor?: string
  todayTextColor?: string
  dayTextColor?: string
  textDisabledColor?: string
  dotColor?: string
  selectedDotColor?: string
  arrowColor?: string
  monthTextColor?: string
  indicatorColor?: string
}

/** Convert Firestore Timestamp-like values or ISO strings to Date */
const toDateIfTimestamp = (value: any): Date | null => {
  if (!value) return null
  if (typeof value === "object" && typeof value.toDate === "function") {
    try {
      return value.toDate()
    } catch {
      return null
    }
  }
  if (typeof value === "string") {
    const d = new Date(value)
    if (!isNaN(d.getTime())) return d
    return null
  }
  if (value instanceof Date) return value
  if (typeof value === "number") {
    if (value > 1e12) return new Date(value)
    return new Date(value * 1000)
  }
  return null
}

/** Format Date to short time like "09:00 PM" */
const formatTime = (d: Date) => {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return ""
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

/** Build time range from start/end if they exist */
const buildTimeRange = (startRaw: any, endRaw: any): string | null => {
  const start = toDateIfTimestamp(startRaw)
  const end = toDateIfTimestamp(endRaw)

  if (start && end) {
    return `${formatTime(start)} - ${formatTime(end)}`
  }
  if (start) return formatTime(start)
  if (end) return formatTime(end)
  return null
}

/** Normalize event but preserve existing string time if present */
const normalizeEvent = (raw: any): Event => {
  const e = { ...(raw as any) } as any

  // Normalize date to Date object if possible
  let dateObj: Date | null = null
  if (e.date) dateObj = toDateIfTimestamp(e.date)
  if (!dateObj && (e.startTime || e.start)) dateObj = toDateIfTimestamp(e.startTime || e.start)
  if (!dateObj && e.createdAt) dateObj = toDateIfTimestamp(e.createdAt)
  if (!dateObj) dateObj = new Date()
  e.date = dateObj

  // Preserve existing string time exactly as stored in Firestore
  if (typeof e.time === "string" && e.time.trim() !== "") {
    // keep it as-is (e.g., "21:00 - 05:00")
  } else {
    // If no string time, try to build from start/end fields
    const timeRange = buildTimeRange(e.startTime || e.start, e.endTime || e.end)
    if (timeRange) {
      e.time = timeRange
    } else {
      // If time is a Timestamp-like single value, convert to formatted string
      const singleTime = toDateIfTimestamp(e.time)
      if (singleTime) e.time = formatTime(singleTime)
      else e.time = e.time || "" // keep empty string if nothing available
    }
  }

  return e as Event
}

const EventCalendarScreen: React.FC<CalendarScreenProps> = ({ navigation }) => {
  const isFocused = useIsFocused()
  const [events, setEvents] = useState<Event[]>([])
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0])
  const [markedDates, setMarkedDates] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Initial data load only
  useEffect(() => {
    if (events.length === 0) {
      loadEvents()
    }
  }, [])

  const loadEvents = async (isRefresh: boolean = false) => {
    try {
      if (!isRefresh) {
        setLoading(true)
      }
      const rawEvents = await FirebaseService.getEvents()
      const normalized: Event[] = (rawEvents || []).map((ev: any) => normalizeEvent(ev))
      setEvents(normalized)

      const marked: Record<string, any> = {}
      normalized.forEach((event) => {
        const dateStr = (event.date instanceof Date ? event.date : new Date(event.date)).toISOString().split("T")[0]
        marked[dateStr] = {
          marked: true,
          dotColor: "#2196F3",
          selectedColor: dateStr === selectedDate ? "#2196F3" : undefined,
          selected: dateStr === selectedDate,
        }
      })

      if (!marked[selectedDate]) {
        marked[selectedDate] = { selected: true, selectedColor: "#2196F3" }
      }

      setMarkedDates(marked)
    } catch (error) {
      console.error("Error loading events for calendar:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    await loadEvents(true)
  }, [])

  const handleDateSelect = (day: any) => {
    const newSelectedDate = day.dateString
    setSelectedDate(newSelectedDate)

    const newMarkedDates = { ...markedDates }
    if (markedDates[selectedDate]) {
      newMarkedDates[selectedDate] = { ...markedDates[selectedDate], selected: false }
    }
    newMarkedDates[newSelectedDate] = { ...(markedDates[newSelectedDate] || {}), selected: true, selectedColor: "#2196F3" }
    setMarkedDates(newMarkedDates)
  }

  const filteredEvents = events.filter((event) => {
    const eventDate = (event.date instanceof Date ? event.date : new Date(event.date)).toISOString().split("T")[0]
    return eventDate === selectedDate
  })

  const getEventTime = (event: Event): string => {
    if (event.time && typeof event.time === "string" && event.time.trim() !== "") {
      return event.time // will return "21:00 - 05:00" if stored that way
    }
    const fallback = buildTimeRange((event as any).startTime || (event as any).start, (event as any).endTime || (event as any).end)
    return fallback || "Time TBD"
  }

  return (
    <View style={styles.container}>
      <Calendar
        theme={
          {
            backgroundColor: "#121212",
            calendarBackground: "#1E1E1E",
            textSectionTitleColor: "#FFFFFF",
            selectedDayBackgroundColor: "#2196F3",
            selectedDayTextColor: "#FFFFFF",
            todayTextColor: "#2196F3",
            dayTextColor: "#FFFFFF",
            textDisabledColor: "#444444",
            dotColor: "#2196F3",
            selectedDotColor: "#FFFFFF",
            arrowColor: "#2196F3",
            monthTextColor: "#FFFFFF",
            indicatorColor: "#2196F3",
          } as CalendarTheme
        }
        markedDates={markedDates}
        onDayPress={handleDateSelect}
        enableSwipeMonths={true}
      />

      <View style={styles.eventsContainer}>
        <View style={styles.dateTitleContainer}>
          <Text style={styles.dateTitle}>Events on {new Date(selectedDate).toDateString()}</Text>
          {!loading && (
            <View style={styles.eventCountBadge}>
              <Text style={styles.eventCountText}>{filteredEvents.length}</Text>
            </View>
          )}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={styles.loadingText}>Loading events...</Text>
          </View>
        ) : filteredEvents.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={64} color="#666666" />
            <Text style={styles.emptyText}>No events on this date</Text>
          </View>
        ) : (
          <FlatList
            data={filteredEvents}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.eventCard}
                onPress={() => {
                  navigation.navigate("EventDetail", { eventId: item.id })
                }}
              >
                <View style={styles.eventTimeContainer}>
                  <Text style={styles.eventTime}>{getEventTime(item)}</Text>
                </View>
                <View style={styles.eventDetails}>
                  <Text style={styles.eventName}>{item.name}</Text>
                  <Text style={styles.eventVenue}>{item.venueName}</Text>
                </View>
              </TouchableOpacity>
            )}
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
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  eventsContainer: {
    flex: 1,
    padding: 16,
  },
  dateTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  dateTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  eventCountBadge: {
    backgroundColor: "#2196F3",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    minWidth: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  eventCountText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#FFFFFF",
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "#FFFFFF",
    fontSize: 18,
    marginTop: 16,
  },
  eventCard: {
    flexDirection: "row",
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
  },
  eventTimeContainer: {
    width: 80,
    padding: 12,
    backgroundColor: "#2196F3",
    justifyContent: "center",
    alignItems: "center",
  },
  eventTime: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  eventDetails: {
    flex: 1,
    padding: 12,
  },
  eventName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  eventVenue: {
    fontSize: 14,
    color: "#BBBBBB",
    marginTop: 4,
  },
})

export default EventCalendarScreen
