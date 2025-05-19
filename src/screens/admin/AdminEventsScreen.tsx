"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Alert, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../../services/FirebaseService"
import { useAuth } from "../../contexts/AuthContext"
import type { Event } from "../../models/Event"
import type { AdminEventsScreenProps } from "../../navigation/types"

const AdminEventsScreen: React.FC<AdminEventsScreenProps> = ({ navigation }) => {
  const { user: currentUser } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (currentUser?.userType !== "admin") {
      Alert.alert("Access Denied", "You don't have permission to access this page")
      navigation.goBack()
      return
    }

    loadEvents()
  }, [currentUser, navigation])

  const loadEvents = async () => {
    try {
      setLoading(true)
      const eventsList = await FirebaseService.getEvents()
      setEvents(eventsList)
    } catch (error) {
      console.error("Error loading events:", error)
      Alert.alert("Error", "Failed to load events")
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteEvent = (eventId: string) => {
    Alert.alert("Delete Event", "Are you sure you want to delete this event? This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true)
            await FirebaseService.deleteEvent(eventId)
            Alert.alert("Success", "Event deleted successfully")
            loadEvents()
          } catch (error) {
            console.error("Error deleting event:", error)
            Alert.alert("Error", "Failed to delete event")
            setLoading(false)
          }
        },
      },
    ])
  }

  const handleToggleFeature = async (eventId: string, isFeatured: boolean) => {
    try {
      await FirebaseService.updateEvent(eventId, { isFeatured: !isFeatured })
      Alert.alert("Success", `Event ${isFeatured ? "unfeatured" : "featured"} successfully`)
      loadEvents()
    } catch (error) {
      console.error("Error updating event:", error)
      Alert.alert("Error", "Failed to update event")
    }
  }

  const handleViewEvent = (eventId: string) => {
    navigation.navigate("EventDetail", { eventId })
  }

  const renderEventItem = ({ item }: { item: Event }) => (
    <View style={styles.eventCard}>
      <Image source={{ uri: item.posterImageUrl }} style={styles.eventImage} />
      <View style={styles.eventContent}>
        <Text style={styles.eventName}>{item.name}</Text>
        <Text style={styles.eventVenue}>{item.venueName}</Text>
        <Text style={styles.eventDate}>{item.date.toDateString()}</Text>

        {item.isFeatured && (
          <View style={styles.featuredBadge}>
            <Text style={styles.featuredText}>Featured</Text>
          </View>
        )}

        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.actionButton, styles.viewButton]} onPress={() => handleViewEvent(item.id)}>
            <Ionicons name="eye-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>View</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, item.isFeatured ? styles.unfeaturedButton : styles.featuredButton]}
            onPress={() => handleToggleFeature(item.id, item.isFeatured)}
          >
            <Ionicons name={item.isFeatured ? "star-outline" : "star"} size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>{item.isFeatured ? "Unfeature" : "Feature"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => handleDeleteEvent(item.id)}
          >
            <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading events...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>Manage Events</Text>
      <Text style={styles.subHeaderText}>Total Events: {events.length}</Text>

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={renderEventItem}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No events found</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    padding: 16,
  },
  headerText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  subHeaderText: {
    fontSize: 16,
    color: "#BBBBBB",
    marginBottom: 16,
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
  listContainer: {
    paddingBottom: 16,
  },
  eventCard: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 16,
  },
  eventImage: {
    width: "100%",
    height: 120,
  },
  eventContent: {
    padding: 16,
  },
  eventName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  eventVenue: {
    fontSize: 14,
    color: "#2196F3",
    marginBottom: 4,
  },
  eventDate: {
    fontSize: 14,
    color: "#BBBBBB",
    marginBottom: 16,
  },
  featuredBadge: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: "#FFD700",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  featuredText: {
    color: "#000000",
    fontWeight: "bold",
    fontSize: 12,
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    marginLeft: 8,
    marginBottom: 8,
  },
  viewButton: {
    backgroundColor: "#2196F3",
  },
  featuredButton: {
    backgroundColor: "#FFD700",
  },
  unfeaturedButton: {
    backgroundColor: "#333333",
  },
  deleteButton: {
    backgroundColor: "#FF3B30",
  },
  actionButtonText: {
    color: "#FFFFFF",
    marginLeft: 4,
    fontSize: 14,
  },
  emptyContainer: {
    padding: 24,
    alignItems: "center",
  },
  emptyText: {
    color: "#FFFFFF",
    fontSize: 16,
  },
})

export default AdminEventsScreen
