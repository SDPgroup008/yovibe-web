"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../contexts/AuthContext"
import FirebaseService from "../services/FirebaseService"
import type { Ticket } from "../models/Ticket"
import type { MyTicketsScreenProps } from "../navigation/types"

const MyTicketsScreen: React.FC<MyTicketsScreenProps> = ({ route, navigation }) => {
  const { user } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [filter, setFilter] = useState<"all" | "active" | "used" | "upcoming">("all")

  useEffect(() => {
    loadUserTickets()
  }, [user])

  const loadUserTickets = async () => {
    if (!user) {
      setLoading(false)
      return
    }

    try {
      console.log("📋 MyTicketsScreen: Loading tickets for user:", user.id)
      const userTickets = await FirebaseService.getTicketsByUser(user.id)
      
      // Sort by purchase date (newest first)
      userTickets.sort((a, b) => {
        const dateA = a.purchaseDate instanceof Date ? a.purchaseDate.getTime() : new Date(a.purchaseDate).getTime()
        const dateB = b.purchaseDate instanceof Date ? b.purchaseDate.getTime() : new Date(b.purchaseDate).getTime()
        return dateB - dateA
      })
      
      setTickets(userTickets)
      console.log("📋 MyTicketsScreen: Loaded", userTickets.length, "tickets")
    } catch (error) {
      console.error("📋 MyTicketsScreen: Error loading tickets:", error)
      Alert.alert("Error", "Failed to load tickets")
    } finally {
      setLoading(false)
    }
  }

  const filteredTickets = tickets.filter((ticket) => {
    if (filter === "all") return true
    if (filter === "active") return ticket.status === "active" && !ticket.isScanned
    if (filter === "used") return ticket.status === "used" || ticket.isScanned
    if (filter === "upcoming") {
      const eventDate = ticket.eventStartTime instanceof Date ? ticket.eventStartTime : new Date(ticket.eventStartTime)
      return eventDate > new Date() && ticket.status === "active"
    }
    return true
  })

  const formatDate = (date: Date | string) => {
    const d = date instanceof Date ? date : new Date(date)
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    })
  }

  const formatTime = (date: Date | string) => {
    const d = date instanceof Date ? date : new Date(date)
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  const getStatusColor = (status: string, isScanned: boolean) => {
    if (status === "used" || isScanned) return "#FF6B6B" // Red for used
    if (status === "cancelled") return "#888888" // Gray for cancelled
    if (status === "active") {
      const eventDate = selectedTicket?.eventStartTime instanceof Date 
        ? selectedTicket.eventStartTime 
        : new Date(selectedTicket?.eventStartTime || Date.now())
      if (eventDate < new Date()) return "#FF6B6B" // Event passed
      return "#4CAF50" // Green for active
    }
    return "#00D4FF"
  }

  const getStatusLabel = (ticket: Ticket) => {
    if (ticket.status === "cancelled") return "Cancelled"
    if (ticket.status === "refunded") return "Refunded"
    if (ticket.status === "used" || ticket.isScanned) return "Used"
    const eventDate = ticket.eventStartTime instanceof Date 
      ? ticket.eventStartTime 
      : new Date(ticket.eventStartTime)
    if (eventDate < new Date()) return "Event Ended"
    return "Active"
  }

  const handleViewTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket)
  }

  const handleCloseTicket = () => {
    setSelectedTicket(null)
  }

  const handleRefresh = () => {
    setLoading(true)
    loadUserTickets()
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00D4FF" />
        <Text style={styles.loadingText}>Loading your tickets...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Tickets</Text>
        <TouchableOpacity onPress={handleRefresh}>
          <Ionicons name="refresh" size={24} color="#00D4FF" />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {(["all", "active", "upcoming", "used"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Ticket Summary */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{tickets.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {tickets.filter((t) => t.status === "active" && !t.isScanned).length}
          </Text>
          <Text style={styles.summaryLabel}>Active</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {tickets.filter((t) => t.status === "used" || t.isScanned).length}
          </Text>
          <Text style={styles.summaryLabel}>Used</Text>
        </View>
      </View>

      <ScrollView style={styles.ticketList} showsVerticalScrollIndicator={false}>
        {filteredTickets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="ticket-outline" size={64} color="#444444" />
            <Text style={styles.emptyTitle}>No Tickets Found</Text>
            <Text style={styles.emptyText}>
              {filter === "all" 
                ? "You haven't purchased any tickets yet."
                : `No ${filter} tickets found.`}
            </Text>
          </View>
        ) : (
          filteredTickets.map((ticket) => (
            <TouchableOpacity
              key={ticket.id}
              style={styles.ticketCard}
              onPress={() => handleViewTicket(ticket)}
            >
              <View style={styles.ticketHeader}>
                <View style={styles.ticketEventInfo}>
                  <Text style={styles.ticketEventName} numberOfLines={1}>{ticket.eventName}</Text>
                  <Text style={styles.ticketType}>{ticket.entryFeeType || "Standard"}</Text>
                </View>
                <View style={[styles.ticketStatusBadge, { backgroundColor: getStatusColor(ticket.status, ticket.isScanned) + "20" }]}>
                  <Text style={[styles.ticketStatusText, { color: getStatusColor(ticket.status, ticket.isScanned) }]}>
                    {getStatusLabel(ticket)}
                  </Text>
                </View>
              </View>

              <View style={styles.ticketDetails}>
                <View style={styles.ticketDetailRow}>
                  <Ionicons name="calendar-outline" size={16} color="#888888" />
                  <Text style={styles.ticketDetailText}>
                    {formatDate(ticket.eventStartTime)}
                  </Text>
                </View>
                <View style={styles.ticketDetailRow}>
                  <Ionicons name="time-outline" size={16} color="#888888" />
                  <Text style={styles.ticketDetailText}>
                    {formatTime(ticket.eventStartTime)}
                  </Text>
                </View>
                <View style={styles.ticketDetailRow}>
                  <Ionicons name="wallet-outline" size={16} color="#888888" />
                  <Text style={styles.ticketDetailText}>
                    UGX {ticket.totalAmount.toLocaleString()}
                  </Text>
                </View>
              </View>

              <View style={styles.ticketFooter}>
                <Text style={styles.ticketId}>ID: {ticket.id.substring(0, 12)}...</Text>
                <Ionicons name="chevron-forward" size={20} color="#666666" />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Your Ticket</Text>
              <TouchableOpacity onPress={handleCloseTicket}>
                <Ionicons name="close" size={28} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* QR Code Display */}
            <View style={styles.qrContainer}>
              {selectedTicket.qrCodeDataUrl ? (
                <Image 
                  source={{ uri: selectedTicket.qrCodeDataUrl }} 
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.qrPlaceholder}>
                  <Ionicons name="qr-code" size={120} color="#00D4FF" />
                  <Text style={styles.qrText}>{selectedTicket.qrCode}</Text>
                </View>
              )}
              <Text style={styles.qrInstruction}>
                Present this QR code at the event entrance
              </Text>
            </View>

            {/* Ticket Information */}
            <View style={styles.ticketInfoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Event</Text>
                <Text style={styles.infoValue}>{selectedTicket.eventName}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Ticket Type</Text>
                <Text style={styles.infoValue}>{selectedTicket.entryFeeType || "Standard"}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Date</Text>
                <Text style={styles.infoValue}>{formatDate(selectedTicket.eventStartTime)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Time</Text>
                <Text style={styles.infoValue}>{formatTime(selectedTicket.eventStartTime)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Quantity</Text>
                <Text style={styles.infoValue}>{selectedTicket.quantity}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Amount Paid</Text>
                <Text style={styles.infoValueHighlight}>UGX {selectedTicket.totalAmount.toLocaleString()}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Ticket ID</Text>
                <Text style={styles.infoValueMono}>{selectedTicket.id}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Status</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedTicket.status, selectedTicket.isScanned) + "20" }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(selectedTicket.status, selectedTicket.isScanned) }]}>
                    {getStatusLabel(selectedTicket)}
                  </Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Purchase Date</Text>
                <Text style={styles.infoValue}>{formatDate(selectedTicket.purchaseDate)}</Text>
              </View>
            </View>

            {/* Security Badge */}
            <View style={styles.securityBadge}>
              <Ionicons name="shield-checkmark" size={20} color="#4CAF50" />
              <Text style={styles.securityText}>This ticket is verified and secured by YoVibe</Text>
            </View>
          </ScrollView>
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
    fontSize: 16,
    marginTop: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    paddingTop: 48,
    backgroundColor: "#1a1a1a",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
  },
  filterContainer: {
    flexDirection: "row",
    padding: 16,
    paddingBottom: 8,
    backgroundColor: "#1a1a1a",
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: "#2a2a2a",
    alignItems: "center",
  },
  filterTabActive: {
    backgroundColor: "#00D4FF",
  },
  filterText: {
    color: "#888888",
    fontSize: 12,
    fontWeight: "600",
  },
  filterTextActive: {
    color: "#FFFFFF",
  },
  summaryContainer: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: "#1a1a1a",
    marginBottom: 8,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryValue: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "bold",
  },
  summaryLabel: {
    color: "#888888",
    fontSize: 12,
    marginTop: 4,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: "#333333",
    marginHorizontal: 16,
  },
  ticketList: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 16,
  },
  emptyText: {
    color: "#888888",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 32,
  },
  ticketCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#00D4FF",
  },
  ticketHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  ticketEventInfo: {
    flex: 1,
    marginRight: 12,
  },
  ticketEventName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  ticketType: {
    color: "#00D4FF",
    fontSize: 12,
    marginTop: 4,
  },
  ticketStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ticketStatusText: {
    fontSize: 11,
    fontWeight: "bold",
  },
  ticketDetails: {
    marginBottom: 12,
  },
  ticketDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  ticketDetailText: {
    color: "#888888",
    fontSize: 13,
    marginLeft: 8,
  },
  ticketFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#333333",
    paddingTop: 12,
  },
  ticketId: {
    color: "#666666",
    fontSize: 11,
    fontFamily: "monospace",
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
  },
  modalContent: {
    flex: 1,
    marginTop: 48,
    marginBottom: 100,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
  },
  qrContainer: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: "#1a1a1a",
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  qrImage: {
    width: 200,
    height: 200,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 10,
  },
  qrPlaceholder: {
    alignItems: "center",
    padding: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
  },
  qrText: {
    color: "#000000",
    fontSize: 10,
    marginTop: 8,
    fontFamily: "monospace",
  },
  qrInstruction: {
    color: "#888888",
    fontSize: 14,
    marginTop: 20,
    textAlign: "center",
  },
  ticketInfoCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  infoLabel: {
    color: "#888888",
    fontSize: 14,
  },
  infoValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  infoValueHighlight: {
    color: "#4CAF50",
    fontSize: 16,
    fontWeight: "bold",
  },
  infoValueMono: {
    color: "#00D4FF",
    fontSize: 11,
    fontFamily: "monospace",
    maxWidth: 180,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  securityBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 24,
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
  },
  securityText: {
    color: "#4CAF50",
    fontSize: 12,
    marginLeft: 8,
  },
})

export default MyTicketsScreen
