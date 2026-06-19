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
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useCompatNavigation } from "../utils/compatNavigation"
import { useRouter } from "../utils/URLRouter"

import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { supabase } from "../config/supabase"
import SupabaseService from "../services/SupabaseService"
import TicketService from "../services/TicketService"
import PesaPalService from "../services/PesaPalService"
import { useAuth } from "../contexts/AuthContext"
import type { Event } from "../models/Event"
import type {
  VenuesStackParamList,
  EventsStackParamList,
  MapStackParamList,
  CalendarStackParamList,
  ProfileStackParamList
} from "../navigation/types"

// Responsive setup for OrganiserDashboardScreen
const { width: screenWidth } = Dimensions.get('window');
const isSmallDevice = screenWidth < 380;
const isTablet = screenWidth >= 768;
const isLargeScreen = screenWidth >= 1024;

const responsiveSize = (small: number, medium: number, large: number) => {
  if (isLargeScreen) return large;
  if (isTablet) return medium;
  return small;
};

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

  // Extract eventId from current path: /events/organiser/:eventId
  const pathParts = currentPath.split('/').filter(Boolean)
  const eventId = pathParts[2] // events/organiser/:eventId, so [events, organiser, eventId]
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
  const [revenueAnalytics, setRevenueAnalytics] = useState<Array<{ label: string; value: number }>>([])
  const [eligiblePayoutTotal, setEligiblePayoutTotal] = useState(0)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [withdrawLoading, setWithdrawLoading] = useState(false)
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
  
  // Photo verification state
  const [showPhotoVerification, setShowPhotoVerification] = useState(false)
  const [pendingTicketDocId, setPendingTicketDocId] = useState<string | null>(null)
  const [buyerPhotoUrl, setBuyerPhotoUrl] = useState<string>("")
  const [buyerName, setBuyerName] = useState<string>("")
  
  const [eventCreatorPaymentDetails, setEventCreatorPaymentDetails] = useState<{
    mobileMoney?: { provider: string; phoneNumber: string; accountName: string }
    bankAccount?: { bankName: string; accountNumber: string; accountName: string }
  } | null>(null)

  type TicketSalesByType = {
    [entryFeeName: string]: {
      early: { count: number; revenue: number }
      late: { count: number; revenue: number }
      scanned: { count: number; revenue: number }
    }
  }

  /**
   * Convert a snake_case database row to camelCase for processing
   */
  const rowToTicket = (row: any): any => {
    if (!row) return row
    return {
      id: row.id,
      eventId: row.event_id || row.eventId,
      eventName: row.event_name || row.eventName,
      entryFeeType: row.entry_fee_type || row.entryFeeType || "Standard",
      ticketType: row.ticket_type || row.ticketType || "Standard",
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

  /**
   * Process an array of ticket rows into sales stats
   */
  const processTicketData = useCallback((tickets: any[]) => {
    let earlyCount = 0
    let lateCount = 0
    let totalRevenue = 0
    let eligibleTotal = 0
    const salesByType: TicketSalesByType = {}

    if (event?.entryFees) {
      event.entryFees.forEach((fee: { name: string; amount: string }) => {
        salesByType[fee.name] = {
          early: { count: 0, revenue: 0 },
          late: { count: 0, revenue: 0 },
          scanned: { count: 0, revenue: 0 },
        }
      })
    }

    tickets.forEach((ticket) => {
      const t = rowToTicket(ticket)
      const ticketType = t.entryFeeType || t.ticketType || "Standard"
      const amount = t.totalAmount || 0
      const isLate = t.isLatePurchase
      const isScanned = t.isScanned || t.status === "used"
      const isEligible = t.payoutEligible === true && t.payoutStatus === "pending"

      if (isLate) lateCount++
      else earlyCount++
      totalRevenue += amount

      if (isEligible) {
        eligibleTotal += t.venueRevenue || 0
      }

      if (!salesByType[ticketType]) {
        salesByType[ticketType] = {
          early: { count: 0, revenue: 0 },
          late: { count: 0, revenue: 0 },
          scanned: { count: 0, revenue: 0 },
        }
      }

      if (isLate) {
        salesByType[ticketType].late.count++
        salesByType[ticketType].late.revenue += amount
      } else {
        salesByType[ticketType].early.count++
        salesByType[ticketType].early.revenue += amount
      }

      if (isScanned) {
        if (!salesByType[ticketType].scanned) {
          salesByType[ticketType].scanned = { count: 0, revenue: 0 }
        }
        salesByType[ticketType].scanned.count++
        salesByType[ticketType].scanned.revenue += amount
      }
    })

    setTicketSalesEarly(earlyCount)
    setTicketSalesLate(lateCount)
    setWalletBalance(`UGX ${totalRevenue.toLocaleString()}`)
    setEligiblePayoutTotal(eligibleTotal)
    setTicketSalesByType(salesByType)
  }, [event])

  /**
   * Fetch all tickets for this event from Supabase and process them
   */
  const fetchTicketData = useCallback(async () => {
    if (!eventId) return
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("event_slug", eventId)

      if (error) throw error
      const rows = data || []

      // Sort by purchase date (newest first)
      rows.sort((a, b) => {
        const dateA = a.purchase_date || a.created_at || ""
        const dateB = b.purchase_date || b.created_at || ""
        return dateB.localeCompare(dateA)
      })

      processTicketData(rows)
    } catch (error) {
      console.error("OrganiserDashboardScreen: Error fetching tickets:", error)
    }
  }, [eventId, processTicketData])

  /**
   * Fetch scan/validation logs from Supabase
   */
  const fetchScanLogs = useCallback(async () => {
    if (!eventId) return
    try {
      const { data, error } = await supabase
        .from("ticket_validations")
        .select("*")
        .eq("event_slug", eventId)
        .order("validatedAt", { ascending: false, nullsFirst: false })
        .limit(10)

      if (error) throw error

      const logs = (data || []).map((v: any) => ({
        time: v.validatedAt ? new Date(v.validatedAt).toLocaleTimeString() : "",
        ticketId: v.ticketId ? v.ticketId.substring(0, 8) + "..." : "Unknown",
        status: v.status === "granted" ? "Valid" : "Invalid",
      }))

      setScanLogs(logs)
    } catch (error) {
      console.error("OrganiserDashboardScreen: Error fetching scan logs:", error)
    }
  }, [eventId])

  useEffect(() => {
    const loadEvent = async () => {
      try {
        const eventData = await SupabaseService.getEventById(eventId)
        setEvent(eventData)
      } catch (error) {
        console.error("Error loading event details in organiser dashboard:", error)
      } finally {
        setLoading(false)
      }
    }

    loadEvent()
  }, [eventId])

  // Load scan/validation logs
  useEffect(() => {
    fetchScanLogs()
  }, [fetchScanLogs])

  useEffect(() => {
    const loadRelatedPaymentDetails = async () => {
      await loadPaymentDetails()

      if (user?.userType === 'admin' && event?.createdBy) {
        const paymentDetails = await loadEventCreatorPaymentDetails(event.createdBy)
        setEventCreatorPaymentDetails(paymentDetails)
      }
    }

    loadRelatedPaymentDetails()
  }, [user, event])

  // Supabase realtime subscription for tickets
  useEffect(() => {
    if (!eventId) return

    // Initial fetch
    fetchTicketData()

    // Subscribe to realtime changes on tickets table for this event
    const ticketChannel = supabase
      .channel(`tickets-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `event_slug=eq.${eventId}`,
        },
        () => {
          // Refetch tickets on any change
          fetchTicketData()
        }
      )
      .subscribe()

    // Subscribe to realtime changes on ticket_validations table for this event
    const validationChannel = supabase
      .channel(`validations-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_validations',
          filter: `event_slug=eq.${eventId}`,
        },
        () => {
          // Refetch scan logs on any change
          fetchScanLogs()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ticketChannel)
      supabase.removeChannel(validationChannel)
    }
  }, [eventId, fetchTicketData, fetchScanLogs])

  const handleScanTicket = async () => {
    try {
      navigation.navigate("TicketScanner", {
        eventId,
        eventName: event?.name || "Event",
      })
    } catch (error) {
      console.error("Error navigating to TicketScanner:", error)
      Alert.alert("Error", "Failed to open scanner")
    }
  }

  const handleScannerSubmit = async () => {
    if (!scannerInput.trim()) return
    const ticketId = scannerInput.trim()
    setShowScannerModal(false)
    await handleValidateTicket(ticketId)
    setScannerInput("")
  }

  const handleValidateTicket = async (ticketId: string) => {
    if (!user) {
      Alert.alert("Error", "Please sign in to validate tickets")
      return
    }

    try {
      setValidating(true)
      Alert.alert(
        "Ticket Validation",
        "Click Validate to verify this ticket.",
        [
          { text: "Cancel", style: "cancel", onPress: () => undefined },
          {
            text: "Validate",
            onPress: async () => {
              try {
                const result = await TicketService.validateTicket(ticketId, user.id, "Event Entrance")

                if (result.success) {
                  // Check if this ticket needs photo verification
                  if (result.needsPhotoVerification && result.buyerPhotoUrl && result.ticketDocId) {
                    console.log("📸 Ticket requires photo verification in OrganiserDashboard")
                    setPendingTicketDocId(result.ticketDocId)
                    setBuyerPhotoUrl(result.buyerPhotoUrl)
                    setBuyerName(result.buyerName || "Ticket Buyer")
                    setShowPhotoVerification(true)
                    setValidating(false)
                    return
                  }
                  
                  // For tickets without photo, grant entry immediately
                  Alert.alert("✅ Entry Granted", "Ticket validated successfully. Entry granted.", [{ text: "OK" }])
                  
                  // Refresh scan logs
                  fetchScanLogs()
                  fetchTicketData()
                } else {
                  Alert.alert("❌ Entry Denied", `Validation failed: ${result.reason}`, [{ text: "OK" }])
                  
                  // Refresh scan logs
                  fetchScanLogs()
                  fetchTicketData()
                }
              } catch (error) {
                console.error("Error during validation:", error)
                Alert.alert("Error", "Failed to validate ticket")
              }
            },
          },
        ],
      )
    } catch (error) {
      console.error("Error validating ticket:", error)
      Alert.alert("Error", "Failed to validate ticket")
    } finally {
      setValidating(false)
    }
  }

  // Handle photo verification confirmation in OrganiserDashboard
  const handlePhotoConfirm = async (confirmed: boolean) => {
    if (!user || !pendingTicketDocId) {
      setShowPhotoVerification(false)
      return
    }

    setShowPhotoVerification(false)
    setValidating(true)

    try {
      if (confirmed) {
        console.log("📸 Photo verified - confirming ticket usage in OrganiserDashboard")
        
        const result = await TicketService.confirmTicketUsage(
          pendingTicketDocId,
          user.id,
          "Event Entrance",
          eventId
        )

        if (result.success) {
          Alert.alert(
            "✅ Entry Granted",
            `Photo verified! Ticket confirmed for ${buyerName}. Entry granted.`,
            [{ text: "OK" }]
          )
          
          // Refresh data
          fetchScanLogs()
          fetchTicketData()
        } else {
          Alert.alert(
            "❌ Entry Denied",
            `Failed to confirm ticket: ${result.reason}`,
            [{ text: "OK" }]
          )
        }
      } else {
        // Photo verification denied
        console.log("📸 Photo verification denied - entry denied")
        
        const newLog = {
          time: new Date().toLocaleTimeString(),
          ticketId: pendingTicketDocId.substring(0, 8) + "...",
          status: "Invalid",
        }
        setScanLogs((prev) => [newLog, ...prev].slice(0, 10))

        Alert.alert(
          "❌ Entry Denied",
          "The person presenting the ticket does not match the photo on file.",
          [{ text: "OK" }]
        )
      }
    } catch (error) {
      console.error("Photo verification error:", error)
      Alert.alert("Error", "Failed to process photo verification")
    } finally {
      setPendingTicketDocId(null)
      setBuyerPhotoUrl("")
      setBuyerName("")
    }
  }

  const handleSavePaymentDetails = async () => {
    if (!event) return
    try {
      const mobileMoney: Array<{ provider: "mtn" | "airtel"; number: string; name: string }> = []
      if (editForm.mobileNumber && editForm.mobileName) {
        mobileMoney.push({
          provider: editForm.mobileProvider === "airtel" ? "airtel" : "mtn",
          number: editForm.mobileNumber,
          name: editForm.mobileName,
        })
      }

      const bankAccounts: Array<{ bankName: string; accountNumber: string; accountName: string }> = []
      if (editForm.bankName && editForm.bankNumber && editForm.bankNameAccount) {
        bankAccounts.push({
          bankName: editForm.bankName,
          accountNumber: editForm.bankNumber,
          accountName: editForm.bankNameAccount,
        })
      }

      const paymentMethods = { mobileMoney, bankAccounts }
      await SupabaseService.updateEvent(event.id, { paymentMethods })
      setEvent({ ...event, paymentMethods })
      setIsEditingPayment(false)
      Alert.alert("Success", "Payment details updated successfully")
    } catch (error) {
      console.error("Error saving payment details:", error)
      Alert.alert("Error", "Failed to save payment details")
    }
  }

  const handleEditPayment = () => {
    if (event?.paymentMethods) {
      const mm = event.paymentMethods.mobileMoney?.[0]
      const bank = event.paymentMethods.bankAccounts?.[0]
      setEditForm({
        mobileProvider: mm?.provider || "mtn",
        mobileNumber: mm?.number || "",
        mobileName: mm?.name || "",
        bankName: bank?.bankName || "",
        bankNumber: bank?.accountNumber || "",
        bankNameAccount: bank?.accountName || "",
      })
    }
    setIsEditingPayment(true)
  }

  const loadPaymentDetails = async () => {
    if (!user) return
    try {
      const userData = await SupabaseService.getUserProfileOrNull(user.uid)
      if (userData?.paymentDetails) {
        setOrganizerPaymentDetails(userData.paymentDetails)
      }
    } catch (error) {
      console.error("Error loading payment details:", error)
    }
  }

  const loadEventCreatorPaymentDetails = async (creatorId: string) => {
    try {
      const userData = await SupabaseService.getUserProfileOrNull(creatorId)
      return userData?.paymentDetails || null
    } catch (error) {
      console.error("Error loading organizer payment details:", error)
      return null
    }
  }

  const handleWithdraw = async () => {
    console.log("🔍 handleWithdraw called - starting withdrawal process")
    console.log("   - user:", user)
    console.log("   - user.id:", user?.id)
    console.log("   - user.uid:", user?.uid)
    console.log("   - withdrawAmount:", withdrawAmount)
    console.log("   - eligiblePayoutTotal:", eligiblePayoutTotal)
    
    try {
      // Add a small delay to ensure state is set
      await new Promise(resolve => setTimeout(resolve, 100))
      
      if (!user) {
        Alert.alert("Error", "You must be logged in to withdraw")
        console.log("   - ERROR: User is null")
        return
      }
      
      if (!withdrawAmount || parseInt(withdrawAmount) <= 0) {
        Alert.alert("Error", "Please enter a valid amount")
        console.log("   - ERROR: Invalid withdraw amount")
        return
      }

      const amount = parseInt(withdrawAmount)
      if (amount > eligiblePayoutTotal) {
        Alert.alert("Error", "Amount exceeds eligible balance")
        return
      }

      console.log("   - Validation passed, starting payout process...")
      setWithdrawLoading(true)
      
      console.log("📋 Processing withdrawal of UGX", amount)
      console.log("   - Eligible balance:", eligiblePayoutTotal, "UGX")

      // Fetch eligible tickets for this specific event to update their payout status after successful payout
      console.log("📋 Fetching eligible tickets for payout update...")
      console.log("   - Event ID:", eventId)
      const eligibleTickets = await SupabaseService.getEligibleTicketsForEvent(eventId)
      console.log("   - Found eligible tickets:", eligibleTickets.length)
      
      if (eligibleTickets.length === 0) {
        Alert.alert("Error", "No eligible tickets found for payout")
        setWithdrawLoading(false)
        return
      }

      // Get user and event payment details
      const userData = await SupabaseService.getUserProfileOrNull(user.uid)
      const userPaymentDetails = userData?.paymentDetails
      const eventData = await SupabaseService.getEventById(eventId)
      const eventPaymentMethods = eventData?.paymentMethods

      const hasMobileMoney = userPaymentDetails?.mobileMoney?.phoneNumber
      const hasBankAccount = userPaymentDetails?.bankAccount?.bankName && userPaymentDetails?.bankAccount?.accountNumber
      const hasEventMobileMoney = eventPaymentMethods?.mobileMoney && eventPaymentMethods.mobileMoney.length > 0
      const hasEventBankAccount = eventPaymentMethods?.bankAccounts && eventPaymentMethods.bankAccounts.length > 0

      if (!hasMobileMoney && !hasBankAccount && !hasEventMobileMoney && !hasEventBankAccount) {
        Alert.alert(
          "No Payment Details",
          "Please configure your payment details to receive payouts.\n\nGo to Profile > Payment Details to add mobile money or bank account.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Configure", onPress: () => { setShowWithdrawModal(false); navigation.goBack() } },
          ],
        )
        setWithdrawLoading(false)
        return
      }

      let payoutMethod: "mobile_money" | "bank_transfer"
      let recipientDetails: { name: string; phoneNumber?: string; accountNumber?: string; bankName?: string }

      if (hasMobileMoney && userPaymentDetails?.mobileMoney) {
        payoutMethod = "mobile_money"
        recipientDetails = {
          name: userPaymentDetails.mobileMoney.accountName,
          phoneNumber: userPaymentDetails.mobileMoney.phoneNumber,
        }
      } else if (hasBankAccount && userPaymentDetails?.bankAccount) {
        payoutMethod = "bank_transfer"
        recipientDetails = {
          name: userPaymentDetails.bankAccount.accountName,
          accountNumber: userPaymentDetails.bankAccount.accountNumber,
          bankName: userPaymentDetails.bankAccount.bankName,
        }
      } else if (hasEventMobileMoney && eventPaymentMethods?.mobileMoney && eventPaymentMethods.mobileMoney.length > 0) {
        payoutMethod = "mobile_money"
        const mobile = eventPaymentMethods.mobileMoney[0]
        recipientDetails = {
          name: mobile.name,
          phoneNumber: mobile.number,
        }
      } else if (hasEventBankAccount && eventPaymentMethods?.bankAccounts && eventPaymentMethods.bankAccounts.length > 0) {
        payoutMethod = "bank_transfer"
        const bank = eventPaymentMethods.bankAccounts[0]
        recipientDetails = {
          name: bank.accountName,
          accountNumber: bank.accountNumber,
          bankName: bank.bankName,
        }
      } else {
        Alert.alert("Error", "Unable to determine payment method")
        setWithdrawLoading(false)
        return
      }

      console.log("📋 Initiating PesaPal payout...")
      console.log("   - Method:", payoutMethod)
      console.log("   - Recipient:", recipientDetails.name)
      
      const payoutResult = await PesaPalService.processPayout(
        user.id,
        amount,
        payoutMethod,
        recipientDetails,
      )

      if (!payoutResult.success) {
        Alert.alert("Error", payoutResult.error || "Failed to process payout")
        setWithdrawLoading(false)
        return
      }

      console.log("✅ Payout processed successfully")
      console.log("   - Payout ID:", payoutResult.payoutId)
      console.log("   - Transaction Ref:", payoutResult.transactionReference)

      // Sort tickets by date (oldest first) and select enough to cover the withdrawal amount
      const sortedTickets = [...eligibleTickets].sort((a, b) => 
        (a.purchaseDate?.getTime() || 0) - (b.purchaseDate?.getTime() || 0)
      )
      
      let remainingAmount = amount
      const ticketsToPayout: typeof eligibleTickets = []
      
      for (const ticket of sortedTickets) {
        if (remainingAmount <= 0) break
        ticketsToPayout.push(ticket)
        remainingAmount -= (ticket.venueRevenue || 0)
      }

      console.log("📋 Updating payout status for selected tickets...")
      console.log("   - Selected tickets:", ticketsToPayout.length)
      
      // Update payout status for selected tickets
      let totalUpdated = 0
      for (const ticket of ticketsToPayout) {
        try {
          console.log("   - Updating ticket:", ticket.id)
          await SupabaseService.updateTicket(ticket.id, {
            payoutStatus: "paid",
            payoutDate: new Date(),
          })
          totalUpdated++
          console.log("   - Successfully updated:", ticket.id)
        } catch (updateError: any) {
          console.error("Error updating ticket payout status:", ticket.id, updateError?.message || updateError)
          // Continue with other tickets even if one fails
        }
      }
      
      console.log(`✅ Updated ${totalUpdated} tickets with payout status: paid`)

      const payoutRecord = {
        date: new Date().toLocaleDateString(),
        amount: `UGX ${amount.toLocaleString()}`,
        status: "Completed",
      }
      setPayoutHistory((prev) => [payoutRecord, ...prev])
      setEligiblePayoutTotal((prev) => prev - amount)
      Alert.alert(
        "✅ Payout Successful!",
        `Your payout of UGX ${amount.toLocaleString()} has been processed.\n\n` +
          `Payout ID: ${payoutResult.payoutId}\n` +
          `Transaction Ref: ${payoutResult.transactionReference}\n\n` +
          `The funds have been sent to your ${payoutMethod === 'mobile_money' ? 'mobile money account' : 'bank account'}. Please allow 1-2 business days for the funds to reflect.`,
        [{ text: "OK" }],
      )
      setShowWithdrawModal(false)
      setWithdrawAmount("")
    } catch (error: any) {
      console.error("Payout error:", error)
      Alert.alert("Error", error?.message || "Failed to process payout")
    } finally {
      setWithdrawLoading(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading organiser dashboard...</Text>
      </View>
    )
  }

  if (!event) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Event not found</Text>
      </View>
    )
  }

  return (
    <View style={styles.dashboardContainer}>
      <View style={styles.dashboardHeader}>
        <Text style={styles.dashboardTitle}>Organiser Dashboard</Text>
      </View>
      <ScrollView style={styles.dashboardContent}>
        <View style={styles.dashboardTabs}>
          <TouchableOpacity
            style={[styles.dashboardTab, activeDashboardTab === 'organizer' && styles.dashboardTabActive]}
            onPress={() => setActiveDashboardTab('organizer')}
          >
            <Text style={[styles.dashboardTabText, activeDashboardTab === 'organizer' && styles.dashboardTabTextActive]}>Organizer</Text>
          </TouchableOpacity>
          {user?.userType === 'admin' && (
            <TouchableOpacity
              style={[styles.dashboardTab, activeDashboardTab === 'admin' && styles.dashboardTabActive]}
              onPress={() => setActiveDashboardTab('admin')}
            >
              <Text style={[styles.dashboardTabText, activeDashboardTab === 'admin' && styles.dashboardTabTextActive]}>Admin</Text>
            </TouchableOpacity>
          )}
        </View>

        {activeDashboardTab === 'organizer' ? (
          <>
            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>Manage Ticket Sales</Text>
              <View style={styles.dashboardCard}>
                <View style={styles.dashboardRow}>
                  <Text style={styles.dashboardLabel}>Allow Late Purchases</Text>
                  <TouchableOpacity
                    style={[styles.toggleSwitch, allowLatePurchases && styles.toggleSwitchActive]}
                    onPress={() => setAllowLatePurchases(!allowLatePurchases)}
                  >
                    <View style={[styles.toggleThumb, allowLatePurchases && styles.toggleThumbActive]} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>Ticket Scanner</Text>
              <TouchableOpacity
                style={styles.scannerButton}
                onPress={handleScanTicket}
                disabled={scanning || validating}
              >
                <Ionicons name="qr-code-outline" size={48} color="#00D4FF" />
                <Text style={styles.scannerButtonTitle}>Scan Tickets</Text>
                <Text style={styles.scannerButtonText}>Tap to scan and validate tickets at event entrances</Text>
                <View style={styles.scannerButtonArrow}>
                  <Ionicons name="chevron-forward" size={24} color="#00D4FF" />
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>Ticket Sales</Text>
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Ionicons name="time" size={24} color="#00D4FF" />
                  <Text style={styles.statValue}>{ticketSalesEarly}</Text>
                  <Text style={styles.statLabel}>Early</Text>
                </View>
                <View style={styles.statCard}>
                  <Ionicons name="alarm" size={24} color="#FF6B6B" />
                  <Text style={styles.statValue}>{ticketSalesLate}</Text>
                  <Text style={styles.statLabel}>Late</Text>
                </View>
              </View>
            </View>

            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>Sales by Ticket Type</Text>
              <View style={styles.salesTable}>
                <View style={styles.salesTableHeader}>
                  <Text style={[styles.salesTableHeaderText, styles.salesTableCell1]}>Type</Text>
                  <Text style={[styles.salesTableHeaderText, styles.salesTableCell2]}>Early</Text>
                  <Text style={[styles.salesTableHeaderText, styles.salesTableCell2]}>Late</Text>
                  <Text style={[styles.salesTableHeaderText, styles.salesTableCell2]}>Scanned</Text>
                </View>
                {Object.keys(ticketSalesByType).length > 0 ? (
                  Object.entries(ticketSalesByType).map(([typeName, sales]) => (
                    <View key={typeName} style={styles.salesTableRow}>
                      <Text style={[styles.salesTableCellText, styles.salesTableCell1]}>{typeName}</Text>
                      <View style={styles.salesTableCell2}>
                        <Text style={styles.salesTableCountText}>{sales.early.count}</Text>
                        <Text style={styles.salesTableRevenueText}>UGX {sales.early.revenue.toLocaleString()}</Text>
                      </View>
                      <View style={styles.salesTableCell2}>
                        <Text style={styles.salesTableCountText}>{sales.late.count}</Text>
                        <Text style={styles.salesTableRevenueText}>UGX {sales.late.revenue.toLocaleString()}</Text>
                      </View>
                      <View style={styles.salesTableCell2}>
                        <Text style={styles.salesTableCountText}>{sales.scanned?.count || 0}</Text>
                        <Text style={styles.salesTableRevenueText}>UGX {(sales.scanned?.revenue || 0).toLocaleString()}</Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.noDataText}>No ticket sales yet</Text>
                )}
                {Object.keys(ticketSalesByType).length > 0 && (
                  <View style={styles.salesTableSummary}>
                    <Text style={[styles.salesTableSummaryText, styles.salesTableCell1]}>TOTAL</Text>
                    <View style={styles.salesTableCell2}>
                      <Text style={styles.salesTableSummaryCount}>
                        {Object.values(ticketSalesByType).reduce((sum, s) => sum + s.early.count, 0)}
                      </Text>
                      <Text style={styles.salesTableSummaryRevenue}>UGX {Object.values(ticketSalesByType).reduce((sum, s) => sum + s.early.revenue, 0).toLocaleString()}</Text>
                    </View>
                    <View style={styles.salesTableCell2}>
                      <Text style={styles.salesTableSummaryCount}>
                        {Object.values(ticketSalesByType).reduce((sum, s) => sum + s.late.count, 0)}
                      </Text>
                      <Text style={styles.salesTableSummaryRevenue}>UGX {Object.values(ticketSalesByType).reduce((sum, s) => sum + s.late.revenue, 0).toLocaleString()}</Text>
                    </View>
                    <View style={styles.salesTableCell2}>
                      <Text style={styles.salesTableSummaryCount}>
                        {Object.values(ticketSalesByType).reduce((sum, s) => sum + (s.scanned?.count || 0), 0)}
                      </Text>
                      <Text style={styles.salesTableSummaryRevenue}>UGX {Object.values(ticketSalesByType).reduce((sum, s) => sum + (s.scanned?.revenue || 0), 0).toLocaleString()}</Text>
                    </View>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>Real-time Scan Logs</Text>
              <View style={styles.dashboardCard}>
                {scanLogs.length > 0 ? (
                  scanLogs.map((log, index) => (
                    <View key={index} style={styles.scanLogItem}>
                      <Text style={styles.scanLogTime}>{log.time}</Text>
                      <Text style={styles.scanLogTicketId}>{log.ticketId}</Text>
                      <Text style={[styles.scanLogStatus, log.status === 'Valid' ? styles.scanLogValid : styles.scanLogInvalid]}>{log.status}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.noDataText}>No scan logs available</Text>
                )}
              </View>
            </View>

            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>Withdraw Now</Text>
              <View style={styles.dashboardCard}>
                <View style={styles.eligibleInfo}>
                  <Text style={styles.eligibleLabel}>Eligible for Payout:</Text>
                  <Text style={styles.eligibleAmount}>UGX {eligiblePayoutTotal.toLocaleString()}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.withdrawButton, eligiblePayoutTotal === 0 && styles.withdrawButtonDisabled]}
                  onPress={() => setShowWithdrawModal(true)}
                  disabled={eligiblePayoutTotal === 0}
                >
                  <Ionicons name="wallet" size={20} color="#FFFFFF" />
                  <Text style={styles.withdrawButtonText}>Withdraw Earnings</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>Payout History</Text>
              <View style={styles.dashboardCard}>
                {payoutHistory.length > 0 ? (
                  payoutHistory.map((payout, index) => (
                    <View key={index} style={styles.payoutItem}>
                      <Text style={styles.payoutDate}>{payout.date}</Text>
                      <Text style={styles.payoutAmount}>{payout.amount}</Text>
                      <Text style={[styles.payoutStatus, payout.status === 'Completed' ? styles.payoutCompleted : styles.payoutPending]}>{payout.status}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.noDataText}>No payout history</Text>
                )}
              </View>
            </View>

            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>Payment Details</Text>
              <View style={styles.dashboardCard}>
                {isEditingPayment ? (
                  <View>
                    <Text style={styles.dashboardLabel}>Mobile Money</Text>
                    <View style={styles.inputContainer}>
                      <TouchableOpacity
                        style={[styles.providerButton, editForm.mobileProvider === 'mtn' && styles.providerButtonActive]}
                        onPress={() => setEditForm({ ...editForm, mobileProvider: 'mtn' })}
                      >
                        <Text style={styles.providerButtonText}>MTN</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.providerButton, editForm.mobileProvider === 'airtel' && styles.providerButtonActive]}
                        onPress={() => setEditForm({ ...editForm, mobileProvider: 'airtel' })}
                      >
                        <Text style={styles.providerButtonText}>Airtel</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder="Phone Number (e.g., +2567...)"
                      value={editForm.mobileNumber}
                      onChangeText={(text) => setEditForm({ ...editForm, mobileNumber: text })}
                      placeholderTextColor="#888"
                      keyboardType="phone-pad"
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Account Name"
                      value={editForm.mobileName}
                      onChangeText={(text) => setEditForm({ ...editForm, mobileName: text })}
                      placeholderTextColor="#888"
                    />
                    <Text style={[styles.dashboardLabel, { marginTop: 16 }]}>Bank Account</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Bank Name"
                      value={editForm.bankName}
                      onChangeText={(text) => setEditForm({ ...editForm, bankName: text })}
                      placeholderTextColor="#888"
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Account Number"
                      value={editForm.bankNumber}
                      onChangeText={(text) => setEditForm({ ...editForm, bankNumber: text })}
                      placeholderTextColor="#888"
                      keyboardType="numeric"
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Account Name"
                      value={editForm.bankNameAccount}
                      onChangeText={(text) => setEditForm({ ...editForm, bankNameAccount: text })}
                      placeholderTextColor="#888"
                    />
                    <View style={styles.buttonRow}>
                      <TouchableOpacity
                        style={[styles.actionButtonSmall, { backgroundColor: '#666' }]}
                        onPress={() => setIsEditingPayment(false)}
                      >
                        <Text style={styles.actionButtonSmallText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButtonSmall, { backgroundColor: '#00D4FF' }]}
                        onPress={handleSavePaymentDetails}
                      >
                        <Text style={styles.actionButtonSmallText}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View>
                    {event?.paymentMethods ? (
                      <View>
                        {event.paymentMethods.mobileMoney && event.paymentMethods.mobileMoney.length > 0 && (
                          <>
                            <Text style={styles.dashboardLabel}>Mobile Money</Text>
                            {event.paymentMethods.mobileMoney.map((mm, index) => (
                              <View key={index} style={styles.paymentDetailRow}>
                                <Text style={styles.paymentDetailText}>{mm.provider.toUpperCase()} - {mm.number}</Text>
                                <Text style={styles.paymentDetailSubtext}>{mm.name}</Text>
                              </View>
                            ))}
                          </>
                        )}
                        {event.paymentMethods.bankAccounts && event.paymentMethods.bankAccounts.length > 0 && (
                          <>
                            <Text style={[styles.dashboardLabel, { marginTop: 8 }]}>Bank Account</Text>
                            {event.paymentMethods.bankAccounts.map((bank, index) => (
                              <View key={index} style={styles.paymentDetailRow}>
                                <Text style={styles.paymentDetailText}>{bank.bankName} - {bank.accountNumber}</Text>
                                <Text style={styles.paymentDetailSubtext}>{bank.accountName}</Text>
                              </View>
                            ))}
                          </>
                        )}
                      </View>
                    ) : (
                      <Text style={styles.noDataText}>No payment details configured</Text>
                    )}
                    <TouchableOpacity style={styles.editButton} onPress={handleEditPayment}>
                      <Text style={styles.editButtonText}>Edit Payment Details</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </>
        ) : (
          // Admin tab - event creator payment details
          <View style={styles.dashboardSection}>
            <Text style={styles.dashboardSectionTitle}>Event Creator Payment Details</Text>
            <View style={styles.dashboardCard}>
              {eventCreatorPaymentDetails ? (
                <View>
                  {eventCreatorPaymentDetails.mobileMoney && (
                    <>
                      <Text style={styles.dashboardLabel}>Mobile Money</Text>
                      <View style={styles.paymentDetailRow}>
                        <Text style={styles.paymentDetailText}>
                          {eventCreatorPaymentDetails.mobileMoney.provider?.toUpperCase()} - {eventCreatorPaymentDetails.mobileMoney.phoneNumber}
                        </Text>
                        <Text style={styles.paymentDetailSubtext}>{eventCreatorPaymentDetails.mobileMoney.accountName}</Text>
                      </View>
                    </>
                  )}
                  {eventCreatorPaymentDetails.bankAccount && (
                    <>
                      <Text style={[styles.dashboardLabel, { marginTop: 8 }]}>Bank Account</Text>
                      <View style={styles.paymentDetailRow}>
                        <Text style={styles.paymentDetailText}>
                          {eventCreatorPaymentDetails.bankAccount.bankName} - {eventCreatorPaymentDetails.bankAccount.accountNumber}
                        </Text>
                        <Text style={styles.paymentDetailSubtext}>{eventCreatorPaymentDetails.bankAccount.accountName}</Text>
                      </View>
                    </>
                  )}
                </View>
              ) : (
                <Text style={styles.noDataText}>No payment details found for event creator</Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  dashboardContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  dashboardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    paddingTop: 48,
  },
  dashboardTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "bold",
  },
  dashboardContent: {
    flex: 1,
    paddingBottom: 80,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000000",
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 16,
    marginTop: 12,
  },
  dashboardTabs: {
    flexDirection: "row",
    margin: 16,
  },
  dashboardTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: "#2a2a2a",
    alignItems: "center",
  },
  dashboardTabActive: {
    backgroundColor: "#00D4FF",
  },
  dashboardTabText: {
    color: "#888888",
    fontSize: 14,
    fontWeight: "600",
  },
  dashboardTabTextActive: {
    color: "#FFFFFF",
  },
  dashboardSection: {
    marginBottom: 16,
    marginHorizontal: 16,
  },
  dashboardSectionTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  dashboardCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
  },
  dashboardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dashboardLabel: {
    color: "#888888",
    fontSize: 14,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "bold",
    marginTop: 8,
  },
  statLabel: {
    color: "#888888",
    fontSize: 12,
    marginTop: 4,
  },
  salesTable: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 12,
    overflow: "hidden",
  },
  salesTableHeader: {
    flexDirection: "row",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  salesTableHeaderText: {
    color: "#888888",
    fontSize: 12,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  salesTableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
  },
  salesTableCell1: {
    flex: 1.5,
  },
  salesTableCell2: {
    flex: 1,
    alignItems: "center",
  },
  salesTableCellText: {
    color: "#FFFFFF",
    fontSize: 13,
  },
  salesTableCountText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  salesTableRevenueText: {
    color: "#00D4FF",
    fontSize: 11,
    marginTop: 2,
  },
  salesTableSummary: {
    flexDirection: "row",
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: "#00D4FF",
  },
  salesTableSummaryText: {
    color: "#00D4FF",
    fontSize: 13,
    fontWeight: "bold",
  },
  salesTableSummaryCount: {
    color: "#00D4FF",
    fontSize: 14,
    fontWeight: "bold",
  },
  salesTableSummaryRevenue: {
    color: "#00D4FF",
    fontSize: 11,
    marginTop: 2,
  },
  noDataText: {
    color: "#888888",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
  },
  scanLogItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
  },
  scanLogTime: {
    color: "#888888",
    fontSize: 12,
    flex: 1,
  },
  scanLogTicketId: {
    color: "#FFFFFF",
    fontSize: 12,
    flex: 1,
    fontFamily: "monospace",
  },
  scanLogStatus: {
    fontSize: 12,
    fontWeight: "bold",
    width: 60,
    textAlign: "right",
  },
  scanLogValid: {
    color: "#4CAF50",
  },
  scanLogInvalid: {
    color: "#FF6B6B",
  },
  eligibleInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  eligibleLabel: {
    color: "#888888",
    fontSize: 14,
  },
  eligibleAmount: {
    color: "#4CAF50",
    fontSize: 18,
    fontWeight: "bold",
  },
  withdrawButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    paddingVertical: 14,
    borderRadius: 8,
  },
  withdrawButtonDisabled: {
    backgroundColor: "#444444",
  },
  withdrawButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  payoutItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
  },
  payoutDate: {
    color: "#888888",
    fontSize: 12,
    flex: 1,
  },
  payoutAmount: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
    flex: 1,
    textAlign: "center",
  },
  payoutStatus: {
    fontSize: 12,
    fontWeight: "bold",
    width: 80,
    textAlign: "right",
  },
  payoutCompleted: {
    color: "#4CAF50",
  },
  payoutPending: {
    color: "#FF9800",
  },
  inputContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  providerButton: {
    flex: 1,
    padding: 12,
    alignItems: "center",
    backgroundColor: "#333333",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  providerButtonActive: {
    backgroundColor: "#2196F3",
    borderColor: "#2196F3",
  },
  providerButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#333333",
    color: "#FFFFFF",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 14,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 8,
  },
  actionButtonSmall: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  actionButtonSmallText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  scannerButton: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#00D4FF",
    borderStyle: "dashed",
  },
  scannerButtonTitle: {
    color: "#00D4FF",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 12,
  },
  scannerButtonText: {
    color: "#888888",
    fontSize: 14,
    marginTop: 4,
  },
  scannerButtonArrow: {
    position: "absolute",
    right: 16,
    top: "50%",
    marginTop: -12,
  },
  toggleSwitch: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#444444",
    padding: 3,
    justifyContent: "center",
  },
  toggleSwitchActive: {
    backgroundColor: "#00FF9F",
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  toggleThumbActive: {
    alignSelf: "flex-end",
  },
  paymentDetailRow: {
    marginBottom: 4,
  },
  paymentDetailText: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  paymentDetailSubtext: {
    color: "#888888",
    fontSize: 12,
    marginTop: 2,
  },
  editButton: {
    marginTop: 12,
    padding: 10,
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    alignItems: "center",
  },
  editButtonText: {
    color: "#00D4FF",
    fontSize: 14,
    fontWeight: "600",
  },
})

export default OrganiserDashboardScreen