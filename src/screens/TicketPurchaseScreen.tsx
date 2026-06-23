"use client"

import type React from "react"
import { useState, useMemo, useEffect, useRef } from "react"
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView, TextInput, Image, Modal, FlatList, Animated, Platform, Linking } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useCompatNavigation } from "../utils/compatNavigation"
import { useRouter } from "../utils/URLRouter"

import { useAuth } from "../contexts/AuthContext"
import TicketService from "../services/TicketService"
import PaymentService from "../services/PaymentService"
import PesaPalService from "../services/PesaPalService"
import PawaPayService from "../services/PawaPayService"
import SupabaseService from "../services/SupabaseService"
import * as ImagePicker from "expo-image-picker"
import type { Event } from "../models/Event"

const TicketPurchaseScreen: React.FC = () => {
  const navigation = useCompatNavigation()
  const { currentPath } = useRouter()

  // Extract eventId from current path: /events/tickets/:eventId
  const pathParts = currentPath.split('/').filter(Boolean)
  const eventId = pathParts[2] // events/tickets/:eventId, so [events, tickets, eventId]
  const { user } = useAuth()

  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [pageLoading, setPageLoading] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [photoCaptured, setPhotoCaptured] = useState(false)
  const [buyerPhotoUrl, setBuyerPhotoUrl] = useState("")
  const [securityPhotoEnabled, setSecurityPhotoEnabled] = useState(false)
  
  // Ticket type selection state
  const [selectedTicketType, setSelectedTicketType] = useState<{ name: string; amount: string } | null>(null)
  const [showTicketTypeModal, setShowTicketTypeModal] = useState(false)
  
  // Load event data
  useEffect(() => {
    const loadEvent = async () => {
      if (!eventId) {
        setLoading(false)
        return
      }

      try {
        const eventData = await SupabaseService.getEventById(eventId)
        if (eventData) {
          setEvent(eventData)
        }
      } catch (error) {
        console.error("Error loading event for ticket purchase:", error)
      } finally {
        setLoading(false)
      }
    }

    loadEvent()
  }, [eventId])

  // Get ticket types from event entry fees
  const ticketTypes = event?.entryFees && event.entryFees.length > 0 ? event.entryFees : []
  
  // Get the selected ticket type name
  const selectedTicketTypeName = selectedTicketType?.name || (ticketTypes.length > 0 ? ticketTypes[0].name : "Standard")

  // Calculate table entry details
  const selectedEntryFee = ticketTypes.length > 0 ? ticketTypes.find(t => t.name === selectedTicketTypeName) : null
  const isTableEntry = selectedEntryFee?.isTable ?? false
  const tableSize = selectedEntryFee?.tableSize ?? 1
  const actualTicketCount = isTableEntry ? quantity * tableSize : quantity

  // Visitor info for unauthenticated users
  const [visitorName, setVisitorName] = useState("")
  const [visitorEmail, setVisitorEmail] = useState("")
  const [visitorPhone, setVisitorPhone] = useState("")
  
  // Buyer names for each ticket (when quantity > 1)
  const [buyerNames, setBuyerNames] = useState<string[]>(() => {
    const initialCount = actualTicketCount
    return Array(initialCount).fill("")
  })
  const [buyerEmails, setBuyerEmails] = useState<string[]>(() => {
    const initialCount = actualTicketCount
    return Array(initialCount).fill("")
  })
  const [emailDistribution, setEmailDistribution] = useState<"single" | "multiple">("single")
  
  // Initialize buyer names/emails when actualTicketCount changes
  useEffect(() => {
    setBuyerNames(prev => {
      const newNames = [...prev]
      while (newNames.length < actualTicketCount) {
        newNames.push("")
      }
      return newNames.slice(0, actualTicketCount)
    })
    setBuyerEmails(prev => {
      const newEmails = [...prev]
      while (newEmails.length < actualTicketCount) {
        newEmails.push("")
      }
      return newEmails.slice(0, actualTicketCount)
    })
  }, [actualTicketCount])
  
  // Payment method state
  const [paymentMethod, setPaymentMethod] = useState<"mobile_money" | "credit_card" | "bank_transfer" | null>(null)
  const [mobileMoneyProvider, setMobileMoneyProvider] = useState<"mtn" | "airtel">("mtn")
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState("")
  const [mobileMoneyName, setMobileMoneyName] = useState("")
  const [cardNumber, setCardNumber] = useState("")
  const [cardExpiry, setCardExpiry] = useState("")
  const [cardCvv, setCardCvv] = useState("")
  const [bankName, setBankName] = useState("")
  const [bankAccountNumber, setBankAccountNumber] = useState("")
  const [bankAccountName, setBankAccountName] = useState("")
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null)
  const [pawaPayDepositId, setPawaPayDepositId] = useState<string | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "completed" | "failed" | null>(null)
  const [purchaseStatus, setPurchaseStatus] = useState<"success" | "error" | null>(null)
  const [statusMessage, setStatusMessage] = useState("")
  const [checkingPayment, setCheckingPayment] = useState(false)
  const bannerOpacity = useRef(new Animated.Value(0)).current

  // Auto-hide banner after 3 seconds
  useEffect(() => {
    if (purchaseStatus !== null) {
      console.log("[BANNER] purchaseStatus changed to:", purchaseStatus, "message:", statusMessage)
      Animated.timing(bannerOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start()

      const timeout = setTimeout(() => {
        Animated.timing(bannerOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        }).start(() => {
          setPurchaseStatus(null)
          setStatusMessage("")
        })
      }, 3000)

      return () => clearTimeout(timeout)
    }
  }, [purchaseStatus])

  const handlePaymentComplete = async () => {
    if (!paymentOrderId) return

    try {
      setCheckingPayment(true)
      setShowPaymentModal(false)

      let verificationResult
      let isMobileMoney = paymentMethod === "mobile_money"
      
      if (isMobileMoney) {
        console.log("🔍 Checking PawaPay deposit status (polling)...")
        
        // Poll for status up to 30 seconds
        let attempts = 0
        const maxAttempts = 15
        let status = "PENDING"
        
        while (attempts < maxAttempts && (status === "PENDING" || status === "PROCESSING")) {
          await new Promise(resolve => setTimeout(resolve, 2000))
          attempts++
          verificationResult = await PawaPayService.checkDepositStatus(paymentOrderId)
          status = (verificationResult.status || "").toUpperCase()
          console.log(`   Attempt ${attempts}: Status = ${status}`)
        }
        
        console.log("✅ Final status:", status)
      } else {
        console.log("🔍 Verifying payment with PesaPal...")
        verificationResult = await PesaPalService.verifyPayment(paymentOrderId)
      }

      const resultStatus = (verificationResult.status || "").toUpperCase()
      if (resultStatus === "COMPLETED") {
        console.log("✅ Payment verified, creating ticket...")
        await createTicketAndNavigate(isMobileMoney, verificationResult)
      } else if (resultStatus === "FAILED") {
        const failMsg = verificationResult.failureMessage || "Payment was rejected. Please try again."
        Alert.alert("Payment Failed", failMsg, [{ text: "OK" }])
      } else {
        const errorMsg = isMobileMoney 
          ? "Payment is still processing. Please check your mobile money and try again."
          : "Payment is still processing. Please check back later."
        Alert.alert("Processing", errorMsg, [{ text: "OK" }])
      }

    } catch (error: any) {
      console.error("Payment completion error:", error)
      Alert.alert("Error", "Failed to complete purchase. Please contact support.", [{ text: "OK" }])
    } finally {
      setCheckingPayment(false)
    }
  }

  const createTicketAndNavigate = async (isMobileMoney: boolean, verificationResult: any) => {
    try {
      setLoading(true)
      
      const includePhoto = securityPhotoEnabled && photoCaptured
      const buyerNamesList = getBuyerNames()
      const buyerEmailsList = getBuyerEmails()
      const ticketCount = actualTicketCount

      const tickets = await TicketService.purchaseTicketsForTable(
        event!,
        buyerNamesList,
        buyerEmailsList,
        ticketCount,
        isTableEntry,
        tableSize,
        quantity,
        includePhoto ? buyerPhotoUrl : "",
        total,
        {
          method: paymentMethod || "mobile_money",
          provider: paymentMethod === "mobile_money" ? mobileMoneyProvider : undefined,
          number: paymentMethod === "mobile_money" ? mobileMoneyNumber : undefined,
          name: paymentMethod === "mobile_money" ? mobileMoneyName : undefined,
          expiry: paymentMethod === "credit_card" ? cardExpiry : undefined,
          cardNumber: paymentMethod === "credit_card" ? cardNumber.slice(-4) : undefined,
          bankName: paymentMethod === "bank_transfer" ? bankName : undefined,
          accountNumber: paymentMethod === "bank_transfer" ? bankAccountNumber : undefined,
          accountName: paymentMethod === "bank_transfer" ? bankAccountName : undefined,
          ticketType: selectedTicketTypeName,
          paymentReference: paymentOrderId || undefined,
          pesapalTransactionId: !isMobileMoney ? verificationResult.transactionId : undefined,
        }
      )

      // Fire-and-forget email sending
      setTimeout(async () => {
        const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://yovibe.net"
        
        for (const ticket of tickets) {
          try {
            const photoUploadLink = ticket.photoUploadToken 
              ? `${baseUrl}/add-photo?ticket=${ticket.id}&token=${ticket.photoUploadToken}`
              : undefined
            
            await fetch(`/.netlify/functions/send-ticket-email`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                buyerEmail: ticket.buyerEmail,
                buyerName: ticket.buyerName,
                eventName: ticket.eventName,
                ticketType: ticket.entryFeeType,
                venue: ticket.venueName,
                date: ticket.eventStartTime.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
                time: ticket.eventStartTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                quantity: ticket.quantity,
                amountPaid: `UGX ${ticket.totalAmount.toLocaleString()}`,
                ticketRef: ticket.id,
                qrCodeDataUrl: ticket.qrCodeDataUrl,
                photoUploadLink,
              }),
            })
            console.log(`Email sent for ticket ${ticket.id}`)
          } catch (err) {
            console.error(`Failed to send email for ticket ${ticket.id}:`, err)
            Alert.alert("Notice", "Your ticket is ready! We had trouble emailing a copy — you can always find it under My Tickets.")
          }
        }
      }, 100)

      setPurchaseStatus("success")
      setStatusMessage(`${actualTicketCount} ticket${actualTicketCount > 1 ? "s" : ""} purchased successfully!`)
      
      setTimeout(() => {
        navigation.navigate("MyTickets")
      }, 1000)

    } catch (error: any) {
      console.error("Ticket creation error:", error)
      Alert.alert("Error", "Failed to create ticket. Please contact support.", [{ text: "OK" }])
    } finally {
      setLoading(false)
    }
  }

  // Get base price from selected ticket type or event entry fees
  // For table entries, calculate price per person from total table price
  const rawBasePrice = selectedTicketType
    ? Number.parseInt(selectedTicketType.amount?.replace(/[^0-9]/g, "") || "0")
    : event && event.entryFees && event.entryFees.length > 0
      ? Number.parseInt(event.entryFees[0].amount?.replace(/[^0-9]/g, "") || "0")
      : 0
  
  // For table entries: divide total table price by number of people
  const basePrice = isTableEntry && tableSize > 0 ? rawBasePrice / tableSize : rawBasePrice

  // Calculate prices with late fee using useMemo for efficiency
  const pricing = useMemo(() => {
    if (!event || !event.date) {
      return { subtotal: 0, lateFee: 0, total: 0, isLatePurchase: false }
    }
    return PesaPalService.calculateTicketPrice(basePrice, actualTicketCount, event.date)
  }, [basePrice, actualTicketCount, event?.date])

  const { subtotal, lateFee, total, isLatePurchase } = pricing
  const { appCommission, venueRevenue } = PaymentService.calculateRevenueSplit(total)
  
