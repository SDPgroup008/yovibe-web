"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, TextInput, ScrollView } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../../contexts/AuthContext"
import TicketService from "../../services/TicketService"
import type { PendingFulfillment } from "../../models/PendingFulfillment"

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
  const [recoveryState, setRecoveryState] = useState<{
    fulfillmentId: string | null
    status: "idle" | "running" | "success" | "failed"
    message: string
    attendeeNames: string[]
  }>({ fulfillmentId: null, status: "idle", message: "", attendeeNames: [] })

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

  const renderStatusBanner = () => {
    if (recoveryState.status === "idle") return null
    
    const isSuccess = recoveryState.status === "success"
    const isRunning = recoveryState.status === "running"
    
    return (
      <View style={[styles.statusBanner, isSuccess ? styles.statusSuccess : isRunning ? styles.statusRunning : styles.statusFailed]}>
        <Text style={styles.statusBannerText}>
          {isSuccess ? "✅ " : isRunning ? "⏳ " : "❌ "}
          {recoveryState.message}
        </Text>
      </View>
    )
  }

  const renderItem = ({ item }: { item: PendingFulfillment }) => {
    const isExpanded = expandedId === item.id
    const stageColor = getStageColor(item.status, item.created_at)

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
                {STATUS_LABELS[item.status] || item.status}
              </Text>
            </View>
          </View>
          <Text style={styles.amount}>UGX {item.amount.toLocaleString()}</Text>
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
              <Text style={styles.detailLabel}>Status</Text>
              <Text style={styles.detailValue}>{item.status}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Attempt Count</Text>
              <Text style={styles.detailValue}>{item.attemptCount}</Text>
            </View>
            {item.lastError && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Last Error</Text>
                <Text style={styles.detailValueError}>{item.lastError}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => handleManualRetry(item)}
            >
              <Text style={styles.retryButtonText}>Complete Manually</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    )
  }

  const handleManualRetry = async (fulfillment: PendingFulfillment) => {
    const needsAttendeeNames = !fulfillment.attendeeNames || fulfillment.attendeeNames.length < fulfillment.quantity
    
    if (needsAttendeeNames) {
      const names: string[] = Array(fulfillment.quantity).fill(null).map(() => "")
      setRecoveryState({
        fulfillmentId: fulfillment.id,
        status: "idle",
        message: "",
        attendeeNames: names,
      })
      setExpandedId(null)
      setTimeout(() => {
        Alert.alert(
          "Enter Attendee Names",
          `Please enter names for all ${fulfillment.quantity} attendee(s)`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Submit", onPress: () => performManualRecoveryWithNames(fulfillment, names) },
          ],
          { textInput: { placeholder: "Enter attendee name", value: names[0] || "" } }
        )
      }, 100)
      return
    }

    performManualRecovery(fulfillment)
  }

  const performManualRecoveryWithNames = (fulfillment: PendingFulfillment, names: string[]) => {
    setRecoveryState({ ...recoveryState, status: "running", message: "Starting manual recovery...", fulfillmentId: fulfillment.id })
    performManualRecovery(fulfillment, names)
  }

  const performManualRecovery = async (fulfillment: PendingFulfillment, attendeeNames?: string[]) => {
    const adminEmail = user?.email || "unknown"
    setRecoveryState({ ...recoveryState, status: "running", message: "Starting manual recovery...", fulfillmentId: fulfillment.id })

    const result = await TicketService.recoverTicket(fulfillment, adminEmail, attendeeNames)

    if (result.success) {
      setRecoveryState({ ...recoveryState, status: "success", message: `✅ Successfully recovered ${result.ticketIds.length} ticket(s)`, fulfillmentId: fulfillment.id })
      loadFulfillments()
    } else {
      setRecoveryState({ ...recoveryState, status: "failed", message: `❌ Failed: ${result.error}`, fulfillmentId: fulfillment.id })
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00D4FF" />
        <Text style={styles.loadingText}>Loading stranded purchases...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {renderStatusBanner()}
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
  list: { padding: 16 },
  card: { backgroundColor: "#1a1a1a", borderRadius: 12, marginBottom: 12, overflow: "hidden" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 16, paddingBottom: 8 },
  buyerName: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  eventName: { color: "#888", fontSize: 14, marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 12, fontWeight: "600" },
  amount: { color: "#4CAF50", fontSize: 18, fontWeight: "bold", paddingHorizontal: 16, marginTop: 8 },
  timeAgo: { color: "#666", fontSize: 12, paddingHorizontal: 16, marginTop: 4, marginBottom: 12 },
  details: { borderTopWidth: 1, borderTopColor: "#333", padding: 16 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  detailLabel: { color: "#888", fontSize: 14 },
  detailValue: { color: "#FFFFFF", fontSize: 14, fontWeight: "500" },
  detailValueError: { color: "#FF6B6B", fontSize: 12, flex: 1, textAlign: "right" },
  retryButton: { backgroundColor: "#2196F3", padding: 12, borderRadius: 8, alignItems: "center", marginTop: 12 },
  retryButtonText: { color: "#FFFFFF", fontWeight: "600" },
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "bold", marginTop: 16 },
  emptyText: { color: "#888", textAlign: "center", marginTop: 8, paddingHorizontal: 32 },
  statusBanner: { padding: 16, margin: 16, borderRadius: 8, backgroundColor: "#2a2a2a" },
  statusRunning: { backgroundColor: "#2a2a2a", borderLeftWidth: 4, borderLeftColor: "#FFA500" },
  statusSuccess: { backgroundColor: "#1a3a1a", borderLeftWidth: 4, borderLeftColor: "#4CAF50" },
  statusFailed: { backgroundColor: "#3a1a1a", borderLeftWidth: 4, borderLeftColor: "#FF6B6B" },
  statusBannerText: { color: "#FFFFFF", fontSize: 14 },
})

export default AdminStrandedPurchasesScreen