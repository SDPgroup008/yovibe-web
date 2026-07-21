"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Alert, ActivityIndicator, Modal, TextInput } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import SupabaseService from "../../services/SupabaseService"
import { useAuth } from "../../contexts/AuthContext"
import type { Event } from "../../models/Event"
import type { AdminEventsScreenProps } from "../../navigation/types"

const AdminEventsScreen: React.FC<AdminEventsScreenProps> = ({ navigation }) => {
  const { user: currentUser } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [statusModalVisible, setStatusModalVisible] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [actionStatus, setActionStatus] = useState<"cancelled" | "postponed" | null>(null)
  const [postponedDate, setPostponedDate] = useState("")
  const [statusUpdating, setStatusUpdating] = useState(false)

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
      const eventsList = await SupabaseService.getEvents()
      setEvents(eventsList)
    } catch (error) {
      console.error("Error loading events:", error)
      Alert.alert("Error", "Failed to load events")
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteEvent = (eventId: string) => {
    const confirmed = window.confirm("Are you sure you want to delete this event? This action cannot be undone.")
    if (confirmed) performDelete(eventId)
  }

  const performDelete = async (eventId: string) => {
    try {
      setLoading(true)
      await SupabaseService.deleteEvent(eventId)
      Alert.alert("Success", "Event deleted successfully")
      loadEvents()
    } catch (error) {
      console.error("Error deleting event:", error)
      Alert.alert("Error", "Failed to delete event")
      setLoading(false)
    }
  }

  const handleToggleFeature = async (eventId: string, isFeatured: boolean) => {
    try {
      await SupabaseService.updateEvent(eventId, { isFeatured: !isFeatured })
      Alert.alert("Success", `Event ${isFeatured ? "unfeatured" : "featured"} successfully`)
      loadEvents()
    } catch (error) {
      console.error("Error updating event:", error)
      Alert.alert("Error", "Failed to update event")
    }
  }

  const openStatusModal = (event: Event, action: "cancelled" | "postponed") => {
    setSelectedEvent(event)
    setActionStatus(action)
    setPostponedDate("")
    setStatusModalVisible(true)
  }

  const confirmStatusChange = async () => {
    if (!selectedEvent || !actionStatus) return
    if (actionStatus === "postponed" && !postponedDate.trim()) {
      Alert.alert("Date Required", "Please enter a new date for the postponed event")
      return
    }
    setStatusUpdating(true)
    try {
      await SupabaseService.updateEvent(selectedEvent.slug || selectedEvent.id, {
        eventStatus: actionStatus,
        ...(actionStatus === "postponed" && postponedDate.trim()
          ? { postponedTo: new Date(postponedDate) }
          : {}),
      } as any)
      setStatusModalVisible(false)
      Alert.alert("Success", `Event ${actionStatus === "cancelled" ? "cancelled" : "postponed"} successfully`)
      loadEvents()
    } catch (error) {
      console.error("Error updating event status:", error)
      Alert.alert("Error", "Failed to update event status")
    } finally {
      setStatusUpdating(false)
    }
  }

  const handleViewEvent = (eventId: string) => {
    navigation.navigate("EventDetail", { eventId })
  }

  const getStatusBadge = (event: Event) => {
    const status = event.eventStatus || "scheduled"
    const config: Record<string, { label: string; color: string; bg: string }> = {
      scheduled: { label: "Scheduled", color: "#4CAF50", bg: "rgba(76,175,80,0.15)" },
      cancelled: { label: "Cancelled", color: "#FF6B6B", bg: "rgba(255,107,107,0.15)" },
      postponed: { label: "Postponed", color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
    }
    return config[status] || config.scheduled
  }

  const renderEventItem = ({ item }: { item: Event }) => {
    const badge = getStatusBadge(item)
    return (
      <View style={styles.eventCard}>
        <Image source={{ uri: item.posterImageUrl }} style={styles.eventImage} />
        <View style={styles.eventContent}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Text style={styles.eventName}>{item.name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.statusBadgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
          </View>
          <Text style={styles.eventVenue}>{item.venueName}</Text>
          <Text style={styles.eventDate}>{item.date.toDateString()}</Text>
          <View style={styles.actionButtons}>
            <TouchableOpacity style={[styles.actionButton, styles.viewButton]} onPress={() => handleViewEvent(item.id)}>
              <Ionicons name="eye-outline" size={18} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>View</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={() => openStatusModal(item, "cancelled")}>
              <Ionicons name="close-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.postponeButton]} onPress={() => openStatusModal(item, "postponed")}>
              <Ionicons name="calendar-outline" size={18} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Postpone</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, item.isFeatured ? styles.unfeaturedButton : styles.featuredButton]} onPress={() => handleToggleFeature(item.id, item.isFeatured)}>
              <Ionicons name={item.isFeatured ? "star-outline" : "star"} size={18} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>{item.isFeatured ? "Unfeature" : "Feature"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => handleDeleteEvent(item.id)}>
              <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

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
      <Modal visible={statusModalVisible} transparent animationType="fade" onRequestClose={() => setStatusModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {actionStatus === "cancelled" ? "Cancel Event" : "Postpone Event"}
            </Text>
            <Text style={styles.modalSub}>
              {actionStatus === "cancelled"
                ? "This will mark the event as cancelled. All ticket purchasers will be eligible for refunds."
                : "Set a new date for this event. Existing tickets remain valid."}
            </Text>
            <Text style={styles.modalEventName}>{selectedEvent?.name}</Text>
            {actionStatus === "postponed" && (
              <TextInput
                style={styles.dateInput}
                value={postponedDate}
                onChangeText={setPostponedDate}
                placeholder="New date (YYYY-MM-DD)"
                placeholderTextColor="#888"
              />
            )}
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setStatusModalVisible(false)}>
                <Text style={styles.modalCancelBtnText}>Go Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={confirmStatusChange} disabled={statusUpdating}>
                {statusUpdating ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>
                    {actionStatus === "cancelled" ? "Confirm Cancellation" : "Confirm Postponement"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0f", padding: 16 },
  headerText: { fontSize: 24, fontWeight: "800", color: "#FFFFFF", marginBottom: 4, letterSpacing: -0.5 },
  subHeaderText: { fontSize: 14, color: "#888", marginBottom: 16 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0a0a0f" },
  loadingText: { color: "#FFFFFF", marginTop: 16 },
  listContainer: { paddingBottom: 16 },
  eventCard: { backgroundColor: "#13131a", borderRadius: 14, overflow: "hidden", marginBottom: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  eventImage: { width: "100%", height: 140 },
  eventContent: { padding: 16 },
  eventName: { fontSize: 18, fontWeight: "700", color: "#FFFFFF", flex: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusBadgeText: { fontSize: 11, fontWeight: "700" },
  eventVenue: { fontSize: 14, color: "#2196F3", marginBottom: 2 },
  eventDate: { fontSize: 13, color: "#888", marginBottom: 14 },
  actionButtons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionButton: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 4 },
  actionButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  viewButton: { backgroundColor: "#2196F3" },
  cancelButton: { backgroundColor: "#DC2626" },
  postponeButton: { backgroundColor: "#F59E0B" },
  featuredButton: { backgroundColor: "#FFD700" },
  unfeaturedButton: { backgroundColor: "#333" },
  deleteButton: { backgroundColor: "rgba(255,59,48,0.2)" },
  emptyContainer: { padding: 24, alignItems: "center" },
  emptyText: { color: "#888", fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalBox: { backgroundColor: "#1a1a2e", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  modalTitle: { fontSize: 20, fontWeight: "800", color: "#FFF", marginBottom: 8 },
  modalSub: { fontSize: 13, color: "#888", lineHeight: 20, marginBottom: 16 },
  modalEventName: { fontSize: 16, fontWeight: "600", color: "#F59E0B", marginBottom: 16 },
  dateInput: { backgroundColor: "#0a0a0f", color: "#FFF", padding: 14, borderRadius: 10, fontSize: 14, marginBottom: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  modalRow: { flexDirection: "row", gap: 12 },
  modalCancelBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: "#222", alignItems: "center" },
  modalCancelBtnText: { color: "#888", fontWeight: "600", fontSize: 14 },
  modalConfirmBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: "#2196F3", alignItems: "center" },
  modalConfirmBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
})

export default AdminEventsScreen
