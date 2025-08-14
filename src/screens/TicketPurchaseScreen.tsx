"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { StyleSheet } from "react-native"
import { useNavigation, useRoute } from "@react-navigation/native"
import { useAuth } from "../contexts/AuthContext"
import firebaseService from "../services/FirebaseService"
import PaymentService from "../services/PaymentService.web"
import QRCodeService from "../services/QRCodeService.web"
import type { Event, TicketType } from "../models/Event"
import type { Ticket, PaymentMethod } from "../models/Ticket"

interface RouteParams {
  eventId: string
}

const TicketPurchaseScreen: React.FC = () => {
  const navigation = useNavigation()
  const route = useRoute()
  const { eventId } = route.params as RouteParams
  const { user } = useAuth()

  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)
  const [selectedTicketType, setSelectedTicketType] = useState<TicketType | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [phoneNumber, setPhoneNumber] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("mtn")

  useEffect(() => {
    loadEvent()
  }, [eventId])

  const loadEvent = async () => {
    try {
      const eventData = await firebaseService.getEvent(eventId)
      if (eventData) {
        setEvent(eventData)
        // Set default ticket type to the first available one
        const availableTickets = eventData.ticketTypes.filter((t) => t.isAvailable)
        if (availableTickets.length > 0) {
          setSelectedTicketType(availableTickets[0])
        }
      }
    } catch (error) {
      console.error("Error loading event:", error)
      alert("Failed to load event details")
    } finally {
      setLoading(false)
    }
  }

  const validatePhoneNumber = (phone: string, method: PaymentMethod): boolean => {
    const cleanPhone = phone.replace(/\s+/g, "")

    switch (method) {
      case "mtn":
        return /^(077|078|076)\d{7}$/.test(cleanPhone) || /^(\+256)(77|78|76)\d{7}$/.test(cleanPhone)
      case "airtel":
        return /^(070|075)\d{7}$/.test(cleanPhone) || /^(\+256)(70|75)\d{7}$/.test(cleanPhone)
      default:
        return cleanPhone.length >= 10
    }
  }

  const detectPaymentMethod = (phone: string): PaymentMethod => {
    const cleanPhone = phone.replace(/\s+/g, "")

    if (/^(077|078|076)/.test(cleanPhone) || /^(\+256)(77|78|76)/.test(cleanPhone)) {
      return "mtn"
    }
    if (/^(070|075)/.test(cleanPhone) || /^(\+256)(70|75)/.test(cleanPhone)) {
      return "airtel"
    }
    return "mtn" // Default fallback
  }

  const calculateTotal = () => {
    if (!selectedTicketType) return 0
    const subtotal = selectedTicketType.price * quantity
    const commission = Math.round(subtotal * 0.05) // 5% commission
    return subtotal + commission
  }

  const calculateCommission = () => {
    if (!selectedTicketType) return 0
    const subtotal = selectedTicketType.price * quantity
    return Math.round(subtotal * 0.05) // 5% commission
  }

  const handlePurchase = async () => {
    if (!event || !selectedTicketType || !user) {
      alert("Missing required information")
      return
    }

    if (!phoneNumber.trim()) {
      alert("Please enter your phone number")
      return
    }

    if (!validatePhoneNumber(phoneNumber, paymentMethod)) {
      alert("Please enter a valid phone number for the selected payment method")
      return
    }

    setPurchasing(true)

    try {
      const totalAmount = calculateTotal()
      const commission = calculateCommission()
      const eventOwnerAmount = selectedTicketType.price * quantity

      console.log("Starting ticket purchase process...")
      console.log("Total amount:", totalAmount)
      console.log("Commission:", commission)
      console.log("Event owner amount:", eventOwnerAmount)

      // Create payment intent
      const paymentIntent = await PaymentService.createPaymentIntent(totalAmount, eventId, user.id)

      // Get available payment methods and find the selected one
      const availablePaymentMethods = PaymentService.getAvailablePaymentMethods()
      const selectedPaymentMethodObj = availablePaymentMethods.find((pm) => pm.id.includes(paymentMethod))

      if (!selectedPaymentMethodObj) {
        throw new Error("Selected payment method not available")
      }

      // Process payment
      console.log("Processing payment with method:", selectedPaymentMethodObj.provider)
      const paymentResult = await PaymentService.processPayment(paymentIntent.id, selectedPaymentMethodObj, totalAmount)

      if (!paymentResult.success) {
        throw new Error(paymentResult.error || "Payment failed")
      }

      console.log("Payment successful, transaction ID:", paymentResult.transactionId)

      // Generate unique ticket ID
      const timestamp = Date.now()
      const hash = await generateTicketHash(user.id, eventId, timestamp)
      const ticketId = `YV_${timestamp}_${hash}`

      console.log("Generated ticket ID:", ticketId)

      // Generate QR code data
      const qrCodeData = await QRCodeService.generateQRCode(ticketId, eventId, user.id, selectedTicketType.id as any)

      console.log("Generated QR code data")

      // Create tickets for each quantity
      const tickets: Omit<Ticket, "id">[] = []
      for (let i = 0; i < quantity; i++) {
        const individualTicketId = quantity > 1 ? `${ticketId}_${i + 1}` : ticketId
        const individualQRData =
          quantity > 1
            ? await QRCodeService.generateQRCode(individualTicketId, eventId, user.id, selectedTicketType.id as any)
            : qrCodeData

        tickets.push({
          eventId,
          eventName: event.name,
          buyerId: user.id,
          buyerName: user.name || user.email || "Unknown",
          buyerPhone: phoneNumber,
          ticketType: selectedTicketType.id as any,
          ticketTypeName: selectedTicketType.name,
          price: selectedTicketType.price,
          quantity: 1, // Each ticket represents 1 entry
          totalAmount: selectedTicketType.price,
          commission,
          paymentMethod,
          paymentStatus: "completed",
          transactionId: paymentResult.transactionId!,
          qrCodeData: individualQRData,
          purchaseDate: new Date(),
          isUsed: false,
          usedAt: null,
          ticketId: individualTicketId,
        })
      }

      console.log("Created ticket objects:", tickets.length)

      // Save tickets to database
      const savedTickets = await Promise.all(tickets.map((ticket) => firebaseService.addTicket(ticket)))

      console.log("Saved tickets to database")

      // Process admin commission immediately (simulate instant payment)
      console.log("Processing admin commission:", commission)
      await processAdminCommission(commission, paymentResult.transactionId!)

      // Update event revenue
      await firebaseService.updateEventRevenue(eventId, {
        totalRevenue: eventOwnerAmount,
        appCommission: commission,
        netRevenue: eventOwnerAmount, // Event owner gets this when ticket is verified
      })

      console.log("Updated event revenue")

      // Show success message
      alert(
        `🎉 Purchase Successful!\n\nTicket ID: ${ticketId}\nTotal Paid: UGX ${totalAmount.toLocaleString()}\n\nYour ticket${quantity > 1 ? "s" : ""} ${quantity > 1 ? "are" : "is"} ready!`,
      )

      // Navigate back or to tickets screen
      navigation.goBack()
    } catch (error) {
      console.error("Error purchasing ticket:", error)
      alert(`Purchase failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setPurchasing(false)
    }
  }

  const generateTicketHash = async (userId: string, eventId: string, timestamp: number): Promise<string> => {
    const data = `${userId}_${eventId}_${timestamp}`
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(data)
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
    return hashHex.substring(0, 8).toUpperCase()
  }

  const processAdminCommission = async (commission: number, transactionId: string): Promise<void> => {
    // Simulate instant commission payment to admin
    console.log(`💰 Admin Commission Processed: UGX ${commission.toLocaleString()}`)
    console.log(`Transaction ID: ${transactionId}`)
    console.log("✅ Commission deposited to admin account instantly")

    // In production, this would call the actual MTN disbursement API
    // await mtnDisbursementAPI.sendMoney({
    //   amount: commission,
    //   phoneNumber: ADMIN_PHONE_NUMBER,
    //   reference: `COMM_${transactionId}`,
    //   description: "YoVibe App Commission"
    // })
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <div style={styles.loadingText}>Loading event details...</div>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div style={styles.container}>
        <div style={styles.errorContainer}>
          <div style={styles.errorText}>Event not found</div>
        </div>
      </div>
    )
  }

  const availableTickets = event.ticketTypes.filter((t) => t.isAvailable)

  if (availableTickets.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.errorContainer}>
          <div style={styles.errorText}>No tickets available for this event</div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <h1 style={styles.title}>Purchase Tickets</h1>

        {/* Event Info */}
        <div style={styles.eventCard}>
          <img src={event.posterImageUrl || "/placeholder.svg"} style={styles.eventImage} alt={event.name} />
          <div style={styles.eventInfo}>
            <h2 style={styles.eventName}>{event.name}</h2>
            <div style={styles.eventDetails}>
              <div style={styles.eventDetail}>
                <span style={styles.icon}>📍</span>
                <span>{event.location}</span>
              </div>
              <div style={styles.eventDetail}>
                <span style={styles.icon}>📅</span>
                <span>{new Date(event.date).toLocaleDateString()}</span>
              </div>
              <div style={styles.eventDetail}>
                <span style={styles.icon}>🕐</span>
                <span>{new Date(event.date).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Ticket Selection */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Select Ticket Type</h3>
          <div style={styles.ticketTypes}>
            {availableTickets.map((ticket) => (
              <div
                key={ticket.id}
                style={{
                  ...styles.ticketTypeCard,
                  ...(selectedTicketType?.id === ticket.id ? styles.ticketTypeCardSelected : {}),
                }}
                onClick={() => setSelectedTicketType(ticket)}
              >
                <div style={styles.ticketTypeHeader}>
                  <span style={styles.ticketTypeName}>{ticket.name}</span>
                  <span style={styles.ticketTypePrice}>UGX {ticket.price.toLocaleString()}</span>
                </div>
                <div style={styles.ticketTypeDescription}>{ticket.description}</div>
                {ticket.id === "secure" && (
                  <div style={styles.secureNote}>
                    <span style={styles.secureIcon}>🔒</span>
                    <span style={styles.secureText}>Includes photo verification at entrance</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Quantity Selection */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Quantity</h3>
          <div style={styles.quantityContainer}>
            <button
              style={styles.quantityButton}
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
            >
              -
            </button>
            <span style={styles.quantityText}>{quantity}</span>
            <button
              style={styles.quantityButton}
              onClick={() => setQuantity(Math.min(10, quantity + 1))}
              disabled={quantity >= 10}
            >
              +
            </button>
          </div>
        </div>

        {/* Payment Method */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Payment Method</h3>
          <div style={styles.paymentMethods}>
            <div
              style={{
                ...styles.paymentMethodCard,
                ...(paymentMethod === "mtn" ? styles.paymentMethodCardSelected : {}),
              }}
              onClick={() => {
                setPaymentMethod("mtn")
                if (phoneNumber) {
                  const detectedMethod = detectPaymentMethod(phoneNumber)
                  if (detectedMethod !== "mtn") {
                    setPhoneNumber("")
                  }
                }
              }}
            >
              <span style={styles.paymentIcon}>📱</span>
              <span style={styles.paymentMethodName}>MTN Mobile Money</span>
            </div>
            <div
              style={{
                ...styles.paymentMethodCard,
                ...(paymentMethod === "airtel" ? styles.paymentMethodCardSelected : {}),
              }}
              onClick={() => {
                setPaymentMethod("airtel")
                if (phoneNumber) {
                  const detectedMethod = detectPaymentMethod(phoneNumber)
                  if (detectedMethod !== "airtel") {
                    setPhoneNumber("")
                  }
                }
              }}
            >
              <span style={styles.paymentIcon}>📱</span>
              <span style={styles.paymentMethodName}>Airtel Money</span>
            </div>
          </div>
        </div>

        {/* Phone Number Input */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Phone Number</h3>
          <input
            style={styles.phoneInput}
            type="tel"
            placeholder={paymentMethod === "mtn" ? "077XXXXXXX or 078XXXXXXX" : "070XXXXXXX or 075XXXXXXX"}
            value={phoneNumber}
            onChange={(e) => {
              const value = e.target.value
              setPhoneNumber(value)

              // Auto-detect payment method based on phone number
              if (value.length >= 3) {
                const detectedMethod = detectPaymentMethod(value)
                if (detectedMethod !== paymentMethod) {
                  setPaymentMethod(detectedMethod)
                }
              }
            }}
          />
          <div style={styles.phoneHint}>
            {paymentMethod === "mtn" ? "MTN numbers: 077, 078, 076" : "Airtel numbers: 070, 075"}
          </div>
        </div>

        {/* Price Breakdown */}
        {selectedTicketType && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Price Breakdown</h3>
            <div style={styles.priceBreakdown}>
              <div style={styles.priceRow}>
                <span>Ticket Price ({quantity}x)</span>
                <span>UGX {(selectedTicketType.price * quantity).toLocaleString()}</span>
              </div>
              <div style={styles.priceRow}>
                <span>App Commission (5%)</span>
                <span>UGX {calculateCommission().toLocaleString()}</span>
              </div>
              <div style={styles.priceRowTotal}>
                <span>Total Amount</span>
                <span>UGX {calculateTotal().toLocaleString()}</span>
              </div>
            </div>
            <div style={styles.commissionNote}>
              <span style={styles.infoIcon}>ℹ️</span>
              <span style={styles.commissionText}>
                Commission is paid to admin instantly. Event owner receives UGX{" "}
                {(selectedTicketType.price * quantity).toLocaleString()} when ticket is verified at entrance.
              </span>
            </div>
          </div>
        )}

        {/* Purchase Button */}
        <button
          style={{
            ...styles.purchaseButton,
            ...(purchasing || !selectedTicketType || !phoneNumber.trim() ? styles.purchaseButtonDisabled : {}),
          }}
          onClick={handlePurchase}
          disabled={purchasing || !selectedTicketType || !phoneNumber.trim()}
        >
          {purchasing ? (
            <div style={styles.purchaseButtonContent}>
              <span>Processing Payment...</span>
            </div>
          ) : (
            <div style={styles.purchaseButtonContent}>
              <span style={styles.purchaseIcon}>🎫</span>
              <span>
                Purchase Ticket{quantity > 1 ? "s" : ""} - UGX {calculateTotal().toLocaleString()}
              </span>
            </div>
          )}
        </button>
      </div>
    </div>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    minHeight: "100vh",
    overflow: "auto",
  },
  content: {
    padding: 20,
    maxWidth: 600,
    margin: "0 auto",
  },
  loadingContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "50vh",
  },
  loadingText: {
    color: "#fff",
    fontSize: 18,
  },
  errorContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "50vh",
  },
  errorText: {
    color: "#ef4444",
    fontSize: 18,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 20,
    margin: "0 0 20px 0",
  },
  eventCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 24,
    border: "1px solid #333",
  },
  eventImage: {
    width: "100%",
    height: 200,
    objectFit: "cover",
  },
  eventInfo: {
    padding: 16,
  },
  eventName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 12,
    margin: "0 0 12px 0",
  },
  eventDetails: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  eventDetail: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#ccc",
  },
  icon: {
    fontSize: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
    margin: "0 0 12px 0",
  },
  ticketTypes: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  ticketTypeCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 16,
    border: "2px solid #333",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  ticketTypeCardSelected: {
    borderColor: "#6366f1",
    backgroundColor: "#1e1b4b",
  },
  ticketTypeHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  ticketTypeName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  ticketTypePrice: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#6366f1",
  },
  ticketTypeDescription: {
    color: "#ccc",
    fontSize: 14,
    marginBottom: 8,
  },
  secureNote: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#065f46",
    padding: 8,
    borderRadius: 6,
  },
  secureIcon: {
    fontSize: 14,
  },
  secureText: {
    color: "#10b981",
    fontSize: 12,
    fontWeight: "500",
  },
  quantityContainer: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    justifyContent: "center",
  },
  quantityButton: {
    backgroundColor: "#6366f1",
    border: "none",
    borderRadius: 8,
    width: 40,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    cursor: "pointer",
  },
  quantityText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    minWidth: 40,
    textAlign: "center",
  },
  paymentMethods: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  paymentMethodCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 16,
    border: "2px solid #333",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 12,
    transition: "all 0.2s ease",
  },
  paymentMethodCardSelected: {
    borderColor: "#6366f1",
    backgroundColor: "#1e1b4b",
  },
  paymentIcon: {
    fontSize: 24,
  },
  paymentMethodName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#fff",
  },
  phoneInput: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    color: "#fff",
    border: "1px solid #333",
    fontSize: 16,
    width: "100%",
    boxSizing: "border-box",
  },
  phoneHint: {
    color: "#666",
    fontSize: 12,
    marginTop: 4,
  },
  priceBreakdown: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 16,
    border: "1px solid #333",
  },
  priceRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    color: "#ccc",
  },
  priceRowTotal: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderTop: "1px solid #333",
    marginTop: 8,
    paddingTop: 16,
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
  commissionNote: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#1e3a8a",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  infoIcon: {
    fontSize: 16,
    marginTop: 2,
  },
  commissionText: {
    color: "#93c5fd",
    fontSize: 12,
    lineHeight: 1.4,
  },
  purchaseButton: {
    backgroundColor: "#6366f1",
    border: "none",
    borderRadius: 8,
    padding: 16,
    width: "100%",
    cursor: "pointer",
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  purchaseButtonDisabled: {
    backgroundColor: "#333",
    cursor: "not-allowed",
  },
  purchaseButtonContent: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  purchaseIcon: {
    fontSize: 20,
  },
})

export default TicketPurchaseScreen
