import React, { useEffect, useState, useCallback } from "react"
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput, Modal } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import RefundService from "../../services/RefundService"

type StatusFilter = "all" | "pending_admin_review" | "approved" | "rejected" | "processing" | "submitted" | "completed" | "needs_attention" | "failed"

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending_admin_review: { label: "Pending Review", color: "#F59E0B", bg: "rgba(245,158,11,0.12)", icon: "time-outline" },
  approved: { label: "Approved", color: "#3B82F6", bg: "rgba(59,130,246,0.12)", icon: "checkmark-circle-outline" },
  rejected: { label: "Rejected", color: "#EF4444", bg: "rgba(239,68,68,0.12)", icon: "close-circle-outline" },
  processing: { label: "Processing", color: "#8B5CF6", bg: "rgba(139,92,246,0.12)", icon: "sync-outline" },
  submitted: { label: "Submitted", color: "#06B6D4", bg: "rgba(6,182,212,0.12)", icon: "send-outline" },
  completed: { label: "Completed", color: "#10B981", bg: "rgba(16,185,129,0.12)", icon: "checkmark-done-outline" },
  needs_attention: { label: "Needs Attention", color: "#F97316", bg: "rgba(249,115,22,0.12)", icon: "warning-outline" },
  failed: { label: "Failed", color: "#DC2626", bg: "rgba(220,38,38,0.12)", icon: "alert-circle-outline" },
}

const FILTERS: StatusFilter[] = ["all", "pending_admin_review", "approved", "processing", "needs_attention", "completed", "rejected", "failed"]

