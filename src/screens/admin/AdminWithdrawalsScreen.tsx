import React, { useEffect, useState, useCallback } from "react"
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  TextInput, Modal, ScrollView,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { supabase } from "../../config/supabase"
import SupabaseService from "../../services/SupabaseService"
import PawaPayService from "../../services/PawaPayService"
import { useAuth } from "../../contexts/AuthContext"

const COMMISSION_RATE = 0.15

interface EventRevenue {
  eventId: string
  eventName: string
  date: Date
  grossRevenue: number
  gatewayFees: number
  appCommission: number
  netRevenue: number
  ticketCount: number
  eligibleTicketIds: string[]
  selected: boolean
}

const toInternationalPhone = (localNumber: string): string => {
  const cleaned = localNumber.replace(/\D/g, "")
  if (cleaned.startsWith("+256")) return cleaned
  if (cleaned.startsWith("256")) return "+256" + cleaned.slice(3)
  if (cleaned.startsWith("0")) return "+256" + cleaned.slice(1)
  return cleaned.length >= 9 ? "+256" + cleaned : cleaned
}

const calculatePayoutFee = (amount: number, provider: "MTN_MOMO_UGA" | "AIRTEL_OAPI_UGA"): number => {
  const percentFee = Math.round(amount * 0.01)
  if (amount < 500) return percentFee
  if (amount <= 60000) return 300 + percentFee
  if (amount <= 500000) return 600 + percentFee
  if (amount <= 1000000) return 1000 + percentFee
  return 1200 + percentFee
}

