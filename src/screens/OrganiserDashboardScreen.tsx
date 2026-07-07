"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Platform,
  Image,
  Animated,
  PanResponder,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useCompatNavigation } from "../utils/compatNavigation"
import { useRouter } from "../utils/URLRouter"

import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { supabase } from "../config/supabase"
import SupabaseService from "../services/SupabaseService"
import TicketService from "../services/TicketService"
import PesaPalService from "../services/PesaPalService"
import PawaPayService from "../services/PawaPayService"
import StaffTokenService from "../services/StaffTokenService"
import { useAuth } from "../contexts/AuthContext"
import type { Event } from "../models/Event"
import type {
  VenuesStackParamList,
  EventsStackParamList,
  MapStackParamList,
  CalendarStackParamList,
  ProfileStackParamList
} from "../navigation/types"

const { width: screenWidth } = Dimensions.get('window')
const isSmallDevice = screenWidth < 380
const isTablet = screenWidth >= 768
const isLargeScreen = screenWidth >= 1024
const SLIDER_WIDTH = screenWidth - 96

const toInternationalPhone = (localNumber: string): string => {
  const cleaned = localNumber.replace(/\D/g, "")
  if (cleaned.startsWith("+256")) return cleaned
  if (cleaned.startsWith("256")) return "+256" + cleaned.slice(3)
  if (cleaned.startsWith("0")) return "+256" + cleaned.slice(1)
  return cleaned.length >= 9 ? "+256" + cleaned : cleaned
}

// =============================================================================
// Payout Fee Calculator
// =============================================================================
// Test cases:
// MTN_MOMO_UGA: 499->fee=5, 500->fee=305, 60000->fee=3300, 60001->fee=3600, 500000->fee=5600, 500001->fee=6000, 1000000->fee=11200
// AIRTEL_OAPI_UGA: 499->fee=5, 500->fee=305, 60000->fee=3300, 500000->fee=5600, 500001->fee=6000
const calculatePayoutFee = (amount: number, provider: "MTN_MOMO_UGA" | "AIRTEL_OAPI_UGA"): number => {
  const percentFee = Math.round(amount * 0.01)
  
  if (amount < 500) {
    return percentFee
  } else if (amount <= 60000) {
    return 300 + percentFee
  } else if (amount <= 500000) {
    return 600 + percentFee
  } else if (amount <= 1000000) {
    return 1000 + percentFee
  } else {
    return 1200 + percentFee
  }
}

// =============================================================================
// Payout Slider Component – futuristic dot-on-line selector
// =============================================================================
const PayoutSlider: React.FC<{
  label: string
  max: number
  price: number
  value: number
  onChange: (v: number) => void
  unitLabel?: string
}> = ({ label, max, price, value, onChange, unitLabel = "ticket" }) => {
  const [trackWidth, setTrackWidth] = useState(SLIDER_WIDTH)
  const total = value * price

  const dotPos = max > 0 ? (value / max) * trackWidth : 0

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gesture) => {
      const rawX = Math.max(0, Math.min(trackWidth, gesture.moveX - 16))
      const stepped = Math.round((rawX / trackWidth) * max)
      onChange(Math.max(0, Math.min(max, stepped)))
    },
  })

  return (
    <View style={payoutSliderStyles.container}>
      <View style={payoutSliderStyles.header}>
        <Text style={payoutSliderStyles.label}>{label}</Text>
        <View style={payoutSliderStyles.badge}>
          <Text style={payoutSliderStyles.badgeText}>{value} / {max}</Text>
        </View>
      </View>
      <View
        style={payoutSliderStyles.trackOuter}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        {/* Fill track */}
        <View style={[payoutSliderStyles.trackFill, { width: dotPos }]} />
        {/* Steps */}
        {max > 1 && Array.from({ length: max + 1 }).map((_, i) => (
          <View
            key={i}
            style={[
              payoutSliderStyles.step,
              i <= value && payoutSliderStyles.stepActive,
            ]}
          />
        ))}
        {/* Thumb dot */}
        <View
          style={[
            payoutSliderStyles.thumb,
            { left: dotPos - 14 },
          ]}
        >
          <View style={payoutSliderStyles.thumbInner} />
        </View>
      </View>
      <View style={payoutSliderStyles.footer}>
        <Text style={payoutSliderStyles.countText}>{value} {unitLabel}{value !== 1 ? "s" : ""}</Text>
        <Text style={payoutSliderStyles.amountText}>UGX {total.toLocaleString()}</Text>
      </View>
    </View>
  )
}

const payoutSliderStyles = StyleSheet.create({
  container: { marginBottom: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  label: { color: "#FFF", fontSize: 15, fontWeight: "600" },
  badge: { backgroundColor: "rgba(0, 212, 255, 0.15)", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  badgeText: { color: "#00D4FF", fontSize: 12, fontWeight: "600" },
  trackOuter: {
    height: 40, justifyContent: "center", position: "relative",
    backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 20,
    marginHorizontal: 14,
  },
  trackFill: {
    position: "absolute", left: 0, top: 0, bottom: 0,
    backgroundColor: "rgba(0, 212, 255, 0.3)",
    borderRadius: 20,
  },
  step: {
    position: "absolute", width: 6, height: 6, borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.15)", marginLeft: -3,
  },
  stepActive: { backgroundColor: "#00D4FF" },
  thumb: {
    position: "absolute", width: 28, height: 28, borderRadius: 14,
    backgroundColor: "rgba(0, 212, 255, 0.2)",
    justifyContent: "center", alignItems: "center",
    top: 6,
  },
  thumbInner: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: "#00D4FF",
    shadowColor: "#00D4FF", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 8, elevation: 6,
  },
  footer: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  countText: { color: "#AAA", fontSize: 12 },
  amountText: { color: "#4CAF50", fontSize: 13, fontWeight: "700" },
})

// =============================================================================
// Helper to assign step positions
// =============================================================================
const assignSteps = (steps: JSX.Element[], max: number, value: number, trackWidth: number) => {
  return Array.from({ length: max + 1 }).map((_, i) => {
    const left = max > 0 ? (i / max) * trackWidth : 0
    return (
      <View
        key={i}
        style={[
          payoutSliderStyles.step,
          { left: left - 3 },
          i <= value && payoutSliderStyles.stepActive,
        ]}
      />
    )
  })
}

// =============================================================================
// Main Dashboard Screen
// =============================================================================
type OrganiserDashboardScreenProps = NativeStackScreenProps<
  | VenuesStackParamList
  | EventsStackParamList
  | MapStackParamList
  | CalendarStackParamList
  | ProfileStackParamList,
  "OrganiserDashboard"
>