export default function AdminRefundsScreen() {
  const [refunds, setRefunds] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const PAGE_SIZE = 20

  const [detailModal, setDetailModal] = useState<any | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [customAmount, setCustomAmount] = useState("")
  const [adminNote, setAdminNote] = useState("")

  const load = useCallback(async (pageNum = 0, append = false) => {
    try {
      if (pageNum === 0) setLoading(true)
      const result = await RefundService.list({
        status: statusFilter !== "all" ? statusFilter : undefined,
        search: searchQuery.trim() || undefined,
        limit: PAGE_SIZE,
        offset: pageNum * PAGE_SIZE,
      })
      const items = result.refunds || []
      setRefunds(prev => append ? [...prev, ...items] : items)
      setHasMore(items.length === PAGE_SIZE)
      setPage(pageNum)
    } catch (e: any) {
      Alert.alert("Refunds", e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [statusFilter, searchQuery])

  useEffect(() => { void load() }, [load])

  const onRefresh = () => { setRefreshing(true); void load(0) }
  const onLoadMore = () => { if (hasMore && !loading) void load(page + 1, true) }

  const openDetail = (item: any) => {
    setDetailModal(item)
    setCustomAmount(item.approved_amount ? String(item.approved_amount) : "")
    setAdminNote("")
  }

  const act = async (action: "approve" | "reject" | "execute" | "retry" | "chargeback", id: string) => {
    setActionLoading(true)
    try {
      if (action === "approve") {
        await RefundService.approve(id, customAmount ? Number(customAmount) : undefined, adminNote || undefined)
      } else if (action === "reject") {
        await RefundService.reject(id, adminNote || undefined)
      } else if (action === "execute") {
        await RefundService.execute(id)
      } else if (action === "retry") {
        await RefundService.retry(id)
      } else if (action === "chargeback") {
        await RefundService.chargeback(id, adminNote || "Chargeback disputed")
      }
      setDetailModal(null)
      await load(0)
    } catch (e: any) {
      Alert.alert("Refund", e.message)
    } finally {
      setActionLoading(false)
    }
  }

  const renderItem = ({ item }: { item: any }) => {
    const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.needs_attention
    return (
      <TouchableOpacity style={styles.card} onPress={() => openDetail(item)} activeOpacity={0.7}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardRef}>{item.request_reference}</Text>
          <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
            <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardDetail}>
            <Text style={styles.cardLabel}>Reason</Text>
            <Text style={styles.cardValue}>{item.reason_code?.replace(/_/g, " ")}</Text>
          </View>
          <View style={styles.cardDetail}>
            <Text style={styles.cardLabel}>Amount</Text>
            <Text style={styles.cardValue}>UGX {Number(item.requested_amount).toLocaleString()}</Text>
          </View>
          <View style={styles.cardDetail}>
            <Text style={styles.cardLabel}>Buyer</Text>
            <Text style={styles.cardValue}>{item.buyer_email}</Text>
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
            <TextInput style={styles.modalInput} value={customAmount} onChangeText={setCustomAmount} placeholder="Approved amount (leave blank for requested)" placeholderTextColor="#666" keyboardType="numeric" />
            <TextInput style={styles.modalInput} value={adminNote} onChangeText={setAdminNote} placeholder="Admin note (optional)" placeholderTextColor="#666" />
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#10B981" }]} onPress={() => act("approve", detailModal.id)} disabled={actionLoading}>
                {actionLoading ? <ActivityIndicator size="small" color="#FFF" /> : <><Ionicons name="checkmark-outline" size={18} color="#FFF" /><Text style={styles.actionBtnText}>Approve</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#EF4444" }]} onPress={() => act("reject", detailModal.id)} disabled={actionLoading}>
                {actionLoading ? <ActivityIndicator size="small" color="#FFF" /> : <><Ionicons name="close-outline" size={18} color="#FFF" /><Text style={styles.actionBtnText}>Reject</Text></>}
              </TouchableOpacity>
            </View>
          </>
        )}
        {s === "approved" && (
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnFull, { backgroundColor: "#3B82F6" }]} onPress={() => act("execute", detailModal.id)} disabled={actionLoading}>
            {actionLoading ? <ActivityIndicator size="small" color="#FFF" /> : <><Ionicons name="send-outline" size={18} color="#FFF" /><Text style={styles.actionBtnText}>Execute Provider Refund</Text></>}
          </TouchableOpacity>
        )}
        {(s === "needs_attention" || s === "failed") && (
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnFull, { backgroundColor: "#F59E0B" }]} onPress={() => act("retry", detailModal.id)} disabled={actionLoading}>
            {actionLoading ? <ActivityIndicator size="small" color="#FFF" /> : <><Ionicons name="refresh-outline" size={18} color="#FFF" /><Text style={styles.actionBtnText}>Retry Refund</Text></>}
          </TouchableOpacity>
        )}
        {(s === "pending_admin_review" || s === "approved") && (
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnFull, { backgroundColor: "#8B5CF6", marginTop: 8 }]} onPress={() => act("chargeback", detailModal.id)} disabled={actionLoading}>
            {actionLoading ? <ActivityIndicator size="small" color="#FFF" /> : <><Ionicons name="shield-outline" size={18} color="#FFF" /><Text style={styles.actionBtnText}>Mark as Chargeback Dispute</Text></>}
          </TouchableOpacity>
        )}
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Refund Management</Text>
      <Text style={styles.subheader}>{refunds.length} request{refunds.length !== 1 ? "s" : ""} · {statusFilter !== "all" ? statusFilter.replace(/_/g, " ") : "all statuses"}</Text>

      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color="#666" />
        <TextInput style={styles.searchInput} value={searchQuery} onChangeText={(t) => { setSearchQuery(t); setPage(0) }} placeholder="Search by reference or email..." placeholderTextColor="#555" />
      </View>

      <FlatList horizontal showsHorizontalScrollIndicator={false} style={styles.filterList} data={FILTERS} keyExtractor={(f) => f}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.filterChip, statusFilter === item && styles.filterChipActive]} onPress={() => { setStatusFilter(item); setPage(0) }}>
            <Text style={[styles.filterChipText, statusFilter === item && styles.filterChipTextActive]}>{item === "all" ? "All" : item.replace(/_/g, " ")}</Text>
          </TouchableOpacity>
        )}
      />

      {loading && page === 0 ? (
        <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 40 }} />
      ) : (
        <FlatList data={refunds} keyExtractor={(item) => item.id} renderItem={renderItem} contentContainerStyle={styles.list}
          onRefresh={onRefresh} refreshing={refreshing} onEndReached={onLoadMore} onEndReachedThreshold={0.3}
          ListEmptyComponent={<View style={{ padding: 40, alignItems: "center" }}><Ionicons name="receipt-outline" size={48} color="#333" /><Text style={{ color: "#666", marginTop: 12, fontSize: 14 }}>No refund requests found</Text></View>}
          ListFooterComponent={hasMore && !loading ? <ActivityIndicator size="small" color="#3B82F6" style={{ padding: 16 }} /> : null}
        />
      )}

      <Modal visible={!!detailModal} transparent animationType="fade" onRequestClose={() => setDetailModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setDetailModal(null)}>
              <Ionicons name="close" size={24} color="#888" />
            </TouchableOpacity>
            {detailModal && (
              <>
                <Text style={styles.modalTitle}>{detailModal.request_reference}</Text>
                <View style={styles.modalStatusRow}>
                  <View style={[styles.badge, { backgroundColor: (STATUS_CONFIG[detailModal.status] || STATUS_CONFIG.needs_attention).bg }]}>
                    <Text style={[styles.badgeText, { color: (STATUS_CONFIG[detailModal.status] || STATUS_CONFIG.needs_attention).color }]}>{(STATUS_CONFIG[detailModal.status] || STATUS_CONFIG.needs_attention).label}</Text>
                  </View>
                </View>
                <View style={styles.modalBody}>
                  <Row label="Buyer" value={detailModal.buyer_email} />
                  <Row label="Reason" value={detailModal.reason_code?.replace(/_/g, " ")} />
                  <Row label="Requested" value={`UGX ${Number(detailModal.requested_amount).toLocaleString()}`} />
                  <Row label="Approved" value={detailModal.approved_amount ? `UGX ${Number(detailModal.approved_amount).toLocaleString()}` : "—"} />
                  <Row label="Refunded" value={detailModal.refunded_amount ? `UGX ${Number(detailModal.refunded_amount).toLocaleString()}` : "—"} />
                  <Row label="Provider" value={detailModal.payment_provider} />
                  <Row label="Payment Ref" value={detailModal.payment_reference || "—"} />
                  <Row label="Event ID" value={detailModal.event_id} />
                  <Row label="Ticket" value={detailModal.ticket_id || "—"} />
                  <Row label="Installment Plan" value={detailModal.installment_plan_id || "—"} />
                  <Row label="Retry Count" value={String(detailModal.retry_count || 0)} />
                  <Row label="Buyer Note" value={detailModal.buyer_note || "—"} />
                  <Row label="Admin Note" value={detailModal.admin_note || "—"} />
                  <Row label="Created" value={detailModal.created_at ? new Date(detailModal.created_at).toLocaleString() : "—"} />
                  {detailModal.chargeback_reason && <Row label="Chargeback Reason" value={detailModal.chargeback_reason} />}
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
  header: { fontSize: 24, fontWeight: "800", color: "#FFF", letterSpacing: -0.5 },
  subheader: { fontSize: 13, color: "#666", marginBottom: 12 },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#13131a", borderRadius: 10, paddingHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  searchInput: { flex: 1, color: "#FFF", paddingVertical: 10, fontSize: 14, marginLeft: 8 },
  filterList: { marginBottom: 12, maxHeight: 36 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: "#13131a", marginRight: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  filterChipActive: { backgroundColor: "rgba(59,130,246,0.15)", borderColor: "#3B82F6" },
  filterChipText: { color: "#666", fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  filterChipTextActive: { color: "#3B82F6" },
  list: { paddingBottom: 20 },
  card: { backgroundColor: "#13131a", borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardRef: { color: "#FFF", fontSize: 13, fontWeight: "700", fontFamily: "monospace" },
  badge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, gap: 4 },
  badgeText: { fontSize: 10, fontWeight: "700" },
  cardBody: { gap: 6 },
  cardDetail: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardLabel: { color: "#555", fontSize: 12, width: 60 },
  cardValue: { color: "#CCC", fontSize: 12, flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 16 },
  modalBox: { backgroundColor: "#1a1a2e", borderRadius: 20, padding: 24, width: "100%", maxWidth: 480, maxHeight: "90%", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  modalClose: { alignSelf: "flex-end", marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#FFF", fontFamily: "monospace", marginBottom: 8 },
  modalStatusRow: { marginBottom: 16 },
  modalBody: { gap: 10, marginBottom: 20 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  rowLabel: { color: "#666", fontSize: 12 },
  rowValue: { color: "#CCC", fontSize: 12, textAlign: "right", flex: 1, marginLeft: 16 },
  actionGrid: { gap: 8 },
  modalInput: { backgroundColor: "#0a0a0f", color: "#FFF", padding: 12, borderRadius: 10, fontSize: 13, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 12, borderRadius: 10, gap: 6, flex: 1 },
  actionBtnFull: { padding: 14 },
  actionBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
})
