"use client"

import { useState, useEffect } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../contexts/AuthContext"
import FirebaseService from "../services/FirebaseService"
import type { Ticket } from "../models/Ticket"

interface PurchasedTicketsScreenProps {
  navigation: any
}

export default function PurchasedTicketsScreen({ navigation }: PurchasedTicketsScreenProps) {
  const { user } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<"verified" | "not_verified">("verified")

  useEffect(() => {
    loadTickets()
  }, [user])

  const loadTickets = async () => {
    if (!user) return

    try {
      setLoading(true)
      const userTickets = await FirebaseService.getTicketsByUser(user.id)
      setTickets(userTickets)
    } catch (error) {
      console.error("Error loading tickets:", error)
      Alert.alert("Error", "Failed to load tickets")
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadTickets()
    setRefreshing(false)
  }

  const getFilteredTickets = () => {
    return tickets.filter((ticket) => {
      if (activeTab === "verified") {
        return ticket.isVerified || ticket.status === "used"
      } else {
        return !ticket.isVerified && ticket.status === "active"
      }
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "#00D4AA"
      case "used":
        return "#007AFF"
      case "cancelled":
        return "#FF6B6B"
      case "refunded":
        return "#FF9500"
      default:
        return "#666"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return "checkmark-circle"
      case "used":
        return "checkmark-done-circle"
      case "cancelled":
        return "close-circle"
      case "refunded":
        return "return-up-back"
      default:
        return "help-circle"
    }
  }

  const renderTicketCard = (ticket: Ticket) => (
    <TouchableOpacity
      key={ticket.id}
      style={styles.ticketCard}
      onPress={() => navigation.navigate("TicketDetail", { ticketId: ticket.id })}
    >
      <View style={styles.ticketHeader}>
        {ticket.eventPosterUrl && <Image source={{ uri: ticket.eventPosterUrl }} style={styles.eventImage} />}
        <View style={styles.ticketInfo}>
          <Text style={styles.eventName}>{ticket.eventName}</Text>
          <Text style={styles.ticketType}>{ticket.ticketType.toUpperCase()} TICKET</Text>
          <Text style={styles.purchaseDate}>Purchased: {ticket.purchaseDate.toLocaleDateString()}</Text>
        </View>
        <View style={styles.statusContainer}>
          <Ionicons name={getStatusIcon(ticket.status) as any} size={24} color={getStatusColor(ticket.status)} />
          <Text style={[styles.statusText, { color: getStatusColor(ticket.status) }]}>
            {ticket.status.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.ticketDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Quantity:</Text>
          <Text style={styles.detailValue}>{ticket.quantity}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Total Amount:</Text>
          <Text style={styles.detailValue}>UGX {ticket.totalAmount.toLocaleString()}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Payment Method:</Text>
          <Text style={styles.detailValue}>{ticket.paymentMethod || "N/A"}</Text>
        </View>
      </View>

      {ticket.ticketType === "secure" && ticket.buyerImageUrl && (
        <View style={styles.secureTicketIndicator}>
          <Ionicons name="shield-checkmark" size={16} color="#00D4AA" />
          <Text style={styles.secureTicketText}>Secure Ticket with Photo Verification</Text>
        </View>
      )}

      {ticket.validationHistory.length > 0 && (
        <View style={styles.validationInfo}>
          <Text style={styles.validationText}>
            Last validated:{" "}
            {ticket.validationHistory[ticket.validationHistory.length - 1].validatedAt.toLocaleDateString()}
          </Text>
        </View>
      )}

      <View style={styles.qrCodeContainer}>
        {ticket.qrCode ? (
          <Image source={{ uri: ticket.qrCode }} style={styles.qrCode} />
        ) : (
          <View style={styles.qrCodePlaceholder}>
            <Ionicons name="qr-code" size={32} color="#666" />
            <Text style={styles.qrCodePlaceholderText}>QR Code Unavailable</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  )

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="ticket-outline" size={64} color="#CCCCCC" />
      <Text style={styles.emptyStateTitle}>No Tickets Found</Text>
      <Text style={styles.emptyStateText}>
        {activeTab === "verified"
          ? "You don't have any verified tickets yet."
          : "You don't have any unverified tickets."}
      </Text>
      <TouchableOpacity style={styles.browseEventsButton} onPress={() => navigation.navigate("Events")}>
        <Text style={styles.browseEventsButtonText}>Browse Events</Text>
      </TouchableOpacity>
    </View>
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading your tickets...</Text>
      </View>
    )
  }

  const filteredTickets = getFilteredTickets()

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Tickets</Text>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "verified" && styles.activeTab]}
          onPress={() => setActiveTab("verified")}
        >
          <Text style={[styles.tabText, activeTab === "verified" && styles.activeTabText]}>
            Verified ({tickets.filter((t) => t.isVerified || t.status === "used").length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "not_verified" && styles.activeTab]}
          onPress={() => setActiveTab("not_verified")}
        >
          <Text style={[styles.tabText, activeTab === "not_verified" && styles.activeTabText]}>
            Active ({tickets.filter((t) => !t.isVerified && t.status === "active").length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredTickets.length > 0 ? filteredTickets.map(renderTicketCard) : renderEmptyState()}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    paddingTop: 50,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E7",
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E7",
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: "#007AFF",
  },
  tabText: {
    fontSize: 16,
    color: "#666",
  },
  activeTabText: {
    color: "#007AFF",
    fontWeight: "600",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  ticketCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  ticketHeader: {
    flexDirection: "row",
    padding: 16,
    alignItems: "center",
  },
  eventImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  ticketInfo: {
    flex: 1,
  },
  eventName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  ticketType: {
    fontSize: 12,
    color: "#007AFF",
    fontWeight: "600",
    marginBottom: 2,
  },
  purchaseDate: {
    fontSize: 12,
    color: "#666",
  },
  statusContainer: {
    alignItems: "center",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  ticketDetails: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 14,
    color: "#666",
  },
  detailValue: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },
  secureTicketIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  secureTicketText: {
    fontSize: 12,
    color: "#00D4AA",
    marginLeft: 4,
    fontWeight: "500",
  },
  validationInfo: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  validationText: {
    fontSize: 12,
    color: "#007AFF",
    fontStyle: "italic",
  },
  qrCodeContainer: {
    alignItems: "center",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E5E7",
  },
  qrCode: {
    width: 120,
    height: 120,
    borderRadius: 8,
  },
  qrCodePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 8,
    backgroundColor: "#F8F9FA",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E5E7",
  },
  qrCodePlaceholderText: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  browseEventsButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  browseEventsButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
})
