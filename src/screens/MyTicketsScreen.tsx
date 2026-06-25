"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useCompatNavigation } from "../utils/compatNavigation"
import { useCachedUserTickets } from "../hooks/useDataCache"
import { useMyTicketsScroll } from "../hooks/useScrollPersistence"
import { useAuth } from "../contexts/AuthContext"
import SupabaseService from "../services/SupabaseService"
import * as Printing from "expo-print"
import * as Sharing from "expo-sharing"
import { Platform } from "react-native"
import type { Ticket } from "../models/Ticket"

// Generate short ticket reference like YV-2026-X5RD or YVG-<event>-<timestamp> for table tickets
const shortTicketRef = (ticket: Ticket): string => {
  if (ticket.ticketRef) {
    return ticket.ticketRef
  }
  
  const year = new Date().getFullYear()
  const suffix = (ticket.id.match(/[A-Za-z0-9]{4}$/) || ["XXXX"])[0].toUpperCase()
  
  // For table tickets, show the group ID
  if (ticket.tableGroupId) {
    return ticket.tableGroupId
  }
  
  // For regular tickets, use the existing format
  return `YV-${year}-${suffix}`
}

const MyTicketsScreen: React.FC = () => {
  const navigation = useCompatNavigation()
  const { user } = useAuth()
  const { data: ticketsRaw, loading: cacheLoading, error, refetch } = useCachedUserTickets(user?.uid || "")
  const tickets = ticketsRaw || []
  const { scrollRef, onScroll } = useMyTicketsScroll()
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [filter, setFilter] = useState<"all" | "active" | "used" | "upcoming">("all")
  const [loading, setLoading] = useState(true)
  const [localTickets, setLocalTickets] = useState<Ticket[]>([])

  // Load tickets on mount and when user changes
  useEffect(() => {
    if (user) {
      console.log("📋 MyTicketsScreen: useEffect triggered, calling loadUserTickets")
      loadUserTickets()
    } else {
      setLoading(false)
    }
  }, [user])

  const loadUserTickets = async () => {
    if (!user) {
      setLoading(false)
      return
    }

    try {
      console.log("📋 MyTicketsScreen: Loading tickets for user:", user.id)
      const userTickets = await SupabaseService.getTicketsByUser(user.id)
      
      console.log("📋 MyTicketsScreen: Raw response length:", userTickets?.length)
      if (userTickets && userTickets.length > 0) {
        const t = userTickets[0]
        console.log("📋 MyTicketsScreen: First ticket keys:", Object.keys(t))
        console.log("📋 MyTicketsScreen: First ticket totalAmount:", t.totalAmount, "type:", typeof t.totalAmount)
        console.log("📋 MyTicketsScreen: First ticket eventName:", t.eventName)
        console.log("📋 MyTicketsScreen: First ticket status:", t.status)
        console.log("📋 MyTicketsScreen: First ticket purchaseDate:", t.purchaseDate)
        console.log("📋 MyTicketsScreen: First ticket eventStartTime:", t.eventStartTime)
      } else {
        console.log("📋 MyTicketsScreen: No tickets returned from SupabaseService.getTicketsByUser")
      }
      
      // Sort by purchase date (newest first)
      const sorted = (userTickets || []).sort((a, b) => {
        const dateA = a.purchaseDate instanceof Date ? a.purchaseDate.getTime() : new Date(a.purchaseDate || 0).getTime()
        const dateB = b.purchaseDate instanceof Date ? b.purchaseDate.getTime() : new Date(b.purchaseDate || 0).getTime()
        return dateB - dateA
      })
      
      setLocalTickets(sorted)
      console.log("📋 MyTicketsScreen: Set", sorted.length, "tickets in state")
    } catch (error) {
      console.error("📋 MyTicketsScreen: Error loading tickets:", error)
      Alert.alert("Error", "Failed to load tickets")
    } finally {
      setLoading(false)
    }
  }

  const filteredTickets = (localTickets || []).filter((ticket) => {
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

  const handleDownloadTicket = async (ticket: Ticket) => {
    try {
      const htmlContent = `
        <html>
          <head>
            <meta charset="UTF-8" />
            <style>
              body { font-family: system-ui; padding: 20px; background: #121212; color: #fff; }
              h1 { color: #00D4FF; }
              h2 { color: #fff; }
              p { color: #CCCCCC; margin: 8px 0; }
              .highlight { color: #4CAF50; font-weight: bold; }
              .mono { font-family: monospace; color: #00D4FF; }
              hr { border: 1px solid #333; margin: 20px 0; }
            </style>
          </head>
          <body>
            <h1>🎫 Your Ticket</h1>
            <h2>${ticket.eventName}</h2>
            <p>Ticket Reference: <b class="mono">${shortTicketRef(ticket)}</b></p>
            <hr />
            <p><b>Buyer:</b> ${ticket.buyerName}</p>
            <p><b>Venue:</b> ${ticket.venueName || "Venue TBA"}</p>
            <p><b>Date:</b> ${formatDate(ticket.eventStartTime)}</p>
            <p><b>Time:</b> ${formatTime(ticket.eventStartTime)}</p>
            <p><b>Ticket Type:</b> ${ticket.entryFeeType || "Standard"}</p>
            ${ticket.tableTotalAmount ? `<p class="highlight">UGX ${ticket.tableTotalAmount.toLocaleString()} (Table Total)</p>` : `<p class="highlight">UGX ${(ticket.totalAmount || 0).toLocaleString()}</p>`}
            <hr />
            <p class="mono">Ticket ID: ${ticket.id}</p>
            <p class="mono">Purchase Date: ${formatDate(ticket.purchaseDate)}</p>
            <hr />
            <p style="color: #00D4FF; font-style: italic;">This ticket is verified and secured by YoVibe.</p>
          </body>
        </html>
      `

      const result = await Printing.printToFileAsync({
        html: htmlContent,
      }) as any

      const pdfUrl: string = result.uri || result.url

      if (Platform.OS === "web") {
        const link = document.createElement("a")
        link.href = pdfUrl
        link.download = `ticket-${shortTicketRef(ticket)}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        Alert.alert("Downloaded", "Ticket PDF saved to your downloads")
      } else {
        await Sharing.shareAsync(pdfUrl as any)
        Alert.alert("Downloaded", "Ticket PDF saved to your files")
      }
    } catch (error: any) {
      console.error("Error generating PDF:", error)
      Alert.alert("Error", "Failed to generate ticket PDF. Please try again.")
    }
  }

  const handleRefresh = () => {
    setLoading(true)
    refetch() // clear cache
    loadUserTickets()
  }

  if (loading || cacheLoading) {
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
        <Text style={styles.headerTitle}>My Tickets</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate("ResendTicket")}>
            <Text style={styles.resendLink}>Resend Ticket</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleRefresh}>
            <Ionicons name="refresh" size={24} color="#00D4FF" />
          </TouchableOpacity>
        </View>
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
          <Text style={styles.summaryValue}>{localTickets.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {(localTickets || []).filter((t) => t.status === "active" && !t.isScanned).length}
          </Text>
          <Text style={styles.summaryLabel}>Active</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {(localTickets || []).filter((t) => t.status === "used" || t.isScanned).length}
          </Text>
          <Text style={styles.summaryLabel}>Used</Text>
        </View>
      </View>

      <ScrollView 
        ref={scrollRef} 
        style={styles.ticketList} 
        showsVerticalScrollIndicator={false} 
        onScroll={onScroll}
      >
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
              <View style={styles.ticketCardHeader}>
                <View style={styles.ticketRefRow}>
                  <Text style={styles.ticketRefBadge}>{shortTicketRef(ticket)}</Text>
                  <View style={[styles.ticketStatusBadgeSmall, { backgroundColor: getStatusColor(ticket.status, ticket.isScanned) + "20" }]}>
                    <Text style={[styles.ticketStatusTextSmall, { color: getStatusColor(ticket.status, ticket.isScanned) }]}>
                      {getStatusLabel(ticket)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Event name – big */}
              <Text style={styles.cardEventName} numberOfLines={1}>{ticket.eventName}</Text>

              {/* Venue & attendee – medium */}
              <View style={styles.cardMetaRow}>
                <Ionicons name="location-outline" size={14} color="#00D4FF" />
                <Text style={styles.cardMetaText} numberOfLines={1}>{ticket.venueName || "Venue TBA"}</Text>
              </View>
              {ticket.buyerName && (
                <View style={styles.cardMetaRow}>
                  <Ionicons name="person-outline" size={14} color="#888" />
                  <Text style={styles.cardMetaText}>{ticket.buyerName}</Text>
                </View>
              )}

              {/* Date/time + price – small */}
              <View style={styles.cardFooterRow}>
                <View style={styles.cardMetaRow}>
                  <Ionicons name="calendar-outline" size={12} color="#666" />
                  <Text style={styles.cardMetaSmall}>{formatDate(ticket.eventStartTime)}</Text>
                </View>
                <Text style={styles.cardPrice}>UGX {(ticket.totalAmount || 0).toLocaleString()}</Text>
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

            {/* Ticket Reference Badge */}
            <View style={styles.modalRefRow}>
              <Text style={styles.modalRefBadge}>{shortTicketRef(selectedTicket)}</Text>
              <View style={[styles.modalStatusBadge, { backgroundColor: getStatusColor(selectedTicket.status, selectedTicket.isScanned) + "20" }]}>
                <Text style={[styles.modalStatusText, { color: getStatusColor(selectedTicket.status, selectedTicket.isScanned) }]}>
                  {getStatusLabel(selectedTicket)}
                </Text>
              </View>
            </View>

            {/* Event Name – big */}
            <Text style={styles.modalEventName}>{selectedTicket.eventName}</Text>

            {/* Venue & Attendee – medium */}
            <View style={styles.modalMetaRow}>
              <Ionicons name="location-outline" size={15} color="#00D4FF" />
              <Text style={styles.modalMetaText}>{selectedTicket.venueName || "Venue TBA"}</Text>
            </View>
            {selectedTicket.buyerName && (
              <View style={styles.modalMetaRow}>
                <Ionicons name="person-outline" size={15} color="#888" />
                <Text style={styles.modalMetaText}>{selectedTicket.buyerName}</Text>
              </View>
            )}

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

            {/* Ticket Information – small details */}
            <View style={styles.ticketInfoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Ticket Type</Text>
                <Text style={styles.infoValue}>{selectedTicket.entryFeeType || "Standard"}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Date & Time</Text>
                <Text style={styles.infoValue}>{formatDate(selectedTicket.eventStartTime)} • {formatTime(selectedTicket.eventStartTime)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Quantity</Text>
                <Text style={styles.infoValue}>{selectedTicket.quantity}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Amount Paid</Text>
                <Text style={styles.infoValueHighlight}>UGX {(selectedTicket.totalAmount || 0).toLocaleString()}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Ticket ID</Text>
                <Text style={styles.infoValueMono}>{shortTicketRef(selectedTicket)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Purchase Date</Text>
                <Text style={styles.infoValueSmall}>{formatDate(selectedTicket.purchaseDate)}</Text>
              </View>
            </View>

            {/* Security Badge */}
            <View style={styles.securityBadge}>
              <Ionicons name="shield-checkmark" size={20} color="#4CAF50" />
              <Text style={styles.securityText}>This ticket is verified and secured by YoVibe</Text>
            </View>

            {/* Download Button */}
            <TouchableOpacity style={styles.downloadButton} onPress={() => handleDownloadTicket(selectedTicket)}>
              <Ionicons name="download-outline" size={20} color="#FFFFFF" />
              <Text style={styles.downloadButtonText}>Download Ticket PDF</Text>
            </TouchableOpacity>
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
    paddingHorizontal: 16,
    paddingTop: 16,
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
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(0,212,255,0.12)",
    shadowColor: "#00D4FF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  ticketCardHeader: {
    marginBottom: 10,
  },
  ticketRefRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ticketRefBadge: {
    color: "#00D4FF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    fontFamily: "monospace",
  },
  ticketStatusBadgeSmall: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  ticketStatusTextSmall: {
    fontSize: 10,
    fontWeight: "700",
  },
  cardEventName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  cardMetaText: {
    color: "#CCC",
    fontSize: 13,
  },
  cardMetaSmall: {
    color: "#666",
    fontSize: 11,
  },
  cardFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  cardPrice: {
    color: "#4CAF50",
    fontSize: 15,
    fontWeight: "700",
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
    marginBottom: 0,
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
  modalRefRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  modalRefBadge: {
    color: "#00D4FF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
    fontFamily: "monospace",
  },
  modalStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  modalStatusText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  modalEventName: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "bold",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  modalMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  modalMetaText: {
    color: "#CCC",
    fontSize: 14,
  },
  infoValueSmall: {
    color: "#888888",
    fontSize: 12,
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
downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 32,
  },
  downloadButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    marginLeft: 8,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  resendLink: {
    color: "#00D4FF",
    fontSize: 14,
    fontWeight: "500",
  },
})

export default MyTicketsScreen
