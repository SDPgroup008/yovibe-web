import type React from "react"
import { useState, useEffect } from "react"
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
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import FirebaseService from "../services/FirebaseService"
import TicketService from "../services/TicketService"
import PesaPalService from "../services/PesaPalService"
import { useAuth } from "../contexts/AuthContext"
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore"
import { db } from "../config/firebase"
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

const OrganiserDashboardScreen: React.FC<OrganiserDashboardScreenProps> = ({ route, navigation }) => {
  const { eventId } = route.params
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

  useEffect(() => {
    const loadEvent = async () => {
      try {
        const eventData = await FirebaseService.getEventById(eventId)
        setEvent(eventData)
      } catch (error) {
        console.error("Error loading event details in organiser dashboard:", error)
      } finally {
        setLoading(false)
      }
    }

    loadEvent()
  }, [eventId])

  // Load scan/validation logs for this specific event
  useEffect(() => {
    const loadScanLogs = async () => {
      if (!eventId) return
      
      try {
        console.log("Loading scan logs for event:", eventId)
        const validations = await FirebaseService.getTicketValidationsByEvent(eventId)
        
        // Convert to scanLogs format
        const logs = validations.map((v) => ({
          time: v.validatedAt ? new Date(v.validatedAt).toLocaleTimeString() : "",
          ticketId: v.ticketId || "",
          status: v.status === "granted" ? "Valid" : "Invalid",
        }))
        
        setScanLogs(logs)
        console.log("Loaded", logs.length, "scan logs for event:", eventId)
      } catch (error) {
        console.error("Error loading scan logs:", error)
      }
    }

    loadScanLogs()
  }, [eventId])

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

  useEffect(() => {
    if (!eventId) return

    const ticketsQuery = query(
      collection(db, "YoVibe/data/tickets"),
      where("eventId", "==", eventId)
    )

    const unsubscribeTickets = onSnapshot(ticketsQuery, (snapshot) => {
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

      const tickets: any[] = []
      snapshot.forEach((doc) => {
        tickets.push(doc.data())
      })
      tickets.sort((a, b) => {
        const dateA = a.purchaseDate?.seconds || 0
        const dateB = b.purchaseDate?.seconds || 0
        return dateB - dateA
      })

      tickets.forEach((ticket) => {
        const ticketType = ticket.entryFeeType || ticket.ticketType || "Standard"
        const amount = ticket.totalAmount || 0
        const isLate = ticket.isLatePurchase
        const isScanned = ticket.isScanned || ticket.status === "used"
        
        // Ticket is eligible if:
        // 1. payoutEligible is true AND
        // 2. payoutStatus is "pending" (not already paid out)
        const isEligible = ticket.payoutEligible === true && ticket.payoutStatus === "pending"

        if (isLate) {
          lateCount++
        } else {
          earlyCount++
        }
        totalRevenue += amount

        if (isEligible) {
          eligibleTotal += ticket.venueRevenue || 0
          console.log("   - Eligible ticket:", ticket.id?.substring(0, 8), "venueRevenue:", ticket.venueRevenue)
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
      console.log("📊 Setting eligible payout total:", eligibleTotal)
      setEligiblePayoutTotal(eligibleTotal)
      setTicketSalesByType(salesByType)
    }, (error) => {
      console.error("OrganiserDashboardScreen ticket listener error:", error)
    })

    const validationsQuery = query(
      collection(db, "YoVibe/data/ticketValidations"),
      orderBy("validatedAt", "desc")
    )

    const unsubscribeValidations = onSnapshot(validationsQuery, (snapshot) => {
      const logs: Array<{ time: string; ticketId: string; status: string }> = []

      snapshot.forEach((doc) => {
        const validation = doc.data()
        logs.push({
          time: validation.validatedAt ? new Date(validation.validatedAt.seconds * 1000).toLocaleTimeString() : new Date().toLocaleTimeString(),
          ticketId: validation.ticketId ? validation.ticketId.substring(0, 8) + "..." : "Unknown",
          status: validation.status === "granted" ? "Valid" : "Invalid",
        })
      })

      setScanLogs(logs.slice(0, 10))
    }, (error) => {
      console.error("OrganiserDashboardScreen validation listener error:", error)
    })

    return () => {
      unsubscribeTickets()
      unsubscribeValidations()
    }
  }, [event, eventId])

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
                  
                  // For tickets without photo, grant entry immediately and refresh logs from Firestore
                  Alert.alert("✅ Entry Granted", "Ticket validated successfully. Entry granted.", [{ text: "OK" }])
                  
                  // Refresh scan logs from database
                  const validations = await FirebaseService.getTicketValidationsByEvent(eventId)
                  const logs = validations.map((v) => ({
                    time: v.validatedAt ? new Date(v.validatedAt).toLocaleTimeString() : "",
                    ticketId: v.ticketId || "",
                    status: v.status === "granted" ? "Valid" : "Invalid",
                  }))
                  setScanLogs(logs)
                } else {
                  Alert.alert("❌ Entry Denied", `Validation failed: ${result.reason}`, [{ text: "OK" }])
                  
                  // Refresh scan logs from database
                  const validations = await FirebaseService.getTicketValidationsByEvent(eventId)
                  const logs = validations.map((v) => ({
                    time: v.validatedAt ? new Date(v.validatedAt).toLocaleTimeString() : "",
                    ticketId: v.ticketId || "",
                    status: v.status === "granted" ? "Valid" : "Invalid",
                  }))
                  setScanLogs(logs)
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
          
          // Reload scan logs after confirmation
          const validations = await FirebaseService.getTicketValidationsByEvent(eventId)
          const logs = validations.map((v) => ({
            time: v.validatedAt ? new Date(v.validatedAt).toLocaleTimeString() : "",
            ticketId: v.ticketId || "",
            status: v.status === "granted" ? "Valid" : "Invalid",
          }))
          setScanLogs(logs)
          Alert.alert(
            "✅ Entry Granted",
            `Photo verified! Ticket confirmed for ${buyerName}. Entry granted.`,
            [{ text: "OK" }]
          )
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
      await FirebaseService.updateEvent(event.id, { paymentMethods })
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
      const userData = await FirebaseService.getUserProfile(user.uid)
      if (userData?.paymentDetails) {
        setOrganizerPaymentDetails(userData.paymentDetails)
      }
    } catch (error) {
      console.error("Error loading payment details:", error)
    }
  }

  const loadEventCreatorPaymentDetails = async (creatorId: string) => {
    try {
      const userData = await FirebaseService.getUserProfile(creatorId)
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
      const eligibleTickets = await FirebaseService.getEligibleTicketsForEvent(eventId)
      console.log("   - Found eligible tickets:", eligibleTickets.length)
      
      if (eligibleTickets.length === 0) {
        Alert.alert("Error", "No eligible tickets found for payout")
        setWithdrawLoading(false)
        return
      }

      // Get user and event payment details
      const userData = await FirebaseService.getUserProfile(user.uid)
      const userPaymentDetails = userData?.paymentDetails
      const eventData = await FirebaseService.getEventById(eventId)
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
          await FirebaseService.updateTicket(ticket.id, {
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
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </TouchableOpacity>
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
                            <Text style={[styles.dashboardLabel, { marginTop: 16 }]}>Bank Account</Text>
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
                      <Text style={styles.noDataText}>No payment methods configured for this event</Text>
                    )}
                    <TouchableOpacity
                      style={[styles.editButton, { marginTop: 16 }]}
                      onPress={handleEditPayment}
                    >
                      <Text style={styles.editButtonText}>Edit Payment Details</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>Monitor All Events</Text>
              <View style={styles.dashboardCard}>
                <View style={styles.dashboardRow}>
                  <Text style={styles.dashboardLabel}>Total Events</Text>
                  <Text style={styles.dashboardValue}>24</Text>
                </View>
                <View style={styles.dashboardRow}>
                  <Text style={styles.dashboardLabel}>Active Events</Text>
                  <Text style={styles.dashboardValue}>12</Text>
                </View>
              </View>
            </View>
            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>Revenue Analytics</Text>
              <View style={styles.dashboardCard}>
                {revenueAnalytics.length > 0 ? (
                  revenueAnalytics.map((item, index) => (
                    <View key={index} style={styles.dashboardRow}>
                      <Text style={styles.dashboardLabel}>{item.label}</Text>
                      <Text style={styles.dashboardValue}>UGX {item.value.toLocaleString()}</Text>
                    </View>
                  ))
                ) : (
                  <>
                    <View style={styles.dashboardRow}>
                      <Text style={styles.dashboardLabel}>Today's Revenue</Text>
                      <Text style={styles.dashboardValue}>UGX 0</Text>
                    </View>
                    <View style={styles.dashboardRow}>
                      <Text style={styles.dashboardLabel}>This Week</Text>
                      <Text style={styles.dashboardValue}>UGX 0</Text>
                    </View>
                    <View style={styles.dashboardRow}>
                      <Text style={styles.dashboardLabel}>This Month</Text>
                      <Text style={styles.dashboardValue}>UGX 0</Text>
                    </View>
                  </>
                )}
              </View>
            </View>
            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>Wallet Balance</Text>
              <View style={styles.walletCard}>
                <Ionicons name="wallet-outline" size={32} color="#00D4FF" />
                <Text style={styles.walletBalance}>{walletBalance}</Text>
                <TouchableOpacity style={styles.manualPayoutButton}>
                  <Text style={styles.manualPayoutText}>Manual Payout Override</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>Fraud Detection Logs</Text>
              <View style={styles.dashboardCard}>
                <Text style={styles.noDataText}>No fraud alerts detected</Text>
              </View>
            </View>
            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>Organizer Payment Details</Text>
              <View style={styles.dashboardCard}>
                {event?.paymentMethods ? (
                  <View>
                    <Text style={styles.dashboardLabel}>Event Organizer</Text>
                    <Text style={styles.dashboardValue}>{event.createdBy}</Text>
                    {event.paymentMethods.mobileMoney && event.paymentMethods.mobileMoney.length > 0 && (
                      <>
                        <Text style={[styles.dashboardLabel, { marginTop: 16 }]}>Mobile Money</Text>
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
                        <Text style={[styles.dashboardLabel, { marginTop: 16 }]}>Bank Account</Text>
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
                  <Text style={styles.noDataText}>No payment methods configured for this event</Text>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={showWithdrawModal} transparent={true} animationType="fade" onRequestClose={() => setShowWithdrawModal(false)}>
        <View style={[styles.fullImageModal, { zIndex: 9999 }]}>
          <View style={styles.withdrawModalContent}>
            <Text style={styles.withdrawModalTitle}>Withdraw Earnings</Text>
            <Text style={styles.withdrawModalSubtitle}>Available: UGX {eligiblePayoutTotal.toLocaleString()}</Text>
            <TextInput
              style={styles.withdrawInput}
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              placeholder="Enter amount"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
            <View style={styles.withdrawModalButtons}>
              <TouchableOpacity
                style={styles.withdrawCancelButton}
                onPress={() => {
                  setShowWithdrawModal(false)
                  setWithdrawAmount("")
                }}
              >
                <Text style={styles.withdrawCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.withdrawConfirmButton, withdrawLoading && styles.withdrawButtonDisabled]}
                onPress={handleWithdraw}
                disabled={withdrawLoading || !withdrawAmount || parseInt(withdrawAmount) <= 0 || parseInt(withdrawAmount) > eligiblePayoutTotal}
              >
                {withdrawLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.withdrawConfirmText}>Withdraw</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showScannerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowScannerModal(false)}
      >
        <View style={[styles.scannerModalOverlay, { zIndex: 9999 }]}>
          <View style={styles.scannerModalContent}>
            <Text style={styles.scannerModalTitle}>Scan Ticket</Text>
            <Text style={styles.scannerModalSubtitle}>Enter ticket ID or scan QR code</Text>
            <TextInput
              style={styles.scannerModalInput}
              value={scannerInput}
              onChangeText={setScannerInput}
              placeholder="Enter ticket ID..."
              placeholderTextColor="#666"
              autoFocus
              onSubmitEditing={handleScannerSubmit}
            />
            <View style={styles.scannerModalButtons}>
              <TouchableOpacity
                style={styles.scannerModalCancelButton}
                onPress={() => {
                  setShowScannerModal(false)
                  setScannerInput("")
                }}
              >
                <Text style={styles.scannerModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.scannerModalValidateButton} onPress={handleScannerSubmit} disabled={!scannerInput.trim()}>
                <Text style={styles.scannerModalValidateText}>Validate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Photo Verification Modal */}
      <Modal
        visible={showPhotoVerification}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPhotoVerification(false)}
      >
        <View style={styles.photoVerificationOverlay}>
          <View style={styles.photoVerificationContent}>
            <Text style={styles.photoVerificationTitle}>Photo Verification Required</Text>
            <Text style={styles.photoVerificationSubtitle}>
              Compare the photo below with the person presenting the ticket
            </Text>
            
            {/* Buyer Photo */}
            <View style={styles.photoContainer}>
              {buyerPhotoUrl ? (
                <Image 
                  source={{ uri: buyerPhotoUrl }} 
                  style={styles.buyerPhoto}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="person" size={60} color="#666" />
                </View>
              )}
              <Text style={styles.buyerNameText}>{buyerName}</Text>
              <Text style={styles.buyerLabel}>Ticket Buyer</Text>
            </View>

            {/* Verification Question */}
            <Text style={styles.verificationQuestion}>
              Does the person presenting the ticket match this photo?
            </Text>

            {/* Verification Buttons */}
            <View style={styles.verificationButtons}>
              <TouchableOpacity 
                style={styles.denyButton}
                onPress={() => handlePhotoConfirm(false)}
              >
                <Ionicons name="close-circle" size={24} color="#FFFFFF" />
                <Text style={styles.denyButtonText}>No - Deny Entry</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.confirmButton}
                onPress={() => handlePhotoConfirm(true)}
              >
                <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
                <Text style={styles.confirmButtonText}>Yes - Grant Entry</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.verificationNote}>
              Entry will only be granted after photo confirmation
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  // Dashboard Styles
  dashboardContainer: {
    flex: 1,
    backgroundColor: "#0D0D0D",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0D0D0D",
  },
  loadingText: {
    fontSize: responsiveSize(16, 18, 20),
    color: "#FFFFFF",
    textAlign: "center",
  },
  dashboardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: responsiveSize(16, 20, 24),
    paddingTop: responsiveSize(50, 60, 70),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 212, 255, 0.2)",
  },
  dashboardTitle: {
    fontSize: responsiveSize(22, 26, 30),
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  dashboardContent: {
    flex: 1,
    padding: responsiveSize(16, 20, 24),
  },
  dashboardTabs: {
    flexDirection: "row",
    marginBottom: responsiveSize(20, 24, 28),
    backgroundColor: "#1A1A1A",
    borderRadius: responsiveSize(10, 12, 14),
    padding: 4,
  },
  dashboardTab: {
    flex: 1,
    paddingVertical: responsiveSize(10, 12, 14),
    alignItems: "center",
    borderRadius: responsiveSize(8, 10, 12),
  },
  dashboardTabActive: {
    backgroundColor: "#00D4FF",
  },
  dashboardTabText: {
    fontSize: responsiveSize(14, 16, 18),
    fontWeight: "600",
    color: "#888888",
  },
  dashboardTabTextActive: {
    color: "#0D0D0D",
  },
  dashboardSection: {
    marginBottom: responsiveSize(20, 24, 28),
  },
  dashboardSectionTitle: {
    fontSize: responsiveSize(16, 18, 20),
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: responsiveSize(10, 12, 14),
  },
  dashboardCard: {
    backgroundColor: "#1A1A1A",
    borderRadius: responsiveSize(10, 12, 14),
    padding: responsiveSize(14, 16, 18),
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.15)",
  },
  dashboardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: responsiveSize(8, 10, 12),
  },
  dashboardLabel: {
    fontSize: responsiveSize(14, 15, 16),
    color: "#CCCCCC",
  },
  dashboardValue: {
    fontSize: responsiveSize(14, 15, 16),
    fontWeight: "bold",
    color: "#00D4FF",
  },
  toggleSwitch: {
    width: responsiveSize(48, 52, 56),
    height: responsiveSize(26, 28, 30),
    borderRadius: responsiveSize(13, 14, 15),
    backgroundColor: "#333333",
    padding: 2,
    justifyContent: "center",
  },
  toggleSwitchActive: {
    backgroundColor: "#00D4FF",
  },
  toggleThumb: {
    width: responsiveSize(22, 24, 26),
    height: responsiveSize(22, 24, 26),
    borderRadius: responsiveSize(11, 12, 13),
    backgroundColor: "#FFFFFF",
  },
  toggleThumbActive: {
    alignSelf: "flex-end",
  },
  statsRow: {
    flexDirection: "row",
    gap: responsiveSize(10, 12, 14),
  },
  statCard: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    borderRadius: responsiveSize(10, 12, 14),
    padding: responsiveSize(16, 18, 20),
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.15)",
  },
  statValue: {
    fontSize: responsiveSize(24, 28, 32),
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: responsiveSize(8, 10, 12),
  },
  statLabel: {
    fontSize: responsiveSize(12, 14, 16),
    color: "#888888",
    marginTop: responsiveSize(4, 6, 8),
  },
  scanLogItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: responsiveSize(8, 10, 12),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  scanLogTime: {
    fontSize: responsiveSize(12, 13, 14),
    color: "#888888",
    flex: 1,
  },
  scanLogTicketId: {
    fontSize: responsiveSize(12, 13, 14),
    color: "#CCCCCC",
    flex: 1,
    textAlign: "center",
  },
  scanLogStatus: {
    fontSize: responsiveSize(12, 13, 14),
    fontWeight: "bold",
    flex: 1,
    textAlign: "right",
  },
  scanLogValid: {
    color: "#4CAF50",
  },
  scanLogInvalid: {
    color: "#FF3B30",
  },
  noDataText: {
    fontSize: responsiveSize(13, 14, 15),
    color: "#666666",
    textAlign: "center",
    paddingVertical: responsiveSize(16, 20, 24),
  },
  // Sales Table Styles
  salesTable: {
    backgroundColor: "#252525",
    borderRadius: 8,
    overflow: "hidden",
  },
  salesTableHeader: {
    flexDirection: "row",
    backgroundColor: "#333333",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#444444",
  },
  salesTableHeaderText: {
    color: "#888888",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  salesTableCell1: {
    flex: 1.5,
    textAlign: "left",
  },
  salesTableCell2: {
    flex: 1,
    alignItems: "center",
  },
  salesTableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  salesTableCellText: {
    color: "#FFFFFF",
    fontSize: 13,
  },
  salesTableCountText: {
    color: "#00D4FF",
    fontSize: 13,
    fontWeight: "bold",
  },
  salesTableRevenueText: {
    color: "#888888",
    fontSize: 10,
    marginTop: 2,
  },
  salesTableSummary: {
    flexDirection: "row",
    backgroundColor: "#444444",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 0,
  },
  salesTableSummaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  salesTableSummaryCount: {
    color: "#00FF9F",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
  },
  salesTableSummaryRevenue: {
    color: "#00FF9F",
    fontSize: 11,
    fontWeight: "bold",
    marginTop: 2,
    textAlign: "center",
  },
  withdrawButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    paddingVertical: responsiveSize(14, 16, 18),
    borderRadius: responsiveSize(8, 10, 12),
    marginTop: 12,
  },
  withdrawButtonDisabled: {
    opacity: 0.5,
  },
  withdrawButtonText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(15, 16, 17),
    fontWeight: "bold",
    marginLeft: responsiveSize(8, 10, 12),
  },
  eligibleInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  eligibleLabel: {
    fontSize: responsiveSize(14, 15, 16),
    color: "#888888",
  },
  eligibleAmount: {
    fontSize: responsiveSize(18, 20, 22),
    fontWeight: "bold",
    color: "#00D4FF",
  },
  withdrawModalContent: {
    backgroundColor: "#1E1E1E",
    borderRadius: 16,
    padding: 24,
    width: "85%",
    maxWidth: 400,
  },
  withdrawModalTitle: {
    fontSize: responsiveSize(18, 20, 22),
    fontWeight: "bold",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
  },
  withdrawModalSubtitle: {
    fontSize: responsiveSize(14, 15, 16),
    color: "#888888",
    textAlign: "center",
    marginBottom: 20,
  },
  withdrawInput: {
    backgroundColor: "#2A2A2A",
    borderRadius: 8,
    padding: 14,
    fontSize: responsiveSize(16, 18, 20),
    color: "#FFFFFF",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#444",
  },
  withdrawModalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  withdrawCancelButton: {
    flex: 1,
    backgroundColor: "#333",
    paddingVertical: 14,
    borderRadius: 8,
    marginRight: 8,
  },
  withdrawCancelText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(15, 16, 17),
    textAlign: "center",
    fontWeight: "bold",
  },
  withdrawConfirmButton: {
    flex: 1,
    backgroundColor: "#4CAF50",
    paddingVertical: 14,
    borderRadius: 8,
    marginLeft: 8,
  },
  withdrawConfirmText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(15, 16, 17),
    textAlign: "center",
    fontWeight: "bold",
  },
  payoutItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: responsiveSize(8, 10, 12),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  payoutDate: {
    fontSize: responsiveSize(12, 13, 14),
    color: "#888888",
    flex: 1,
  },
  payoutAmount: {
    fontSize: responsiveSize(12, 13, 14),
    fontWeight: "bold",
    color: "#FFFFFF",
    flex: 1,
    textAlign: "center",
  },
  payoutStatus: {
    fontSize: responsiveSize(12, 13, 14),
    fontWeight: "bold",
    flex: 1,
    textAlign: "right",
  },
  payoutCompleted: {
    color: "#4CAF50",
  },
  payoutPending: {
    color: "#FF9800",
  },
  walletCard: {
    backgroundColor: "#1A1A1A",
    borderRadius: responsiveSize(10, 12, 14),
    padding: responsiveSize(20, 24, 28),
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.15)",
  },
  walletBalance: {
    fontSize: responsiveSize(28, 32, 36),
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: responsiveSize(12, 14, 16),
  },
  manualPayoutButton: {
    marginTop: responsiveSize(16, 20, 24),
    paddingVertical: responsiveSize(10, 12, 14),
    paddingHorizontal: responsiveSize(16, 20, 24),
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    borderRadius: responsiveSize(6, 8, 10),
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.3)",
  },
  manualPayoutText: {
    color: "#00D4FF",
    fontSize: responsiveSize(13, 14, 15),
    fontWeight: "600",
  },
  inputContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  providerButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
  },
  providerButtonActive: {
    backgroundColor: "#00D4FF",
    borderColor: "#00D4FF",
  },
  providerButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    padding: 12,
    color: "#FFFFFF",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#333",
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  actionButtonSmall: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  actionButtonSmallText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  paymentDetailRow: {
    backgroundColor: "#1E1E1E",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  paymentDetailText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  paymentDetailSubtext: {
    color: "#888888",
    fontSize: 12,
    marginTop: 4,
  },
  editButton: {
    backgroundColor: "#00D4FF",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  editButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  scannerButton: {
    alignItems: "center",
    padding: 20,
    backgroundColor: "rgba(0, 212, 255, 0.1)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.3)",
  },
  scannerButtonTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: 12,
  },
  scannerButtonText: {
    fontSize: 13,
    color: "#AAAAAA",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 12,
  },
  scannerButtonArrow: {
    position: "absolute",
    right: 16,
    top: "50%",
    marginTop: -12,
  },
  fullImageModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  // Scanner Modal Styles
  scannerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  scannerModalContent: {
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 24,
    width: "85%",
    maxWidth: 400,
  },
  scannerModalTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  scannerModalSubtitle: {
    color: "#888888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  scannerModalInput: {
    backgroundColor: "#333333",
    color: "#FFFFFF",
    padding: 16,
    borderRadius: 8,
    fontSize: 16,
    marginBottom: 20,
  },
  scannerModalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  scannerModalCancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#333333",
    alignItems: "center",
  },
  scannerModalCancelText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  scannerModalValidateButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#00D4FF",
    alignItems: "center",
  },
  scannerModalValidateText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  // Photo Verification Styles
  photoVerificationOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  photoVerificationContent: {
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  photoVerificationTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  photoVerificationSubtitle: {
    color: "#888888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  photoContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  buyerPhoto: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 3,
    borderColor: "#00D4FF",
    marginBottom: 12,
  },
  photoPlaceholder: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "#333",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#666",
    marginBottom: 12,
  },
  buyerNameText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  buyerLabel: {
    color: "#888888",
    fontSize: 12,
  },
  verificationQuestion: {
    color: "#FFD700",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 20,
  },
  verificationButtons: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  denyButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF4444",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  denyButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
    marginLeft: 6,
  },
  confirmButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
    marginLeft: 6,
  },
  verificationNote: {
    color: "#666666",
    fontSize: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
})

export default OrganiserDashboardScreen