const OrganiserDashboardScreen: React.FC = () => {
  const navigation = useCompatNavigation()
  const { currentPath } = useRouter()
  const pathParts = currentPath.split('/').filter(Boolean)
  const eventId = pathParts[2]
  const { user } = useAuth()

  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeDashboardTab, setActiveDashboardTab] = useState<'organizer' | 'admin'>('organizer')
  const [allowLatePurchases, setAllowLatePurchases] = useState(true)
  const [ticketSalesEarly, setTicketSalesEarly] = useState(0)
  const [ticketSalesLate, setTicketSalesLate] = useState(0)
  const [scanLogs, setScanLogs] = useState<Array<{ time: string; ticketId: string; status: string }>>([])
  const [payoutHistory, setPayoutHistory] = useState<Array<{ date: string; amount: string; status: string }>>([])
  const [walletBalance, setWalletBalance] = useState("UGX 0")
  const [eligiblePayoutTotal, setEligiblePayoutTotal] = useState(0)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [withdrawLoading, setWithdrawLoading] = useState(false)
  
  // Payout slider state
  const [payoutTicketTypes, setPayoutTicketTypes] = useState<Record<string, { total: number; price: number; scannedIds: string[]; isTable?: boolean; tableSize?: number }>>({})
  const [payoutSelections, setPayoutSelections] = useState<Record<string, number>>({})
  const [payoutPhone, setPayoutPhone] = useState("")
  const [payoutPhoneConfirm, setPayoutPhoneConfirm] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError, setOtpError] = useState("")
  const [resendCooldown, setResendCooldown] = useState(0)
  const [payoutProvider, setPayoutProvider] = useState<"MTN_MOMO_UGA" | "AIRTEL_OAPI_UGA">("MTN_MOMO_UGA")

  const [ticketSalesByType, setTicketSalesByType] = useState<Record<string, { early: { count: number; revenue: number }; late: { count: number; revenue: number }; scanned: { count: number; revenue: number } }>>({})
  const [organizerPaymentDetails, setOrganizerPaymentDetails] = useState<{
    mobileMoney?: { provider: string; phoneNumber: string; accountName: string }
    bankAccount?: { bankName: string; accountNumber: string; accountName: string }
  }>({})
  const [isEditingPayment, setIsEditingPayment] = useState(false)
  const [editForm, setEditForm] = useState({
    mobileProvider: "mtn" as "mtn" | "airtel",
    mobileNumber: "",
    mobileName: "",
    bankName: "",
    bankNumber: "",
    bankNameAccount: ""
  })
  const [scanning, setScanning] = useState(false)
  const [validating, setValidating] = useState(false)
  const [scannerInput, setScannerInput] = useState("")
  const [showScannerModal, setShowScannerModal] = useState(false)
  const [showPhotoVerification, setShowPhotoVerification] = useState(false)
  const [pendingTicketDocId, setPendingTicketDocId] = useState<string | null>(null)
  const [buyerPhotoUrl, setBuyerPhotoUrl] = useState<string>("")
  const [buyerName, setBuyerName] = useState<string>("")
  const [eventCreatorPaymentDetails, setEventCreatorPaymentDetails] = useState<any>(null)

  type StaffToken = { id: string; token: string; label?: string; expires_at: string; created_at: string }
  const [activeTokens, setActiveTokens] = useState<StaffToken[]>([])
  const [newTokenLabel, setNewTokenLabel] = useState("")
  const [showTokenModal, setShowTokenModal] = useState(false)
  const [tokenLoading, setTokenLoading] = useState(false)

  const formatTimeRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now()
    if (diff <= 0) return "Expired"
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}h ${minutes}m`
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      Alert.alert("Copied", "Link copied to clipboard")
    } catch {
      Alert.alert("Error", "Failed to copy")
    }
  }

  const handleGenerateToken = async () => {
    if (!event?.slug) return
    const activeCount = activeTokens.filter(t => new Date(t.expires_at) > new Date()).length
    if (activeCount >= 15) {
      Alert.alert("Limit Reached", "Maximum of 15 active staff links per event")
      return
    }
    setTokenLoading(true)
    try {
      const result = await StaffTokenService.generateToken(event.slug, newTokenLabel || undefined)
      if (result) {
        const tokens = await StaffTokenService.getActiveTokensForEvent(event.slug)
        const newToken = tokens.find(t => t.id === result.tokenId)
        if (newToken) {
          const link = `https://yovibe.net/scan/${newToken.token}`
          await copyToClipboard(link)
          setActiveTokens([newToken, ...activeTokens])
        }
        setShowTokenModal(false)
        setNewTokenLabel("")
      }
    } catch {
      Alert.alert("Error", "Failed to generate token")
    } finally {
      setTokenLoading(false)
    }
  }

  const handleRevokeToken = async (tokenId: string) => {
    await StaffTokenService.revokeToken(tokenId)
    setActiveTokens(activeTokens.filter(t => t.id !== tokenId))
  }

  const handleFetchTokens = async () => {
    if (!event?.slug) return
    const tokens = await StaffTokenService.getActiveTokensForEvent(event.slug)
    setActiveTokens(tokens)
  }

  useEffect(() => { handleFetchTokens() }, [event?.slug])

  type TicketSalesByType = {
    [entryFeeName: string]: {
      early: { count: number; revenue: number }
      late: { count: number; revenue: number }
      scanned: { count: number; revenue: number }
    }
  }

  const rowToTicket = (row: any): any => {
    if (!row) return row
    return {
      id: row.id,
      eventId: row.event_id || row.eventId,
      eventName: row.event_name || row.eventName,
      entryFeeType: row.entry_fee_type || row.entryFeeType || "Standard",
      totalAmount: row.total_amount ?? row.totalAmount ?? 0,
      venueRevenue: row.venue_revenue ?? row.venueRevenue ?? 0,
      appCommission: row.app_commission ?? row.appCommission ?? 0,
      isLatePurchase: row.is_late_purchase ?? row.isLatePurchase ?? false,
      isScanned: row.is_scanned ?? row.isScanned ?? false,
      status: row.status || "pending",
      payoutEligible: row.payout_eligible ?? row.payoutEligible ?? false,
      payoutStatus: row.payout_status || row.payoutStatus || "pending",
      purchaseDate: row.purchase_date || row.purchaseDate,
      created_at: row.created_at,
    }
  }

  // Build a lookup from entry fee name to fee details
  const getEntryFeeInfo = useCallback((typeName: string): { isTable?: boolean; tableSize?: number } | undefined => {
    return event?.entryFees?.find(fee => fee.name === typeName)
  }, [event])

  const processTicketData = useCallback((tickets: any[]) => {
    let earlyCount = 0, lateCount = 0, totalRevenue = 0, eligibleTotal = 0
    const salesByType: TicketSalesByType = {}
    const payoutTypes: Record<string, { total: number; price: number; scannedIds: string[]; isTable?: boolean; tableSize?: number }> = {}

    if (event?.entryFees) {
      event.entryFees.forEach((fee: { name: string; amount: string; isTable?: boolean; tableSize?: number }) => {
        salesByType[fee.name] = { early: { count: 0, revenue: 0 }, late: { count: 0, revenue: 0 }, scanned: { count: 0, revenue: 0 } }
        payoutTypes[fee.name] = { total: 0, price: parseInt(fee.amount?.replace(/[^0-9]/g, "") || "0"), scannedIds: [], isTable: fee.isTable || false, tableSize: fee.tableSize || 1 }
      })
    }

    tickets.forEach((ticket) => {
      const t = rowToTicket(ticket)
      const ticketType = t.entryFeeType || "Standard"
      const amount = t.totalAmount || 0
      const isLate = t.isLatePurchase
      const isScanned = t.isScanned || t.status === "used"
      const isEligible = t.payoutEligible === true && t.payoutStatus === "pending"

      if (isLate) lateCount++; else earlyCount++
      totalRevenue += amount
      if (isEligible) eligibleTotal += t.venueRevenue || 0

      if (!salesByType[ticketType]) salesByType[ticketType] = { early: { count: 0, revenue: 0 }, late: { count: 0, revenue: 0 }, scanned: { count: 0, revenue: 0 } }
      if (isLate) { salesByType[ticketType].late.count++; salesByType[ticketType].late.revenue += amount }
      else { salesByType[ticketType].early.count++; salesByType[ticketType].early.revenue += amount }
      if (isScanned) {
        if (!salesByType[ticketType].scanned) salesByType[ticketType].scanned = { count: 0, revenue: 0 }
        salesByType[ticketType].scanned.count++
        salesByType[ticketType].scanned.revenue += amount
      }

      // Track for payout (use scanned & payout-eligible tickets only)
      if (isScanned && isEligible) {
        if (!payoutTypes[ticketType]) {
          payoutTypes[ticketType] = { total: 0, price: t.venueRevenue || 0, scannedIds: [], isTable: false, tableSize: 1 }
        }
        // Override the initial price from entryFees (full amount) with actual venueRevenue (price - app fees)
        payoutTypes[ticketType].price = t.venueRevenue || 0
        payoutTypes[ticketType].total++
        payoutTypes[ticketType].scannedIds.push(t.id)
      }
    })

    setTicketSalesEarly(earlyCount)
    setTicketSalesLate(lateCount)
    setWalletBalance(`UGX ${totalRevenue.toLocaleString()}`)
    setEligiblePayoutTotal(eligibleTotal)
    setTicketSalesByType(salesByType)
    setPayoutTicketTypes(payoutTypes)
  }, [event])

  const fetchTicketData = useCallback(async () => {
    if (!eventId) return
    try {
      const { data, error } = await supabase.from("tickets").select("*").eq("event_slug", eventId)
      if (error) throw error
      const rows = data || []
      rows.sort((a: any, b: any) => { const da = a.purchase_date || a.created_at || ""; const db = b.purchase_date || b.created_at || ""; return db.localeCompare(da) })
      processTicketData(rows)
    } catch (error) { console.error("OrganiserDashboardScreen: Error fetching tickets:", error) }
  }, [eventId, processTicketData])

  const fetchScanLogs = useCallback(async () => {
    if (!eventId) return
    try {
      const { data, error } = await supabase.from("ticket_validations").select("*").eq("event_slug", eventId).order("validatedAt", { ascending: false, nullsFirst: false }).limit(10)
      if (error) throw error
      setScanLogs((data || []).map((v: any) => ({ time: v.validatedAt ? new Date(v.validatedAt).toLocaleTimeString() : "", ticketId: v.ticketId ? v.ticketId.substring(0, 8) + "..." : "Unknown", status: v.status === "granted" ? "Valid" : "Invalid" })))
    } catch (error) { console.error("OrganiserDashboardScreen: Error fetching scan logs:", error) }
  }, [eventId])

  useEffect(() => {
    const load = async () => {
      try { const ed = await SupabaseService.getEventById(eventId); setEvent(ed) } catch {}
      setLoading(false)
    }
    load()
  }, [eventId])
  useEffect(() => { fetchScanLogs() }, [fetchScanLogs])
  useEffect(() => { if (!eventId) return; fetchTicketData()
    const tc = supabase.channel(`tickets-${eventId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `event_slug=eq.${eventId}` }, () => fetchTicketData()).subscribe()
    const vc = supabase.channel(`validations-${eventId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_validations', filter: `event_slug=eq.${eventId}` }, () => fetchScanLogs()).subscribe()
    return () => { supabase.removeChannel(tc); supabase.removeChannel(vc) }
  }, [eventId, fetchTicketData, fetchScanLogs])

  // Load payout history from Supabase on mount
  useEffect(() => {
    if (!user) return
    const loadPayouts = async () => {
      try {
        const payouts = await SupabaseService.getPayoutsByOrganizer(user.id)
        if (payouts && payouts.length > 0) {
          setPayoutHistory(payouts.map((p: any) => ({
            date: new Date(p.request_date || p.processed_date).toLocaleDateString(),
            amount: `UGX ${(p.amount || 0).toLocaleString()}`,
            status: p.status === "Completed" ? "Completed" : "Pending",
          })))
        }
      } catch {}
    }
    loadPayouts()
  }, [user, eventId])

  // Initialize default selections when payout types change
  useEffect(() => {
    const initial: Record<string, number> = {}
    Object.keys(payoutTicketTypes).forEach(k => { initial[k] = 0 })
    setPayoutSelections(initial)
  }, [payoutTicketTypes])

  // Load user's phone for payout
  useEffect(() => {
    if (!user) return
    SupabaseService.getUserProfileOrNull(user.uid).then(ud => {
      if (ud?.paymentDetails?.mobileMoney?.phoneNumber) {
        setPayoutPhone(ud.paymentDetails.mobileMoney.phoneNumber)
        setPayoutProvider(ud.paymentDetails.mobileMoney.provider === "airtel" || ud.paymentDetails.mobileMoney.provider === "airtel_tigo" ? "AIRTEL_OAPI_UGA" : "MTN_MOMO_UGA")
      }
    }).catch(() => {})
  }, [user])

  const handleScanTicket = () => {
    navigation.navigate("TicketScanner", { eventId, eventName: event?.name || "Event" })
  }

  const handleValidateTicket = async (ticketId: string) => {
    if (!user) return
    setValidating(true)
    Alert.alert("Ticket Validation", "Click Validate to verify this ticket.", [
      { text: "Cancel", style: "cancel" },
      { text: "Validate", onPress: async () => {
        try {
          const result = await TicketService.validateTicket(ticketId, user.id, "Event Entrance")
          if (result.success && result.needsPhotoVerification && result.buyerPhotoUrl && result.ticketDocId) {
            setPendingTicketDocId(result.ticketDocId); setBuyerPhotoUrl(result.buyerPhotoUrl); setBuyerName(result.buyerName || "Ticket Buyer"); setShowPhotoVerification(true); setValidating(false); return
          }
          Alert.alert(result.success ? "✅ Entry Granted" : "❌ Entry Denied", result.success ? "Ticket validated." : `Failed: ${result.reason}`)
          fetchScanLogs(); fetchTicketData()
        } catch { Alert.alert("Error", "Failed") }
      }}
    ])
    setValidating(false)
  }

  const handlePhotoConfirm = async (confirmed: boolean) => {
    if (!user || !pendingTicketDocId) { setShowPhotoVerification(false); return }
    setShowPhotoVerification(false); setValidating(true)
    try {
      if (confirmed) {
        const r = await TicketService.confirmTicketUsage(pendingTicketDocId, user.id, "Event Entrance", eventId)
        Alert.alert(r.success ? "✅ Entry Granted" : "❌ Entry Denied", r.success ? `Photo verified for ${buyerName}.` : r.reason || "Failed")
        fetchScanLogs(); fetchTicketData()
      } else { Alert.alert("❌ Entry Denied", "Photo mismatch.") }
    } catch { Alert.alert("Error", "Failed") }
    finally { setPendingTicketDocId(null); setBuyerPhotoUrl(""); setBuyerName(""); setValidating(false) }
  }

  const handleEditPayment = () => {
    if (event?.paymentMethods) {
      const mm = event.paymentMethods.mobileMoney?.[0]; const bank = event.paymentMethods.bankAccounts?.[0]
      setEditForm({ mobileProvider: mm?.provider || "mtn", mobileNumber: mm?.number || "", mobileName: mm?.name || "", bankName: bank?.bankName || "", bankNumber: bank?.accountNumber || "", bankNameAccount: bank?.accountName || "" })
    }
    setIsEditingPayment(true)
  }

  const handleSavePaymentDetails = async () => {
    if (!event) return
    try {
      const mobileMoney: Array<{ provider: "mtn" | "airtel"; number: string; name: string }> = []
      if (editForm.mobileNumber && editForm.mobileName) mobileMoney.push({ provider: editForm.mobileProvider, number: editForm.mobileNumber, name: editForm.mobileName })
      const bankAccounts: Array<{ bankName: string; accountNumber: string; accountName: string }> = []
      if (editForm.bankName && editForm.bankNumber && editForm.bankNameAccount) bankAccounts.push({ bankName: editForm.bankName, accountNumber: editForm.bankNumber, accountName: editForm.bankNameAccount })
      await SupabaseService.updateEvent(event.id, { paymentMethods: { mobileMoney, bankAccounts } })
      setEvent({ ...event, paymentMethods: { mobileMoney, bankAccounts } }); setIsEditingPayment(false)
      Alert.alert("Success", "Payment details updated")
    } catch { Alert.alert("Error", "Failed to save") }
  }

  const loadPaymentDetails = async () => {
    if (!user) return
    try { const ud = await SupabaseService.getUserProfileOrNull(user.uid); if (ud?.paymentDetails) setOrganizerPaymentDetails(ud.paymentDetails) } catch {}
  }
  const loadEventCreatorPaymentDetails = async (creatorId: string) => {
    try { return (await SupabaseService.getUserProfileOrNull(creatorId))?.paymentDetails || null } catch { return null }
  }
  useEffect(() => { loadPaymentDetails(); if (user?.userType === 'admin' && event?.createdBy) loadEventCreatorPaymentDetails(event.createdBy).then(setEventCreatorPaymentDetails) }, [user, event])

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  // Reset state when modal closes or payout completes
  const resetPayoutState = useCallback(() => {
    setPayoutPhone("")
    setPayoutPhoneConfirm("")
    setOtpCode("")
    setOtpSent(false)
    setOtpError("")
    setResendCooldown(0)
  }, [])

  // --- Payout handler ---
  // Send OTP
  const handleSendOtp = async () => {
    if (!user?.email) return;

    const phone1 = toInternationalPhone(payoutPhone);
    const phone2 = toInternationalPhone(payoutPhoneConfirm);
    if (phone1 !== phone2) {
      setOtpError("Numbers don't match");
      return;
    }

    setOtpLoading(true);
    setOtpError("");

    try {
      const { data: { user: sessionUser } } = await supabase.auth.getUser()
      if (!sessionUser) {
        setOtpError("Session expired. Please sign in again.");
        return;
      }
      const authUserId = sessionUser.id; // ← use THIS, not user.id

      await supabase
        .from('payout_otps')
        .update({ used: true })
        .eq('user_id', authUserId)
        .eq('used', false);

      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      const { error: dbError } = await supabase
        .from('payout_otps')
        .insert({
          user_id: authUserId,
          email: user.email,
          otp: otp,
          expires_at: new Date(Date.now() + 90 * 1000),
        });

      if (dbError) throw dbError;

      const { error: emailError } = await supabase.functions.invoke('send-payout-otp', {
        body: { email: user.email, otp }
      });

      if (emailError) throw emailError;

      console.log("[PayoutOTP] OTP sent:", otp);
      setOtpSent(true);
      setResendCooldown(60);
    } catch (err) {
      console.error(err);
      setOtpError("Failed to send code. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  // Verify OTP
  const handlePayoutWithOtpCheck = async () => {
    if (!otpCode?.trim()) {
      setOtpError("Please enter the code");
      return;
    }

    setOtpError("");
    setOtpLoading(true);

    try {
      const { data: { user: sessionUser } } = await supabase.auth.getUser()
      if (!sessionUser) {
        setOtpError("Session expired. Please sign in again.");
        return;
      }

      const { data, error } = await supabase
        .from('payout_otps')
        .select('*')
        .eq('user_id', sessionUser.id)  // ← fixed here too
        .eq('otp', otpCode.trim())
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error || !data) {
        setOtpError("Code is incorrect or has expired. Please request a new one.");
        return;
      }

      await supabase
        .from('payout_otps')
        .update({ used: true })
        .eq('id', data.id);

      console.log("[PayoutOTP] OTP verified successfully!");
      await handlePayoutSubmit();

    } catch (err) {
      console.error(err);
      setOtpError("Verification failed. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handlePayoutSubmit = async () => {
    if (!user) { Alert.alert("Error", "Sign in required"); return }
    if (!payoutPhone || payoutPhone.length < 10) { Alert.alert("Error", "Enter a valid mobile money number"); return }

    // Collect selected tickets
    const selectedTicketIds: string[] = []
    let totalAmount = 0
    for (const [type, count] of Object.entries(payoutSelections)) {
      if (count > 0 && payoutTicketTypes[type]) {
        const data = payoutTicketTypes[type]
        const isTableType = data.isTable || false
        const tableSize = data.tableSize || 1
        // For table types: slider counts in tables, need to multiply by tableSize for actual tickets
        const actualTicketCount = isTableType ? count * tableSize : count
        const ticketIds = data.scannedIds.slice(0, actualTicketCount)
        selectedTicketIds.push(...ticketIds)
        // Price already accounts for table: sliderPrice = price * tableSize for tables
        totalAmount += count * (isTableType ? (data.price * tableSize) : (data.price || 0))
      }
    }
    if (selectedTicketIds.length === 0) { Alert.alert("Error", "Select at least one ticket"); return }
    // Cap the amount to never exceed eligible payout total (safety net)
    totalAmount = Math.min(totalAmount, eligiblePayoutTotal)
    if (totalAmount <= 0) { Alert.alert("Error", "Payout amount cannot be zero after eligibility cap"); setWithdrawLoading(false); return }

    setWithdrawLoading(true)
    try {
      const internationalPhone = toInternationalPhone(payoutPhone)
      const payoutFee = calculatePayoutFee(totalAmount, payoutProvider)
      const netPayoutAmount = totalAmount - payoutFee
      console.log(`[PayoutFee] provider=${payoutProvider} gross=${totalAmount} fee=${payoutFee} net=${netPayoutAmount}`)

      console.log("📋 Processing PawaPay payout of UGX", totalAmount, "to", internationalPhone)

      // Map provider string
      const provider = payoutProvider

      // Initiate payout via PawaPay - use net amount
      const payoutResult = await PawaPayService.initiatePayout(netPayoutAmount, "UGX", internationalPhone, provider)

      if (!payoutResult.success) {
        Alert.alert("Payout Failed", payoutResult.error || "Unknown error")
        setWithdrawLoading(false)
        return
      }

      console.log("✅ Payout initiated:", payoutResult.payoutId)

      // Mark tickets as paid + set payout_eligible to false
      for (const tid of selectedTicketIds) {
        try { await SupabaseService.updateTicket(tid, { payoutStatus: "paid", payoutDate: new Date(), payoutEligible: false }) } catch {}
      }

      // Save payout to Supabase payouts table
      try {
        await SupabaseService.savePayout({
          organizer_id: user.id,
          ticket_ids: selectedTicketIds,
          amount: totalAmount,
          status: "Completed",
          processed_date: new Date().toISOString(),
          transaction_reference: payoutResult.payoutId,
          payout_method: "mobile_money",
          recipient_name: user.displayName || user.email || "",
          recipient_phone_number: toInternationalPhone(payoutPhone),
        })
      } catch (err) { console.error("Failed to save payout record:", err) }

      // Update organizer wallet (get-or-create pattern)
      try {
        let wallet = await SupabaseService.getOrganizerWallet(user.id)

        if (!wallet) {
          console.log("No existing wallet for organizer — creating one before applying payout")
          await SupabaseService.createOrUpdateOrganizerWallet(user.id, {
            available_balance: 0,
            pending_balance: 0,
            total_earnings: 0,
            total_payouts: 0,
          })
          wallet = await SupabaseService.getOrganizerWallet(user.id)
        }

        await SupabaseService.createOrUpdateOrganizerWallet(user.id, {
          available_balance: (wallet?.available_balance || 0) - totalAmount,
          total_payouts: (wallet?.total_payouts || 0) + totalAmount,
          last_payout_date: new Date().toISOString(),
        })
      } catch (err) {
        console.error("Failed to update wallet after successful payout:", err)
      }

      setPayoutHistory(prev => [{ date: new Date().toLocaleDateString(), amount: `UGX ${totalAmount.toLocaleString()}`, status: "Completed" }, ...prev])
      setEligiblePayoutTotal(prev => Math.max(0, prev - totalAmount))
      Alert.alert("✅ Payout Submitted!", `UGX ${totalAmount.toLocaleString()} sent to ${toInternationalPhone(payoutPhone)}\nPayout ID: ${payoutResult.payoutId}`)
      setShowWithdrawModal(false)
      resetPayoutState()
      // Reset selections
      const reset: Record<string, number> = {}; Object.keys(payoutTicketTypes).forEach(k => { reset[k] = 0 }); setPayoutSelections(reset)
    } catch (error: any) {
      console.error("Payout error:", error)
      Alert.alert("Error", error?.message || "Failed")
    } finally { setWithdrawLoading(false) }
  }

  // Compute totals (account for table types where count = tables, price = per-person)
  const totalSelected = Object.entries(payoutSelections).reduce((sum, [type, count]) => {
    if (count <= 0) return sum
    const data = payoutTicketTypes[type]
    if (!data) return sum
    const isTableType = data.isTable || false
    // For table types, selected count is in tables, so total units is the same (just tables)
    return sum + count
  }, 0)
  const totalPayoutAmount = Object.entries(payoutSelections).reduce((sum, [type, count]) => {
    if (count <= 0 || !payoutTicketTypes[type]) return sum
    const data = payoutTicketTypes[type]
    const isTableType = data.isTable || false
    const tableSize = data.tableSize || 1
    // For table types: slider count is in tables, price per ticket * tableSize = price per table
    const effectivePrice = isTableType ? (data.price * tableSize) : (data.price || 0)
    return sum + (count * effectivePrice)
  }, 0)
  // Ensure payout amount never exceeds eligible total
  const cappedPayoutAmount = Math.min(totalPayoutAmount, eligiblePayoutTotal)

  if (loading) return <View style={styles.loadingContainer}><Text style={styles.loadingText}>Loading...</Text></View>
  if (!event) return <View style={styles.loadingContainer}><Text style={styles.loadingText}>Event not found</Text></View>

  // ===========================================================================
  // Payout Slider Modal
  // ===========================================================================
  const renderWithdrawModal = () => (
    <Modal visible={showWithdrawModal} transparent animationType="slide" onRequestClose={() => setShowWithdrawModal(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>💰 Withdraw Earnings</Text>
            <TouchableOpacity onPress={() => { setShowWithdrawModal(false); resetPayoutState(); }}>
              <Ionicons name="close-circle" size={28} color="#888" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* Ticket type sliders */}
            {Object.entries(payoutTicketTypes).length === 0 ? (
              <Text style={{ color: "#888", textAlign: "center", padding: 30 }}>No scanned tickets eligible for payout</Text>
            ) : (
              Object.entries(payoutTicketTypes).map(([typeName, data]) => {
                const isTableType = data.isTable || false
                const tableSize = data.tableSize || 1
                // For table types: slider counts in tables (1 = 1 full table)
                const sliderMax = isTableType ? Math.floor(data.total / tableSize) : data.total
                const sliderPrice = isTableType ? data.price * tableSize : data.price
                const currentVal = payoutSelections[typeName] || 0
                const unitLabel = isTableType ? "table" : "ticket"
                return (
                <View key={typeName} style={styles.sliderSection}>
                  <PayoutSlider
                    label={typeName}
                    max={sliderMax}
                    price={sliderPrice}
                    value={Math.min(currentVal, sliderMax)}
                    onChange={(v) => setPayoutSelections(prev => ({ ...prev, [typeName]: v }))}
                    unitLabel={unitLabel}
                  />
                </View>
                )
              })
            )}

            {/* Provider selection */}
            <View style={styles.phoneSection}>
              <Text style={styles.phoneLabel}>📱 Provider</Text>
              <View style={styles.providerRow}>
                <TouchableOpacity
                  style={[styles.providerChip, payoutProvider === "MTN_MOMO_UGA" && styles.providerChipActive]}
                  onPress={() => setPayoutProvider("MTN_MOMO_UGA")}
                >
                  <Text style={[styles.providerChipText, payoutProvider === "MTN_MOMO_UGA" && styles.providerChipTextActive]}>MTN</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.providerChip, payoutProvider === "AIRTEL_OAPI_UGA" && styles.providerChipActive]}
                  onPress={() => setPayoutProvider("AIRTEL_OAPI_UGA")}
                >
                  <Text style={[styles.providerChipText, payoutProvider === "AIRTEL_OAPI_UGA" && styles.providerChipTextActive]}>Airtel</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Mobile money number */}
            <View style={styles.phoneSection}>
              <Text style={styles.phoneLabel}>📱 Mobile Money Number</Text>
              <View style={styles.phoneRow}>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="07XXXXXXXX"
                  placeholderTextColor="#555"
                  value={payoutPhone}
                  onChangeText={(t) => {
                    setPayoutPhone(t)
                    if (otpSent) { setOtpSent(false); setOtpCode(""); setResendCooldown(0) }
                  }}
                  keyboardType="phone-pad"
                />
              </View>
              <Text style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>Confirm Number</Text>
              <View style={styles.phoneRow}>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="07XXXXXXXX"
                  placeholderTextColor="#555"
                  value={payoutPhoneConfirm}
                  onChangeText={(t) => {
                    setPayoutPhoneConfirm(t)
                    if (otpSent) { setOtpSent(false); setOtpCode(""); setResendCooldown(0) }
                  }}
                  keyboardType="phone-pad"
                />
              </View>
              <View style={{ height: 12 }} />
              <TouchableOpacity
                style={[styles.sendOtpBtn, (toInternationalPhone(payoutPhone) !== toInternationalPhone(payoutPhoneConfirm) || otpLoading) && styles.sendOtpBtnDisabled]}
                onPress={handleSendOtp}
                disabled={toInternationalPhone(payoutPhone) !== toInternationalPhone(payoutPhoneConfirm) || otpLoading}
              >
                {otpLoading ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.sendOtpBtnText}>Send OTP</Text>}
              </TouchableOpacity>
              {otpError ? <Text style={styles.otpErrorText}>{otpError}</Text> : null}
              {otpSent && (
                <>
                  <Text style={styles.otpLabel}>Enter Code</Text>
                  <TextInput
                    style={styles.otpInput}
                    placeholder="6-digit code"
                    placeholderTextColor="#555"
                    value={otpCode}
                    onChangeText={setOtpCode}
                    keyboardType="numeric"
                    maxLength={6}
                  />
                </>
              )}
              {resendCooldown > 0 && <Text style={styles.resendText}>Resend available in {resendCooldown}s</Text>}
              <View style={{ height: 20 }} />
            </View>
          </ScrollView>

{/* Summary bar */}
          <View style={styles.summaryBar}>
            <View style={styles.summaryLeft}>
              <Text style={styles.summaryLabel}>Selected</Text>
              <Text style={styles.summaryCount}>{totalSelected} item{totalSelected !== 1 ? "s" : ""}</Text>
            </View>
            <View style={styles.summaryCenter}>
              <Text style={styles.summaryLabel}>Total</Text>
              <Text style={[styles.summaryAmount, totalPayoutAmount > eligiblePayoutTotal && { color: "#FF6B6B" }]}>UGX {cappedPayoutAmount.toLocaleString()}</Text>
            </View>
            <View style={styles.feeRight}>
              <Text style={styles.feeLabel}>Fee</Text>
              <Text style={styles.feeAmount}>- UGX {calculatePayoutFee(totalPayoutAmount, payoutProvider).toLocaleString()}</Text>
              <Text style={styles.netLabel}>You'll receive</Text>
              <Text style={styles.netAmount}>UGX {Math.max(0, totalPayoutAmount - calculatePayoutFee(totalPayoutAmount, payoutProvider)).toLocaleString()}</Text>
            </View>
            <TouchableOpacity
              style={[styles.payoutActionBtn, (totalSelected === 0 || withdrawLoading || totalPayoutAmount > eligiblePayoutTotal || !otpSent) && styles.payoutActionBtnDisabled]}
              onPress={handlePayoutWithOtpCheck}
              disabled={totalSelected === 0 || withdrawLoading || totalPayoutAmount > eligiblePayoutTotal || !otpSent}
            >
              {withdrawLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="send" size={16} color="#FFF" />
                  <Text style={styles.payoutActionText}>Payout</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )

  return (
    <View style={styles.dashboardContainer}>
      <View style={styles.dashboardHeader}>
        <Text style={styles.dashboardTitle}>Organiser Dashboard</Text>
      </View>
      <ScrollView style={styles.dashboardContent}>
        <View style={styles.dashboardTabs}>
          <TouchableOpacity style={[styles.dashboardTab, activeDashboardTab === 'organizer' && styles.dashboardTabActive]} onPress={() => setActiveDashboardTab('organizer')}>
            <Text style={[styles.dashboardTabText, activeDashboardTab === 'organizer' && styles.dashboardTabTextActive]}>Organizer</Text>
          </TouchableOpacity>
          {user?.userType === 'admin' && (
            <TouchableOpacity style={[styles.dashboardTab, activeDashboardTab === 'admin' && styles.dashboardTabActive]} onPress={() => setActiveDashboardTab('admin')}>
              <Text style={[styles.dashboardTabText, activeDashboardTab === 'admin' && styles.dashboardTabTextActive]}>Admin</Text>
            </TouchableOpacity>
          )}
        </View>

        {activeDashboardTab === 'organizer' ? (
          <>
            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>🎫 Ticket Sales</Text>
              <View style={styles.statsRow}>
                <View style={styles.statCard}><Ionicons name="time" size={24} color="#00D4FF" /><Text style={styles.statValue}>{ticketSalesEarly}</Text><Text style={styles.statLabel}>Early</Text></View>
                <View style={styles.statCard}><Ionicons name="alarm" size={24} color="#FF6B6B" /><Text style={styles.statValue}>{ticketSalesLate}</Text><Text style={styles.statLabel}>Late</Text></View>
              </View>
            </View>

            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>📊 Sales by Type</Text>
              <View style={styles.salesTable}>
                <View style={styles.salesTableHeader}>
                  <Text style={[styles.salesTableHeaderText, { flex: 1.5 }]}>Type</Text>
                  <Text style={[styles.salesTableHeaderText, { flex: 1, textAlign: "center" }]}>Early</Text>
                  <Text style={[styles.salesTableHeaderText, { flex: 1, textAlign: "center" }]}>Late</Text>
                  <Text style={[styles.salesTableHeaderText, { flex: 1, textAlign: "center" }]}>Scanned</Text>
                </View>
                {Object.keys(ticketSalesByType).length > 0 ? Object.entries(ticketSalesByType).map(([typeName, s]) => {
                  const feeInfo = getEntryFeeInfo(typeName)
                  const isTableTicket = feeInfo?.isTable === true
                  const tableSize = feeInfo?.tableSize || 1
                  const formatCount = (count: number) => {
                    if (isTableTicket && tableSize > 0) {
                      const tables = Math.floor(count / tableSize)
                      const remaining = count % tableSize
                      let label = `${count}`
                      if (tables > 0) label += ` (${tables} table${tables > 1 ? 's' : ''}`
                      if (remaining > 0) label += ` +${remaining} pax`
                      if (tables > 0) label += `)`
                      return label
                    }
                    return `${count}`
                  }
                  return (
                  <View key={typeName} style={styles.salesTableRow}>
                    <Text style={[styles.salesTableCellText, { flex: 1.5 }]}>{typeName}</Text>
                    <View style={{ flex: 1, alignItems: "center" }}><Text style={styles.salesTableCountText}>{formatCount(s.early.count)}</Text><Text style={styles.salesTableRevenueText}>UGX {s.early.revenue.toLocaleString()}</Text></View>
                    <View style={{ flex: 1, alignItems: "center" }}><Text style={styles.salesTableCountText}>{formatCount(s.late.count)}</Text><Text style={styles.salesTableRevenueText}>UGX {s.late.revenue.toLocaleString()}</Text></View>
                    <View style={{ flex: 1, alignItems: "center" }}><Text style={styles.salesTableCountText}>{formatCount(s.scanned?.count || 0)}</Text><Text style={styles.salesTableRevenueText}>UGX {(s.scanned?.revenue || 0).toLocaleString()}</Text></View>
                  </View>
                  )
                }) : <Text style={styles.noDataText}>No sales yet</Text>}
                {Object.keys(ticketSalesByType).length > 0 && (
                  <View style={styles.salesTableSummary}>
                    <Text style={[styles.salesTableSummaryText, { flex: 1.5 }]}>TOTAL</Text>
                    <View style={{ flex: 1, alignItems: "center" }}><Text style={styles.salesTableSummaryCount}>{Object.values(ticketSalesByType).reduce((s, t) => s + t.early.count, 0)}</Text></View>
                    <View style={{ flex: 1, alignItems: "center" }}><Text style={styles.salesTableSummaryCount}>{Object.values(ticketSalesByType).reduce((s, t) => s + t.late.count, 0)}</Text></View>
                    <View style={{ flex: 1, alignItems: "center" }}><Text style={styles.salesTableSummaryCount}>{Object.values(ticketSalesByType).reduce((s, t) => s + (t.scanned?.count || 0), 0)}</Text></View>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>📷 Ticket Scanner</Text>
              <TouchableOpacity style={styles.scannerButton} onPress={handleScanTicket} disabled={scanning || validating}>
                <Ionicons name="qr-code-outline" size={48} color="#00D4FF" />
                <Text style={styles.scannerButtonTitle}>Scan Tickets</Text>
                <Text style={styles.scannerButtonText}>Tap to scan and validate tickets at event entrances</Text>
                <View style={styles.scannerButtonArrow}>
                  <Ionicons name="chevron-forward" size={24} color="#00D4FF" />
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.dashboardSection}>
              <View style={styles.dashboardRow}>
                <Text style={styles.dashboardSectionTitle}>🔐 Staff Scanner Links</Text>
                <TouchableOpacity onPress={() => setShowTokenModal(true)}>
                  <Ionicons name="add-circle-outline" size={28} color="#00D4FF" />
                </TouchableOpacity>
              </View>
              <View style={styles.dashboardCard}>
                {activeTokens.length > 0 ? (
                  activeTokens.map((token) => (
                    <View key={token.id} style={styles.tokenItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.tokenLabel}>{token.label || "Staff"}</Text>
                        <Text style={styles.tokenExpiry}>Expires: {formatTimeRemaining(token.expires_at)}</Text>
                      </View>
                      <TouchableOpacity onPress={() => copyToClipboard(`https://yovibe.net/scan/${token.token}`)}>
                        <Ionicons name="link-outline" size={20} color="#00D4FF" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleRevokeToken(token.id)}>
                        <Ionicons name="close-circle" size={20} color="#FF6B6B" />
                      </TouchableOpacity>
                    </View>
                  ))
                ) : (
                  <Text style={styles.noDataText}>No staff links generated yet</Text>
                )}
              </View>
            </View>

            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>🔍 Scan Logs</Text>
              <View style={styles.dashboardCard}>
                {scanLogs.length > 0 ? scanLogs.map((log, i) => (
                  <View key={i} style={styles.scanLogItem}>
                    <Text style={styles.scanLogTime}>{log.time}</Text>
                    <Text style={styles.scanLogTicketId}>{log.ticketId}</Text>
                    <Text style={[styles.scanLogStatus, log.status === 'Valid' ? styles.scanLogValid : styles.scanLogInvalid]}>{log.status}</Text>
                  </View>
                )) : <Text style={styles.noDataText}>No scan logs</Text>}
              </View>
            </View>

            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>💸 Withdraw</Text>
              <View style={styles.eligibleCard}>
                <View style={styles.eligibleRow}>
                  <Ionicons name="wallet-outline" size={24} color="#4CAF50" />
                  <View>
                    <Text style={styles.eligibleLabel}>Eligible for Payout</Text>
                    <Text style={styles.eligibleAmount}>UGX {eligiblePayoutTotal.toLocaleString()}</Text>
                  </View>
                </View>
                <Text style={styles.eligibleDesc}>Select tickets by type to cash out</Text>
                <TouchableOpacity style={[styles.withdrawBtn, eligiblePayoutTotal === 0 && { opacity: 0.4 }]} onPress={() => setShowWithdrawModal(true)} disabled={eligiblePayoutTotal === 0}>
                  <Ionicons name="cash-outline" size={20} color="#FFF" />
                  <Text style={styles.withdrawBtnText}>Withdraw Earnings</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>📜 Payout History</Text>
              <View style={styles.dashboardCard}>
                {payoutHistory.length > 0 ? payoutHistory.map((p, i) => (
                  <View key={i} style={styles.payoutItem}>
                    <Text style={styles.payoutDate}>{p.date}</Text>
                    <Text style={styles.payoutAmount}>{p.amount}</Text>
                    <Text style={[styles.payoutStatus, p.status === 'Completed' ? styles.payoutCompleted : styles.payoutPending]}>{p.status}</Text>
                  </View>
                )) : <Text style={styles.noDataText}>No payouts yet</Text>}
              </View>
            </View>

            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>⚙️ Payment Details</Text>
              <View style={styles.dashboardCard}>
                {isEditingPayment ? (
                  <View>
                    <Text style={styles.dashboardLabel}>Mobile Money</Text>
                    <View style={styles.inputContainer}>
                      <TouchableOpacity style={[styles.providerButton, editForm.mobileProvider === 'mtn' && styles.providerButtonActive]} onPress={() => setEditForm({ ...editForm, mobileProvider: 'mtn' })}><Text style={styles.providerButtonText}>MTN</Text></TouchableOpacity>
                      <TouchableOpacity style={[styles.providerButton, editForm.mobileProvider === 'airtel' && styles.providerButtonActive]} onPress={() => setEditForm({ ...editForm, mobileProvider: 'airtel' })}><Text style={styles.providerButtonText}>Airtel</Text></TouchableOpacity>
                    </View>
                    <TextInput style={styles.input} placeholder="Phone Number" value={editForm.mobileNumber} onChangeText={(t) => setEditForm({ ...editForm, mobileNumber: t })} placeholderTextColor="#888" keyboardType="phone-pad" />
                    <TextInput style={styles.input} placeholder="Account Name" value={editForm.mobileName} onChangeText={(t) => setEditForm({ ...editForm, mobileName: t })} placeholderTextColor="#888" />
                    <Text style={[styles.dashboardLabel, { marginTop: 16 }]}>Bank Account</Text>
                    <TextInput style={styles.input} placeholder="Bank Name" value={editForm.bankName} onChangeText={(t) => setEditForm({ ...editForm, bankName: t })} placeholderTextColor="#888" />
                    <TextInput style={styles.input} placeholder="Account Number" value={editForm.bankNumber} onChangeText={(t) => setEditForm({ ...editForm, bankNumber: t })} placeholderTextColor="#888" keyboardType="numeric" />
                    <TextInput style={styles.input} placeholder="Account Name" value={editForm.bankNameAccount} onChangeText={(t) => setEditForm({ ...editForm, bankNameAccount: t })} placeholderTextColor="#888" />
                    <View style={styles.buttonRow}>
                      <TouchableOpacity style={[styles.actionButtonSmall, { backgroundColor: '#666' }]} onPress={() => setIsEditingPayment(false)}><Text style={styles.actionButtonSmallText}>Cancel</Text></TouchableOpacity>
                      <TouchableOpacity style={[styles.actionButtonSmall, { backgroundColor: '#00D4FF' }]} onPress={handleSavePaymentDetails}><Text style={styles.actionButtonSmallText}>Save</Text></TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View>
                    {event?.paymentMethods ? (
                      <View>
                        {event.paymentMethods.mobileMoney?.map((mm, i) => (
                          <View key={i} style={styles.paymentDetailRow}><Text style={styles.paymentDetailText}>{mm.provider.toUpperCase()} - {mm.number}</Text><Text style={styles.paymentDetailSubtext}>{mm.name}</Text></View>
                        ))}
                        {event.paymentMethods.bankAccounts?.map((b, i) => (
                          <View key={i} style={styles.paymentDetailRow}><Text style={styles.paymentDetailText}>{b.bankName} - {b.accountNumber}</Text><Text style={styles.paymentDetailSubtext}>{b.accountName}</Text></View>
                        ))}
                      </View>
                    ) : <Text style={styles.noDataText}>No payment details</Text>}
                    <TouchableOpacity style={styles.editButton} onPress={handleEditPayment}><Text style={styles.editButtonText}>Edit</Text></TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </>
        ) : (
          <View style={styles.dashboardSection}>
            <Text style={styles.dashboardSectionTitle}>Event Creator Payment Details</Text>
            <View style={styles.dashboardCard}>
              {eventCreatorPaymentDetails ? (
                <View>
                  {eventCreatorPaymentDetails.mobileMoney && <><Text style={styles.dashboardLabel}>Mobile Money</Text><Text style={{ color: "#FFF" }}>{eventCreatorPaymentDetails.mobileMoney.provider?.toUpperCase()} - {eventCreatorPaymentDetails.mobileMoney.phoneNumber}</Text></>}
                  {eventCreatorPaymentDetails.bankAccount && <><Text style={[styles.dashboardLabel, { marginTop: 8 }]}>Bank</Text><Text style={{ color: "#FFF" }}>{eventCreatorPaymentDetails.bankAccount.bankName} - {eventCreatorPaymentDetails.bankAccount.accountNumber}</Text></>}
                </View>
              ) : <Text style={styles.noDataText}>No details</Text>}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Photo Verification Modal */}
      <Modal visible={showPhotoVerification} transparent animationType="fade" onRequestClose={() => setShowPhotoVerification(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Photo Verification</Text>
            <Text style={styles.modalSub}>Does this person match the photo?</Text>
            <View style={styles.photoWrap}>
              {buyerPhotoUrl ? <Image source={{ uri: buyerPhotoUrl }} style={styles.photo} resizeMode="cover" /> : <View style={styles.photoPlace}><Ionicons name="person" size={60} color="#666" /></View>}
              <Text style={styles.nameText}>{buyerName}</Text>
            </View>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.denyBtn} onPress={() => handlePhotoConfirm(false)}><Ionicons name="close-circle" size={24} color="#FFF" /><Text style={styles.btnText}>No</Text></TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={() => handlePhotoConfirm(true)}><Ionicons name="checkmark-circle" size={24} color="#FFF" /><Text style={styles.btnText}>Yes</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Withdraw Modal */}
      {renderWithdrawModal()}

      {/* Staff Token Modal */}
      <Modal visible={showTokenModal} transparent animationType="slide" onRequestClose={() => setShowTokenModal(false)}>
        <View style={styles.tokenModalOverlay}>
          <View style={styles.tokenModalContainer}>
            <View style={styles.tokenModalHeader}>
              <Text style={styles.tokenModalTitle}>🔐 Generate Staff Link</Text>
              <TouchableOpacity onPress={() => setShowTokenModal(false)}>
                <Ionicons name="close-circle" size={28} color="#888" />
              </TouchableOpacity>
            </View>
            <View style={styles.tokenModalBody}>
              <Text style={styles.staffInputLabel}>Label (optional)</Text>
              <TextInput
                style={styles.staffInput}
                placeholder="e.g. Main Entrance Scanner"
                placeholderTextColor="#888"
                value={newTokenLabel}
                onChangeText={setNewTokenLabel}
              />
              <Text style={styles.staffHelperText}>Maximum 15 active links per event. Links expire in 24 hours.</Text>
              <TouchableOpacity
                style={[styles.staffGenerateBtn, tokenLoading && styles.staffGenerateBtnDisabled]}
                onPress={handleGenerateToken}
                disabled={tokenLoading}
              >
                {tokenLoading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.staffGenerateBtnText}>Generate Link</Text>
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
  dashboardContainer: { flex: 1, backgroundColor: "#000000" },
  dashboardHeader: { flexDirection: "row", alignItems: "center", padding: 16, paddingTop: 48 },
  dashboardTitle: { color: "#FFF", fontSize: 24, fontWeight: "bold" },
  dashboardContent: { flex: 1, paddingBottom: 80 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" },
  loadingText: { color: "#FFF", fontSize: 16, marginTop: 12 },
  dashboardTabs: { flexDirection: "row", margin: 16 },
  dashboardTab: { flex: 1, paddingVertical: 10, marginHorizontal: 4, borderRadius: 8, backgroundColor: "#2a2a2a", alignItems: "center" },
  dashboardTabActive: { backgroundColor: "#00D4FF" },
  dashboardTabText: { color: "#888", fontSize: 14, fontWeight: "600" },
  dashboardTabTextActive: { color: "#FFF" },
  dashboardSection: { marginBottom: 16, marginHorizontal: 16 },
  dashboardSectionTitle: { color: "#FFF", fontSize: 18, fontWeight: "bold", marginBottom: 12 },
  dashboardCard: { backgroundColor: "#1a1a1a", borderRadius: 12, padding: 16 },
  dashboardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dashboardLabel: { color: "#888", fontSize: 14, marginBottom: 8 },
  statsRow: { flexDirection: "row", gap: 12 },
  statCard: { flex: 1, backgroundColor: "#1a1a1a", padding: 16, borderRadius: 12, alignItems: "center" },
  statValue: { color: "#FFF", fontSize: 32, fontWeight: "bold", marginTop: 8 },
  statLabel: { color: "#888", fontSize: 12, marginTop: 4 },
  salesTable: { backgroundColor: "#1a1a1a", borderRadius: 12, padding: 12 },
  salesTableHeader: { flexDirection: "row", paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#333" },
  salesTableHeaderText: { color: "#888", fontSize: 12, fontWeight: "bold", textTransform: "uppercase" },
  salesTableRow: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#2a2a2a" },
  salesTableCellText: { color: "#FFF", fontSize: 13 },
  salesTableCountText: { color: "#FFF", fontSize: 14, fontWeight: "bold" },
  salesTableRevenueText: { color: "#00D4FF", fontSize: 11, marginTop: 2 },
  salesTableSummary: { flexDirection: "row", paddingTop: 12, borderTopWidth: 2, borderTopColor: "#00D4FF" },
  salesTableSummaryText: { color: "#00D4FF", fontSize: 13, fontWeight: "bold" },
  salesTableSummaryCount: { color: "#00D4FF", fontSize: 14, fontWeight: "bold" },
  noDataText: { color: "#888", fontSize: 14, textAlign: "center", paddingVertical: 20 },
  scanLogItem: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#2a2a2a" },
  scanLogTime: { color: "#888", fontSize: 12, flex: 1 },
  scanLogTicketId: { color: "#FFF", fontSize: 12, flex: 1, fontFamily: "monospace" },
  scanLogStatus: { fontSize: 12, fontWeight: "bold", width: 60, textAlign: "right" },
  scanLogValid: { color: "#4CAF50" }, scanLogInvalid: { color: "#FF6B6B" },
  eligibleCard: { backgroundColor: "#1a1a1a", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "rgba(0,212,255,0.2)" },
  eligibleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  eligibleLabel: { color: "#888", fontSize: 13 },
  eligibleAmount: { color: "#4CAF50", fontSize: 22, fontWeight: "bold" },
  eligibleDesc: { color: "#666", fontSize: 12, marginBottom: 16 },
  withdrawBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#2196F3", paddingVertical: 14, borderRadius: 8, gap: 8 },
  withdrawBtnText: { color: "#FFF", fontSize: 16, fontWeight: "bold" },
  payoutItem: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#2a2a2a" },
  payoutDate: { color: "#888", fontSize: 12, flex: 1 },
  payoutAmount: { color: "#FFF", fontSize: 14, fontWeight: "bold", flex: 1, textAlign: "center" },
  payoutStatus: { fontSize: 12, fontWeight: "bold", width: 80, textAlign: "right" },
  payoutCompleted: { color: "#4CAF50" }, payoutPending: { color: "#FF9800" },
  inputContainer: { flexDirection: "row", gap: 10, marginBottom: 12 },
  providerButton: { flex: 1, padding: 12, alignItems: "center", backgroundColor: "#333", borderRadius: 8, borderWidth: 1, borderColor: "transparent" },
  providerButtonActive: { backgroundColor: "#2196F3", borderColor: "#2196F3" },
  providerButtonText: { color: "#FFF", fontWeight: "600" },
  input: { backgroundColor: "#333", color: "#FFF", padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 14 },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  actionButtonSmall: { flex: 1, padding: 12, borderRadius: 8, alignItems: "center" },
  actionButtonSmallText: { color: "#FFF", fontWeight: "600" },
  scannerButton: { backgroundColor: "#1a1a1a", borderRadius: 12, padding: 24, alignItems: "center", borderWidth: 2, borderColor: "#00D4FF", borderStyle: "dashed" },
  scannerButtonTitle: { color: "#00D4FF", fontSize: 18, fontWeight: "bold", marginTop: 12 },
  scannerButtonText: { color: "#888", fontSize: 14, marginTop: 4 },
  scannerButtonArrow: { position: "absolute", right: 16, top: "50%", marginTop: -12 },
  paymentDetailRow: { marginBottom: 4 },
  paymentDetailText: { color: "#FFF", fontSize: 14 },
  paymentDetailSubtext: { color: "#888", fontSize: 12, marginTop: 2 },
  editButton: { marginTop: 12, padding: 10, backgroundColor: "#2a2a2a", borderRadius: 8, alignItems: "center" },
  editButtonText: { color: "#00D4FF", fontSize: 14, fontWeight: "600" },

  // -- Withdraw Modal --
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  modalContainer: { backgroundColor: "#111", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: 800 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: "#FFF", fontSize: 20, fontWeight: "bold" },
  modalBody: { maxHeight: 750 },
  sliderSection: { marginBottom: 0 },
  phoneSection: { marginTop: 4, marginBottom: 80 },
  phoneLabel: { color: "#FFF", fontSize: 15, fontWeight: "600", marginBottom: 8 },
  phoneRow: { marginBottom: 8 },
  phoneInput: { backgroundColor: "#1a1a1a", color: "#FFF", padding: 14, borderRadius: 10, fontSize: 16, borderWidth: 1, borderColor: "#333" },
  providerRow: { flexDirection: "row", gap: 12 },
  providerChip: { flex: 1, padding: 12, alignItems: "center", backgroundColor: "#1a1a1a", borderRadius: 10, borderWidth: 1, borderColor: "#333" },
  providerChipActive: { borderColor: "#00D4FF", backgroundColor: "rgba(0,212,255,0.1)" },
  providerChipText: { color: "#888", fontWeight: "600" },
  providerChipTextActive: { color: "#00D4FF" },
  summaryBar: { flexDirection: "row", alignItems: "center", paddingTop: 12, borderTopWidth: 1, borderTopColor: "#222", position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#111", padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  summaryLeft: { flex: 1 },
  summaryCenter: { flex: 1, alignItems: "center" },
  summaryLabel: { color: "#666", fontSize: 11 },
  summaryCount: { color: "#FFF", fontSize: 16, fontWeight: "bold" },
  summaryAmount: { color: "#4CAF50", fontSize: 16, fontWeight: "bold" },
  feeRight: { flex: 1, alignItems: "flex-end", marginRight: 12 },
  feeLabel: { color: "#888", fontSize: 10 },
  feeAmount: { color: "#FF6B6B", fontSize: 12, fontWeight: "bold" },
  netLabel: { color: "#888", fontSize: 10, marginTop: 2 },
  netAmount: { color: "#4CAF50", fontSize: 12, fontWeight: "bold" },
  payoutActionBtn: { backgroundColor: "#2196F3", flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, gap: 6 },
  payoutActionBtnDisabled: { backgroundColor: "#444" },
  payoutActionText: { color: "#FFF", fontWeight: "bold", fontSize: 14 },
  sendOtpBtn: { backgroundColor: "#00D4FF", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, alignItems: "center", marginTop: 8 },
  sendOtpBtnDisabled: { backgroundColor: "#666" },
  sendOtpBtnText: { color: "#000", fontWeight: "bold", fontSize: 14 },
  otpErrorText: { color: "#FF6B6B", fontSize: 12, marginTop: 8, textAlign: "center" },
  otpLabel: { color: "#FFF", fontSize: 14, fontWeight: "600", marginTop: 16, marginBottom: 8 },
  otpInput: { backgroundColor: "#1a1a1a", color: "#FFF", padding: 14, borderRadius: 10, fontSize: 16, textAlign: "center", letterSpacing: 8, width: 200 },
  resendText: { color: "#888", fontSize: 12, marginTop: 8, textAlign: "center" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalBox: { backgroundColor: "#1a1a1a", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, alignItems: "center" },
  modalSub: { color: "#888", fontSize: 14, textAlign: "center", marginBottom: 20 },
  photoWrap: { alignItems: "center", marginBottom: 20 },
  photo: { width: 180, height: 180, borderRadius: 90, borderWidth: 3, borderColor: "#00D4FF", marginBottom: 12 },
  photoPlace: { width: 180, height: 180, borderRadius: 90, backgroundColor: "#333", alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#666", marginBottom: 12 },
  nameText: { color: "#FFF", fontSize: 18, fontWeight: "bold", marginBottom: 4 },
  btnRow: { flexDirection: "row", gap: 16, marginBottom: 16 },
  denyBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#FF4444", paddingVertical: 14, borderRadius: 8 },
  confirmBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#4CAF50", paddingVertical: 14, borderRadius: 8 },
  btnText: { color: "#FFF", fontSize: 16, fontWeight: "bold", marginLeft: 8 },

  // -- Staff Token --
  tokenItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#2a2a2a" },
  tokenLabel: { color: "#FFF", fontSize: 15, fontWeight: "500" },
  tokenExpiry: { color: "#888", fontSize: 12, marginTop: 2 },
  tokenModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  tokenModalContainer: { backgroundColor: "#111", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: 800 },
  tokenModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  tokenModalTitle: { color: "#FFF", fontSize: 20, fontWeight: "bold" },
  tokenModalBody: { maxHeight: 750, paddingHorizontal: 0 },
  staffInputLabel: { color: "#FFF", fontSize: 14, fontWeight: "600", marginBottom: 8 },
  staffInput: { backgroundColor: "#1a1a1a", color: "#FFF", padding: 14, borderRadius: 10, fontSize: 16, borderWidth: 1, borderColor: "#333", marginBottom: 16 },
  staffHelperText: { color: "#666", fontSize: 12, textAlign: "center", marginBottom: 16 },
  staffGenerateBtn: { backgroundColor: "#00D4FF", paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  staffGenerateBtnDisabled: { backgroundColor: "#666" },
  staffGenerateBtnText: { color: "#000", fontWeight: "bold", fontSize: 16 },
})

export default OrganiserDashboardScreen