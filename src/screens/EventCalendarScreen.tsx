"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from "react-native"
import { Calendar } from "react-native-calendars"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../services/FirebaseService"
import type { Event } from "../models/Event"
import type { EventCalendarScreenProps } from "../navigation/types"

// Define the CalendarTheme type manually since it's not exported
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
  // Add any other properties you need
}

const EventCalendarScreen: React.FC<EventCalendarScreenProps> = ({ navigation }) => {
  const [events, setEvents] = useState<Event[]>([])
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0])
  const [markedDates, setMarkedDates] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadEvents()
    })

    return unsubscribe
  }, [navigation])

  const loadEvents = async () => {
    try {
      setLoading(true)
      const allEvents = await FirebaseService.getEvents()
      setEvents(allEvents)

      // Mark dates with events
      const marked: Record<string, any> = {}
      allEvents.forEach((event) => {
        const dateStr = event.date.toISOString().split("T")[0]
        marked[dateStr] = {
          marked: true,
          dotColor: "#2196F3",
          selectedColor: dateStr === selectedDate ? "#2196F3" : undefined,
          selected: dateStr === selectedDate,
        }
      })

      // Mark selected date if it doesn't have events
      if (!marked[selectedDate]) {
        marked[selectedDate] = {
          selected: true,
          selectedColor: "#2196F3",
        }
      }

      setMarkedDates(marked)
    } catch (error) {
      console.error("Error loading events for calendar:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleDateSelect = (day: any) => {
    const newSelectedDate = day.dateString
    setSelectedDate(newSelectedDate)

    // Update marked dates
    const newMarkedDates = { ...markedDates }

    // Remove selection from previous date
    if (markedDates[selectedDate]) {
      newMarkedDates[selectedDate] = {
        ...markedDates[selectedDate],
        selected: false,
      }
    }

    // Add selection to new date
    newMarkedDates[newSelectedDate] = {
      ...(markedDates[newSelectedDate] || {}),
      selected: true,
      selectedColor: "#2196F3",
    }

    setMarkedDates(newMarkedDates)
  }

  const filteredEvents = events.filter((event) => {
    const eventDate = event.date.toISOString().split("T")[0]
    return eventDate === selectedDate
  })

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
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
        <Text style={styles.dateTitle}>Events on {new Date(selectedDate).toDateString()}</Text>

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
                  navigation.navigate("Events", {
                    screen: "EventDetail",
                    params: { eventId: item.id },
                  })
                }}
              >
                <View style={styles.eventTimeContainer}>
                  <Text style={styles.eventTime}>{formatTime(item.date)}</Text>
                </View>
                <View style={styles.eventDetails}>
                  <Text style={styles.eventName}>{item.name}</Text>
                  <Text style={styles.eventVenue}>{item.venueName}</Text>
                </View>
              </TouchableOpacity>
            )}
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
  dateTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 16,
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
