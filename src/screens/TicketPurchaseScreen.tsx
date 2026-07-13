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
import InstallmentService from "../services/InstallmentService"
import type { InstallmentPlanType } from "../models/InstallmentPlan"
import { INSTALLMENT_SERVICE_FEE_RATE } from "../models/InstallmentPlan"
import * as ImagePicker from "expo-image-picker"
import type { Event } from "../models/Event"
import type { CreateFulfillmentInput } from "../models/PendingFulfillment"

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
  const [buyingForSomeoneElse, setBuyingForSomeoneElse] = useState(false)
  
  // Ticket type selection state
  const [selectedTicketType, setSelectedTicketType] = useState<{ name: string; amount: string } | null>(null)

  const [showTicketTypeModal, setShowTicketTypeModal] = useState(false)

  const [soldCounts, setSoldCounts] = useState<Record<string, number>>({})
  const [showSeatMapModal, setShowSeatMapModal] = useState(false)
  const [occupiedSeats, setOccupiedSeats] = useState<number[]>([])
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null)
  const [seatMapFee, setSeatMapFee] = useState<any>(null)
  
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
          const counts: Record<string, number> = {}
          await Promise.all(
            (eventData.entryFees || []).map(async (fee: any) => {
              if (fee.maxTickets && fee.maxTickets > 0) {
                counts[fee.name] = await SupabaseService.getSoldTicketCount(eventId, fee.name)
              }
            })
          )
          setSoldCounts(counts)
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
  const ticketTypes: any[] = event?.entryFees && event.entryFees.length > 0 ? event.entryFees : []

  const isSoldOut = (fee: any): boolean => {
    if (!fee.maxTickets || fee.maxTickets <= 0) return false
    return (soldCounts[fee.name] ?? 0) >= fee.maxTickets
  }

  const openSeatMap = async (fee: any) => {
    if (!fee.seatMap || fee.seatMap.type === "none") return
    setSelectedSeat(null)
    const occupied = await SupabaseService.getOccupiedSeats(eventId, fee.name)
    setOccupiedSeats(occupied)
    setSeatMapFee(fee)
    setShowSeatMapModal(true)
  }
  
  // Get the selected ticket type name
  const selectedTicketTypeName = selectedTicketType?.name || (ticketTypes.length > 0 ? ticketTypes[0].name : "Standard")

  // Calculate table entry details
  const selectedEntryFee = ticketTypes.length > 0 ? ticketTypes.find((t: any) => t.name === selectedTicketTypeName) : null
  const isTableEntry = selectedEntryFee?.isTable ?? false
  const tableSize = selectedEntryFee?.tableSize ?? 1
  const actualTicketCount = isTableEntry ? quantity * tableSize : quantity

  // Visitor info for unauthenticated users
  const [visitorName, setVisitorName] = useState("")
  const [visitorEmail, setVisitorEmail] = useState("")
  const [visitorPhone, setVisitorPhone] = useState("")
  const [buyerContactEmail, setBuyerContactEmail] = useState("")
  
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
  
  // Save form draft to sessionStorage on field change (for login redirect restore)
  useEffect(() => {
    if (typeof sessionStorage === "undefined") return
    try {
      sessionStorage.setItem("yovibe_ticket_draft_" + eventId, JSON.stringify({
        visitorName, visitorEmail, visitorPhone, buyerContactEmail, buyerNames, buyerEmails
      }))
    } catch {}
  }, [visitorName, visitorEmail, visitorPhone, buyerContactEmail, buyerNames, buyerEmails, eventId])

  // Restore form draft from sessionStorage on mount (after login redirect)
  useEffect(() => {
    if (typeof sessionStorage === "undefined" || !eventId) return
    try {
      const raw = sessionStorage.getItem("yovibe_ticket_draft_" + eventId)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (draft.visitorName) setVisitorName(draft.visitorName)
      if (draft.visitorEmail) setVisitorEmail(draft.visitorEmail)
      if (draft.visitorPhone) setVisitorPhone(draft.visitorPhone)
      if (draft.buyerContactEmail) setBuyerContactEmail(draft.buyerContactEmail)
      if (draft.buyerNames?.length) setBuyerNames(draft.buyerNames)
      if (draft.buyerEmails?.length) setBuyerEmails(draft.buyerEmails)
    } catch {}
  }, [eventId])
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

  // Installment state
  const [useInstallments, setUseInstallments] = useState(false)
  const [installmentPlanType, setInstallmentPlanType] = useState<InstallmentPlanType>("2")
  const [installmentPlanId, setInstallmentPlanId] = useState<string | null>(null)

  // ===========================================================================
  // FIX: Security-photo branch logic, computed ONCE at component scope so it's
  // visible both to the JSX render below AND to handlePurchase/createTicketAndNavigate.
  // Previously this was declared separately inside handlePurchase AND inside
  // createTicketAndNavigate (in the latter case, even referencing deliveryEmails/
  // payerEmail before those were defined) — neither of those inner copies was
  // visible to the JSX, which is what caused:
  //   "ReferenceError: showManualPhotoCapture is not defined"
  // Do not redeclare these inside handlePurchase or createTicketAndNavigate —
  // both functions now just reference these component-scope values directly.
  // ===========================================================================
  const payerEmailForPhotoCheck = buyerContactEmail.trim() || visitorEmail.trim() || buyerEmails[0]?.trim() || user?.email || ""
  const deliveryEmailsForPhotoCheck = emailDistribution === "single"
    ? Array(actualTicketCount).fill(payerEmailForPhotoCheck)
    : buyerEmails.slice(0, actualTicketCount).map(e => e.trim())

  const isBuyingForSelf = actualTicketCount === 1 && !isTableEntry && !buyingForSomeoneElse && deliveryEmailsForPhotoCheck[0] === payerEmailForPhotoCheck
  const showManualPhotoCapture = isBuyingForSelf
  const securityPhotoForcedViaEmail = actualTicketCount > 1 || isTableEntry || (actualTicketCount === 1 && !isBuyingForSelf)

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

  const pollPaymentStatus = async (depositId: string, startAttempts: number = 0) => {
    let attempts = startAttempts
    const maxAttempts = 25
    let status = "PENDING"
    let verificationResult: any = null
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
      }
    }
    
    console.log("✅ Final status:", status)
    const resultStatus = verificationResult ? (verificationResult.status || "").toUpperCase() : "PENDING"
    
    if (resultStatus === "COMPLETED") {
      setCheckingPayment(false)
      try { sessionStorage.removeItem("yovibe_ticket_draft_" + (event ? event.id : "")) } catch {}
      setPurchaseStatus("success")
      setStatusMessage("Payment successful! Creating your ticket...")
      await createTicketAndNavigate(true, verificationResult)
    } else if (resultStatus === "FAILED") {
      setCheckingPayment(false)
      const failMsg = verificationResult?.failureMessage || "Your mobile money payment was not completed."
      setPurchaseStatus("error")
      setStatusMessage(failMsg)
    } else {
      setStatusMessage(`Still pending. Check your mobile money PIN. Attempt ${attempts}/${maxAttempts}.`)
    }
    
    return { status, verificationResult, attempts }
  }