const updateBuyerName = (index: number, name: string) => {
    setBuyerNames(prev => {
      const newNames = [...prev]
      newNames[index] = name
      return newNames
    })
  }
  
  const updateBuyerEmail = (index: number, email: string) => {
    setBuyerEmails(prev => {
      const newEmails = [...prev]
      newEmails[index] = email
      return newEmails
    })
  }
  
  const getBuyerNames = (): string[] => {
    return buyerNames.slice(0, actualTicketCount).map(name => name.trim() || visitorName.trim())
  }
  
  const getBuyerEmails = (): string[] => {
    if (emailDistribution === "single") {
      const singleEmail = visitorEmail.trim() || buyerEmails[0]?.trim()
      if (!singleEmail) return Array(actualTicketCount).fill("")
      return Array(actualTicketCount).fill(singleEmail)
    }
    return buyerEmails.slice(0, actualTicketCount).map(email => email.trim())
  }
  
  const handleCapturePhoto = async () => {
    try {
      setLoading(true)

      // Request camera permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== "granted") {
        Alert.alert("Permission Required", "Camera permission is needed to capture your photo for verification.")
        return
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      })

      if (!result.canceled && result.assets[0]) {
        const photoUri = result.assets[0].uri
        setBuyerPhotoUrl(photoUri)
        setPhotoCaptured(true)
        Alert.alert("Success", "Photo captured successfully!")
      }
    } catch (error) {
      Alert.alert("Error", "Failed to capture photo")
    } finally {
      setLoading(false)
    }
  }

