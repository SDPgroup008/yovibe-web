"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../../contexts/AuthContext"
import TicketService from "../../services/TicketService"
import type { PendingFulfillment } from "../../models/PendingFulfillment"
import { ResponsiveSkeleton } from "../../components/SkeletonLoader"

function formatDistanceToNow(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - new Date(date).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`
}

const STATUS_LABELS: Record<string, string> = {
  payment_confirmed: "Payment received, ticket not started",
  fulfilling: "Ticket creation in progress",
  failed: "Failed — needs manual action",
}

const STATUS_COLORS: Record<string, string> = {
  payment_confirmed: "#00D4FF",
  fulfilling: "#FFA500",
  failed: "#FF6B6B",
}

export const AdminStrandedPurchasesScreen: React.FC = () => {
  const { user } = useAuth()
  const [fulfillments, setFulfillments] = useState<PendingFulfillment[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  useEffect(() => {
    if (user?.userType !== "admin") {
      Alert.alert("Access Denied", "Admin access required")
      return
    }
    loadFulfillments()
  }, [user])

  const loadFulfillments = async () => {
    setLoading(true)
    try {
      const data = await TicketService.getPendingFulfillmentsByStatus("payment_confirmed")
      const failed = await TicketService.getPendingFulfillmentsByStatus("failed")
      const fulfilling = await TicketService.getPendingFulfillmentsByStatus("fulfilling")
      setFulfillments([...data, ...failed, ...fulfilling])
    } catch (error) {
      console.error("Error loading fulfillments:", error)
      Alert.alert("Error", "Failed to load stranded purchases")
    } finally {
      setLoading(false)
    }
  }

  const getStageColor = (status: string, createdAt: Date) => {
    const hoursAgo = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60)
    if (status === "failed" || hoursAgo > 1) return "#FF6B6B"
    if (hoursAgo > 0.5) return "#FFA500"
    return "#00D4FF"
  }

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text)
    }
    Alert.alert("Copied", "Reference ID copied to clipboard")
  }

  const renderItem = ({ item }: { item: PendingFulfillment }) => {
    const isExpanded = expandedId === item.id
    const stageColor = getStageColor(item.status, item.created_at)
    const hasTicketIds = Boolean(item.ticketIds?.length)
    const failedOnEmailSend = item.lastError?.toLowerCase().includes("email send") || false
    const likelyTicketsExist = item.status === "failed" && failedOnEmailSend

    return (
      <View style={styles.card} key={item.id}>
        <TouchableOpacity onPress={() => setExpandedId(isExpanded ? null : item.id)}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.buyerName}>{item.buyerName || item.buyerEmail}</Text>
              <Text style={styles.eventName}>{item.eventName}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: stageColor + "20" }]}>
              <Text style={[styles.statusText, { color: stageColor }]}>
                {(hasTicketIds || likelyTicketsExist) && failedOnEmailSend ? "Emails not sent — resume" : STATUS_LABELS[item.status] || item.status}
              </Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Amount:</Text>
            <Text style={styles.summaryValue}>UGX {item.amount.toLocaleString()}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tickets:</Text>
            <Text style={styles.summaryValue}>{item.quantity}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Reference:</Text>
            <TouchableOpacity onPress={() => copyToClipboard(item.id)}>
              <Text style={styles.refText}>{item.id.slice(0, 8)}...</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.timeAgo}>
            Stuck for {formatDistanceToNow(new Date(item.created_at))}
          </Text>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.details}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Buyer Email</Text>
              <Text style={styles.detailValue}>{item.buyerEmail}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Payment ID</Text>
              <Text style={styles.detailValue} numberOfLines={1}>{item.paymentId}</Text>
            </View>
            {item.pawapayDepositId && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>PawaPay ID</Text>
                <Text style={styles.detailValue} numberOfLines={1}>{item.pawapayDepositId}</Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Status</Text>
              <Text style={styles.detailValue}>{item.status}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Attempts</Text>
              <Text style={styles.detailValue}>{item.attemptCount}</Text>
            </View>
            {hasTicketIds && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Ticket IDs</Text>
                <Text style={styles.detailValue} numberOfLines={1}>{item.ticketIds?.join(", ").slice(0, 40)}...</Text>
              </View>
            )}
            {item.lastError && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Last Error</Text>
                <Text style={styles.detailValueError}>{item.lastError}</Text>
              </View>
            )}
            {item.attendeeNames && item.attendeeNames.length > 0 && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Attendee Names</Text>
                <Text style={styles.detailValue}>{item.attendeeNames.join(", ")}</Text>
              </View>
            )}
            
            <View style={styles.actionRow}>
          <View style={styles.workerNotice}>
            <Ionicons name="time-outline" size={18} color="#00D4FF" />
            <Text style={styles.workerNoticeText}>
              Recovery is handled automatically by the secure fulfillment worker.
            </Text>
          </View>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonSecondary]}
                onPress={() => copyToClipboard(item.id)}
              >
                <Ionicons name="copy" size={20} color="#00D4FF" />
                <Text style={styles.actionButtonTextSecondary}>Copy Ref</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    )
  }

  if (loading) {
    return <ResponsiveSkeleton variant="table" />
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Stranded Purchases</Text>
        <TouchableOpacity onPress={loadFulfillments}>
          <Ionicons name="refresh" size={24} color="#00D4FF" />
        </TouchableOpacity>
      </View>

      {fulfillments.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
          <Text style={styles.emptyTitle}>No Stranded Purchases</Text>
          <Text style={styles.emptyText}>All ticket purchases are completing successfully.</Text>
        </View>
      ) : (
        <FlatList
          data={fulfillments}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
        />
      )}

    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#121212" },
  loadingText: { color: "#FFFFFF", marginTop: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 48, backgroundColor: "#1a1a1a" },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "bold" },
  workerNotice: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: "rgba(0, 212, 255, 0.08)" },
  workerNoticeText: { flex: 1, color: "#B9EFFF", fontSize: 13, lineHeight: 18 },
  list: { padding: 16 },
  card: { backgroundColor: "#1a1a1a", borderRadius: 12, marginBottom: 12, overflow: "hidden" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 16, paddingBottom: 8 },
  buyerName: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  eventName: { color: "#888", fontSize: 14, marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 12, fontWeight: "600" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  summaryLabel: { color: "#888", fontSize: 14 },
  summaryValue: { color: "#FFFFFF", fontSize: 14, fontWeight: "500" },
  timeAgo: { color: "#666", fontSize: 12, paddingHorizontal: 16, marginBottom: 12 },
  details: { borderTopWidth: 1, borderTopColor: "#333", padding: 16 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  detailLabel: { color: "#888", fontSize: 14, flex: 1 },
  detailValue: { color: "#FFFFFF", fontSize: 14, fontWeight: "500", flex: 1, textAlign: "right", marginRight: 8 },
  detailValueError: { color: "#FF6B6B", fontSize: 12, flex: 1, textAlign: "right", marginRight: 8 },
  refText: { color: "#00D4FF", fontSize: 14 },
  actionRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  actionButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 12, borderRadius: 8 },
  actionButtonPrimary: { backgroundColor: "#2196F3" },
  actionButtonResume: { backgroundColor: "#4CAF50" },
  actionButtonSecondary: { backgroundColor: "rgba(0, 212, 255, 0.1)", borderWidth: 1, borderColor: "#00D4FF" },
  actionButtonText: { color: "#FFFFFF", fontWeight: "600", marginLeft: 8 },
  actionButtonTextSecondary: { color: "#00D4FF", fontWeight: "600" },
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "bold", marginTop: 16 },
  emptyText: { color: "#888", textAlign: "center", marginTop: 8, paddingHorizontal: 32 },
  statusBanner: { padding: 16, margin: 16, borderRadius: 8, backgroundColor: "#2a2a2a" },
  statusRunning: { backgroundColor: "#2a2a2a", borderLeftWidth: 4, borderLeftColor: "#FFA500" },
  statusSuccess: { backgroundColor: "#1a3a1a", borderLeftWidth: 4, borderLeftColor: "#4CAF50" },
  statusFailed: { backgroundColor: "#3a1a1a", borderLeftWidth: 4, borderLeftColor: "#FF6B6B" },
  statusBannerText: { color: "#FFFFFF", fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.8)", justifyContent: "center", alignItems: "center" },
  modalContent: { backgroundColor: "#1a1a1a", borderRadius: 12, width: "90%", maxWidth: 500, padding: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#333" },
  modalTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "bold" },
  modalSubtitle: { color: "#888", fontSize: 14, marginBottom: 16 },
  modalBody: { maxHeight: 300, marginBottom: 16 },
  modalInput: { backgroundColor: "#333", color: "#FFFFFF", padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 14 },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  modalButtonSecondary: { flex: 1, alignItems: "center", padding: 12, backgroundColor: "#333", borderRadius: 8 },
  modalButtonPrimary: { flex: 1, alignItems: "center", padding: 12, backgroundColor: "#2196F3", borderRadius: 8 },
  modalButtonTextSecondary: { color: "#888", fontWeight: "600" },
  modalButtonTextPrimary: { color: "#FFFFFF", fontWeight: "600" },
})

export default AdminStrandedPurchasesScreen