export default function AdminWithdrawalsScreen() {
  const { user } = useAuth()
  const [events, setEvents] = useState<EventRevenue[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [calculating, setCalculating] = useState(false)

  // Withdraw modal state
  const [showModal, setShowModal] = useState(false)
  const [phone, setPhone] = useState("")
  const [phoneConfirm, setPhoneConfirm] = useState("")
  const [provider, setProvider] = useState<"MTN_MOMO_UGA" | "AIRTEL_OAPI_UGA">("MTN_MOMO_UGA")
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState("")
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError, setOtpError] = useState("")
  const [withdrawLoading, setWithdrawLoading] = useState(false)

  // Derived
  const selectedEvents = events.filter(e => e.selected)
  const grossTotal = selectedEvents.reduce((s, e) => s + e.grossRevenue, 0)
  const gatewayTotal = selectedEvents.reduce((s, e) => s + e.gatewayFees, 0)
  const commissionTotal = selectedEvents.reduce((s, e) => s + e.appCommission, 0)
  const netRevenue = grossTotal - gatewayTotal - commissionTotal
  const payoutFee = calculatePayoutFee(netRevenue, provider)
  const netAfterFee = Math.max(0, netRevenue - payoutFee)
  const allSelected = events.length > 0 && events.every(e => e.selected)

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true)
      const all = await SupabaseService.getEvents()
      const featured = all.filter(e => e.isFeatured)
      const enriched: EventRevenue[] = []

      for (const evt of featured) {
        const allTickets = await SupabaseService.getTicketsByEvent(evt.slug)
        const eligible = allTickets.filter((t: any) => {
          const pe = t.payout_eligible ?? t.payoutEligible ?? false
          const ps = t.payout_status ?? t.payoutStatus ?? "pending"
          return pe === true && ps === "pending"
        })
        const gross = eligible.reduce((s: number, t: any) => s + (t.total_amount ?? t.totalAmount ?? 0), 0)
        const gateway = eligible.reduce((s: number, t: any) => s + (t.gateway_fee ?? t.gatewayFee ?? 0), 0)
        const commission = eligible.reduce((s: number, t: any) => s + (t.app_commission ?? t.appCommission ?? 0), 0)
        enriched.push({
          eventId: evt.slug,
          eventName: evt.name,
          date: evt.date,
          grossRevenue: gross,
          gatewayFees: gateway,
          appCommission: commission,
          netRevenue: gross - gateway - commission,
          ticketCount: eligible.length,
          eligibleTicketIds: eligible.map((t: any) => t.id),
          selected: false,
        })
      }
      enriched.sort((a, b) => b.date.getTime() - a.date.getTime())
      setEvents(enriched)
    } catch (e: any) {
      console.error("AdminWithdrawals: Error loading events:", e)
      Alert.alert("Error", "Failed to load event revenue data")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void loadEvents() }, [loadEvents])

  const toggleEvent = (eventId: string) => {
    setEvents(prev => prev.map(e => e.eventId === eventId ? { ...e, selected: !e.selected } : e))
  }

  const toggleAll = () => {
    setEvents(prev => prev.map(e => ({ ...e, selected: !allSelected })))
  }

  // ── OTP flow ──────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    if (!user?.email) return
    const p1 = toInternationalPhone(phone)
    const p2 = toInternationalPhone(phoneConfirm)
    if (p1 !== p2) { setOtpError("Numbers don't match"); return }
    if (netAfterFee <= 0) { setOtpError("Net withdrawal amount is zero"); return }
    setOtpLoading(true); setOtpError("")
    try {
      const { data: { user: sessionUser } } = await supabase.auth.getUser()
      if (!sessionUser) { setOtpError("Session expired"); return }
      await supabase.from('payout_otps').update({ used: true }).eq('user_id', sessionUser.id).eq('used', false)
      const otp = Math.floor(100000 + Math.random() * 900000).toString()
      await supabase.from('payout_otps').insert({ user_id: sessionUser.id, email: user.email, otp, expires_at: new Date(Date.now() + 90 * 1000) })
      const { error: emailError } = await supabase.functions.invoke('send-payout-otp', { body: { email: user.email, otp } })
      if (emailError) throw emailError
      setOtpSent(true)
    } catch (err) { console.error(err); setOtpError("Failed to send code") }
    finally { setOtpLoading(false) }
  }

  const handleConfirmWithdraw = async () => {
    if (!otpCode.trim()) { setOtpError("Enter the code"); return }
    setOtpLoading(true); setOtpError("")
    try {
      const { data: { user: sessionUser } } = await supabase.auth.getUser()
      if (!sessionUser) { setOtpError("Session expired"); return }
      const { data: otpRow } = await supabase.from('payout_otps')
        .select('*').eq('user_id', sessionUser.id).eq('otp', otpCode.trim()).eq('used', false).gt('expires_at', new Date().toISOString()).single()
      if (!otpRow) { setOtpError("Code is incorrect or expired"); return }
      await supabase.from('payout_otps').update({ used: true }).eq('id', otpRow.id)
      setOtpLoading(false)
      setWithdrawLoading(true)
      try {
        const intPhone = toInternationalPhone(phone)
        const payoutResult = await PawaPayService.initiatePayout(netAfterFee, "UGX", intPhone, provider)
        if (!payoutResult.success) { Alert.alert("Payout Failed", payoutResult.error || "Unknown"); return }

        // Mark tickets for all selected events
        const allEligibleIds: string[] = []
        for (const evt of selectedEvents) {
          for (const tid of evt.eligibleTicketIds) {
            allEligibleIds.push(tid)
            try { await SupabaseService.updateTicket(tid, { payoutStatus: "paid", payoutDate: new Date(), payoutEligible: false }) } catch {}
          }
        }

        // Save payout record
        try {
          await SupabaseService.savePayout({
            organizer_id: user.id,
            ticket_ids: allEligibleIds,
            amount: netRevenue,
            status: "Completed",
            processed_date: new Date().toISOString(),
            transaction_reference: payoutResult.payoutId,
            payout_method: "mobile_money",
            recipient_name: user.displayName || user.email || "",
            recipient_phone_number: intPhone,
          })
        } catch (err) { console.error("Failed to save payout:", err) }

        Alert.alert("✅ Withdrawal Submitted!", `UGX ${netAfterFee.toLocaleString()} sent to ${intPhone}`)
        setShowModal(false)
        setOtpSent(false); setOtpCode(""); setPhone(""); setPhoneConfirm("")
        setEvents(prev => prev.map(e => e.selected ? { ...e, selected: false } : e))
        await loadEvents()
      } catch (e: any) { Alert.alert("Error", e.message) }
      finally { setWithdrawLoading(false) }
    } catch (err) { console.error(err); setOtpError("Verification failed") }
    finally { setOtpLoading(false) }
  }

  const renderRow = ({ item }: { item: EventRevenue }) => (
    <TouchableOpacity style={styles.row} onPress={() => toggleEvent(item.eventId)} activeOpacity={0.7}>
      <View style={styles.checkCol}>
        <Ionicons name={item.selected ? "checkbox" : "square-outline"} size={22} color={item.selected ? "#00D4FF" : "#555"} />
      </View>
      <View style={styles.infoCol}>
        <Text style={styles.eventName}>{item.eventName}</Text>
        <Text style={styles.eventMeta}>{item.date.toLocaleDateString()} · {item.ticketCount} ticket{item.ticketCount !== 1 ? "s" : ""}</Text>
      </View>
      <View style={styles.numbersCol}>
        <Text style={styles.numGross}>UGX {item.grossRevenue.toLocaleString()}</Text>
        <Text style={styles.numNet}>UGX {item.netRevenue.toLocaleString()}</Text>
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Featured Revenue Withdrawals</Text>
      <Text style={styles.subheader}>{events.length} featured events</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#00D4FF" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.eventId}
          renderItem={renderRow}
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadEvents() }}
          ListHeaderComponent={events.length > 0 ? (
            <TouchableOpacity style={styles.selectAllRow} onPress={toggleAll}>
              <Ionicons name={allSelected ? "checkbox" : "square-outline"} size={22} color={allSelected ? "#00D4FF" : "#555"} />
              <Text style={styles.selectAllText}>Select All</Text>
            </TouchableOpacity>
          ) : null}
          ListEmptyComponent={
            <View style={{ padding: 40, alignItems: "center" }}>
              <Ionicons name="calendar-outline" size={48} color="#333" />
              <Text style={{ color: "#666", marginTop: 12 }}>No featured events found</Text>
            </View>
          }
        />
      )}

      {/* Summary bar */}
      {selectedEvents.length > 0 && (
        <View style={styles.summaryBar}>
          <View style={styles.summarySection}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Gross Revenue</Text>
              <Text style={styles.summaryValue}>UGX {grossTotal.toLocaleString()}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Gateway Fees</Text>
              <Text style={[styles.summaryValue, { color: "#FF6B6B" }]}>- UGX {gatewayTotal.toLocaleString()}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>App Commission ({Math.round(COMMISSION_RATE * 100)}%)</Text>
              <Text style={[styles.summaryValue, { color: "#FF6B6B" }]}>- UGX {commissionTotal.toLocaleString()}</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryDivider]}>
              <Text style={styles.summaryLabelBold}>Net Withdrawal</Text>
              <Text style={styles.summaryValueBold}>UGX {netRevenue.toLocaleString()}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.withdrawBtn} onPress={() => { setPhone(""); setPhoneConfirm(""); setOtpSent(false); setOtpCode(""); setOtpError(""); setShowModal(true) }}>
            <Ionicons name="cash-outline" size={20} color="#000" />
            <Text style={styles.withdrawBtnText}>Withdraw Selected</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Withdraw Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>💰 Withdraw Revenue</Text>
              <TouchableOpacity onPress={() => { setShowModal(false); setOtpSent(false); setOtpCode("") }}>
                <Ionicons name="close-circle" size={28} color="#888" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              {/* Breakdown */}
              <View style={styles.breakdownCard}>
                <Text style={styles.breakdownTitle}>Selected Events: {selectedEvents.length}</Text>
                <Row label="Gross Revenue" value={`UGX ${grossTotal.toLocaleString()}`} />
                <Row label="Gateway Fees" value={`- UGX ${gatewayTotal.toLocaleString()}`} color="#FF6B6B" />
                <Row label="App Commission" value={`- UGX ${commissionTotal.toLocaleString()}`} color="#FF6B6B" />
                <View style={styles.breakdownDivider} />
                <Row label="Net Withdrawal" value={`UGX ${netRevenue.toLocaleString()}`} bold color="#00D4FF" />
                <Row label="Withdrawal Fee" value={`- UGX ${payoutFee.toLocaleString()}`} color="#F59E0B" />
                <View style={styles.breakdownDivider} />
                <Row label="You'll Receive" value={`UGX ${netAfterFee.toLocaleString()}`} bold color="#4CAF50" size={18} />
              </View>

              {/* Provider */}
              <Text style={styles.sectionLabel}>Mobile Money Provider</Text>
              <View style={styles.providerRow}>
                <TouchableOpacity style={[styles.providerChip, provider === "MTN_MOMO_UGA" && styles.providerChipActive]} onPress={() => setProvider("MTN_MOMO_UGA")}>
                  <Text style={[styles.providerChipText, provider === "MTN_MOMO_UGA" && styles.providerChipTextActive]}>MTN</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.providerChip, provider === "AIRTEL_OAPI_UGA" && styles.providerChipActive]} onPress={() => setProvider("AIRTEL_OAPI_UGA")}>
                  <Text style={[styles.providerChipText, provider === "AIRTEL_OAPI_UGA" && styles.providerChipTextActive]}>Airtel</Text>
                </TouchableOpacity>
              </View>

              {/* Phone */}
              <Text style={styles.sectionLabel}>Mobile Money Number</Text>
              <TextInput style={styles.input} value={phone} onChangeText={(t) => { setPhone(t); if (otpSent) { setOtpSent(false); setOtpCode("") } }} placeholder="07XXXXXXXX" placeholderTextColor="#555" keyboardType="phone-pad" />
              <TextInput style={[styles.input, { marginTop: 8 }]} value={phoneConfirm} onChangeText={(t) => { setPhoneConfirm(t); if (otpSent) { setOtpSent(false); setOtpCode("") } }} placeholder="Confirm number" placeholderTextColor="#555" keyboardType="phone-pad" />

              {!otpSent ? (
                <TouchableOpacity style={[styles.actionBtn, (!phone || !phoneConfirm || otpLoading) && { opacity: 0.4 }]} onPress={handleSendOtp} disabled={!phone || !phoneConfirm || otpLoading}>
                  {otpLoading ? <ActivityIndicator color="#000" /> : <><Ionicons name="lock-closed-outline" size={20} color="#000" /><Text style={styles.actionBtnText}>Send Verification Code</Text></>}
                </TouchableOpacity>
              ) : (
                <>
                  <Text style={{ color: "#FFF", fontSize: 14, fontWeight: "600", marginTop: 16, marginBottom: 8 }}>Enter Code</Text>
                  <TextInput style={styles.input} value={otpCode} onChangeText={setOtpCode} placeholder="6-digit code" placeholderTextColor="#555" keyboardType="number-pad" maxLength={6} />
                  {otpError ? <Text style={{ color: "#FF6B6B", fontSize: 12, marginTop: 4 }}>{otpError}</Text> : null}
                  <TouchableOpacity style={[styles.actionBtn, (!otpCode || otpLoading) && { opacity: 0.4 }, { marginTop: 16 }]} onPress={handleConfirmWithdraw} disabled={!otpCode || otpLoading}>
                    {withdrawLoading ? <ActivityIndicator color="#000" /> : <><Ionicons name="checkmark-circle-outline" size={20} color="#000" /><Text style={styles.actionBtnText}>Confirm Withdrawal</Text></>}
                  </TouchableOpacity>
                </>
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function Row({ label, value, color, bold, size }: { label: string; value: string; color?: string; bold?: boolean; size?: number }) {
  return (
    <View style={modStyles.row}>
      <Text style={[modStyles.rowLabel, bold && { fontWeight: "700" }]}>{label}</Text>
      <Text style={[modStyles.rowValue, { color: color || "#CCC" }, bold && { fontWeight: "800" }, size ? { fontSize: size } : {}]}>{value}</Text>
    </View>
  )
}

const modStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  rowLabel: { color: "#888", fontSize: 13 },
  rowValue: { color: "#CCC", fontSize: 14, fontWeight: "600", textAlign: "right" },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0f", padding: 16 },
  header: { fontSize: 24, fontWeight: "800", color: "#FFF", letterSpacing: -0.5 },
  subheader: { fontSize: 13, color: "#666", marginBottom: 16 },
  selectAllRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  selectAllText: { color: "#AAA", fontSize: 14, fontWeight: "600" },

  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  checkCol: { width: 36, alignItems: "center" },
  infoCol: { flex: 1 },
  eventName: { color: "#FFF", fontSize: 14, fontWeight: "600" },
  eventMeta: { color: "#666", fontSize: 11, marginTop: 2 },
  numbersCol: { alignItems: "flex-end" },
  numGross: { color: "#888", fontSize: 12 },
  numNet: { color: "#00D4FF", fontSize: 14, fontWeight: "700" },

  summaryBar: { backgroundColor: "#13131a", borderRadius: 14, padding: 16, marginTop: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  summarySection: { gap: 4 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { color: "#888", fontSize: 12 },
  summaryLabelBold: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  summaryValue: { color: "#CCC", fontSize: 13, fontWeight: "600" },
  summaryValueBold: { color: "#00D4FF", fontSize: 16, fontWeight: "800" },
  summaryDivider: { borderTopWidth: 1, borderTopColor: "#2a2a2a", paddingTop: 8, marginTop: 8 },

  withdrawBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#00D4FF", paddingVertical: 14, borderRadius: 10, marginTop: 12, gap: 6 },
  withdrawBtnText: { color: "#000", fontWeight: "800", fontSize: 15 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 16 },
  modalBox: { backgroundColor: "#1a1a2e", borderRadius: 20, width: "100%", maxWidth: 480, maxHeight: "90%", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  modalTitle: { fontSize: 20, fontWeight: "800", color: "#FFF" },

  breakdownCard: { backgroundColor: "#0a0a0f", borderRadius: 12, padding: 16, marginBottom: 20 },
  breakdownTitle: { color: "#FFF", fontSize: 14, fontWeight: "700", marginBottom: 12 },
  breakdownDivider: { height: 1, backgroundColor: "#2a2a2a", marginVertical: 8 },

  sectionLabel: { color: "#FFF", fontSize: 14, fontWeight: "600", marginBottom: 8, marginTop: 16 },
  providerRow: { flexDirection: "row", gap: 8 },
  providerChip: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: "#0a0a0f", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  providerChipActive: { borderColor: "#00D4FF", backgroundColor: "rgba(0,212,255,0.1)" },
  providerChipText: { color: "#888", fontWeight: "600", fontSize: 13 },
  providerChipTextActive: { color: "#00D4FF" },

  input: { backgroundColor: "#0a0a0f", color: "#FFF", padding: 14, borderRadius: 10, fontSize: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#00D4FF", paddingVertical: 14, borderRadius: 10, gap: 6, marginTop: 16 },
  actionBtnText: { color: "#000", fontWeight: "800", fontSize: 14 },
})