const handlePurchase = async () => {
    // Validate names for each ticket
    const buyerNamesList = getBuyerNames()
    const ticketCount = actualTicketCount
    
    for (let i = 0; i < ticketCount; i++) {
      if (!buyerNamesList[i]?.trim()) {
        Alert.alert("Name Required", `Please enter name for person ${i + 1}`)
        return
      }
    }

    // Determine buyer ID, email, and phone based on auth status
    let buyerId: string
    let buyerName: string
    let buyerEmail: string
    let buyerPhone: string
    
    if (user) {
      // Authenticated user - use their registered details
      buyerId = user.id
      buyerName = user.displayName || user.email || "Unknown"
      buyerEmail = user.email || ""
      // Try to get phone from payment details or leave empty
      buyerPhone = user?.paymentDetails?.mobileMoney?.phoneNumber || ""
    } else {
      // Unauthenticated user - require name, email, and phone
      if (!visitorName.trim()) {
        Alert.alert("Name Required", "Please enter your name")
        return
      }
      if (!visitorEmail.trim()) {
        Alert.alert("Email Required", "Please enter your email address")
        return
      }
      if (!visitorPhone.trim()) {
        Alert.alert("Phone Required", "Please enter your phone number for payment")
        return
      }
      
      // Generate unique visitor ID
      buyerId = `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      buyerName = visitorName.trim()
      buyerEmail = visitorEmail.trim()
      buyerPhone = visitorPhone.trim()
    }

    // Validate ticket type selection
    if (!selectedTicketType && ticketTypes.length > 0) {
      Alert.alert("Ticket Type Required", "Please select a ticket type")
      return
    }

    // Validate security photo if enabled
    const includePhoto = securityPhotoEnabled && photoCaptured
    if (securityPhotoEnabled && !photoCaptured) {
      Alert.alert("Photo Required", "Please capture your security photo or disable the security option")
      return
    }
    
    try {
      if (paymentMethod === "mobile_money") {
        // Handle mobile money payment via PawaPay
        const provider = mobileMoneyProvider === "mtn" ? "MTN_MOMO_UGA" : "AIRTEL_OAPI_UGA"
        
        console.log("💳 Initiating mobile money payment via PawaPay...")
        const depositResult = await PawaPayService.initiateDeposit(
          total,
          "UGX",
          mobileMoneyNumber,
          provider
        )

        if (!depositResult.success) {
          throw new Error(depositResult.error || "Failed to initiate mobile money payment")
        }

        console.log("✅ PawaPay deposit initiated:", depositResult.depositId)
        
        const depositId = depositResult.depositId!
        setPaymentOrderId(depositId)
        setPawaPayDepositId(depositId)
        setPaymentStatus("pending")
        setCheckingPayment(true)

        // Now poll for payment status in foreground
        let attempts = 0
        const maxAttempts = 15
        let status = "PENDING"
        let verificationResult: any
        let networkError = false
        
        while (attempts < maxAttempts && (status === "PENDING" || status === "PROCESSING")) {
          try {
            await new Promise(resolve => setTimeout(resolve, 2000))
            attempts++
            verificationResult = await PawaPayService.checkDepositStatus(depositId)
            status = (verificationResult.status || "").toUpperCase()
            console.log(`   Attempt ${attempts}: Status = ${status}`)
            networkError = false
          } catch (err) {
            console.log(`⚠️ Network error attempt ${attempts}:`, err)
            networkError = true
            // Continue retrying even on network errors
          }
        }
        
        console.log("✅ Final status:", status)
        const resultStatus = verificationResult ? (verificationResult.status || "").toUpperCase() : "PENDING"
        
        if (resultStatus === "COMPLETED") {
          setCheckingPayment(false)
          setPurchaseStatus("success")
          setStatusMessage("Payment successful! Creating your ticket...")
          await createTicketAndNavigate(true, verificationResult)
        } else if (resultStatus === "FAILED") {
          setCheckingPayment(false)
          const failMsg = verificationResult?.failureMessage || "Your mobile money payment was not completed."
          setPurchaseStatus("error")
          setStatusMessage(failMsg)
        } else {
          // Still pending or network error – keep overlay visible with recheck button
          // Do NOT set checkingPayment(false) – the overlay stays
          setStatusMessage("Payment is taking longer. Check your mobile money PIN prompt or tap recheck.")
          // Don't return – the overlay remains with the recheck button
        }
        return
      } else {
        // Handle card/bank transfer via PesaPal
        const description = `${quantity}x ${selectedTicketTypeName} ticket(s) for ${event!.name}`
        const callbackUrl = typeof window !== "undefined" ? window.location.origin : ""

        console.log("💳 Submitting order to PesaPal...")
        const orderResult = await PesaPalService.submitOrder(
          total,
          description,
          buyerEmail,
          buyerPhone,
          callbackUrl,
          buyerName
        )

        if (!orderResult.success || !orderResult.paymentUrl) {
          throw new Error(orderResult.error || "Failed to initialize payment")
        }

        console.log("✅ PesaPal order created:", orderResult.orderId)
        console.log("💳 Payment URL:", orderResult.paymentUrl)

        const paymentUrl = orderResult.paymentUrl
        const orderId = orderResult.orderId!

        if (Platform.OS === "web") {
          const paymentWindow = window.open("", "_blank")
          if (paymentWindow) {
            paymentWindow.location.href = paymentUrl
          } else {
            window.location.href = paymentUrl
          }
        } else {
          await Linking.openURL(paymentUrl)
        }

        setPaymentUrl(paymentUrl)
        setPaymentOrderId(orderId)
        setShowPaymentModal(true)
      }
    } catch (error: any) {
      console.error("Purchase error:", error)
      setCheckingPayment(false)
      const errorMessage = error?.message || "Failed to initialize payment. Please try again."
      setPurchaseStatus("error")
      setStatusMessage(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={{ color: '#FFFFFF', marginTop: 12, fontSize: 16 }}>Loading event details...</Text>
      </View>
    )
  }

  if (!event) {
    return (
      <View style={styles.container}>
        <ScrollView>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Purchase Tickets</Text>
          </View>
        </ScrollView>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Full-screen loading overlay for mobile money payment - must be outside ScrollView */}
      {/* Retry recheck function */}
      {checkingPayment && (
        <View style={styles.fullScreenOverlay}>
          <View style={styles.loaderContainer}>
            <ActivityIndicator color="#00D4FF" size="large" />
            <Text style={styles.loaderTitle}>
              ⏳ Payment Pending
            </Text>
            <Text style={styles.loaderSubtitle}>
              {statusMessage || "Please check your phone and enter your mobile money PIN to complete the payment."}
            </Text>
            
            {/* If we have a depositId and payment is still pending, show recheck button */}
            {pawaPayDepositId && (
              <TouchableOpacity
                style={styles.recheckButton}
                onPress={async () => {
                  setStatusMessage("Rechecking payment status...")
                  try {
                    const result = await PawaPayService.checkDepositStatus(pawaPayDepositId)
                    const status = (result.status || "").toUpperCase()
                    if (status === "COMPLETED") {
                      setCheckingPayment(false)
                      setPurchaseStatus("success")
                      setStatusMessage("Payment successful! Creating your ticket...")
                      await createTicketAndNavigate(true, result)
                    } else if (status === "FAILED") {
                      setCheckingPayment(false)
                      setPurchaseStatus("error")
                      setStatusMessage(result.failureMessage || "Payment failed.")
                    } else {
                      setStatusMessage("Still pending. Make sure you entered your mobile money PIN. Tap recheck again.")
                    }
                  } catch (err) {
                    setStatusMessage("Network error. Check your connection and tap recheck.")
                  }
                }}
              >
                <Ionicons name="refresh" size={20} color="#FFF" />
                <Text style={styles.recheckButtonText}>Recheck Payment</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={styles.cancelPaymentButton}
              onPress={() => {
                setCheckingPayment(false)
                setPawaPayDepositId(null)
              }}
            >
              <Text style={styles.cancelPaymentText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Purchase Tickets</Text>
        </View>

      <View style={styles.eventInfo}>
        <Text style={styles.eventName}>{event.name}</Text>
        <Text style={styles.eventVenue}>{event.venueName}</Text>
        <Text style={styles.eventDate}>{new Date(event.date).toDateString()}</Text>
      </View>

      {/* Purchase Status Banner */}
{purchaseStatus !== null && (
        <Animated.View 
          style={[
            styles.banner, 
            purchaseStatus === "success" ? styles.bannerSuccess : styles.bannerError,
            { opacity: bannerOpacity }
          ]}
        >
          <Text style={styles.bannerText}>{statusMessage}</Text>
        </Animated.View>
      )}

      <View style={styles.ticketSection}>
        <Text style={styles.sectionTitle}>Select Ticket Type</Text>

        {/* Ticket Type Selector */}
        {ticketTypes.length > 0 ? (
          <TouchableOpacity 
            style={styles.ticketTypeSelector}
            onPress={() => setShowTicketTypeModal(true)}
          >
            <View style={styles.ticketTypeSelectorContent}>
              <Ionicons name="ticket" size={24} color="#00D4FF" />
              <View style={styles.ticketTypeSelectorText}>
                <Text style={styles.ticketTypeSelectorLabel}>
                  {selectedTicketTypeName}
                </Text>
                <Text style={styles.ticketTypeSelectorPrice}>
                  UGX {isTableEntry ? (basePrice * tableSize).toLocaleString() : basePrice.toLocaleString()}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-down" size={24} color="#888888" />
          </TouchableOpacity>
        ) : (
          <Text style={styles.noTicketsText}>No ticket types available</Text>
        )}

        {!isTableEntry && (
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Price per ticket:</Text>
            <Text style={styles.priceValue}>UGX {basePrice.toLocaleString()}</Text>
          </View>
        )}

        {isTableEntry && (
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Table price:</Text>
            <Text style={styles.priceValue}>UGX {(basePrice * tableSize).toLocaleString()}</Text>
          </View>
        )}

        <View style={styles.quantitySection}>
          <Text style={styles.quantityLabel}>Quantity:</Text>
          <View style={styles.quantityControls}>
            <TouchableOpacity style={styles.quantityButton} onPress={() => setQuantity(Math.max(1, quantity - 1))}>
              <Ionicons name="remove" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TextInput  
              style={styles.quantityInput}
              value={quantity.toString()}
              onChangeText={(text) => setQuantity(Math.max(1, Number.parseInt(text) || 1))}
              keyboardType="numeric"
            />
            <TouchableOpacity style={styles.quantityButton} onPress={() => setQuantity(quantity + 1)}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Buyer Names Section - One input per ticket */}
      <View style={styles.buyerNamesSection}>
        <Text style={styles.sectionTitle}>
          Names ({actualTicketCount} ticket{actualTicketCount > 1 ? "s" : ""})
        </Text>
        {!user && (
          <Text style={styles.sectionSubtitle}>Each ticket requires a unique name</Text>
        )}
        {Array.from({ length: actualTicketCount }).map((_, index) => (
          <TextInput
            key={index}
            style={styles.input}
            value={buyerNames[index] || ""}
            onChangeText={(text) => updateBuyerName(index, text)}
            placeholder={`Person ${index + 1} Name`}
            placeholderTextColor="#999"
          />
        ))}
      </View>

      {/* Email Distribution Section */}
      <View style={styles.emailDistributionSection}>
        <Text style={styles.sectionTitle}>Email Distribution</Text>
        <View style={styles.radioContainer}>
          <TouchableOpacity
            style={[styles.radioButton, emailDistribution === "single" && styles.radioButtonSelected]}
            onPress={() => setEmailDistribution("single")}
          >
            <View style={[styles.radioCircle, emailDistribution === "single" && styles.radioCircleSelected]}>
              {emailDistribution === "single" && <View style={styles.radioDot} />}
            </View>
            <Text style={styles.radioLabel}>Send all tickets to one email</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.radioButton, emailDistribution === "multiple" && styles.radioButtonSelected]}
            onPress={() => setEmailDistribution("multiple")}
          >
            <View style={[styles.radioCircle, emailDistribution === "multiple" && styles.radioCircleSelected]}>
              {emailDistribution === "multiple" && <View style={styles.radioDot} />}
            </View>
            <Text style={styles.radioLabel}>Send each ticket to different email</Text>
          </TouchableOpacity>
        </View>

        {emailDistribution === "single" ? (
          <TextInput
            style={styles.input}
            value={visitorEmail}
            onChangeText={setVisitorEmail}
            placeholder="Enter email address"
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        ) : (
          Array.from({ length: actualTicketCount }).map((_, index) => (
            <TextInput
              key={index}
              style={styles.input}
              value={buyerEmails[index] || ""}
              onChangeText={(text) => updateBuyerEmail(index, text)}
              placeholder={`Person ${index + 1} Email`}
              placeholderTextColor="#999"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          ))
        )}
      </View>

      <View style={styles.securitySection}>
        <Text style={styles.sectionTitle}>Security (Optional)</Text>
        <Text style={styles.securityInfo}>
          Enable security photo to add an extra layer of verification to your ticket. This will help verify your identity at the event entrance.
        </Text>

        <TouchableOpacity
          style={[styles.toggleButton, securityPhotoEnabled && styles.toggleButtonActive]}
          onPress={() => setSecurityPhotoEnabled(!securityPhotoEnabled)}
        >
          <View style={styles.toggleContent}>
            <Ionicons name={securityPhotoEnabled ? "shield-checkmark" : "shield-outline"} size={24} color={securityPhotoEnabled ? "#00FF9F" : "#888888"} />
            <View style={styles.toggleTextContainer}>
              <Text style={[styles.toggleText, securityPhotoEnabled && styles.toggleTextActive]}>
                {securityPhotoEnabled ? "Security Photo Enabled" : "Enable Security Photo"}
              </Text>
              <Text style={styles.toggleSubtext}>
                {securityPhotoEnabled ? "Photo will be added to your ticket" : "Add photo verification to your ticket"}
              </Text>
            </View>
          </View>
          <View style={[styles.toggleSwitch, securityPhotoEnabled && styles.toggleSwitchActive]}>
            <View style={[styles.toggleKnob, securityPhotoEnabled && styles.toggleKnobActive]} />
          </View>
        </TouchableOpacity>

        {securityPhotoEnabled && (
          <View style={styles.photoSection}>
            <Text style={styles.photoSectionText}>
              {photoCaptured ? "Photo added to ticket" : "Tap below to capture your security photo"}
            </Text>
            <TouchableOpacity
              style={[styles.photoButton, photoCaptured && styles.photoButtonCaptured]}
              onPress={handleCapturePhoto}
              disabled={loading}
            >
              <Ionicons name={photoCaptured ? "checkmark-circle" : "camera"} size={24} color="#FFFFFF" />
              <Text style={styles.photoButtonText}>
                {photoCaptured ? "Photo Captured" : "Capture Photo"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.paymentSection}>
        <Text style={styles.sectionTitle}>Payment Method</Text>
        
        {/* Mobile Money */}
        <TouchableOpacity
          style={[styles.paymentOption, paymentMethod === "mobile_money" && styles.paymentOptionSelected]}
          onPress={() => setPaymentMethod("mobile_money")}
        >
          <Ionicons name="phone-portrait" size={24} color={paymentMethod === "mobile_money" ? "#00D4FF" : "#888888"} />
          <Text style={[styles.paymentOptionText, paymentMethod === "mobile_money" && styles.paymentOptionTextSelected]}>Mobile Money</Text>
        </TouchableOpacity>
        
        {/* Credit Card */}
        <TouchableOpacity
          style={[styles.paymentOption, paymentMethod === "credit_card" && styles.paymentOptionSelected]}
          onPress={() => setPaymentMethod("credit_card")}
        >
          <Ionicons name="card" size={24} color={paymentMethod === "credit_card" ? "#00D4FF" : "#888888"} />
          <Text style={[styles.paymentOptionText, paymentMethod === "credit_card" && styles.paymentOptionTextSelected]}>Credit Card</Text>
        </TouchableOpacity>
        
        {/* Bank Transfer */}
        <TouchableOpacity
          style={[styles.paymentOption, paymentMethod === "bank_transfer" && styles.paymentOptionSelected]}
          onPress={() => setPaymentMethod("bank_transfer")}
        >
          <Ionicons name="business" size={24} color={paymentMethod === "bank_transfer" ? "#00D4FF" : "#888888"} />
          <Text style={[styles.paymentOptionText, paymentMethod === "bank_transfer" && styles.paymentOptionTextSelected]}>Bank Transfer</Text>
        </TouchableOpacity>
        
        {/* Payment Details Form */}
        {paymentMethod === "mobile_money" && (
          <View style={styles.paymentForm}>
            <Text style={styles.paymentFormTitle}>Mobile Money Details</Text>
            <View style={styles.providerButtons}>
              <TouchableOpacity
                style={[styles.providerButton, mobileMoneyProvider === "mtn" && styles.providerButtonActive]}
                onPress={() => setMobileMoneyProvider("mtn")}
              >
                <Text style={[styles.providerButtonText, mobileMoneyProvider === "mtn" && styles.providerButtonTextActive]}>MTN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.providerButton, mobileMoneyProvider === "airtel" && styles.providerButtonActive]}
                onPress={() => setMobileMoneyProvider("airtel")}
              >
                <Text style={[styles.providerButtonText, mobileMoneyProvider === "airtel" && styles.providerButtonTextActive]}>Airtel</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={mobileMoneyNumber}
              onChangeText={setMobileMoneyNumber}
              placeholder="Mobile money number"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              value={mobileMoneyName}
              onChangeText={setMobileMoneyName}
              placeholder="Account holder name"
              placeholderTextColor="#999"
            />
          </View>
        )}
        
        {paymentMethod === "credit_card" && (
          <View style={styles.paymentForm}>
            <Text style={styles.paymentFormTitle}>Card Details</Text>
            <TextInput
              style={styles.input}
              value={cardNumber}
              onChangeText={setCardNumber}
              placeholder="Card number"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
            <View style={styles.cardRow}>
              <TextInput
                style={[styles.input, styles.cardHalfInput]}
                value={cardExpiry}
                onChangeText={setCardExpiry}
                placeholder="MM/YY"
                placeholderTextColor="#999"
              />
              <TextInput
                style={[styles.input, styles.cardHalfInput]}
                value={cardCvv}
                onChangeText={setCardCvv}
                placeholder="CVV"
                placeholderTextColor="#999"
                keyboardType="numeric"
                secureTextEntry
              />
            </View>
          </View>
        )}
        
        {paymentMethod === "bank_transfer" && (
          <View style={styles.paymentForm}>
            <Text style={styles.paymentFormTitle}>Bank Transfer Details</Text>
            <TextInput
              style={styles.input}
              value={bankName}
              onChangeText={setBankName}
              placeholder="Bank name"
              placeholderTextColor="#999"
            />
            <TextInput
              style={styles.input}
              value={bankAccountNumber}
              onChangeText={setBankAccountNumber}
              placeholder="Account number"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              value={bankAccountName}
              onChangeText={setBankAccountName}
              placeholder="Account name"
              placeholderTextColor="#999"
            />
          </View>
        )}
      </View>

      <View style={styles.summarySection}>
        <Text style={styles.sectionTitle}>Order Summary</Text>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>
            Tickets ({quantity}x){isTableEntry && tableSize > 1 ? ` (${tableSize} pax/table)` : ""}
          </Text>
          <Text style={styles.summaryValue}>UGX {subtotal.toLocaleString()}</Text>
        </View>

        {isLatePurchase && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Late Fee (15%):</Text>
            <Text style={styles.summaryValue}>UGX {lateFee.toLocaleString()}</Text>
          </View>
        )}

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>YoVibe Fee (15%):</Text>
          <Text style={styles.summaryValue}>UGX {appCommission.toLocaleString()}</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Event Revenue:</Text>
          <Text style={styles.summaryValue}>UGX {venueRevenue.toLocaleString()}</Text>
        </View>

        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total:</Text>
          <Text style={styles.totalValue}>UGX {total.toLocaleString()}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.purchaseButton, (!paymentMethod || loading) && styles.purchaseButtonDisabled]}
        onPress={handlePurchase}
        disabled={!paymentMethod || loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="card" size={24} color="#FFFFFF" />
            <Text style={styles.purchaseButtonText}>Purchase Tickets</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Ticket Type Selection Modal */}
      <Modal
        visible={showTicketTypeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTicketTypeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Ticket Type</Text>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setShowTicketTypeModal(false)}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={ticketTypes}
              keyExtractor={(item, index) => `${item.name}_${index}`}
              renderItem={({ item }) => {
                const isSelected = selectedTicketType?.name === item.name
                const itemPrice = Number.parseInt(item.amount?.replace(/[^0-9]/g, "") || "0")
                
                return (
                  <TouchableOpacity
                    style={[
                      styles.ticketTypeItem,
                      isSelected && styles.ticketTypeItemSelected
                    ]}
                    onPress={() => {
                      setSelectedTicketType(item)
                      setShowTicketTypeModal(false)
                    }}
                  >
                    <View style={styles.ticketTypeItemContent}>
                      <Text style={styles.ticketTypeItemName}>{item.name}</Text>
                      <Text style={styles.ticketTypeItemPrice}>
                        UGX {Number.parseInt(item.amount?.replace(/[^0-9]/g, "") || "0").toLocaleString()}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={24} style={styles.ticketTypeItemCheck} />
                    )}
                  </TouchableOpacity>
                )
              }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>

      {/* Payment Modal (for card/bank transfer) */}
      <Modal
        visible={showPaymentModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.paymentModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Complete Payment</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowPaymentModal(false)}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.paymentModalSubtitle}>
              Complete your payment of UGX {total.toLocaleString()} for {quantity}x ticket(s)
            </Text>

            {paymentOrderId && (
              <View style={styles.paymentIframeContainer}>
                <Text style={styles.paymentIframeText}>
                  Processing payment...
                </Text>
                <TouchableOpacity
                  style={styles.paymentCompleteButton}
                  onPress={handlePaymentComplete}
                >
                  <Text style={styles.paymentCompleteButtonText}>
                    I've Completed Payment
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    paddingTop: 50,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginLeft: 16,
  },
  eventInfo: {
    padding: 16,
    backgroundColor: "#1E1E1E",
    margin: 16,
    borderRadius: 12,
  },
  eventName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  eventVenue: {
    fontSize: 16,
    color: "#2196F3",
    marginBottom: 4,
  },
eventDate: {
    fontSize: 14,
    color: "#DDDDDD",
  },
  ticketSection: {
    padding: 16,
    backgroundColor: "#1E1E1E",
    margin: 16,
    borderRadius: 12,
    marginTop: 0,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#888888",
    marginBottom: 16,
    lineHeight: 20,
  },
  ticketTypeSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#333333",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#00D4FF",
  },
  ticketTypeSelectorContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  ticketTypeSelectorText: {
    flexDirection: "column",
  },
  ticketTypeSelectorLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  ticketTypeSelectorPrice: {
    color: "#00D4FF",
    fontSize: 14,
    marginTop: 2,
  },
  noTicketsText: {
    color: "#888888",
    fontSize: 14,
    textAlign: "center",
    padding: 16,
    marginBottom: 16,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  priceLabel: {
    fontSize: 14,
    color: "#888888",
  },
  priceValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  quantitySection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  quantityLabel: {
    fontSize: 14,
    color: "#888888",
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quantityInput: {
    backgroundColor: "#333333",
    color: "#FFFFFF",
    padding: 8,
    borderRadius: 6,
    width: 50,
    textAlign: "center",
    fontSize: 16,
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#333333",
    justifyContent: "center",
    alignItems: "center",
  },
buyerNamesSection: {
    padding: 16,
    backgroundColor: "#1E1E1E",
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
  },
  securitySection: {
    padding: 16,
    backgroundColor: "#1E1E1E",
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
  },
  securityInfo: {
    color: "#888888",
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#333333",
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "transparent",
  },
  toggleButtonActive: {
    borderColor: "#00D4FF",
    backgroundColor: "rgba(0, 212, 255, 0.1)",
  },
  toggleContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  toggleTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  toggleText: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  toggleTextActive: {
    color: "#00FF9F",
  },
  toggleSubtext: {
    color: "#888888",
    fontSize: 12,
    marginTop: 2,
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
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  toggleKnobActive: {
    alignSelf: "flex-end",
  },
  photoSection: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#252525",
    borderRadius: 8,
  },
  photoSectionText: {
    fontSize: 14,
    color: "#DDDDDD",
    textAlign: "center",
    marginBottom: 12,
  },
  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF9800",
    padding: 16,
    borderRadius: 8,
  },
  photoButtonCaptured: {
    backgroundColor: "#4CAF50",
  },
  photoButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  emailDistributionSection: {
    padding: 16,
    backgroundColor: "#1E1E1E",
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
  },
  radioContainer: {
    flexDirection: "column",
    gap: 12,
    marginBottom: 16,
  },
  radioButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#333333",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  radioButtonSelected: {
    borderColor: "#00D4FF",
    backgroundColor: "rgba(0, 212, 255, 0.1)",
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#888888",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  radioCircleSelected: {
    borderColor: "#00D4FF",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#00D4FF",
  },
  radioLabel: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  summarySection: {
    padding: 16,  
    backgroundColor: "#1E1E1E",
    margin: 16,
    borderRadius: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#DDDDDD",
  },
  summaryValue: {
    fontSize: 14,
    color: "#FFFFFF",
  },
  totalRow: {  
    borderTopWidth: 1,
    borderTopColor: "#333333",
    paddingTop: 8,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#4CAF50",
  },
  purchaseButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    margin: 16,
    padding: 16,
    borderRadius: 8,
  },
  purchaseButtonDisabled: {
    backgroundColor: "#666666",
  },
  purchaseButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 8,
  },
  // Payment section styles
  paymentSection: {
    padding: 16,
    backgroundColor: "#1E1E1E",
    margin: 16,
    borderRadius: 12,
  },
  paymentOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#333333",
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  paymentOptionSelected: {
    borderColor: "#00D4FF",
    backgroundColor: "rgba(0, 212, 255, 0.1)",
  },
  paymentOptionText: {
    color: "#888888",
    fontSize: 16,
    marginLeft: 12,
  },
  paymentOptionTextSelected: {
    color: "#00D4FF",
  },
  paymentForm: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#252525",
    borderRadius: 8,
  },
  paymentFormTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 12,
  },
  providerButtons: {
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
    color: "#888888",
    fontWeight: "600",
  },
  providerButtonTextActive: {
    color: "#FFFFFF",
  },
  input: {
    backgroundColor: "#333333",
    color: "#FFFFFF",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 14,
  },
  cardRow: {
    flexDirection: "row",
    gap: 10,
  },
  cardHalfInput: {
    flex: 1,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    width: "85%",
    maxHeight: "70%",
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  modalCloseButton: {
    padding: 5,
  },
  ticketTypeItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#333333",
    borderRadius: 8,
    marginBottom: 10,
  },
  ticketTypeItemSelected: {
    borderWidth: 2,
    borderColor: "#00D4FF",
  },
  ticketTypeItemContent: {
    flexDirection: "column",
  },
  ticketTypeItemName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  ticketTypeItemPrice: {
    color: "#00D4FF",
    fontSize: 14,
    marginTop: 4,
  },
  ticketTypeItemCheck: {
    color: "#00FF9F",
  },
  banner: {
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  bannerSuccess: {
    backgroundColor: "#28a745",
  },
  bannerError: {
    backgroundColor: "#dc3545",
  },
  bannerText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
  },
  // Full screen overlay for mobile money payment checking
  fullScreenOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    elevation: 9999,
  },
  loaderContainer: {
    alignItems: "center",
    padding: 32,
    maxWidth: 350,
  },
  loaderTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 24,
    marginBottom: 12,
  },
  loaderSubtitle: {
    color: "#CCCCCC",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  recheckButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    borderWidth: 1,
    borderColor: "#00D4FF",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    gap: 8,
    marginBottom: 12,
    width: "100%",
  },
  recheckButtonText: {
    color: "#00D4FF",
    fontSize: 16,
    fontWeight: "bold",
  },
  cancelPaymentButton: {
    paddingVertical: 10,
  },
  cancelPaymentText: {
    color: "#888888",
    fontSize: 14,
  },
  loaderFooter: {
    color: "#888888",
    fontSize: 13,
    fontStyle: "italic",
  },
  paymentModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  paymentModalContent: {
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    width: "90%",
    maxWidth: 400,
    padding: 20,
  },
  paymentModalSubtitle: {
    color: "#CCCCCC",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  paymentIframeContainer: {
    alignItems: "center",
    padding: 20,
  },
  paymentIframeText: {
    color: "#FFFFFF",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  paymentCompleteButton: {
    backgroundColor: "#00D4FF",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
  },
  paymentCompleteButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
})

export default TicketPurchaseScreen