const handlePaymentComplete = async () => {
    if (!paymentOrderId) return

    try {
      setCheckingPayment(true)
      setShowPaymentModal(false)

      let verificationResult
      let isMobileMoney = paymentMethod === "mobile_money"
      
      if (isMobileMoney) {
        console.log("🔍 Checking PawaPay deposit status (polling)...")
        await pollPaymentStatus(paymentOrderId!, 0)
        return
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
    let fulfillmentId: string | null = null
    
    try {
      setLoading(true)
      
      const buyerNamesList = getBuyerNames()
      const buyerEmailsList = getBuyerEmails()
      const paymentId = verificationResult.depositId || paymentOrderId || `pi_${Date.now()}`
      const buyerEmailFinal = user?.email || buyerContactEmail.trim() || visitorEmail.trim() || buyerEmails[0]?.trim()
      const buyerNameFinal = visitorName.trim() || buyerContactEmail.trim().split('@')[0] || "Guest"
      
      fulfillmentId = await TicketService.createPendingFulfillment({
        paymentId,
        pawapayDepositId: isMobileMoney ? verificationResult.depositId : undefined,
        buyerEmail: user?.email || buyerContactEmail.trim() || visitorEmail.trim() || buyerEmails[0]?.trim(),
        buyerName: buyerNameFinal,
        buyerId: user?.id,
        eventId: event!.id,
        eventName: event!.name,
        quantity: actualTicketCount,
        amount: total,
        attendeeNames: buyerNamesList,
      })
      console.log("✅ Created pending fulfillment:", fulfillmentId)
      
      await TicketService.updateFulfillmentStatus(fulfillmentId, "fulfilling")

      const includePhoto = securityPhotoEnabled && photoCaptured
      
      const ticketCount = actualTicketCount

      const payerEmail = visitorEmail.trim() || buyerEmails[0]?.trim()
      const deliveryEmails = emailDistribution === "single" 
        ? Array(actualTicketCount).fill(payerEmail)
        : buyerEmailsList

      const isBuyingForSelf = actualTicketCount === 1 && !isTableEntry && !buyingForSomeoneElse
      const showManualPhotoCapture = isBuyingForSelf
      const securityPhotoForcedViaEmail = actualTicketCount > 1 || isTableEntry || (actualTicketCount === 1 && !isBuyingForSelf)

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
        },
        user?.id ?? null,
        payerEmail,
        deliveryEmails,
        selectedSeat ?? undefined,
      )

      const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://yovibe.net"
      
      for (const ticket of tickets) {
        try {
          const payerEmailMatchesDelivery = ticket.deliveryEmail === payerEmail
          const shouldIncludePhotoLink = ticket.photoUploadToken && (!ticket.buyerPhotoUrl || !payerEmailMatchesDelivery)
          const photoUploadLink = shouldIncludePhotoLink 
            ? `${baseUrl}/add-photo?ticket=${ticket.id}&token=${ticket.photoUploadToken}`
            : undefined
          
          await fetch(`/.netlify/functions/send-ticket-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              buyerEmail: ticket.deliveryEmail ?? ticket.buyerEmail,
              buyerName: ticket.buyerName,
              eventName: ticket.eventName,
              ticketType: ticket.entryFeeType,
              venue: ticket.venueName,
              date: ticket.eventStartTime.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
              time: ticket.eventStartTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              ticketRef: ticket.ticketRef,
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

      await TicketService.updateFulfillmentStatus(fulfillmentId, "fulfilled", {
        ticketIds: tickets.map(t => t.id),
      })
      console.log("✅ Fulfillment completed successfully")

      setPurchaseStatus("success")
      setStatusMessage(`${actualTicketCount} ticket${actualTicketCount > 1 ? "s" : ""} purchased successfully!`)
      
      setTimeout(() => {
        navigation.navigate("MyTickets")
      }, 1000)

    } catch (error: any) {
      console.error("Ticket creation error:", error)
      
      if (fulfillmentId) {
        await TicketService.updateFulfillmentStatus(fulfillmentId, "failed", {
          lastError: error.message || "Unknown error during ticket fulfillment",
          attemptCount: 1,
        })
      }
      
      const referenceMsg = fulfillmentId 
        ? `If you don't receive your ticket within 30 minutes, contact support with this reference: ${fulfillmentId}`
        : "Please contact support with your payment reference."
      
      Alert.alert(
        "Payment Received",
        `Your payment was successful. We're finalizing your ticket and will email it shortly. If you don't receive it within 30 minutes, contact support.`,
        [{ text: "OK", onPress: () => navigation.navigate("MyTickets") }]
      )
      
      setPurchaseStatus("success")
      setStatusMessage("Payment received — finalizing ticket...")
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

  // Installment preview — recalculated whenever plan type or total changes
  const installmentPreview = useMemo(() => {
    if (!useInstallments || !event?.date) return []
    return InstallmentService.previewPlan(total, installmentPlanType, event.date)
  }, [useInstallments, installmentPlanType, total, event?.date])
  
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

const handleInstallmentPurchase = async () => {
    const buyerNamesList = getBuyerNames()
    for (let i = 0; i < actualTicketCount; i++) {
      if (!buyerNamesList[i]?.trim()) {
        Alert.alert("Name Required", `Please enter name for person ${i + 1}`)
        return
      }
    }

    if (!paymentMethod) {
      Alert.alert("Payment Required", "Please select a payment method")
      return
    }

    if (paymentMethod === "mobile_money" && !mobileMoneyNumber.trim()) {
      Alert.alert("Number Required", "Please enter your mobile money number")
      return
    }

    const buyerEmailFinal = user?.email || buyerContactEmail.trim() || visitorEmail.trim() || buyerEmails[0]?.trim() || ""
    const buyerNameFinal = visitorName.trim() || buyerEmailFinal.split("@")[0] || "Guest"
    const buyerEmailsList = getBuyerEmails()
    const deliveryEmails = emailDistribution === "single"
      ? Array(actualTicketCount).fill(buyerEmailFinal)
      : buyerEmailsList

    try {
      setLoading(true)
      const result = await InstallmentService.createPlanAndPayFirst(
        event!,
        installmentPlanType,
        total,
        lateFee,
        {
          buyerId: user?.id,
          buyerEmail: buyerEmailFinal,
          buyerName: buyerNameFinal,
          buyerNames: buyerNamesList,
          buyerEmails: buyerEmailsList,
          deliveryEmails,
          payerEmail: buyerEmailFinal,
          isTableEntry,
          tableSize,
          buyerPhotoUrl: photoCaptured ? buyerPhotoUrl : undefined,
        },
        {
          method: paymentMethod,
          provider: paymentMethod === "mobile_money" ? mobileMoneyProvider : undefined,
          number: paymentMethod === "mobile_money" ? mobileMoneyNumber : undefined,
          name: paymentMethod === "mobile_money" ? mobileMoneyName : undefined,
        }
      )

      setInstallmentPlanId(result.planId)

      if (paymentMethod === "mobile_money" && result.depositId) {
        setPaymentOrderId(result.depositId)
        setPawaPayDepositId(result.depositId)
        setCheckingPayment(true)
        // Poll and on completion mark installment 0 paid
        const pollResult = await pollInstallmentPayment(result.planId, 0, result.depositId)
        if (!pollResult) {
          setPurchaseStatus("error")
          setStatusMessage("Payment not completed. You can pay the first installment from My Tickets.")
        }
      } else if (result.paymentUrl) {
        if (typeof window !== "undefined") {
          window.open(result.paymentUrl, "_blank")
        }
        setPaymentOrderId(result.orderId || null)
        setShowPaymentModal(true)
      }
    } catch (error: any) {
      setPurchaseStatus("error")
      setStatusMessage(error.message || "Failed to create installment plan")
    } finally {
      setLoading(false)
    }
  }

  const pollInstallmentPayment = async (
    planId: string,
    installmentIndex: number,
    depositId: string
  ): Promise<boolean> => {
    let attempts = 0
    const maxAttempts = 25
    let status = "PENDING"

    while (attempts < maxAttempts && (status === "PENDING" || status === "PROCESSING")) {
      await new Promise((r) => setTimeout(r, 2000))
      attempts++
      try {
        const result = await PawaPayService.checkDepositStatus(depositId)
        status = (result.status || "").toUpperCase()
      } catch {
        // network hiccup — keep polling
      }
    }

    setCheckingPayment(false)

    if (status === "COMPLETED") {
      await InstallmentService.onInstallmentPaid(planId, installmentIndex, depositId, "mobile_money")
      setPurchaseStatus("success")
      const remaining = parseInt(installmentPlanType) - 1
      setStatusMessage(
        remaining > 0
          ? `First installment paid! ${remaining} installment${remaining > 1 ? "s" : ""} remaining. Find them in My Tickets.`
          : "All installments paid! Your ticket is being sent to your email."
      )
      setTimeout(() => navigation.navigate("MyTickets"), 1500)
      return true
    }
    return false
  }

  const handlePurchase = async () => {
    console.log("[handlePurchase] START - user:", user?.id || "visitor", "paymentMethod:", paymentMethod)
    
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
      // Unauthenticated user - require buyer contact email
      console.log("[handlePurchase] Unauthenticated user - buyerContactEmail:", buyerContactEmail)
      if (!buyerContactEmail.trim()) {
        Alert.alert("Email Required", "Please enter your email address")
        return
      }
      
      // Generate unique visitor ID
      buyerId = `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      buyerName = visitorName.trim() || buyerContactEmail.trim().split('@')[0] || "Guest"
      buyerEmail = buyerContactEmail.trim()
      buyerPhone = visitorPhone.trim() || ""
    }

    // Validate ticket type selection
    if (!selectedTicketType && ticketTypes.length > 0) {
      Alert.alert("Ticket Type Required", "Please select a ticket type")
      return
    }

    const isBuyingForSelfValidation = actualTicketCount === 1 && !isTableEntry && !buyingForSomeoneElse
    const showManualPhotoCaptureValidation = isBuyingForSelfValidation

    if (showManualPhotoCaptureValidation && securityPhotoEnabled && !photoCaptured) {
      Alert.alert("Photo Required", "Please capture your security photo or disable the security option")
      return
    }
    
    try {
      console.log("[handlePurchase] Payment method:", paymentMethod)
      if (paymentMethod === "mobile_money") {
        console.log("[handlePurchase] Mobile Money flow - total:", total, "number:", mobileMoneyNumber)
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

        await pollPaymentStatus(depositId, 0)
        return
      } else {
        console.log("[handlePurchase] PesaPal flow - total:", total, "buyerEmail:", buyerEmail)
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
                  setCheckingPayment(true)
                  setStatusMessage("Rechecking payment status...")
                  await pollPaymentStatus(pawaPayDepositId, 0)
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
        {event.posterImageUrl ? (
          <Image
            source={{ uri: event.posterImageUrl }}
            style={styles.eventPosterBg}
            resizeMode="cover"
          />
        ) : null}
        <View style={styles.eventInfoGradient} />
        <View style={styles.eventInfoContent}>
          <Text style={styles.eventName}>{event.name}</Text>
          <Text style={styles.eventVenue}>{event.venueName}</Text>
          <Text style={styles.eventDate}>{new Date(event.date).toDateString()}</Text>
        </View>
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

      {!user && (
        <View style={styles.visitorInfoSection}>
          <Text style={styles.sectionTitle}>Buyer Contact Info</Text>
          <TextInput
            style={styles.input}
            value={buyerContactEmail}
            onChangeText={setBuyerContactEmail}
            placeholder="Enter buyer's email address"
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>
      )}

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

        {actualTicketCount === 1 && !isTableEntry && emailDistribution === "single" && (
          <TouchableOpacity
            style={[styles.radioButton, buyingForSomeoneElse && styles.radioButtonSelected]}
            onPress={() => setBuyingForSomeoneElse(!buyingForSomeoneElse)}
          >
            <View style={[styles.radioCircle, buyingForSomeoneElse && styles.radioCircleSelected]}>
              {buyingForSomeoneElse && <View style={styles.radioDot} />}
            </View>
            <Text style={styles.radioLabel}>I'm buying this for someone else</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.securitySection}>
        <Text style={styles.sectionTitle}>Security (Optional)</Text>
        <Text style={styles.securityInfo}>
          Enable security photo to add an extra layer of verification to your ticket. This will help verify your identity at the event entrance.
        </Text>

        {showManualPhotoCapture && (
          <>
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
          </>
        )}

        {securityPhotoForcedViaEmail && !showManualPhotoCapture && (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              A security photo link will be emailed to each attendee for them to add their photo.
            </Text>
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
      </View>

      {/* Installment Plan Toggle */}
      <View style={styles.installmentSection}>
        <Text style={styles.sectionTitle}>Payment Plan</Text>
        <View style={styles.planToggleRow}>
          <TouchableOpacity
            style={[styles.planToggleBtn, !useInstallments && styles.planToggleBtnActive]}
            onPress={() => setUseInstallments(false)}
          >
            <Text style={[styles.planToggleText, !useInstallments && styles.planToggleTextActive]}>Pay in Full</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.planToggleBtn, useInstallments && styles.planToggleBtnActive]}
            onPress={() => setUseInstallments(true)}
          >
            <Text style={[styles.planToggleText, useInstallments && styles.planToggleTextActive]}>Pay in Parts</Text>
          </TouchableOpacity>
        </View>

        {useInstallments && (
          <>
            <View style={styles.planTypeRow}>
              {(["2", "3", "4", "5"] as InstallmentPlanType[]).map((pt) => (
                <TouchableOpacity
                  key={pt}
                  style={[styles.planTypeBtn, installmentPlanType === pt && styles.planTypeBtnActive]}
                  onPress={() => setInstallmentPlanType(pt)}
                >
                  <Text style={[styles.planTypeText, installmentPlanType === pt && styles.planTypeTextActive]}>
                    {pt}x
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {installmentPreview.map((inst, i) => {
              const label = i === 0 ? "Pay now" : `Installment ${i + 1} — due ${inst.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              return (
                <View key={i} style={styles.installmentRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.installmentLabel}>{label}</Text>
                    <Text style={styles.installmentFeeNote}>Includes 8% service fee (UGX {inst.serviceFee.toLocaleString()})</Text>
                  </View>
                  <Text style={[styles.installmentAmount, i === 0 && styles.installmentAmountFirst]}>
                    UGX {inst.totalDue.toLocaleString()}
                  </Text>
                </View>
              )
            })}

            <View style={styles.installmentNotice}>
              <Ionicons name="information-circle-outline" size={16} color="#F59E0B" />
              <Text style={styles.installmentNoticeText}>
                QR code is sent after the final installment. Missed installments can be paid any time before the event date.
              </Text>
            </View>
          </>
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

        {!useInstallments && (
          <>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>YoVibe Fee (15%):</Text>
              <Text style={styles.summaryValue}>UGX {appCommission.toLocaleString()}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Event Revenue:</Text>
              <Text style={styles.summaryValue}>UGX {venueRevenue.toLocaleString()}</Text>
            </View>
          </>
        )}

        {useInstallments && installmentPreview.length > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Due today (incl. 8% fee):</Text>
            <Text style={[styles.summaryValue, { color: "#F59E0B" }]}>
              UGX {installmentPreview[0].totalDue.toLocaleString()}
            </Text>
          </View>
        )}

        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>{useInstallments ? "Ticket Total:" : "Total:"}</Text>
          <Text style={styles.totalValue}>UGX {total.toLocaleString()}</Text>
        </View>
      </View>

      {!user && useInstallments && (
        <TouchableOpacity
          onPress={() => { if (typeof window !== "undefined") window.location.href = "/login?returnTo=" + encodeURIComponent(window.location.pathname) }}
          style={styles.loginToContinueLink}
        >
          <Text style={styles.loginToContinueText}>Login to continue</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.purchaseButton, (!paymentMethod || loading || (!user && useInstallments)) && styles.purchaseButtonDisabled]}
        onPress={useInstallments ? handleInstallmentPurchase : handlePurchase}
        disabled={!paymentMethod || loading || (!user && useInstallments)}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="card" size={24} color="#FFFFFF" />
            <Text style={styles.purchaseButtonText}>
              {useInstallments ? `Reserve & Pay First Installment` : "Purchase Tickets"}
            </Text>
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
              keyExtractor={(item: any, index: number) => `${item.name}_${index}`}
              renderItem={({ item }: { item: any }) => {
                const isSelected = selectedTicketType?.name === item.name
                const soldOut = isSoldOut(item)
                const remaining = item.maxTickets && item.maxTickets > 0
                  ? Math.max(0, item.maxTickets - (soldCounts[item.name] ?? 0))
                  : null
                const hasSeatMap = item.seatMap && item.seatMap.type !== "none"
                return (
                  <TouchableOpacity
                    style={[styles.ticketTypeItem, isSelected && styles.ticketTypeItemSelected, soldOut && styles.ticketTypeItemSoldOut]}
                    onPress={() => {
                      if (soldOut) return
                      setSelectedTicketType(item)
                      setShowTicketTypeModal(false)
                      if (hasSeatMap) openSeatMap(item)
                    }}
                    disabled={soldOut}
                  >
                    <View style={styles.ticketTypeItemContent}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={[styles.ticketTypeItemName, soldOut && { color: "#666" }]}>{item.name}</Text>
                        {soldOut && (
                          <View style={styles.soldOutBadge}>
                            <Text style={styles.soldOutBadgeText}>SOLD OUT</Text>
                          </View>
                        )}
                        {hasSeatMap && !soldOut && (
                          <View style={styles.seatMapBadge}>
                            <Text style={styles.seatMapBadgeText}>PICK SEAT</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.ticketTypeItemPrice, soldOut && { color: "#555" }]}>
                        UGX {Number.parseInt(item.amount?.replace(/[^0-9]/g, "") || "0").toLocaleString()}
                      </Text>
                      {remaining !== null && !soldOut && (
                        <Text style={styles.remainingText}>{remaining} left</Text>
                      )}
                    </View>
                    {isSelected && !soldOut && (
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

      {/* Seat Map Modal */}
      <Modal visible={showSeatMapModal} transparent animationType="slide" onRequestClose={() => setShowSeatMapModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: "85%", width: "92%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Your Seat</Text>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowSeatMapModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {seatMapFee && (seatMapFee as any).seatMap?.type === "cinema" ? (
                Array.from({ length: (seatMapFee as any).seatMap.rows || 5 }).map((_, rowIdx) => {
                  const rowLabel = String.fromCharCode(65 + rowIdx)
                  const cols = (seatMapFee as any).seatMap.cols || 10
                  return (
                    <View key={rowLabel} style={seatMapStyles.cinemaRow}>
                      <Text style={seatMapStyles.rowLabel}>{rowLabel}</Text>
                      <View style={seatMapStyles.seatsRow}>
                        {Array.from({ length: cols }).map((_, colIdx) => {
                          const seatNum = rowIdx * cols + colIdx + 1
                          const taken = occupiedSeats.includes(seatNum)
                          const picked = selectedSeat === seatNum
                          return (
                            <TouchableOpacity key={seatNum}
                              style={[seatMapStyles.seat, taken && seatMapStyles.seatTaken, picked && seatMapStyles.seatPicked]}
                              onPress={() => !taken && setSelectedSeat(seatNum)} disabled={taken}>
                              <Text style={[seatMapStyles.seatLabel, taken && { color: "#555" }, picked && { color: "#000" }]}>{colIdx + 1}</Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    </View>
                  )
                })
              ) : (
                <View style={seatMapStyles.numberedGrid}>
                  {Array.from({ length: (seatMapFee as any)?.maxTickets || 0 }).map((_, idx) => {
                    const seatNum = idx + 1
                    const taken = occupiedSeats.includes(seatNum)
                    const picked = selectedSeat === seatNum
                    return (
                      <TouchableOpacity key={seatNum}
                        style={[seatMapStyles.numberedSeat, taken && seatMapStyles.seatTaken, picked && seatMapStyles.seatPicked]}
                        onPress={() => !taken && setSelectedSeat(seatNum)} disabled={taken}>
                        <Text style={[seatMapStyles.numberedSeatLabel, taken && { color: "#555" }, picked && { color: "#000" }]}>{seatNum}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}
              <View style={seatMapStyles.legend}>
                <View style={seatMapStyles.legendItem}><View style={[seatMapStyles.legendDot, { backgroundColor: "#2a2a2a" }]} /><Text style={seatMapStyles.legendText}>Available</Text></View>
                <View style={seatMapStyles.legendItem}><View style={[seatMapStyles.legendDot, { backgroundColor: "#FF4444" }]} /><Text style={seatMapStyles.legendText}>Taken</Text></View>
                <View style={seatMapStyles.legendItem}><View style={[seatMapStyles.legendDot, { backgroundColor: "#00D4FF" }]} /><Text style={seatMapStyles.legendText}>Selected</Text></View>
              </View>
            </ScrollView>
            <TouchableOpacity
              style={[styles.purchaseButton, { margin: 0, marginTop: 12 }, !selectedSeat && styles.purchaseButtonDisabled]}
              onPress={() => setShowSeatMapModal(false)}
              disabled={!selectedSeat}
            >
              <Text style={styles.purchaseButtonText}>
                {selectedSeat ? `Confirm Seat ${selectedSeat}` : "Pick a seat to continue"}
              </Text>
            </TouchableOpacity>
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
    margin: 16,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1E1E1E",
    height: 110,
  },
  eventPosterBg: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: "55%",
  },
  eventInfoGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // left side fully opaque dark, fades to transparent on the right
    // React Native Web supports backgroundImage for gradients
    ...(Platform.OS === "web" ? {
      backgroundImage: "linear-gradient(to right, #1E1E1E 38%, rgba(30,30,30,0.85) 55%, transparent 100%)",
    } : {
      backgroundColor: "rgba(30,30,30,0.5)",
    }),
  },
  eventInfoContent: {
    padding: 16,
    justifyContent: "center",
    width: "65%",
    height: "100%",
  },
  eventName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 6,
  },
  eventVenue: {
    fontSize: 14,
    color: "#2196F3",
    marginBottom: 3,
  },
  eventDate: {
    fontSize: 12,
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
  visitorInfoSection: {
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
  ticketTypeItemSoldOut: { opacity: 0.5 },
  soldOutBadge: { backgroundColor: "#FF4444", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  soldOutBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "bold" },
  seatMapBadge: { backgroundColor: "rgba(0,212,255,0.2)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "#00D4FF" },
  seatMapBadgeText: { color: "#00D4FF", fontSize: 10, fontWeight: "bold" },
  remainingText: { color: "#F59E0B", fontSize: 11, marginTop: 2 },
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
  infoBox: {
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#00D4FF",
  },
  infoText: {
    color: "#CCCCCC",
    fontSize: 12,
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
  // Installment styles
  installmentSection: {
    padding: 16,
    backgroundColor: "#1E1E1E",
    margin: 16,
    borderRadius: 12,
  },
  planToggleRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  planToggleBtn: {
    flex: 1,
    padding: 12,
    alignItems: "center",
    backgroundColor: "#333333",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  planToggleBtnActive: {
    backgroundColor: "rgba(0,212,255,0.12)",
    borderColor: "#00D4FF",
  },
  planToggleText: {
    color: "#888888",
    fontSize: 14,
    fontWeight: "600",
  },
  planToggleTextActive: {
    color: "#00D4FF",
  },
  planTypeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  planTypeBtn: {
    flex: 1,
    padding: 10,
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  planTypeBtnActive: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderColor: "#F59E0B",
  },
  planTypeText: {
    color: "#888888",
    fontSize: 13,
    fontWeight: "600",
  },
  planTypeTextActive: {
    color: "#F59E0B",
  },
  installmentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  installmentLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
  },
  installmentFeeNote: {
    color: "#666",
    fontSize: 11,
    marginTop: 2,
  },
  installmentAmount: {
    color: "#CCCCCC",
    fontSize: 14,
    fontWeight: "700",
  },
  installmentAmountFirst: {
    color: "#F59E0B",
  },
  installmentNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 14,
    padding: 12,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.25)",
  },
  installmentNoticeText: {
    flex: 1,
    color: "#D97706",
    fontSize: 12,
    lineHeight: 18,
  },
  loginToContinueLink: {
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 8,
  },
  loginToContinueText: {
    color: "#00D4FF",
    fontSize: 14,
    textDecorationLine: "underline",
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

const seatMapStyles = StyleSheet.create({
  cinemaRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  rowLabel: { color: "#888", fontSize: 12, width: 18, fontWeight: "bold" },
  seatsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  seat: { width: 28, height: 28, borderRadius: 4, backgroundColor: "#2a2a2a", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#444" },
  seatTaken: { backgroundColor: "#3a1a1a", borderColor: "#FF4444" },
  seatPicked: { backgroundColor: "#00D4FF", borderColor: "#00D4FF" },
  seatLabel: { color: "#CCC", fontSize: 10, fontWeight: "600" },
  numberedGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 8 },
  numberedSeat: { width: 44, height: 44, borderRadius: 8, backgroundColor: "#2a2a2a", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#444" },
  numberedSeatLabel: { color: "#CCC", fontSize: 13, fontWeight: "700" },
  legend: { flexDirection: "row", gap: 16, justifyContent: "center", paddingVertical: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendText: { color: "#888", fontSize: 11 },
})

export default TicketPurchaseScreen
