import React, { useEffect, useState, useCallback } from "react"
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput, Modal } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { supabase } from "../../config/supabase"
import SupabaseService from "../../services/SupabaseService"
import { useAuth } from "../../contexts/AuthContext"

type StatusFilter = "all" | "pending_admin_review" | "approved" | "rejected" | "processing" | "completed"

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending_admin_review: { label: "Pending Review", color: "#F59E0B", bg: "rgba(245,158,11,0.12)", icon: "time-outline" },
  approved: { label: "Approved", color: "#3B82F6", bg: "rgba(59,130,246,0.12)", icon: "checkmark-circle-outline" },
  rejected: { label: "Rejected", color: "#EF4444", bg: "rgba(239,68,68,0.12)", icon: "close-circle-outline" },
  processing: { label: "Processing", color: "#8B5CF6", bg: "rgba(139,92,246,0.12)", icon: "sync-outline" },
  completed: { label: "Completed", color: "#10B981", bg: "rgba(16,185,129,0.12)", icon: "checkmark-done-outline" },
}

const FILTERS: StatusFilter[] = ["all", "pending_admin_review", "approved", "rejected", "completed"]

export default function AdminPayoutsScreen() {
  const { user } = useAuth()
  const [payouts, setPayouts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [detailModal, setDetailModal] = useState<any | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (statusFilter === "all") {
        const [pending, approved, rejected, completed] = await Promise.all([
          SupabaseService.getPayoutsByStatus("pending_admin_review", 50, 0),
          SupabaseService.getPayoutsByStatus("approved", 50, 0),
          SupabaseService.getPayoutsByStatus("rejected", 50, 0),
          SupabaseService.getPayoutsByStatus("completed", 50, 0),
        ])
        setPayouts([...pending, ...approved, ...rejected, ...completed].sort(
          (a, b) => new Date(b.request_date).getTime() - new Date(a.request_date).getTime()
        ))
      } else {
        const data = await SupabaseService.getPayoutsByStatus(statusFilter, 100, 0)
        setPayouts(data)
      }
    } catch (e: any) {
      console.error("AdminPayouts: Error loading payouts:", e)
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { void load() }, [load])

  const sendNotification = async (userId: string, title: string, body: string) => {
    try {
      await supabase.from("notifications").insert({
        user_id: userId,
        title,
        body,
        type: "payout_update",
        data: { payoutId: detailModal?.id },
        is_read: false,
        created_at: new Date().toISOString(),
      })
    } catch (err) { console.error("Failed to send notification:", err) }
  }

  const handleApprove = async (payoutId: string, organizerId: string) => {
    setActionLoading(true)
    try {
      await SupabaseService.approvePayout(payoutId, user?.id || "")
      await sendNotification(organizerId, "✅ Payout Approved", `Your payout of UGX ${detailModal?.amount?.toLocaleString()} has been approved and is being processed.`)
      setDetailModal(null)
      await load()
    } catch (e: any) {
      Alert.alert("Error", e.message)
    } finally { setActionLoading(false) }
  }

  const handleReject = async (payoutId: string, organizerId: string) => {
    if (!rejectReason.trim()) { Alert.alert("Reason Required", "Enter a reason for rejection"); return }
    setActionLoading(true)
    try {
      await SupabaseService.rejectPayout(payoutId, user?.id || "", rejectReason.trim())
      await sendNotification(organizerId, "❌ Payout Rejected", `Your payout of UGX ${detailModal?.amount?.toLocaleString()} was rejected. Reason: ${rejectReason.trim()}`)
      setDetailModal(null)
      setRejectReason("")
      await load()
    } catch (e: any) {
      Alert.alert("Error", e.message)
    } finally { setActionLoading(false) }
  }

  const handleComplete = async (payoutId: string, organizerId: string) => {
    setActionLoading(true)
    try {
      await SupabaseService.completePayout(payoutId, user?.id || "", `manual_${Date.now()}`)
      await sendNotification(organizerId, "✅ Payout Completed", `Your payout of UGX ${detailModal?.amount?.toLocaleString()} has been processed. Check your bank account.`)
      setDetailModal(null)
      await load()
    } catch (e: any) {
      Alert.alert("Error", e.message)
    } finally { setActionLoading(false) }
  }

  const renderItem = ({ item }: { item: any }) => {
    const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending_admin_review
    const metadata = typeof item.metadata === "string" ? JSON.parse(item.metadata || "{}") : (item.metadata || {})
    return (
      <TouchableOpacity style={styles.card} onPress={() => { setDetailModal(item); setRejectReason("") }} activeOpacity={0.7}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardId}>{item.id?.slice(0, 8)}</Text>
          <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
            <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Amount</Text>
            <Text style={styles.cardValue}>UGX {Number(item.amount).toLocaleString()}</Text>
          </View>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Method</Text>
            <Text style={styles.cardValue}>{item.payout_method === "bank_transfer" ? "Card / Bank" : "Mobile Money"}</Text>
          </View>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Bank</Text>
            <Text style={styles.cardValue}>{metadata.bank_name || "—"}</Text>
          </View>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Date</Text>
            <Text style={styles.cardValue}>{new Date(item.request_date).toLocaleDateString()}</Text>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  const renderActions = () => {
    if (!detailModal) return null
    const s = detailModal.status
    return (
      <View style={styles.actionGrid}>
        {s === "pending_admin_review" && (
          <>
            <TextInput style={styles.modalInput} value={rejectReason} onChangeText={setRejectReason} placeholder="Rejection reason (required for reject)" placeholderTextColor="#666" multiline />
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.btn, { backgroundColor: "#10B981" }]} onPress={() => handleApprove(detailModal.id, detailModal.organizer_id)} disabled={actionLoading}>
                {actionLoading ? <ActivityIndicator size="small" color="#FFF" /> : <><Ionicons name="checkmark-outline" size={18} color="#FFF" /><Text style={styles.btnText}>Approve</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { backgroundColor: "#EF4444" }]} onPress={() => handleReject(detailModal.id, detailModal.organizer_id)} disabled={actionLoading || !rejectReason.trim()}>
                {actionLoading ? <ActivityIndicator size="small" color="#FFF" /> : <><Ionicons name="close-outline" size={18} color="#FFF" /><Text style={styles.btnText}>Reject</Text></>}
              </TouchableOpacity>
            </View>
          </>
        )}
        {s === "approved" && (
          <TouchableOpacity style={[styles.btn, styles.btnFull, { backgroundColor: "#10B981" }]} onPress={() => handleComplete(detailModal.id, detailModal.organizer_id)} disabled={actionLoading}>
            {actionLoading ? <ActivityIndicator size="small" color="#FFF" /> : <><Ionicons name="checkmark-done-outline" size={18} color="#FFF" /><Text style={styles.btnText}>Mark as Completed</Text></>}
          </TouchableOpacity>
        )}
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Payout Requests</Text>
      <Text style={styles.subheader}>{payouts.length} request{payouts.length !== 1 ? "s" : ""}</Text>

      <FlatList horizontal showsHorizontalScrollIndicator={false} style={styles.filterList} data={FILTERS} keyExtractor={(f) => f}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.filterChip, statusFilter === item && styles.filterChipActive]} onPress={() => setStatusFilter(item)}>
            <Text style={[styles.filterChipText, statusFilter === item && styles.filterChipTextActive]}>{item === "all" ? "All" : item.replace(/_/g, " ")}</Text>
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 40 }} />
      ) : (
        <FlatList data={payouts} keyExtractor={(item) => item.id} renderItem={renderItem} contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={{ padding: 40, alignItems: "center" }}>
              <Ionicons name="cash-outline" size={48} color="#333" />
              <Text style={{ color: "#666", marginTop: 12, fontSize: 14 }}>No payout requests found</Text>
            </View>
          }
        />
      )}

      <Modal visible={!!detailModal} transparent animationType="fade" onRequestClose={() => setDetailModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setDetailModal(null)}>
              <Ionicons name="close" size={24} color="#888" />
            </TouchableOpacity>
            {detailModal && (
              <>
                <Text style={styles.modalTitle}>Payout Request</Text>
                <View style={styles.badgeRow}>
                  <View style={[styles.badge, { backgroundColor: (STATUS_CONFIG[detailModal.status] || STATUS_CONFIG.pending_admin_review).bg }]}>
                    <Text style={[styles.badgeText, { color: (STATUS_CONFIG[detailModal.status] || STATUS_CONFIG.pending_admin_review).color }]}>{(STATUS_CONFIG[detailModal.status] || STATUS_CONFIG.pending_admin_review).label}</Text>
                  </View>
                </View>
                <View style={styles.modalBody}>
                  <Row label="ID" value={detailModal.id} />
                  <Row label="Amount" value={`UGX ${Number(detailModal.amount).toLocaleString()}`} />
                  <Row label="Method" value={detailModal.payout_method === "bank_transfer" ? "Card / Bank Transfer" : "Mobile Money"} />
                  <Row label="Status" value={detailModal.status} />
                  <Row label="Recipient" value={detailModal.recipient_name || "—"} />
                  {(() => {
                    const meta = typeof detailModal.metadata === "string" ? JSON.parse(detailModal.metadata || "{}") : (detailModal.metadata || {})
                    return meta.bank_name ? <Row label="Bank" value={meta.bank_name} /> : null
                  })()}
                  {(() => {
                    const meta = typeof detailModal.metadata === "string" ? JSON.parse(detailModal.metadata || "{}") : (detailModal.metadata || {})
                    return meta.account_number ? <Row label="Account" value={meta.account_number} /> : null
                  })()}
                  {detailModal.admin_note ? <Row label="Admin Note" value={detailModal.admin_note} /> : null}
                  <Row label="Tickets" value={`${detailModal.ticket_ids?.length || 0} tickets`} />
                  <Row label="Submitted" value={new Date(detailModal.request_date).toLocaleString()} />
                </View>
                {renderActions()}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0f", padding: 16 },
  header: { fontSize: 24, fontWeight: "800", color: "#FFF", letterSpacing: -0.5, marginBottom: 4 },
  subheader: { fontSize: 13, color: "#666", marginBottom: 12 },
  filterList: { marginBottom: 12, maxHeight: 36 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: "#13131a", marginRight: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  filterChipActive: { backgroundColor: "rgba(59,130,246,0.15)", borderColor: "#3B82F6" },
  filterChipText: { color: "#666", fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  filterChipTextActive: { color: "#3B82F6" },
  list: { paddingBottom: 20 },
  card: { backgroundColor: "#13131a", borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  cardId: { color: "#FFF", fontSize: 12, fontWeight: "700", fontFamily: "monospace" },
  badge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, gap: 4 },
  badgeText: { fontSize: 10, fontWeight: "700" },
  cardBody: { gap: 6 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardLabel: { color: "#555", fontSize: 12, width: 55 },
  cardValue: { color: "#CCC", fontSize: 12, flex: 1 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 16 },
  modalBox: { backgroundColor: "#1a1a2e", borderRadius: 20, padding: 24, width: "100%", maxWidth: 480, maxHeight: "90%", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  modalClose: { alignSelf: "flex-end", marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#FFF", marginBottom: 8 },
  badgeRow: { marginBottom: 16 },
  modalBody: { gap: 10, marginBottom: 20 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  rowLabel: { color: "#666", fontSize: 12 },
  rowValue: { color: "#CCC", fontSize: 12, textAlign: "right", flex: 1, marginLeft: 16 },
  actionGrid: { gap: 8 },
  modalInput: { backgroundColor: "#0a0a0f", color: "#FFF", padding: 12, borderRadius: 10, fontSize: 13, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", minHeight: 40 },
  actionRow: { flexDirection: "row", gap: 8 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 12, borderRadius: 10, gap: 6, flex: 1 },
  btnFull: { padding: 14 },
  btnText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
})
