"use client"

import type React from "react"
import { useState, useMemo, useEffect, useRef } from "react"
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView, TextInput, Image, Modal, FlatList, Platform, Linking } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useCompatNavigation } from "../utils/compatNavigation"
import { useRouter } from "../utils/URLRouter"

import { useAuth } from "../contexts/AuthContext"
import { v4 as uuidv4 } from "uuid"
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
import { ValidationDialog } from "../components/ValidationDialog"
import { TicketCreationProgress } from "../components/TicketCreationProgress"
import { StatusDialog } from "../components/StatusDialog"
import { useDeviceType, COLORS } from "../utils/ResponsiveDesign"

// ─── Design tokens (UI only) ─────────────────────────────────────────
const SURFACE = "rgba(18, 18, 26, 0.72)"
const SURFACE_INNER = "rgba(30, 30, 46, 0.55)"
const SURFACE_BORDER = "rgba(255, 255, 255, 0.08)"
const CARD_RADIUS = 14

const STEP_LABELS = ["Ticket", "Attendees", "Delivery", "Payment"] as const

// Compact section header with a step number chip (purely visual).
const StepSectionTitle: React.FC<{ step: number; title: string }> = ({ step, title }) => (
  <View style={styles.stepSectionTitleRow}>
    <View style={styles.stepChip}>
      <Text style={styles.stepChipText}>{step}</Text>
    </View>
    <Text style={styles.stepSectionTitle}>{title}</Text>
  </View>
)

