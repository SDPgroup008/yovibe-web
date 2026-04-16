"use client"

import type React from "react"
import { useState, useEffect, useMemo, useCallback } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
  Platform,
  ImageBackground,
  Modal,
  Image,
  Dimensions,
  TextInput,
  ActivityIndicator,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../services/FirebaseService"
import { useAuth } from "../contexts/AuthContext"
import type { Event } from "../models/Event"
import type { EventDetailScreenProps } from "../navigation/types"
import TicketService from "../services/TicketService"
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore"
import { db } from "../config/firebase"

// Responsive setup for EventDetailScreen
const { width: screenWidth } = Dimensions.get('window');
const isSmallDevice = screenWidth < 380;
const isTablet = screenWidth >= 768;
const isLargeScreen = screenWidth >= 1024;

console.log("[v0] EventDetailScreen responsiveness initialized - Screen width:", screenWidth, "px | Device type:", isLargeScreen ? "Large/Desktop" : isTablet ? "Tablet" : "Mobile");

const EventDetailScreen: React.FC<EventDetailScreenProps> = ({ route, navigation }) => {
  const { eventId } = route.params
  const { user } = useAuth()
  
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [isGoing, setIsGoing] = useState(false)
  const [attendeeCount, setAttendeeCount] = useState(0)
  const [showFullImage, setShowFullImage] = useState(false)
  const [showOrganizerDashboard, setShowOrganizerDashboard] = useState(false)
  const [activeDashboardTab, setActiveDashboardTab] = useState<'organizer' | 'admin'>('organizer')
  
  // Organizer Dashboard State
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
  
  // Ticket sales breakdown by entry fee type
  type TicketSalesByType = {
    [entryFeeName: string]: {
      early: { count: number; revenue: number }
      late: { count: number; revenue: number }
      scanned: { count: number; revenue: number }
    }
  }
  const [ticketSalesByType, setTicketSalesByType] = useState<TicketSalesByType>({})

  // Payment details state
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
  
  // Ticket Scanner State
  const [scanning, setScanning] = useState(false)
  const [validating, setValidating] = useState(false)
  const [scannerInput, setScannerInput] = useState("")
  const [showScannerModal, setShowScannerModal] = useState(false)
  
  // Handle scan ticket - navigate to scanner with event info
  const handleScanTicket = async () => {
    try {
      console.log("========================================")
      console.log("📱 ORGANIZER DASHBOARD: TICKET SCANNER")
      console.log("========================================")
      console.log("📋 EventDetailScreen.handleScanTicket: Navigating to scanner")
      console.log("📋 Event ID:", eventId)
      console.log("📋 Organizer ID:", user?.id)
      console.log("📋 Event:", event?.name)
      
      navigation.navigate("TicketScanner", { 
        eventId: eventId, 
        eventName: event?.name || "Event" 
      })
      
    } catch (error) {
      console.error("❌ Error scanning ticket:", error)
      Alert.alert("Error", "Failed to open scanner")
    }
  }
  
  // Handle scanner submit
  const handleScannerSubmit = async () => {
    if (!scannerInput.trim()) return
    
    const ticketId = scannerInput.trim()
    console.log("📋 Ticket ID entered:", ticketId)
    setShowScannerModal(false)
    await handleValidateTicket(ticketId)
    setScannerInput("")
  }
  
  // Handle validate ticket
  const handleValidateTicket = async (ticketId: string) => {
    if (!user) {
      console.log("❌ Validation failed: User not authenticated")
      Alert.alert("Error", "Please sign in to validate tickets")
      return
    }

    try {
      console.log("--- Organizer validating ticket ---")
      console.log("📋 Ticket ID:", ticketId)
      console.log("📋 Validator ID:", user.id)
      console.log("📋 Validator Name:", user.displayName)
      
      setValidating(true)
      
      // Use Alert.prompt for confirmation
      console.log("⏳ Prompting for validation confirmation...")
      
      Alert.alert(
        "Ticket Validation",
        "Click Validate to verify this ticket.",
        [
          { text: "Cancel", style: "cancel", onPress: () => console.log("📋 Validation cancelled by organizer") },
          {
            text: "Validate",
            onPress: async () => {
              console.log("✅ Organizer confirmed validation")
              console.log("⏳ Calling TicketService.validateTicket...")
              
              try {
                const result = await TicketService.validateTicket(ticketId, user.id, "Event Entrance")
                
                console.log("📋 Validation result received:")
                console.log("   - Success:", result.success)
                console.log("   - Reason:", result.reason || "N/A")
                
                // Add to scan logs
                const newLog = {
                  time: new Date().toLocaleTimeString(),
                  ticketId: ticketId.substring(0, 8) + "...",
                  status: result.success ? "Valid" : "Invalid"
                }
                setScanLogs(prev => [newLog, ...prev].slice(0, 10))
                console.log("📋 Scan log updated:", newLog)
                
                if (result.success) {
                  console.log("✅ TICKET VALIDATION SUCCESSFUL")
                  console.log("📋 Ticket ID:", ticketId)
                  console.log("📋 Entry granted to attendee")
                  console.log("========================================")
                  Alert.alert("✅ Entry Granted", "Ticket validated successfully. Entry granted.", [{ text: "OK" }])
                } else {
                  console.log("❌ TICKET VALIDATION FAILED")
                  console.log("📋 Reason:", result.reason)
                  console.log("========================================")
                  Alert.alert("❌ Entry Denied", `Validation failed: ${result.reason}`, [{ text: "OK" }])
                }
              } catch (error) {
                console.error("❌ Error during validation:", error)
                Alert.alert("Error", "Failed to validate ticket")
              }
            },
          },
        ],
      )
    } catch (error) {
      console.error("❌ Error validating ticket:", error)
      Alert.alert("Error", "Failed to validate ticket")
    } finally {
      setValidating(false)
    }
  }
  // Admin state - for viewing organizer's payment details
  const [eventCreatorPaymentDetails, setEventCreatorPaymentDetails] = useState<{
    mobileMoney?: { provider: string; phoneNumber: string; accountName: string }
    bankAccount?: { bankName: string; accountNumber: string; accountName: string }
  } | null>(null)

  useEffect(() => {
    const loadEvent = async () => {
      try {
        const eventData = await FirebaseService.getEventById(eventId)
        setEvent(eventData)

        // Check if current user is attending
        if (user && eventData?.attendees) {
          setIsGoing(eventData.attendees.includes(user.id))
        }

        // Set attendee count
        setAttendeeCount(eventData?.attendees?.length || 0)
      } catch (error) {
        console.error("Error loading event details:", error)
      } finally {
        setLoading(false)
      }
    }

    loadEvent()
  }, [eventId, user])

  const handleToggleGoing = async () => {
    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to mark yourself as attending this event.")
      return
    }

    if (!event) return

    try {
      const updatedIsGoing = !isGoing
      setIsGoing(updatedIsGoing)

      // Update attendee count optimistically
      setAttendeeCount((prevCount) => (updatedIsGoing ? prevCount + 1 : prevCount - 1))

      // Update in database
      const updatedAttendees = updatedIsGoing
        ? [...(event.attendees || []), user.id]
        : (event.attendees || []).filter((id) => id !== user.id)

      await FirebaseService.updateEvent(event.id, { attendees: updatedAttendees })

      // Update local event state
      setEvent({
        ...event,
        attendees: updatedAttendees,
      })
    } catch (error) {
      console.error("Error updating attendance:", error)
      // Revert optimistic update on error
      setIsGoing(!isGoing)
      setAttendeeCount(event.attendees?.length || 0)
      Alert.alert("Error", "Failed to update attendance status")
    }
  }

  const handleBuyTicket = () => {
    if (!event) return

    // Navigate to TicketPurchaseScreen for actual ticket purchase
    // Both authenticated and unauthenticated users can access this screen
    navigation.navigate("TicketPurchase", { event })
  }

  const handleViewTicketContacts = () => {
    if (!event) return

    navigation.navigate("TicketContactScreen", { ticketContacts: event.ticketContacts })
  }

  const handleShare = async () => {
    if (!event) return

    try {
      const result = await Share.share({
        title: event.name,
        message: `Check out ${event.name} at ${event.venueName} on ${event.date.toDateString()}! ${event.description}`,
        url: event.posterImageUrl, // This will only work on iOS
      })

      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          console.log(`Shared via ${result.activityType}`)
        } else {
          console.log("Shared successfully")
        }
      } else if (result.action === Share.dismissedAction) {
        console.log("Share dismissed")
      }
    } catch (error) {
      console.error("Error sharing event:", error)
      Alert.alert("Error", "Failed to share event")
    }
  }

  const handleImageDoubleTap = () => {
    setShowFullImage(true)
  }

  const formatDateRange = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }
    return date.toLocaleDateString("en-US", options).toUpperCase()
  }

  // Handle delete event for admin
  const handleDeleteEvent = async () => {
    if (!event) return
    
    try {
      console.log("[EventDetailScreen] Deleting event:", event.id)
      await FirebaseService.deleteEvent(event.id)
      console.log("[EventDetailScreen] Event deleted successfully")
      Alert.alert("Success", "Event deleted successfully")
      navigation.goBack()
    } catch (error) {
      console.error("[EventDetailScreen] Error deleting event:", error)
      Alert.alert("Error", "Failed to delete event")
    }
  }

  // Load organizer payment details
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

  // Load event creator's payment details (for admin view)
  const loadEventCreatorPaymentDetails = async (creatorId: string) => {
    try {
      const userData = await FirebaseService.getUserProfile(creatorId)
      return userData?.paymentDetails || null
    } catch (error) {
      console.error("Error loading organizer payment details:", error)
      return null
    }
  }

  // Handle withdraw earnings
  const handleWithdraw = async () => {
    if (!user || !withdrawAmount || parseInt(withdrawAmount) <= 0) {
      Alert.alert("Error", "Please enter a valid amount")
      return
    }

    const amount = parseInt(withdrawAmount)
    if (amount > eligiblePayoutTotal) {
      Alert.alert("Error", "Amount exceeds eligible balance")
      return
    }

    setWithdrawLoading(true)
    try {
      console.log("💰 Initiating payout withdrawal:")
      console.log("   - Organizer ID:", user.id)
      console.log("   - Event ID:", eventId)
      console.log("   - Amount:", amount)

      // Get payout eligible tickets for this organizer's events
      const eligibleTickets = await FirebaseService.getEligibleTicketsForPayout(user.id)
      
      if (eligibleTickets.length === 0) {
        Alert.alert("Error", "No eligible tickets found for payout")
        setWithdrawLoading(false)
        return
      }

      // Calculate total venue revenue from eligible tickets
      const totalVenueRevenue = eligibleTickets.reduce((sum, t) => sum + (t.venueRevenue || 0), 0)
      
      if (totalVenueRevenue < amount) {
        Alert.alert("Error", "Insufficient eligible balance")
        setWithdrawLoading(false)
        return
      }

      // For now, we'll simulate a successful payout
      // In production, this would call PesaPalService.processPayout()
      console.log("💰 Processing payout via PesaPal...")
      
      // Simulate payout processing
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Add to payout history
      const payoutRecord = {
        date: new Date().toLocaleDateString(),
        amount: `UGX ${amount.toLocaleString()}`,
        status: "Completed"
      }
      setPayoutHistory(prev => [payoutRecord, ...prev])

      // Update eligible total
      setEligiblePayoutTotal(prev => prev - amount)

      // Show success
      Alert.alert("Success", `Successfully withdrew UGX ${amount.toLocaleString()}`)
      setShowWithdrawModal(false)
      setWithdrawAmount("")

    } catch (error: any) {
      console.error("❌ Payout error:", error)
      Alert.alert("Error", error?.message || "Failed to process payout")
    } finally {
      setWithdrawLoading(false)
    }
  }

  // Save organizer payment details
  const handleSavePaymentDetails = async () => {
    if (!event) return
    try {
      // Build mobile money array from form
      const mobileMoney: Array<{ provider: "mtn" | "airtel"; number: string; name: string }> = []
      if (editForm.mobileNumber && editForm.mobileName) {
        mobileMoney.push({
          provider: editForm.mobileProvider === "airtel" ? "airtel" : "mtn",
          number: editForm.mobileNumber,
          name: editForm.mobileName
        })
      }
      
      // Build bank accounts array from form
      const bankAccounts: Array<{ bankName: string; accountNumber: string; accountName: string }> = []
      if (editForm.bankName && editForm.bankNumber && editForm.bankNameAccount) {
        bankAccounts.push({
          bankName: editForm.bankName,
          accountNumber: editForm.bankNumber,
          accountName: editForm.bankNameAccount
        })
      }
      
      const paymentMethods = { mobileMoney, bankAccounts }
      
      // Update the event with new payment methods
      await FirebaseService.updateEvent(event.id, { paymentMethods })
      
      // Update local state
      setEvent({ ...event, paymentMethods })
      setIsEditingPayment(false)
      Alert.alert("Success", "Payment details updated successfully")
    } catch (error) {
      console.error("Error saving payment details:", error)
      Alert.alert("Error", "Failed to save payment details")
    }
  }

  // Handle edit button press - populate form with existing values
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
        bankNameAccount: bank?.accountName || ""
      })
    }
    setIsEditingPayment(true)
  }

  // Initialize payment details when dashboard opens
  useEffect(() => {
    if (showOrganizerDashboard) {
      loadPaymentDetails()
      // Load event creator's payment details for admin view
      if (user?.userType === 'admin' && event?.createdBy) {
        loadEventCreatorPaymentDetails(event.createdBy)
      }
    }
  }, [showOrganizerDashboard, user, event])

  // Real-time ticket sales and validations listener
  useEffect(() => {
    if (!showOrganizerDashboard || !eventId) return

    console.log("📡 Setting up real-time listeners for organizer dashboard...")

    // Listen for NEW ticket purchases (removed orderBy to avoid index requirement)
    const ticketsQuery = query(
      collection(db, "YoVibe/data/tickets"),
      where("eventId", "==", eventId)
    )

    const unsubscribeTickets = onSnapshot(ticketsQuery, (snapshot) => {
      console.log("📡 Real-time: Ticket sales updated!")
      let earlyCount = 0
      let lateCount = 0
      let totalRevenue = 0
      let eligibleTotal = 0
      
      // Initialize sales by entry fee type
      const salesByType: TicketSalesByType = {}
      
      // Initialize with event entry fees if available
      if (event?.entryFees) {
        event.entryFees.forEach((fee: { name: string; amount: string }) => {
          salesByType[fee.name] = {
            early: { count: 0, revenue: 0 },
            late: { count: 0, revenue: 0 },
            scanned: { count: 0, revenue: 0 }
          }
        })
      }

      // Sort tickets by purchaseDate descending (client-side since we removed orderBy)
      const tickets = []
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
        const isEligible = ticket.payoutEligible === true
        
        if (isLate) {
          lateCount++
        } else {
          earlyCount++
        }
        totalRevenue += amount
        
        // Track eligible payout (venueRevenue from eligible tickets)
        if (isEligible) {
          eligibleTotal += ticket.venueRevenue || 0
        }
        
        // Track by entry fee type
        if (!salesByType[ticketType]) {
          salesByType[ticketType] = {
            early: { count: 0, revenue: 0 },
            late: { count: 0, revenue: 0 },
            scanned: { count: 0, revenue: 0 }
          }
        }
        
        if (isLate) {
          salesByType[ticketType].late.count++
          salesByType[ticketType].late.revenue += amount
        } else {
          salesByType[ticketType].early.count++
          salesByType[ticketType].early.revenue += amount
        }
        
        // Track scanned tickets separately
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

      console.log("📡 Real-time: Early tickets:", earlyCount, "Late tickets:", lateCount, "Revenue:", totalRevenue, "Eligible:", eligibleTotal)
      console.log("📡 Real-time: Sales by type:", JSON.stringify(salesByType))
    }, (error) => {
      console.error("📡 Real-time listener error for tickets:", error)
    })

    // Listen for ticket validations/scans
    const validationsQuery = query(
      collection(db, "YoVibe/data/ticketValidations"),
      orderBy("validatedAt", "desc")
    )

    const unsubscribeValidations = onSnapshot(validationsQuery, (snapshot) => {
      console.log("📡 Real-time: Ticket validations updated!")
      const logs: Array<{ time: string; ticketId: string; status: string }> = []

      snapshot.forEach((doc) => {
        const validation = doc.data()
        logs.push({
          time: validation.validatedAt ? new Date(validation.validatedAt.seconds * 1000).toLocaleTimeString() : new Date().toLocaleTimeString(),
          ticketId: validation.ticketId ? validation.ticketId.substring(0, 8) + "..." : "Unknown",
          status: validation.status === "granted" ? "Valid" : "Invalid"
        })
      })

      setScanLogs(logs.slice(0, 10))
      console.log("📡 Real-time: Scan logs updated, count:", logs.length)
    }, (error) => {
      console.error("📡 Real-time listener error for validations:", error)
    })

    // Cleanup listeners on unmount or when dashboard closes
    return () => {
      console.log("📡 Cleaning up real-time listeners...")
      unsubscribeTickets()
      unsubscribeValidations()
    }
  }, [showOrganizerDashboard, eventId])

  // Inject JSON-LD structured data for SEO
  useEffect(() => {
    if (!event) return
    
    const eventJsonLd = {
      "@context": "https://schema.org",
      "@type": "Event",
      "name": event.name,
      "description": event.description || `Join us at ${event.venueName} for an amazing event`,
      "startDate": event.date.toISOString(),
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
      "eventStatus": "https://schema.org/EventScheduled",
      "location": {
        "@type": "Place",
        "name": event.venueName,
        "address": {
          "@type": "PostalAddress",
          "addressLocality": event.location || "Kampala",
          "addressCountry": "UG"
        }
      },
      "image": event.posterImageUrl,
      "offers": event.isFreeEntry ? {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "UGX",
        "availability": "https://schema.org/InStock"
      } : {
        "@type": "Offer",
        "price": event.entryFees[0]?.amount || "0",
        "priceCurrency": "UGX",
        "availability": "https://schema.org/InStock"
      },
      "organizer": {
        "@type": "Organization",
        "name": "YoVibe",
        "url": "https://yovibe.net"
      }
    }
    
    // Create or update JSON-LD script
    const scriptId = 'event-json-ld'
    let script = document.getElementById(scriptId) as HTMLScriptElement | null
    if (!script) {
      script = document.createElement('script')
      script.id = scriptId
      script.type = 'application/ld+json'
      document.head.appendChild(script)
    }
    script.textContent = JSON.stringify(eventJsonLd)
    
    return () => {
      const existingScript = document.getElementById(scriptId)
      if (existingScript) {
        existingScript.remove()
      }
    }
  }, [event])

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading event details...</Text>
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

  const isEventOwner = user && event.createdBy === user.id

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity onPress={handleImageDoubleTap} activeOpacity={0.9}>
        <ImageBackground 
          source={{ uri: event.posterImageUrl }} 
          style={styles.headerImage}
          aria-label={`Event poster for ${event.name}`}
          accessibilityLabel={`Event poster for ${event.name}`}
        >
          <View style={styles.headerOverlay}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.eventHeaderInfo}>
              <Text style={styles.eventName}>{event.name}</Text>
              <Text style={styles.eventLocation}>
                {event.location || event.venueName.toUpperCase()} • {formatDateRange(event.date)}
              </Text>

              <View style={styles.eventMeta}>
                {attendeeCount > 0 && (
                  <View style={styles.attendeeCount}>
                    <Ionicons name="people" size={16} color="#FFFFFF" />
                    <Text style={styles.attendeeCountText}>{attendeeCount} going</Text>
                  </View>
                )}
                <Text style={styles.entryFee}>
                  {event.isFreeEntry ? "Free" : event.entryFees.map((fee) => `${fee.name}: ${fee.amount}`).join(", ")}
                </Text>
              </View>
            </View>
          </View>
        </ImageBackground>
      </TouchableOpacity>

      {/* Full Image Modal */}
      <Modal visible={showFullImage} transparent={true} animationType="fade">
        <View style={styles.fullImageModal}>
          <TouchableOpacity style={styles.fullImageCloseButton} onPress={() => setShowFullImage(false)}>
            <Ionicons name="close" size={30} color="#FFFFFF" />
          </TouchableOpacity>
          <Image source={{ uri: event.posterImageUrl }} style={styles.fullImage} resizeMode="contain" />
        </View>
      </Modal>

      {/* Withdraw Modal */}
      <Modal visible={showWithdrawModal} transparent={true} animationType="fade">
        <View style={styles.fullImageModal}>
          <View style={styles.withdrawModalContent}>
            <Text style={styles.withdrawModalTitle}>Withdraw Earnings</Text>
            <Text style={styles.withdrawModalSubtitle}>
              Available: UGX {eligiblePayoutTotal.toLocaleString()}
            </Text>
            
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

      <View style={styles.contentContainer}>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.actionButton, isGoing && styles.goingButton]} onPress={handleToggleGoing}>
            <Ionicons
              name={isGoing ? "checkmark-circle" : "calendar-outline"}
              size={20}
              color={isGoing ? "#FFFFFF" : "#2196F3"}
            />
            <Text style={[styles.actionButtonText, isGoing && styles.goingButtonText]}>
              {isGoing ? "I'm Going" : "I'm Going"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <Ionicons name="share-social-outline" size={20} color="#2196F3" />
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>
        </View>

        {/* Organiser Dashboard - Show for event owners AND admins */}
        {(isEventOwner || user?.userType === "admin") && (
          <View style={styles.ownerControls}>
            <TouchableOpacity style={styles.ownerButton} onPress={() => setShowOrganizerDashboard(true)}>
              <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
              <Text style={styles.ownerButtonText}>Organiser Dashboard</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {/* Delete Event - Admin only */}
        {user?.userType === "admin" && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => {
              // Use a simple confirm dialog instead of Alert.alert for web compatibility
              const confirmed = window.confirm("Are you sure you want to delete this event? This action cannot be undone.")
              
              if (confirmed) {
                handleDeleteEvent()
              }
            }}
          >
            <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
            <Text style={styles.deleteButtonText}>Delete Event</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.venueContainer}
          onPress={() => {
            const venueId = event.venueId

            // Preferred: navigate directly to VenueDetail if it's registered in the same navigator
            try {
              navigation.navigate("VenueDetail", { venueId })
              return
            } catch (e) {
              // ignore and try nested navigation below
            }

            // Fallback for cross-stack navigation: cast to any to satisfy TypeScript
            // (keeps runtime behavior of navigating to Venues -> VenueDetail)
            ;(navigation as any).navigate("Venues", {
              screen: "VenueDetail",
              params: { venueId },
            })
          }}
        >
          <Ionicons name="location" size={20} color="#2196F3" />
          <Text style={styles.venueName}>{event.venueName}</Text>
        </TouchableOpacity>


        <View style={styles.dateContainer}>
          <Ionicons name="calendar" size={20} color="#FFFFFF" />
          <Text style={styles.dateText}>{event.date.toDateString()}</Text>
        </View>

        <Text style={styles.sectionTitle}>About this event</Text>
        <Text style={styles.description}>{event.description}</Text>

        <Text style={styles.sectionTitle}>Artists</Text>
        <View style={styles.artistsContainer}>
          {event.artists.map((artist, index) => (
            <View key={index} style={styles.artistTag}>
              <Text style={styles.artistText}>{artist}</Text>
            </View>
          ))}
        </View>

        {/* Ticket Contact Button - Now above Buy Tickets */}
        <TouchableOpacity style={styles.button} onPress={handleViewTicketContacts}>
          <Ionicons name="call-outline" size={20} color="#FFFFFF" />
          <Text style={styles.buttonText}>Ticket Contact</Text>
        </TouchableOpacity>

        {/* Buy Tickets Button - Only visible to Admins */}
        {user?.userType === "admin" && (
        <TouchableOpacity style={styles.button} onPress={handleBuyTicket}>
          <Ionicons name="ticket-outline" size={20} color="#FFFFFF" />
          <Text style={styles.buttonText}>Buy Tickets</Text>
        </TouchableOpacity>
        )}

      </View>

      {/* Organizer Dashboard Modal */}
      <Modal
        visible={showOrganizerDashboard}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowOrganizerDashboard(false)}
      >
        <View style={styles.dashboardContainer}>
          <View style={styles.dashboardHeader}>
            <Text style={styles.dashboardTitle}>Dashboard</Text>
            <TouchableOpacity onPress={() => setShowOrganizerDashboard(false)}>
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.dashboardContent}>
            {/* Dashboard Tabs */}
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
                {/* Organizer Dashboard Content */}
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
                    <Text style={styles.scannerButtonText}>
                      Tap to scan and validate tickets at event entrances
                    </Text>
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
                
                {/* Ticket Sales by Entry Fee Type */}
                <View style={styles.dashboardSection}>
                  <Text style={styles.dashboardSectionTitle}>Sales by Ticket Type</Text>
                  <View style={styles.salesTable}>
                    {/* Table Header */}
                    <View style={styles.salesTableHeader}>
                      <Text style={[styles.salesTableHeaderText, styles.salesTableCell1]}>Type</Text>
                      <Text style={[styles.salesTableHeaderText, styles.salesTableCell2]}>Early</Text>
                      <Text style={[styles.salesTableHeaderText, styles.salesTableCell2]}>Late</Text>
                      <Text style={[styles.salesTableHeaderText, styles.salesTableCell2]}>Scanned</Text>
                    </View>
                    
                    {/* Table Rows - Sales by Entry Fee Type */}
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
                    
                    {/* Summary Row */}
                    {Object.keys(ticketSalesByType).length > 0 && (
                      <View style={styles.salesTableSummary}>
                        <Text style={[styles.salesTableSummaryText, styles.salesTableCell1]}>TOTAL</Text>
                        <View style={styles.salesTableCell2}>
                          <Text style={styles.salesTableSummaryCount}>
                            {Object.values(ticketSalesByType).reduce((sum, s) => sum + s.early.count, 0)}
                          </Text>
                          <Text style={styles.salesTableSummaryRevenue}>
                            UGX {Object.values(ticketSalesByType).reduce((sum, s) => sum + s.early.revenue, 0).toLocaleString()}
                          </Text>
                        </View>
                        <View style={styles.salesTableCell2}>
                          <Text style={styles.salesTableSummaryCount}>
                            {Object.values(ticketSalesByType).reduce((sum, s) => sum + s.late.count, 0)}
                          </Text>
                          <Text style={styles.salesTableSummaryRevenue}>
                            UGX {Object.values(ticketSalesByType).reduce((sum, s) => sum + s.late.revenue, 0).toLocaleString()}
                          </Text>
                        </View>
                        <View style={styles.salesTableCell2}>
                          <Text style={styles.salesTableSummaryCount}>
                            {Object.values(ticketSalesByType).reduce((sum, s) => sum + (s.scanned?.count || 0), 0)}
                          </Text>
                          <Text style={styles.salesTableSummaryRevenue}>
                            UGX {Object.values(ticketSalesByType).reduce((sum, s) => sum + (s.scanned?.revenue || 0), 0).toLocaleString()}
                          </Text>
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

                {/* Payment Details Section - Organizer Tab */}
                <View style={styles.dashboardSection}>
                  <Text style={styles.dashboardSectionTitle}>Payment Details</Text>
                  <View style={styles.dashboardCard}>
                    {isEditingPayment ? (
                      <View>
                        <Text style={styles.dashboardLabel}>Mobile Money</Text>
                        <View style={styles.inputContainer}>
                          <TouchableOpacity 
                            style={[styles.providerButton, editForm.mobileProvider === 'mtn' && styles.providerButtonActive]}
                            onPress={() => setEditForm({...editForm, mobileProvider: 'mtn'})}
                          >
                            <Text style={styles.providerButtonText}>MTN</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={[styles.providerButton, editForm.mobileProvider === 'airtel' && styles.providerButtonActive]}
                            onPress={() => setEditForm({...editForm, mobileProvider: 'airtel'})}
                          >
                            <Text style={styles.providerButtonText}>Airtel</Text>
                          </TouchableOpacity>
                        </View>
                        <TextInput
                          style={styles.input}
                          placeholder="Phone Number (e.g., +2567...)"
                          value={editForm.mobileNumber}
                          onChangeText={(text) => setEditForm({...editForm, mobileNumber: text})}
                          placeholderTextColor="#888"
                          keyboardType="phone-pad"
                        />
                        <TextInput
                          style={styles.input}
                          placeholder="Account Name"
                          value={editForm.mobileName}
                          onChangeText={(text) => setEditForm({...editForm, mobileName: text})}
                          placeholderTextColor="#888"
                        />
                        <Text style={[styles.dashboardLabel, { marginTop: 16 }]}>Bank Account</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="Bank Name"
                          value={editForm.bankName}
                          onChangeText={(text) => setEditForm({...editForm, bankName: text})}
                          placeholderTextColor="#888"
                        />
                        <TextInput
                          style={styles.input}
                          placeholder="Account Number"
                          value={editForm.bankNumber}
                          onChangeText={(text) => setEditForm({...editForm, bankNumber: text})}
                          placeholderTextColor="#888"
                          keyboardType="numeric"
                        />
                        <TextInput
                          style={styles.input}
                          placeholder="Account Name"
                          value={editForm.bankNameAccount}
                          onChangeText={(text) => setEditForm({...editForm, bankNameAccount: text})}
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
                                    <Text style={styles.paymentDetailText}>
                                      {mm.provider.toUpperCase()} - {mm.number}
                                    </Text>
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
                                    <Text style={styles.paymentDetailText}>
                                      {bank.bankName} - {bank.accountNumber}
                                    </Text>
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
                {/* Admin Dashboard Content */}
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

                {/* Organizer Payment Details - Admin View */}
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
                                <Text style={styles.paymentDetailText}>
                                  {mm.provider.toUpperCase()} - {mm.number}
                                </Text>
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
                                <Text style={styles.paymentDetailText}>
                                  {bank.bankName} - {bank.accountNumber}
                                </Text>
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
        </View>
      </Modal>
      
      {/* Scanner Input Modal */}
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
              
              <TouchableOpacity 
                style={styles.scannerModalValidateButton}
                onPress={handleScannerSubmit}
                disabled={!scannerInput.trim()}
              >
                <Text style={styles.scannerModalValidateText}>Validate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

// Responsive helper function (uses already-declared breakpoints from line 26-29)
const responsiveSize = (small: number, medium: number, large: number) => {
  if (isLargeScreen) return large;
  if (isTablet) return medium;
  return small;
};

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
    fontSize: responsiveSize(14, 16, 18),
  },
  headerImage: {
    width: "100%",
    height: responsiveSize(240, 300, 360),
  },
  headerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "space-between",
    padding: responsiveSize(12, 14, 18),
    paddingTop: Platform.OS === "ios" ? responsiveSize(40, 50, 60) : responsiveSize(12, 14, 18),
  },
  backButton: {
    width: responsiveSize(36, 40, 48),
    height: responsiveSize(36, 40, 48),
    borderRadius: responsiveSize(18, 20, 24),
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.3)",
  },
  eventHeaderInfo: {
    marginBottom: responsiveSize(12, 14, 18),
  },
  eventName: {
    fontSize: responsiveSize(22, 26, 32),
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: responsiveSize(6, 8, 12),
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  eventLocation: {
    fontSize: responsiveSize(13, 15, 17),
    color: "#FFFFFF",
    marginBottom: responsiveSize(6, 8, 10),
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  eventMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  attendeeCount: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: responsiveSize(8, 10, 12),
    marginBottom: responsiveSize(4, 6, 8),
  },
  attendeeCountText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(12, 13, 14),
    marginLeft: responsiveSize(4, 5, 6),
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  entryFee: {
    color: "#FFD700",
    fontWeight: "bold",
    fontSize: responsiveSize(13, 15, 17),
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  fullImageModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullImageCloseButton: {
    position: "absolute",
    top: responsiveSize(30, 40, 50),
    right: responsiveSize(15, 20, 25),
    zIndex: 1,
    padding: responsiveSize(8, 10, 12),
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: responsiveSize(20, 24, 28),
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
  fullImage: {
    width: "100%",
    height: "100%",
  },
  contentContainer: {
    padding: responsiveSize(12, 16, 24),
    paddingBottom: responsiveSize(54, 60, 68), // Match bottom navbar height
    maxWidth: isLargeScreen ? 900 : "100%",
    alignSelf: "center",
    width: "100%",
  },
  actionButtons: {
    flexDirection: "row",
    marginBottom: responsiveSize(14, 18, 24),
    gap: responsiveSize(8, 10, 12),
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E1E1E",
    paddingVertical: responsiveSize(10, 12, 16),
    paddingHorizontal: responsiveSize(14, 18, 24),
    borderRadius: responsiveSize(6, 8, 12),
    marginRight: 0,
    flex: 1,
  },
  goingButton: {
    backgroundColor: "#2196F3",
  },
  actionButtonText: {
    color: "#2196F3",
    fontWeight: "bold",
    marginLeft: responsiveSize(6, 8, 10),
    fontSize: responsiveSize(12, 14, 15),
  },
  goingButtonText: {
    color: "#FFFFFF",
  },
  ownerControls: {
    marginBottom: responsiveSize(14, 18, 24),
  },
  ownerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    paddingVertical: responsiveSize(10, 12, 16),
    paddingHorizontal: responsiveSize(14, 18, 24),
    borderRadius: responsiveSize(6, 8, 12),
    marginBottom: responsiveSize(8, 10, 12),
  },
  ownerButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    marginLeft: responsiveSize(6, 8, 10),
    fontSize: responsiveSize(13, 14, 15),
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
  venueContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: responsiveSize(8, 10, 14),
    paddingVertical: responsiveSize(6, 8, 10),
    paddingHorizontal: responsiveSize(8, 10, 12),
    backgroundColor: "rgba(33, 150, 243, 0.1)",
    borderRadius: responsiveSize(6, 8, 12),
    borderWidth: 1,
    borderColor: "rgba(33, 150, 243, 0.2)",
  },
  venueName: {
    fontSize: responsiveSize(13, 15, 17),
    color: "#2196F3",
    marginLeft: responsiveSize(6, 8, 10),
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: responsiveSize(12, 16, 20),
    paddingVertical: responsiveSize(6, 8, 10),
    paddingHorizontal: responsiveSize(8, 10, 12),
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: responsiveSize(6, 8, 12),
  },
  dateText: {
    fontSize: responsiveSize(13, 15, 17),
    color: "#FFFFFF",
    marginLeft: responsiveSize(6, 8, 10),
  },
  sectionTitle: {
    fontSize: responsiveSize(16, 20, 24),
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: responsiveSize(12, 16, 20),
    marginBottom: responsiveSize(6, 8, 12),
  },
  description: {
    fontSize: responsiveSize(13, 15, 16),
    color: "#DDDDDD",
    lineHeight: responsiveSize(20, 22, 26),
  },
  artistsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: responsiveSize(6, 8, 12),
    gap: responsiveSize(6, 8, 10),
  },
  artistTag: {
    backgroundColor: "#2196F3",
    paddingHorizontal: responsiveSize(10, 12, 16),
    paddingVertical: responsiveSize(5, 6, 8),
    borderRadius: responsiveSize(16, 18, 20),
  },
  artistText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(12, 13, 14),
  },
  button: {
    backgroundColor: "#2196F3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: responsiveSize(44, 48, 54),
    borderRadius: responsiveSize(6, 8, 12),
    marginTop: responsiveSize(16, 20, 28),
    marginBottom: responsiveSize(16, 20, 28),
  },
  buttonText: {
    color: "white",
    fontSize: responsiveSize(13, 15, 16),
    fontWeight: "bold",
    marginLeft: responsiveSize(6, 8, 10),
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF3B30",
    paddingVertical: responsiveSize(10, 12, 16),
    paddingHorizontal: responsiveSize(14, 18, 24),
    borderRadius: responsiveSize(6, 8, 12),
    marginTop: responsiveSize(12, 16, 20),
  },
  deleteButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    marginLeft: responsiveSize(6, 8, 10),
    fontSize: responsiveSize(13, 14, 15),
  },
  // Dashboard Styles
  dashboardContainer: {
    flex: 1,
    backgroundColor: "#0D0D0D",
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
})

export default EventDetailScreen