const TicketPurchaseScreen: React.FC = () => {
  const { isLargeScreen } = useDeviceType()
  const navigation = useCompatNavigation()
  const { currentPath } = useRouter()

  // Extract eventId from current path: /events/tickets/:eventId
  const pathParts = currentPath.split('/').filter(Boolean)
  const eventId = pathParts[2] // events/tickets/:eventId, so [events, tickets, eventId]
  const { user } = useAuth()

  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
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
  const [perPersonSeats, setPerPersonSeats] = useState<(number | null)[]>([])
  const [pickSeatIndex, setPickSeatIndex] = useState<number | null>(null)
  const [seatMapFee, setSeatMapFee] = useState<any>(null)
  const [pickerMode, setPickerMode] = useState<"seat" | "table">("seat")
  const [occupiedTables, setOccupiedTables] = useState<number[]>([])
  const [tableSeats, setTableSeats] = useState<(number | null)[]>([])
  
  // Load event data
  useEffect(() => {
    const loadEvent = async () => {
      if (!eventId) {
        setInitialLoading(false)
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
        setInitialLoading(false)
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

  const openSeatMap = async (fee: any, personIndex?: number, mode?: "seat" | "table") => {
    const m = mode || "seat"
    console.log(`[openSeatMap] Opening seat map for fee: ${fee.name}, mode: ${m}, personIndex: ${personIndex}`);
    if (!fee.seatMap || fee.seatMap.type === "none") return
    setPickerMode(m)
    setSeatMapFee(fee)
    setPickSeatIndex(personIndex ?? null)

    if (m === "table") {
      const occupied = await SupabaseService.getOccupiedTables(eventId, fee.name)
      setOccupiedTables(occupied)
      setShowSeatMapModal(true)
      return
    }

    const occupied = await SupabaseService.getOccupiedSeats(eventId, fee.name)
    setOccupiedSeats(occupied)
    setShowSeatMapModal(true)
  }
  
  // Get the selected ticket type name
  const selectedTicketTypeName = selectedTicketType?.name || "Click here to select"

  // Calculate table entry details
  const selectedEntryFee = selectedTicketType ? ticketTypes.find((t: any) => t.name === selectedTicketType.name) : null
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
    setPerPersonSeats(prev => {
      const newSeats: (number | null)[] = [...prev]
      while (newSeats.length < actualTicketCount) {
        newSeats.push(null)
      }
      return newSeats.slice(0, actualTicketCount)
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
  const [cardFirstName, setCardFirstName] = useState("")
  const [cardLastName, setCardLastName] = useState("")
  const [cardPhone, setCardPhone] = useState("")
  const [cardCvv, setCardCvv] = useState("")
  const [bankName, setBankName] = useState("")
  const [bankAccountNumber, setBankAccountNumber] = useState("")
  const [bankAccountName, setBankAccountName] = useState("")
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null)
  const [pawaPayDepositId, setPawaPayDepositId] = useState<string | null>(null)
  const [pesapalOrderRef, setPesapalOrderRef] = useState<string | null>(null)
  const [pesapalTrackingId, setPesapalTrackingId] = useState<string | null>(null)
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "completed" | "failed" | null>(null)
  const [purchaseStatus, setPurchaseStatus] = useState<"success" | "error" | null>(null)
  const [statusMessage, setStatusMessage] = useState("")
  // Reused across retries so the server-side fulfillment is idempotent.
  const [activeFulfillmentId, setActiveFulfillmentId] = useState<string | null>(null)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [checkingPayment, setCheckingPayment] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [validationVisible, setValidationVisible] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [progressVisible, setProgressVisible] = useState(false)
  const [progressStep, setProgressStep] = useState(0)
  const [progressCompleted, setProgressCompleted] = useState(false)
  const [deliveryEmail, setDeliveryEmail] = useState("")
  const scrollRef = useRef<ScrollView>(null)
  const fieldYPositions = useRef<Record<string, number>>({})

  // --- Consolidated field validation -------------------------------------
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const PHONE_REGEX = /^(0\d{9}|\+256\d{9}|256\d{9})$/
  const CARD_EXPIRY_REGEX = /^(0[1-9]|1[0-2])\/\d{2}$/

  function registerFieldPos(key: string, y: number) { fieldYPositions.current[key] = y }

  function validatePurchaseForm(): Record<string, string> {
    const errs: Record<string, string> = {}
    const names = getBuyerNames()
    for (let i = 0; i < actualTicketCount; i++) {
      if (!names[i]?.trim()) errs[`name_${i}`] = `Please enter name for person ${i + 1}`
    }
    if (selectedEntryFee?.seatMap && selectedEntryFee.seatMap.type !== "none") {
      if (isTableEntry) {
        const unassigned = tableSeats.slice(0, quantity).filter(s => s == null)
        if (unassigned.length > 0) errs.seat_selection = "Please select a table for each group"
      } else {
        const unassigned = perPersonSeats.slice(0, actualTicketCount).filter(s => s == null)
        if (unassigned.length > 0) errs.seat_selection = "Please select a seat for each person"
      }
    }
    if (!selectedTicketType && ticketTypes.length > 0) errs.ticketType = "Please select a ticket type"
    if (!user && !buyerContactEmail.trim()) errs.buyerContactEmail = "Please enter your email address"
    else if (!user && !EMAIL_REGEX.test(buyerContactEmail.trim())) errs.buyerContactEmail = "Enter a valid email address"
    if (!paymentMethod) errs.paymentMethod = "Please select a payment method"
    // Email distribution validation
    if (emailDistribution === "single" && !visitorEmail.trim()) {
      errs.visitorEmail = "Please enter a delivery email address for this ticket"
    } else if (emailDistribution === "single" && !EMAIL_REGEX.test(visitorEmail.trim())) {
      errs.visitorEmail = "Enter a valid email address for delivery"
    }
    if (emailDistribution === "multiple") {
      const hasEmpty = buyerEmails.slice(0, actualTicketCount).some(e => !e.trim())
      if (hasEmpty) errs.buyerEmailDist = "Please enter a delivery email for each attendee"
    }
    // Seat/table per-person inline errors
    if (selectedEntryFee?.seatMap && selectedEntryFee.seatMap.type !== "none" && !isTableEntry) {
      for (let i = 0; i < actualTicketCount; i++) {
        if (perPersonSeats[i] == null && !errs.seat_selection) errs.seat_selection = "Please select a seat for each person"
        if (perPersonSeats[i] == null) errs[`seat_${i}`] = "Seat required"
      }
    }
    if (isTableEntry && selectedEntryFee?.seatMap && selectedEntryFee.seatMap.type !== "none") {
      for (let i = 0; i < quantity; i++) {
        if (tableSeats[i] == null) errs[`table_${i}`] = "Table required"
      }
    }
    if (paymentMethod === "mobile_money") {
      if (!mobileMoneyNumber.trim()) errs.mobileMoneyNumber = "Please enter your mobile money number"
      else if (!PHONE_REGEX.test(mobileMoneyNumber.trim())) errs.mobileMoneyNumber = "Enter a valid Ugandan phone (e.g. 0772123456)"
    }
    if (paymentMethod === "credit_card") {
      if (!cardFirstName.trim()) errs.cardFirstName = "Please enter your first name for billing"
      if (!cardLastName.trim()) errs.cardLastName = "Please enter your last name for billing"
      if (!cardPhone.trim()) errs.cardPhone = "Please enter your phone number for billing"
      else if (!PHONE_REGEX.test(cardPhone.trim())) errs.cardPhone = "Enter a valid Ugandan phone (e.g. 0772123456)"
    }
    return errs
  }

  function handleFieldErrors(errs: Record<string, string>): boolean {
    setFieldErrors(errs)
    if (Object.keys(errs).length === 0) return false
    const firstKey = Object.keys(errs)[0]
    const y = fieldYPositions.current[firstKey]
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true })
    setValidationErrors(Object.values(errs))
    setValidationVisible(true)
    return true
  }

  // Installment state
  const [useInstallments, setUseInstallments] = useState(false)
  const [installmentPlanType, setInstallmentPlanType] = useState<InstallmentPlanType>("2")
  const [installmentPlanId, setInstallmentPlanId] = useState<string | null>(null)

  // ===========================================================================
  // FIX: Security-photo branch logic, computed ONCE at component scope so it's
  // visible both to the JSX render below AND to handlePurchase/createTicketAndNavigate.
  // Previously this was declared separately inside handlePurchase AND inside
  // createTicketAndNavigate (in the latter case, even referencing deliveryEmails/
  // payerEmail before those were defined) � neither of those inner copies was
  // visible to the JSX, which is what caused:
  //   "ReferenceError: showManualPhotoCapture is not defined"
  // Do not redeclare these inside handlePurchase or createTicketAndNavigate �
  // both functions now just reference these component-scope values directly.
  // ===========================================================================
  const payerEmailForPhotoCheck = buyerContactEmail.trim() || visitorEmail.trim() || buyerEmails[0]?.trim() || user?.email || ""
  const deliveryEmailsForPhotoCheck = emailDistribution === "single"
    ? Array(actualTicketCount).fill(payerEmailForPhotoCheck)
    : buyerEmails.slice(0, actualTicketCount).map(e => e.trim())

  const isBuyingForSelf = actualTicketCount === 1 && !isTableEntry && !buyingForSomeoneElse && deliveryEmailsForPhotoCheck[0] === payerEmailForPhotoCheck
  const showManualPhotoCapture = isBuyingForSelf
  const securityPhotoForcedViaEmail = actualTicketCount > 1 || isTableEntry || (actualTicketCount === 1 && !isBuyingForSelf)

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
        console.log(`?? Network error attempt ${attempts}:`, err)
        networkError = true
      }
    }
    
    console.log("? Final status:", status)
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

  // PesaPal has no trusted client-side "payment complete" signal. Verify the
  // merchant reference server-side until the processor reports COMPLETED.
  // Ticket creation is deliberately gated on that verified result.
  const pollPesapalStatus = async (merchantReference: string, trackingId?: string) => {
    const maxAttempts = 60
    setPesapalOrderRef(merchantReference)
    setPesapalTrackingId(trackingId || null)
    setCheckingPayment(true)
    setStatusMessage("Complete payment in the PesaPal window. We are verifying it automatically.")
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const verification = await PesaPalService.verifyPayment(merchantReference, trackingId)
        if (verification.status === "completed") {
          setCheckingPayment(false)
          setPurchaseStatus("success")
          setStatusMessage("Payment verified! Creating your ticket...")
          await createTicketAndNavigate(false, verification)
          // Clear the refs only AFTER fulfillment consumed them (server-side
          // payment re-verification needs the tracking id / merchant ref).
          setPesapalOrderRef(null)
          setPesapalTrackingId(null)
          return
        }
        if (verification.status === "failed") {
          setStatusMessage("PesaPal reported that the payment failed or was cancelled. You can retry verification or cancel.")
          return
        }
      } catch (error) {
        console.warn("PesaPal verification attempt failed; retaining pending state", error)
      }
      setStatusMessage(`Still verifying payment... Attempt ${attempt + 1}/${maxAttempts}.`)
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
    setStatusMessage("Payment is still being verified. You can retry verification or cancel. Do not pay again unless the payment is confirmed failed.")
  }

  const createTicketAndNavigate = async (isMobileMoney: boolean, verificationResult: any) => {
    // Phase 1: ticket creation is server-side. We submit the full purchase
    // payload; the server re-verifies the payment with the provider and only
    // then creates the tickets, uploads the QR/photo, emails, and records the
    // fulfillment row. The client no longer writes ticket rows.
    const fulfillmentId = activeFulfillmentId ?? uuidv4()
    setActiveFulfillmentId(fulfillmentId)

    try {
      setLoading(true)
      setProgressVisible(true)
      setProgressCompleted(false)
      setProgressStep(0)

      const buyerNamesList = getBuyerNames()
      const buyerEmailsList = getBuyerEmails()
      const buyerEmailFinal = user?.email || buyerContactEmail.trim() || ""

      const deliveryEmails = emailDistribution === "single"
        ? Array(actualTicketCount).fill(visitorEmail.trim() || buyerEmails[0]?.trim() || buyerEmailFinal)
        : buyerEmailsList

      const payerEmail = user?.email || buyerContactEmail.trim() || visitorEmail.trim() || buyerEmails[0]?.trim() || ""

      const includePhoto = securityPhotoEnabled && photoCaptured

      setProgressStep(1) // Saving ticket
      const result = await TicketService.fulfillPurchase({
        fulfillmentId,
        eventId: event!.id,
        ticketType: selectedTicketTypeName,
        quantity: actualTicketCount,
        totalAmount: total,
        isTableEntry,
        tableSize,
        buyerNames: buyerNamesList,
        buyerEmails: buyerEmailsList,
        deliveryEmails,
        payerEmail,
        buyerId: user?.id ?? null,
        buyerPhone: (paymentMethod === "credit_card" ? cardPhone : mobileMoneyNumber) || undefined,
        buyerPhotoDataUrl: includePhoto ? buyerPhotoUrl : undefined,
        seatNumbers: isTableEntry ? undefined : perPersonSeats,
        tableNumbers: isTableEntry
          ? tableSeats.flatMap((t) => t != null ? Array(tableSize).fill(t) : [null]).slice(0, actualTicketCount)
          : undefined,
        payment: {
          method: paymentMethod || "mobile_money",
          provider: paymentMethod === "mobile_money" ? mobileMoneyProvider : undefined,
          number: paymentMethod === "mobile_money" ? mobileMoneyNumber : (paymentMethod === "credit_card" ? cardPhone : undefined),
          name: paymentMethod === "mobile_money" ? mobileMoneyName : undefined,
          cardName: paymentMethod === "credit_card" ? `${cardFirstName} ${cardLastName}`.trim() : undefined,
          bankName: paymentMethod === "bank_transfer" ? bankName : undefined,
          accountNumber: paymentMethod === "bank_transfer" ? bankAccountNumber : undefined,
          accountName: paymentMethod === "bank_transfer" ? bankAccountName : undefined,
        },
        verification: {
          orderId: isMobileMoney ? undefined : (paymentOrderId || pesapalOrderRef || undefined),
          trackingId: isMobileMoney ? undefined : (pesapalTrackingId || undefined),
          depositId: isMobileMoney ? (pawaPayDepositId || verificationResult.depositId || undefined) : undefined,
        },
      })

      if (result.success) {
        setProgressStep(4) // Ticket successfully delivered
        setProgressCompleted(true)
        setPurchaseStatus("success")
        setStatusMessage(`${actualTicketCount} ticket${actualTicketCount > 1 ? "s" : ""} purchased successfully!`)
        setTimeout(() => {
          setProgressVisible(false)
          navigation.navigate("MyTickets")
        }, 1000)
        return
      }

      setProgressVisible(false)

      if (result.status === "pending" || result.status === "in_progress") {
        setCheckingPayment(true)
        setPurchaseStatus(null)
        setStatusMessage(
          result.status === "in_progress"
            ? "Your purchase is being finalized. Check My Tickets shortly, or retry below."
            : "Payment is still being verified. You can retry verification or cancel. Do not pay again unless the payment is confirmed failed.",
        )
        return
      }

      // Payment failed or a server error — surface it with the reference.
      setCheckingPayment(false)
      setPurchaseStatus("error")
      setStatusMessage(result.error || "We could not finalize your purchase. Please try again.")
      Alert.alert(
        "Purchase Not Completed",
        result.error || "We could not finalize your purchase. Please try again or contact support.",
        [{ text: "OK" }],
      )
    } catch (error: any) {
      console.error("Ticket creation error:", error)
      setProgressVisible(false)
      setCheckingPayment(false)
      setPurchaseStatus("error")
      setStatusMessage(error?.message || "Failed to finalize your purchase. Please try again.")
      Alert.alert(
        "Purchase Error",
        `We could not finalize your purchase. Reference: ${fulfillmentId}. If you paid, contact support with this reference.`,
        [{ text: "OK", onPress: () => navigation.navigate("MyTickets") }],
      )
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
    return PesaPalService.calculateTicketPrice(basePrice, actualTicketCount, event.date, event.lateFeePercent)
  }, [basePrice, actualTicketCount, event?.date])

  const { subtotal, lateFee, total, isLatePurchase } = pricing
  const { appCommission, venueRevenue } = PaymentService.calculateRevenueSplit(total)

  // Installment preview � recalculated whenever plan type or total changes
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
    if (fieldErrors[`name_${index}`]) {
      setFieldErrors(prev => { const n = { ...prev }; delete n[`name_${index}`]; return n })
    }
  }
  
  const updateBuyerEmail = (index: number, email: string) => {
    setBuyerEmails(prev => {
      const newEmails = [...prev]
      newEmails[index] = email
      return newEmails
    })
    if (fieldErrors.buyerEmailDist) setFieldErrors(prev => { const n = { ...prev }; delete n.buyerEmailDist; return n })
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
    setFieldErrors({})
    const errs = validatePurchaseForm()
    delete errs.paymentMethod; delete errs.mobileMoneyNumber; delete errs.cardFirstName; delete errs.cardLastName; delete errs.cardPhone
    if (Object.keys(errs).length > 0) { handleFieldErrors(errs); return }

    const buyerNamesList = getBuyerNames()
    const buyerEmailFinal = user?.email || buyerContactEmail.trim() || ""
    const buyerNameFinal = visitorName.trim() || buyerEmailFinal.split("@")[0] || "Guest"
    const buyerEmailsList = getBuyerEmails()
    const deliveryEmails = emailDistribution === "single"
      ? Array(actualTicketCount).fill(visitorEmail.trim() || buyerEmails[0]?.trim() || "")
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
          seatNumber: isTableEntry ? (tableSeats[0] ?? undefined) : (perPersonSeats.filter(s => s != null)[0] ?? undefined),
        },
        {
          method: (paymentMethod || "credit_card") as "mobile_money" | "credit_card" | "bank_transfer",
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
        setPaymentStatus("pending")
        void pollPesapalInstallmentStatus(result.planId, result.orderId || "", result.trackingId)
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
        // network hiccup � keep polling
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

  const pollPesapalInstallmentStatus = async (planId: string, merchantReference: string, trackingId?: string) => {
    if (!merchantReference) return
    setCheckingPayment(true)
    setStatusMessage("Complete the installment payment in the PesaPal window. Verification is automatic.")
    for (let attempt = 0; attempt < 60; attempt++) {
      const verification = await PesaPalService.verifyPayment(merchantReference, trackingId)
      if (verification.status === "completed") {
        await InstallmentService.onInstallmentPaid(planId, 0, verification.transactionId || merchantReference, "credit_card")
        setCheckingPayment(false)
        setPurchaseStatus("success")
        setStatusMessage("Installment payment verified. Your installment plan has been updated.")
        setTimeout(() => navigation.navigate("MyTickets"), 1500)
        return
      }
      if (verification.status === "failed") {
        setCheckingPayment(false)
        setPurchaseStatus("error")
        setStatusMessage("PesaPal reported that the installment payment failed or was cancelled.")
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
    setCheckingPayment(false)
    setPurchaseStatus("error")
    setStatusMessage("The installment payment is still pending. Check My Tickets later before trying again.")
  }

  const handlePurchase = async () => {
    console.log("[handlePurchase] START - user:", user?.id || "visitor", "paymentMethod:", paymentMethod)
    
    // Consolidated validation
    setFieldErrors({})
    const errs = validatePurchaseForm()
    if (Object.keys(errs).length > 0) { handleFieldErrors(errs); return }

    // Determine buyer ID, email, and phone based on auth status
    let buyerId: string
    let buyerName: string
    let buyerEmail: string
    let buyerPhone: string
    
    if (user) {
      buyerId = user.id
      buyerName = user.displayName || user.email || "Unknown"
      buyerEmail = user.email || ""
      buyerPhone = user?.paymentDetails?.mobileMoney?.phoneNumber || ""
    } else {
      buyerId = `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      buyerName = visitorName.trim() || buyerContactEmail.trim().split('@')[0] || "Guest"
      buyerEmail = buyerContactEmail.trim()
      buyerPhone = visitorPhone.trim() || ""
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
        
        console.log("?? Initiating mobile money payment via PawaPay...")
        const depositResult = await PawaPayService.initiateDeposit(
          total,
          "UGX",
          mobileMoneyNumber,
          provider
        )

        if (!depositResult.success) {
          throw new Error(depositResult.error || "Failed to initiate mobile money payment")
        }

        console.log("? PawaPay deposit initiated:", depositResult.depositId)
        
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
        const callbackUrl = typeof window !== "undefined" ? `${window.location.origin}/events/payment-callback` : ""

        console.log("?? Submitting order to PesaPal...")
        const orderResult = await PesaPalService.submitOrder(
          total,
          description,
          buyerEmail,
          buyerPhone,
          callbackUrl,
          buyerName,
          cardFirstName || undefined,
          cardLastName || undefined,
        )

        if (!orderResult.success || !orderResult.paymentUrl) {
          throw new Error(orderResult.error || "Failed to initialize payment")
        }

        console.log("? PesaPal order created:", orderResult.orderId)
        console.log("?? Payment URL:", orderResult.paymentUrl)

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

        setPaymentOrderId(orderId)
        setPaymentStatus("pending")
        void pollPesapalStatus(orderId, orderResult.trackingId)
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

  // Informational checkout progress (derived from state — never gates flows).
  const checkoutStep = useMemo(() => {
    const namesOk = Array.from({ length: actualTicketCount }).every(
      (_, i) => ((buyerNames[i] || "").trim().length > 0),
    )
    const deliveryOk = emailDistribution === "multiple"
      ? Array.from({ length: actualTicketCount }).every(
          (_, i) => ((buyerEmails[i] || "").trim().length > 0),
        )
      : (visitorEmail || "").trim().length > 0
    if (!selectedTicketType) return 1
    if (!namesOk) return 2
    if (!deliveryOk) return 3
    return 4
  }, [selectedTicketType, actualTicketCount, buyerNames, buyerEmails, emailDistribution, visitorEmail])

  if (initialLoading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#00D4FF" />
        <Text style={{ color: '#FFFFFF', marginTop: 12, fontSize: 16 }}>Loading event details...</Text>
      </View>
    )
  }

  if (!event) {
    return (
      <View style={styles.container}>
      <ScrollView ref={scrollRef}>
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
              ? Payment Pending
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

            {/* If we have a PesaPal order and payment is still pending/failed, show retry button */}
            {pesapalOrderRef && (
              <TouchableOpacity
                style={styles.recheckButton}
                onPress={async () => {
                  setCheckingPayment(true)
                  setStatusMessage("Retrying PesaPal payment verification...")
                  await pollPesapalStatus(pesapalOrderRef, pesapalTrackingId || undefined)
                }}
              >
                <Ionicons name="refresh" size={20} color="#FFF" />
                <Text style={styles.recheckButtonText}>Retry Verification</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.cancelPaymentButton}
              onPress={() => {
                setCheckingPayment(false)
                setPawaPayDepositId(null)
                setPesapalOrderRef(null)
                setPesapalTrackingId(null)
              }}
            >
              <Text style={styles.cancelPaymentText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <ScrollView>
        <View style={[styles.header, isLargeScreen && styles.desktopHeader]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back to event"
          >
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Purchase Tickets</Text>
          <View style={styles.headerSecure}>
            <Ionicons name="lock-closed" size={13} color="#00D4FF" />
            <Text style={styles.headerSecureText}>Secure Checkout</Text>
          </View>
        </View>

        {/* ── Event hero band ────────────────────────────────────── */}
        <View style={[styles.eventHero, isLargeScreen && styles.eventHeroDesktop]}>
          {event.posterImageUrl ? (
            <Image
              source={{ uri: event.posterImageUrl }}
              style={styles.eventHeroBg as any}
              resizeMode="cover"
            />
          ) : null}
          <View style={styles.eventHeroOverlay} />
          <View style={styles.eventHeroContent}>
            <Text style={styles.eventHeroName}>{event.name}</Text>
            <View style={styles.eventHeroChips}>
              <View style={styles.chip}>
                <Ionicons name="location-outline" size={13} color="#00D4FF" />
                <Text style={styles.chipText}>{event.venueName}</Text>
              </View>
              <View style={styles.chip}>
                <Ionicons name="calendar-outline" size={13} color="#00D4FF" />
                <Text style={styles.chipText}>{new Date(event.date).toDateString()}</Text>
              </View>
              {event.time ? (
                <View style={styles.chip}>
                  <Ionicons name="time-outline" size={13} color="#00D4FF" />
                  <Text style={styles.chipText}>{event.time}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── Checkout progress ──────────────────────────────────── */}
        <View style={[styles.stepper, isLargeScreen && styles.desktopStepper]}>
          {STEP_LABELS.map((label, i) => {
            const stepNum = i + 1
            const done = checkoutStep > stepNum
            const active = checkoutStep >= stepNum
            return (
              <View key={label} style={styles.stepperItem}>
                <View style={[styles.stepperDot, active && styles.stepperDotActive]}>
                  {done ? (
                    <Ionicons name="checkmark" size={12} color="#03121a" />
                  ) : (
                    <Text style={[styles.stepperDotText, active && styles.stepperDotTextActive]}>{stepNum}</Text>
                  )}
                </View>
                <Text style={[styles.stepperLabel, active && styles.stepperLabelActive]}>{label}</Text>
                {i < STEP_LABELS.length - 1 && <View style={[styles.stepperLine, done && styles.stepperLineActive]} />}
              </View>
            )
          })}
        </View>

      {/* Purchase Status Dialog */}
      <StatusDialog
        visible={purchaseStatus !== null}
        type={purchaseStatus === "success" ? "success" : "error"}
        message={statusMessage || "Payment failed. Please try again."}
        onDismiss={() => { setPurchaseStatus(null); setStatusMessage("") }}
      />

      <View style={isLargeScreen ? styles.desktopTicketLayout : undefined}>
      <View style={isLargeScreen ? styles.desktopTicketLeft : undefined}>
        <View style={[styles.ticketSection, isLargeScreen && styles.desktopSectionWide]}>
        <StepSectionTitle step={1} title="Select Ticket Type" />

        {/* Ticket Type Selector: inline tier cards on desktop, modal elsewhere */}
        {ticketTypes.length > 0 ? (
          isLargeScreen ? (
            <View style={styles.tierGrid}>
              {ticketTypes.map((fee: any) => {
                const isSelected = selectedTicketType?.name === fee.name
                const soldOut = isSoldOut(fee)
                const remaining = fee.maxTickets && fee.maxTickets > 0
                  ? Math.max(0, fee.maxTickets - (soldCounts[fee.name] ?? 0))
                  : null
                const hasSeatMap = fee.seatMap && fee.seatMap.type !== "none"
                return (
                  <TouchableOpacity
                    key={`${fee.name}_tier`}
                    activeOpacity={0.8}
                    style={[
                      styles.tierCard,
                      isSelected && styles.tierCardSelected,
                      soldOut && styles.tierCardSoldOut,
                    ]}
                    onPress={() => {
                      if (soldOut) return
                      setSelectedTicketType(fee)
                      setFieldErrors((prev: any) => { const n = { ...prev }; delete n.ticketType; return n })
                    }}
                    disabled={soldOut}
                  >
                    <View style={styles.tierCardHeader}>
                      <Text style={[styles.tierCardName, soldOut && { color: "#666" }]}>{fee.name}</Text>
                      {soldOut ? (
                        <View style={styles.soldOutBadge}>
                          <Text style={styles.soldOutBadgeText}>SOLD OUT</Text>
                        </View>
                      ) : isSelected ? (
                        <Ionicons name="checkmark-circle" size={22} color="#00FF9F" />
                      ) : hasSeatMap ? (
                        <View style={styles.seatMapBadge}>
                          <Text style={styles.seatMapBadgeText}>PICK SEAT</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.tierCardPrice, soldOut && { color: "#555" }]}>
                      UGX {Number.parseInt(String(fee.amount || "0").replace(/[^0-9]/g, "") || "0").toLocaleString()}
                    </Text>
                    {remaining !== null && !soldOut && (
                      <Text style={styles.remainingText}>{remaining} left</Text>
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
          ) : (
            <TouchableOpacity 
              style={[styles.ticketTypeSelector, fieldErrors.ticketType && { borderColor: "#FF4444", borderWidth: 1.5 }]}
              onPress={() => setShowTicketTypeModal(true)}
              activeOpacity={0.8}
            >
              <View style={styles.ticketTypeSelectorContent}>
                <Ionicons name="ticket" size={24} color="#00D4FF" />
                  <View style={styles.ticketTypeSelectorText}>
                    <Text style={[styles.ticketTypeSelectorLabel, !selectedTicketType && { color: "#666", fontStyle: "italic" }]}>
                      {selectedTicketTypeName}
                    </Text>
                    {selectedTicketType && (
                      <Text style={styles.ticketTypeSelectorPrice}>
                        UGX {isTableEntry ? (basePrice * tableSize).toLocaleString() : basePrice.toLocaleString()}
                      </Text>
                    )}
                  </View>
              </View>
              <Ionicons name="chevron-down" size={24} color="#888888" />
            </TouchableOpacity>
          )
        ) : (
          <Text style={styles.noTicketsText}>No ticket types available</Text>
        )}
        {fieldErrors.ticketType && <Text style={{ color: "#FF4444", fontSize: 12, marginBottom: 4 }}>{fieldErrors.ticketType}</Text>}

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
        <View style={[styles.visitorInfoSection, isLargeScreen && styles.desktopSectionWide]}>
          <Text style={styles.sectionTitle}>Buyer Contact Info</Text>
          <TextInput
            style={[styles.input, fieldErrors.buyerContactEmail && styles.inputError]}
            value={buyerContactEmail}
            onChangeText={(t) => { setBuyerContactEmail(t); setFieldErrors(prev => { const n = { ...prev }; delete n.buyerContactEmail; return n }) }}
            placeholder="Enter buyer's email address"
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {fieldErrors.buyerContactEmail && <Text style={{ color: "#FF4444", fontSize: 12, marginBottom: 4 }}>{fieldErrors.buyerContactEmail}</Text>}
        </View>
      )}

      {/* Buyer Names Section - One input per ticket */}
      <View style={[styles.buyerNamesSection, isLargeScreen && styles.desktopSectionWide]}>
        <StepSectionTitle
          step={2}
          title={isTableEntry
            ? `Names (${quantity} x ${tableSize} pax)`
            : `Names (${actualTicketCount} ticket${actualTicketCount > 1 ? "s" : ""})`}
        />
        {!user && (
          <Text style={styles.sectionSubtitle}>Each ticket requires a unique name</Text>
        )}

        {isTableEntry ? (
          /* -- Table mode: group names by table -- */
          <View style={[isLargeScreen && styles.namesGrid]}>
            {Array.from({ length: quantity }).map((_, tableIdx) => {
              const start = tableIdx * tableSize
              const end = start + tableSize
              return (
                <View key={tableIdx} style={[styles.tableGroupCard, isLargeScreen && styles.namesGridItem]}>
                  <View style={styles.tableGroupHeader}>
                    <Text style={styles.tableGroupTitle}>Table {tableIdx + 1}</Text>
                    <TouchableOpacity
                      style={[styles.seatSelectBtn, tableSeats[tableIdx] != null && styles.seatSelectBtnActive, fieldErrors[`table_${tableIdx}`] && { borderColor: "#FF4444", borderWidth: 1.5 }]}
                      onPress={() => {
                        const fee = ticketTypes.find((t: any) => t.name === selectedTicketTypeName)
                        if (fee) openSeatMap(fee, tableIdx, "table")
                      }}
                    >
                      <Text style={[styles.seatSelectBtnText, tableSeats[tableIdx] != null && styles.seatSelectBtnTextActive]}>
                        {tableSeats[tableIdx] != null ? `Table ${tableSeats[tableIdx]}` : "Select Table"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {Array.from({ length: tableSize }).map((_, seatIdx) => {
                    const personIdx = start + seatIdx
                    return (
                      <View key={seatIdx} style={styles.tablePersonRow}>
                        <TextInput
                          style={[styles.input, { flex: 1 }, fieldErrors[`name_${personIdx}`] && styles.inputError]}
                          value={buyerNames[personIdx] || ""}
                          onChangeText={(text) => updateBuyerName(personIdx, text)}
                          placeholder={`Person ${personIdx + 1} Name`}
                          placeholderTextColor="#999"
                        />
                      </View>
                    )
                  })}
                </View>
              )
            })}
          </View>
        ) : (
          /* -- Normal mode: one name per ticket with seat picker -- */
          <View style={[isLargeScreen && styles.namesGrid]}>
            {Array.from({ length: actualTicketCount }).map((_, index) => {
              const hasSeatMap = selectedEntryFee?.seatMap && selectedEntryFee.seatMap.type !== "none"
              return (
                <View key={index} style={[styles.nameRow, isLargeScreen && styles.namesGridItem]}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginRight: hasSeatMap ? 8 : 0 }, fieldErrors[`name_${index}`] && styles.inputError]}
                    value={buyerNames[index] || ""}
                    onChangeText={(text) => updateBuyerName(index, text)}
                    placeholder={`Person ${index + 1} Name`}
                    placeholderTextColor="#999"
                  />
                  {hasSeatMap && (
                    <TouchableOpacity
                      style={[styles.seatSelectBtn, perPersonSeats[index] != null && styles.seatSelectBtnActive, fieldErrors[`seat_${index}`] && { borderColor: "#FF4444", borderWidth: 1.5 }]}
                      onPress={() => {
                        const fee = ticketTypes.find((t: any) => t.name === selectedTicketTypeName)
                        if (fee) openSeatMap(fee, index, "seat")
                      }}
                    >
                      <Text style={[styles.seatSelectBtnText, perPersonSeats[index] != null && styles.seatSelectBtnTextActive]}>
                        {perPersonSeats[index] != null ? `Seat ${perPersonSeats[index]}` : "Seat �"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            })}
          </View>
        )}
      </View>

      {/* Email Distribution Section */}
      <View style={[styles.emailDistributionSection, isLargeScreen && styles.desktopSectionHalf]}>
        <StepSectionTitle step={3} title="Email Distribution" />
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
          <View>
            <TextInput
            style={[styles.input, fieldErrors.visitorEmail && styles.inputError]}
            value={visitorEmail}
            onChangeText={(t) => { setVisitorEmail(t); setFieldErrors(prev => { const n = { ...prev }; delete n.visitorEmail; return n }) }}
            placeholder="Enter email address"
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {fieldErrors.visitorEmail && <Text style={{ color: "#FF4444", fontSize: 12, marginBottom: 4 }}>{fieldErrors.visitorEmail}</Text>}
          </View>
        ) : (
          <View>
          {Array.from({ length: actualTicketCount }).map((_, index) => (
            <TextInput
              key={index}
              style={[styles.input, fieldErrors.buyerEmailDist && styles.inputError]}
              value={buyerEmails[index] || ""}
              onChangeText={(text) => updateBuyerEmail(index, text)}
              placeholder={`Person ${index + 1} Email`}
              placeholderTextColor="#999"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          ))}
          {fieldErrors.buyerEmailDist && <Text style={{ color: "#FF4444", fontSize: 12, marginBottom: 4 }}>{fieldErrors.buyerEmailDist}</Text>}
          </View>
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

      <View style={[styles.securitySection, isLargeScreen && styles.desktopSectionHalf]}>
        <StepSectionTitle step={2} title="Security (Optional)" />
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

      <View style={[styles.paymentSection, isLargeScreen && styles.desktopSectionHalf]}>
        <StepSectionTitle step={4} title="Payment Method" />
        
        {/* Mobile Money */}
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.paymentOption, paymentMethod === "mobile_money" && styles.paymentOptionSelected]}
          onPress={() => setPaymentMethod("mobile_money")}
        >
          <View style={styles.paymentOptionMain}>
            <View style={[styles.paymentOptionIcon, paymentMethod === "mobile_money" && styles.paymentOptionIconActive]}>
              <Ionicons name="phone-portrait" size={22} color={paymentMethod === "mobile_money" ? "#00D4FF" : "#888888"} />
            </View>
            <View>
              <Text style={[styles.paymentOptionText, paymentMethod === "mobile_money" && styles.paymentOptionTextSelected]}>Mobile Money</Text>
              <Text style={styles.paymentOptionSub}>MTN &amp; Airtel — instant</Text>
            </View>
          </View>
          {paymentMethod === "mobile_money" && <Ionicons name="checkmark-circle" size={22} color="#00D4FF" />}
        </TouchableOpacity>

        {/* Credit Card */}
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.paymentOption, paymentMethod === "credit_card" && styles.paymentOptionSelected]}
          onPress={() => setPaymentMethod("credit_card")}
        >
          <View style={styles.paymentOptionMain}>
            <View style={[styles.paymentOptionIcon, paymentMethod === "credit_card" && styles.paymentOptionIconActive]}>
              <Ionicons name="card" size={22} color={paymentMethod === "credit_card" ? "#00D4FF" : "#888888"} />
            </View>
            <View>
              <Text style={[styles.paymentOptionText, paymentMethod === "credit_card" && styles.paymentOptionTextSelected]}>Credit Card</Text>
              <Text style={styles.paymentOptionSub}>Visa &amp; Mastercard</Text>
            </View>
          </View>
          {paymentMethod === "credit_card" && <Ionicons name="checkmark-circle" size={22} color="#00D4FF" />}
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
              style={[styles.input, fieldErrors.mobileMoneyNumber && styles.inputError]}
              value={mobileMoneyNumber}
              onChangeText={(t) => { setMobileMoneyNumber(t); setFieldErrors(prev => { const n = { ...prev }; delete n.mobileMoneyNumber; return n }) }}
              placeholder="Mobile money number"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
            />
            {fieldErrors.mobileMoneyNumber && <Text style={{ color: "#FF4444", fontSize: 12, marginBottom: 4 }}>{fieldErrors.mobileMoneyNumber}</Text>}
            <TextInput
              style={styles.input}
              value={mobileMoneyName}
              onChangeText={setMobileMoneyName}
              placeholder="Account holder name"
              placeholderTextColor="#999"
            />
          </View>
          )}
          {/* Credit Card Billing Form */}
          {paymentMethod === "credit_card" && (
            <View style={styles.paymentForm}>
              <Text style={styles.paymentFormTitle}>Billing Details</Text>
              <TextInput style={[styles.input, fieldErrors.cardFirstName && styles.inputError]}                   value={cardFirstName}
                  onChangeText={(t) => { setCardFirstName(t); setFieldErrors(prev => { const n = { ...prev }; delete n.cardFirstName; return n }) }}
                  placeholder="First name" placeholderTextColor="#999" />
              <TextInput style={[styles.input, fieldErrors.cardLastName && styles.inputError]} value={cardLastName} onChangeText={(t) => { setCardLastName(t); setFieldErrors(prev => { const n = { ...prev }; delete n.cardLastName; return n }) }} placeholder="Last name" placeholderTextColor="#999" />
              <TextInput style={[styles.input, fieldErrors.cardPhone && styles.inputError]} value={cardPhone} onChangeText={(t) => { setCardPhone(t); setFieldErrors(prev => { const n = { ...prev }; delete n.cardPhone; return n }) }} placeholder="Phone number" placeholderTextColor="#999" keyboardType="phone-pad" />
              {fieldErrors.cardFirstName && <Text style={{ color: "#FF4444", fontSize: 12, marginBottom: 4 }}>{fieldErrors.cardFirstName}</Text>}
              {fieldErrors.cardLastName && <Text style={{ color: "#FF4444", fontSize: 12, marginBottom: 4 }}>{fieldErrors.cardLastName}</Text>}
              {fieldErrors.cardPhone && <Text style={{ color: "#FF4444", fontSize: 12, marginBottom: 4 }}>{fieldErrors.cardPhone}</Text>}
            </View>
          )}
        </View>

      {/* Installment Plan Toggle */}
      <View style={[styles.installmentSection, isLargeScreen && styles.desktopSectionHalf]}>
        <StepSectionTitle step={4} title="Payment Plan" />
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
              const label = i === 0 ? "Pay now" : `Installment ${i + 1} � due ${inst.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
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

      </View>{/* desktopTicketLeft */}
      <View style={isLargeScreen ? styles.desktopTicketRight : undefined}>
      <View style={[styles.summarySection, isLargeScreen && styles.desktopSummarySection]}>
        {/* Event thumbnail */}
        <View style={styles.summaryEventRow}>
          {event.posterImageUrl ? (
            <Image source={{ uri: event.posterImageUrl }} style={styles.summaryEventThumb} resizeMode="cover" />
          ) : (
            <View style={[styles.summaryEventThumb, styles.summaryEventThumbFallback]}>
              <Ionicons name="ticket" size={20} color="#00D4FF" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryEventName} numberOfLines={1}>{event.name}</Text>
            <Text style={styles.summaryEventMeta}>{new Date(event.date).toDateString()}</Text>
          </View>
        </View>
        <View style={styles.summaryDivider} />

        <Text style={styles.sectionTitle}>Order Summary</Text>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>
            Tickets ({quantity}x){isTableEntry && tableSize > 1 ? ` (${tableSize} pax/table)` : ""}
          </Text>
          <Text style={styles.summaryValue}>UGX {subtotal.toLocaleString()}</Text>
        </View>

        {isLatePurchase && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Late Fee ({(event?.lateFeePercent ?? 0)}%):</Text>
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
          style={[styles.loginToContinueLink, isLargeScreen && styles.desktopLoginToContinue]}
        >
          <Text style={styles.loginToContinueText}>Login to continue</Text>
        </TouchableOpacity>
      )}

      {/* Guest-only explicit consent — authenticated users already agreed to the
          Terms & Conditions during signup, so the checkbox gates only guests. */}
      {!user && (
        <TouchableOpacity style={styles.termsRow} onPress={() => setAcceptedTerms(prev => !prev)} activeOpacity={0.7}>
          <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
            {acceptedTerms && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
          </View>
          <Text style={styles.termsText}>
            I agree to the{" "}
            <Text
              style={styles.termsLink}
              onPress={(e) => { e?.stopPropagation?.(); (navigation as any).navigate("TermsAndConditions") }}
            >
              Terms &amp; Conditions
            </Text>
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[
          styles.purchaseButton,
          isLargeScreen && styles.desktopPurchaseButton,
          (!paymentMethod || loading || (!user && useInstallments) || (!user && !acceptedTerms)) && styles.purchaseButtonDisabled,
        ]}
        onPress={() => {
          if (!user && !acceptedTerms) {
            Alert.alert("Accept Terms", "Please read and accept the Terms & Conditions to continue.")
            return
          }
          useInstallments ? handleInstallmentPurchase() : handlePurchase()
        }}
        disabled={!paymentMethod || loading || (!user && useInstallments) || (!user && !acceptedTerms)}
        activeOpacity={0.85}
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

      {/* Trust cluster (visual only) */}
      <View style={[styles.trustCluster, isLargeScreen && styles.desktopTrustCluster]}>
        <View style={styles.trustRow}>
          <Ionicons name="lock-closed" size={13} color="#00D4FF" />
          <Text style={styles.trustText}>Secured by PesaPal &amp; PawaPay</Text>
        </View>
        <View style={styles.trustRow}>
          <Ionicons name="shield-checkmark-outline" size={13} color="#00FF9F" />
          <Text style={styles.trustText}>Instant ticket delivery to your email</Text>
        </View>
        <View style={styles.trustRow}>
          <Ionicons name="information-circle-outline" size={13} color="#F59E0B" />
          <Text style={styles.trustText}>Installment plans carry an 8% service fee</Text>
        </View>
      </View>
      </View>{/* desktopTicketRight */}
      </View>{/* desktopTicketLayout */}

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
                      setFieldErrors(prev => { const n = { ...prev }; delete n.ticketType; return n })
                      setShowTicketTypeModal(false)
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

      {/* Seat / Table Picker Modal */}
      <Modal visible={showSeatMapModal} transparent animationType="slide" onRequestClose={() => setShowSeatMapModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: "85%", width: "92%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {pickerMode === "table" ? "Select Table" : pickSeatIndex != null ? `Select Seat for Person ${pickSeatIndex + 1}` : "Select Seat"}
              </Text>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowSeatMapModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
            {pickerMode === "table" ? (
              /* -- Table selection grid (same color logic as seats) -- */
              <View style={seatMapStyles.numberedGrid}>
                {Array.from({ length: (seatMapFee as any)?.maxTickets || quantity }).map((_, idx) => {
                  const tableNum = idx + 1
                  const taken = occupiedTables.includes(tableNum)
                  const selectedByMe = tableSeats.includes(tableNum)
                  const isMine = pickSeatIndex != null && tableSeats[pickSeatIndex] === tableNum
                  const isDisabled = taken || (selectedByMe && !isMine)
                  return (
                    <TouchableOpacity key={tableNum}
                      style={[
                        seatMapStyles.numberedSeat,
                        taken && seatMapStyles.seatTaken,
                        selectedByMe && !isMine && seatMapStyles.seatSelectedByMe,
                        isMine && seatMapStyles.seatPicked,
                      ]}
                      onPress={() => {
                        if (isDisabled) return
                        const newTableSeats = [...tableSeats]
                        newTableSeats[pickSeatIndex ?? 0] = tableNum
                        setTableSeats(newTableSeats)
                        setShowSeatMapModal(false)
                      }} disabled={isDisabled}>
                      <Text style={[
                        seatMapStyles.numberedSeatLabel,
                        taken && { color: "#555" },
                        selectedByMe && !isMine && { color: "#FFD700" },
                        isMine && { color: "#000" },
                      ]}>{tableNum}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
              ) : seatMapFee && (seatMapFee as any).seatMap?.type === "cinema" ? (
                /* -- Cinema seat layout -- */
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
                          const selectedByMe = perPersonSeats.includes(seatNum)
                          const isMine = pickSeatIndex != null && perPersonSeats[pickSeatIndex] === seatNum
                          const isDisabled = taken || (selectedByMe && !isMine)
                          return (
                            <TouchableOpacity key={seatNum}
                              style={[
                                seatMapStyles.seat,
                                taken && seatMapStyles.seatTaken,
                                selectedByMe && !isMine && seatMapStyles.seatSelectedByMe,
                                isMine && seatMapStyles.seatPicked,
                              ]}
                              onPress={() => {
                                if (isDisabled) return
                                const newSeats = [...perPersonSeats]
                                newSeats[pickSeatIndex ?? 0] = seatNum
                                setPerPersonSeats(newSeats)
                                setShowSeatMapModal(false)
                              }} disabled={isDisabled}>
                              <Text style={[
                                seatMapStyles.seatLabel,
                                taken && { color: "#555" },
                                selectedByMe && !isMine && { color: "#FFD700" },
                                isMine && { color: "#000" },
                              ]}>{colIdx + 1}</Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    </View>
                  )
                })
              ) : (
                /* -- Numbered seat grid -- */
                <View style={seatMapStyles.numberedGrid}>
                  {Array.from({ length: (seatMapFee as any)?.maxTickets || 0 }).map((_, idx) => {
                    const seatNum = idx + 1
                    const taken = occupiedSeats.includes(seatNum)
                    const selectedByMe = perPersonSeats.includes(seatNum)
                    const isMine = pickSeatIndex != null && perPersonSeats[pickSeatIndex] === seatNum
                    const isDisabled = taken || (selectedByMe && !isMine)
                    return (
                      <TouchableOpacity key={seatNum}
                        style={[
                          seatMapStyles.numberedSeat,
                          taken && seatMapStyles.seatTaken,
                          selectedByMe && !isMine && seatMapStyles.seatSelectedByMe,
                          isMine && seatMapStyles.seatPicked,
                        ]}
                        onPress={() => {
                          if (isDisabled) return
                          const newSeats = [...perPersonSeats]
                          newSeats[pickSeatIndex ?? 0] = seatNum
                          setPerPersonSeats(newSeats)
                          setShowSeatMapModal(false)
                        }} disabled={isDisabled}>
                        <Text style={[
                          seatMapStyles.numberedSeatLabel,
                          taken && { color: "#555" },
                          selectedByMe && !isMine && { color: "#FFD700" },
                          isMine && { color: "#000" },
                        ]}>{seatNum}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}
              {/* Legend */}
              <View style={seatMapStyles.legend}>
                <View style={seatMapStyles.legendItem}><View style={[seatMapStyles.legendDot, { backgroundColor: "#2a2a2a" }]} /><Text style={seatMapStyles.legendText}>Available</Text></View>
                <View style={seatMapStyles.legendItem}><View style={[seatMapStyles.legendDot, { backgroundColor: "#FF4444" }]} /><Text style={seatMapStyles.legendText}>Taken</Text></View>
                <View style={seatMapStyles.legendItem}><View style={[seatMapStyles.legendDot, { backgroundColor: "#FFD700" }]} /><Text style={seatMapStyles.legendText}>Selected</Text></View>
                <View style={seatMapStyles.legendItem}><View style={[seatMapStyles.legendDot, { backgroundColor: "#00D4FF" }]} /><Text style={seatMapStyles.legendText}>Mine</Text></View>
              </View>
            </ScrollView>
            <TouchableOpacity
              style={[styles.purchaseButton, { marginHorizontal: 16, marginBottom: 20 }]}
              onPress={() => setShowSeatMapModal(false)}
            >
              <Text style={styles.purchaseButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      </ScrollView>

      <ValidationDialog
        visible={validationVisible}
        title="Missing Information"
        missingFields={validationErrors}
        onDismiss={() => setValidationVisible(false)}
      />

      <TicketCreationProgress
        visible={progressVisible}
        currentStep={progressStep}
        completed={progressCompleted}
        deliveryEmail={deliveryEmail}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 48,
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    flex: 1,
  },
  headerSecure: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,212,255,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,212,255,0.35)",
  },
  headerSecureText: {
    color: "#00D4FF",
    fontSize: 12,
    fontWeight: "600",
  },
  desktopHeader: {
    paddingTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  eventHero: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    overflow: "hidden",
    height: 150,
    position: "relative",
    backgroundColor: "#0c0e16",
  },
  eventHeroDesktop: {
    marginHorizontal: 0,
    borderRadius: 0,
    height: 150,
    marginBottom: 12,
  },
  eventHeroBg: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  eventHeroOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // web: vertical gradient; native: flat translucent scrim
    ...(Platform.OS === "web"
      ? {
          backgroundImage: "linear-gradient(180deg, rgba(5,5,8,0.15) 0%, rgba(5,5,8,0.72) 62%, rgba(5,5,8,0.95) 100%)",
        }
      : {
          backgroundColor: "rgba(5,5,8,0.72)",
        }),
  },
  eventHeroContent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
  },
  eventHeroName: {
    fontSize: 26,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  eventHeroChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  chipText: {
    color: "#DDDDDD",
    fontSize: 12,
    fontWeight: "500",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  stepperItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepperDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  stepperDotActive: {
    backgroundColor: "rgba(0,212,255,0.16)",
    borderColor: "#00D4FF",
  },
  stepperDotText: {
    color: "#888888",
    fontSize: 12,
    fontWeight: "700",
  },
  stepperDotTextActive: {
    color: "#00D4FF",
  },
  stepperLabel: {
    color: "#888888",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 8,
    marginRight: 4,
  },
  stepperLabelActive: {
    color: "#FFFFFF",
  },
  stepperLine: {
    flex: 1,
    height: 2,
    minWidth: 18,
    marginHorizontal: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  stepperLineActive: {
    backgroundColor: "#00D4FF",
  },
  ticketSection: {
    padding: 16,
    backgroundColor: SURFACE,
    margin: 16,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    marginTop: 0,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  stepSectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  stepChip: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 8,
    backgroundColor: "rgba(0,212,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,212,255,0.4)",
    marginRight: 10,
  },
  stepChipText: {
    color: "#00D4FF",
    fontSize: 13,
    fontWeight: "800",
  },
  stepSectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
    flex: 1,
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
  tierGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  tierCard: {
    width: "48%",
    backgroundColor: SURFACE_INNER,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    padding: 14,
  },
  tierCardSelected: {
    borderColor: "#00D4FF",
    backgroundColor: "rgba(0,212,255,0.08)",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 0 20px rgba(0,212,255,0.18)" }
      : {}),
  },
  tierCardSoldOut: {
    opacity: 0.55,
  },
  tierCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  tierCardName: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  tierCardPrice: {
    color: "#00D4FF",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
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
    backgroundColor: SURFACE,
    margin: 16,
    marginTop: 0,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  namesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  namesGridItem: {
    width: "48%",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  seatSelectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#2a2a2a",
    borderWidth: 1,
    borderColor: "#444",
  },
  seatSelectBtnActive: {
    backgroundColor: "rgba(0,212,255,0.12)",
    borderColor: "#00D4FF",
  },
  seatSelectBtnText: {
    color: "#888",
    fontSize: 11,
    fontWeight: "700",
  },
  seatSelectBtnTextActive: {
    color: "#00D4FF",
  },
  tableGroupCard: {
    backgroundColor: "#252525",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tableGroupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  tableGroupTitle: {
    color: "#00D4FF",
    fontSize: 14,
    fontWeight: "700",
  },
  tablePersonRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  visitorInfoSection: {
    padding: 16,
    backgroundColor: SURFACE,
    margin: 16,
    marginTop: 0,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  securitySection: {
    padding: 16,
    backgroundColor: SURFACE,
    margin: 16,
    marginTop: 0,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
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
    backgroundColor: SURFACE,
    margin: 16,
    marginTop: 0,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
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
    backgroundColor: SURFACE,
    margin: 16,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
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
    margin: 16,
    padding: 16,
    borderRadius: 12,
    ...(Platform.OS === "web"
      ? {
          backgroundImage: "linear-gradient(135deg, #00D4FF, #8B5CF6)",
          boxShadow: "0 8px 28px rgba(0,212,255,0.3)",
        }
      : {
          backgroundColor: "#2196F3",
        }),
  },
  desktopPurchaseButton: {
    margin: 0,
    marginTop: 4,
  },
  purchaseButtonDisabled: {
    opacity: 0.5,
    ...(Platform.OS === "web"
      ? { backgroundImage: "linear-gradient(135deg, #555555, #444444)", boxShadow: "none" }
      : { backgroundColor: "#666666" }),
  },
  termsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 14, marginBottom: 4, paddingHorizontal: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#888", alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: "#00D4FF", borderColor: "#00D4FF" },
  termsText: { color: "#AAA", fontSize: 12, lineHeight: 18 },
  termsLink: { color: "#00D4FF", fontWeight: "600", textDecorationLine: "underline" },
  purchaseButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 8,
  },
  // Payment section styles
  paymentSection: {
    padding: 16,
    backgroundColor: SURFACE,
    margin: 16,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  paymentOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    backgroundColor: SURFACE_INNER,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  paymentOptionSelected: {
    borderColor: "#00D4FF",
    backgroundColor: "rgba(0, 212, 255, 0.08)",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 0 18px rgba(0,212,255,0.15)" }
      : {}),
  },
  paymentOptionMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  paymentOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  paymentOptionIconActive: {
    borderColor: "rgba(0,212,255,0.5)",
    backgroundColor: "rgba(0,212,255,0.1)",
  },
  paymentOptionText: {
    color: "#888888",
    fontSize: 15,
    fontWeight: "600",
  },
  paymentOptionTextSelected: {
    color: "#00D4FF",
  },
  paymentOptionSub: {
    color: "#666666",
    fontSize: 12,
    marginTop: 2,
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
    borderWidth: 1,
    borderColor: "transparent",
  },
  inputError: { borderColor: "#FF4444", borderWidth: 1.5 },
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
    backgroundColor: SURFACE,
    margin: 16,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
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
  desktopTicketLayout: {
    flexDirection: "row",
    gap: 24,
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingVertical: 4,
  },
  desktopStepper: {
    marginBottom: 12,
    paddingHorizontal: 24,
  },
  desktopTicketLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    alignContent: "flex-start",
  },
  desktopSectionWide: {
    width: "100%",
    margin: 0,
  },
  desktopSectionHalf: {
    width: "48%",
    minWidth: 0,
    margin: 0,
  },
  desktopTicketRight: {
    width: 360,
    backgroundColor: "rgba(12, 14, 22, 0.85)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 16,
    alignSelf: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
    ...((Platform.OS === "web"
      ? { position: "sticky", top: 24, maxHeight: "calc(100vh - 48px)", overflow: "auto" }
      : {}) as any),
  },
  desktopSummarySection: {
    margin: 0,
    marginBottom: 16,
  },
  desktopLoginToContinue: {
    marginHorizontal: 0,
  },
  desktopTrustCluster: {
    marginHorizontal: 0,
  },
  summaryEventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  summaryEventThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#14141c",
  },
  summaryEventThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  summaryEventName: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  summaryEventMeta: {
    color: "#888888",
    fontSize: 12,
    marginTop: 2,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: SURFACE_BORDER,
    marginBottom: 16,
  },
  trustCluster: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 8,
  },
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trustText: {
    color: "#7c7c8c",
    fontSize: 12,
  },
})

const seatMapStyles = StyleSheet.create({
  cinemaRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  rowLabel: { color: "#888", fontSize: 12, width: 18, fontWeight: "bold" },
  seatsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  seat: { width: 28, height: 28, borderRadius: 4, backgroundColor: "#2a2a2a", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#444" },
  seatTaken: { backgroundColor: "#3a1a1a", borderColor: "#FF4444" },
  seatPicked: { backgroundColor: "#00D4FF", borderColor: "#00D4FF" },
  seatSelectedByMe: { backgroundColor: "#3a3a00", borderColor: "#FFD700", opacity: 0.7 },
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

