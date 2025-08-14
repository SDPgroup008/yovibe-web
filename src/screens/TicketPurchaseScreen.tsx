"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useNavigation, useRoute } from "@react-navigation/native"
import { useAuth } from "../contexts/AuthContext"
import firebaseService from "../services/FirebaseService"
import PaymentService from "../services/PaymentService"
import QRCodeService from "../services/QRCodeService"
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
      const events = await firebaseService.getEvents()
      const eventData = events.find((event) => event.id === eventId)
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

      // Simulate payment processing
      const paymentResult = await PaymentService.processMTNPayment({
        amount: totalAmount,
        phoneNumber: phoneNumber.replace(/\s+/g, ""),
        eventId,
        ticketType: selectedTicketType.name,
        quantity,
        buyerId: user.id,
        buyerName: user.displayName || user.email || "Unknown User",
        eventName: event.name,
        paymentMethod,
      })

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
      const qrCodeResult = await QRCodeService.generateQRCode({
        ticketId,
        eventId,
        eventName: event.name,
        buyerId: user.id,
        buyerName: user.displayName || user.email || "Unknown User",
        buyerPhone: phoneNumber,
        ticketType: selectedTicketType.name,
        quantity,
        totalAmount: selectedTicketType.price * quantity,
        purchaseDate: new Date().toISOString(),
      })

      if (!qrCodeResult.success) {
        throw new Error("Failed to generate QR code")
      }

      console.log("Generated QR code data")

      // Create tickets for each quantity
      const tickets: Omit<Ticket, "id">[] = []
      for (let i = 0; i < quantity; i++) {
        const individualTicketId = quantity > 1 ? `${ticketId}_${i + 1}` : ticketId

        tickets.push({
          eventId,
          eventName: event.name,
          buyerId: user.id,
          buyerName: user.displayName || user.email || "Unknown",
          buyerPhone: phoneNumber,
          ticketType: selectedTicketType.id as any,
          ticketTypeName: selectedTicketType.name,
          quantity: 1, // Each ticket represents 1 entry
          totalAmount: selectedTicketType.price,
          commission,
          paymentMethod,
          paymentStatus: "completed",
          qrCodeData: qrCodeResult.qrCodeData!,
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
  }

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={loadingContainerStyle}>
          <div style={loadingTextStyle}>Loading event details...</div>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div style={containerStyle}>
        <div style={errorContainerStyle}>
          <div style={errorTextStyle}>Event not found</div>
        </div>
      </div>
    )
  }

  const availableTickets = event.ticketTypes.filter((t) => t.isAvailable)

  if (availableTickets.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={errorContainerStyle}>
          <div style={errorTextStyle}>No tickets available for this event</div>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={contentStyle}>
        <h1 style={titleStyle}>Purchase Tickets</h1>

        {/* Event Info */}
        <div style={eventCardStyle}>
          <img src={event.posterImageUrl || "/placeholder.svg"} style={eventImageStyle} alt={event.name} />
          <div style={eventInfoStyle}>
            <h2 style={eventNameStyle}>{event.name}</h2>
            <div style={eventDetailsStyle}>
              <div style={eventDetailStyle}>
                <span style={iconStyle}>📍</span>
                <span>{event.location}</span>
              </div>
              <div style={eventDetailStyle}>
                <span style={iconStyle}>📅</span>
                <span>{new Date(event.date).toLocaleDateString()}</span>
              </div>
              <div style={eventDetailStyle}>
                <span style={iconStyle}>🕐</span>
                <span>{new Date(event.date).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Ticket Selection */}
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Select Ticket Type</h3>
          <div style={ticketTypesStyle}>
            {availableTickets.map((ticket) => (
              <div
                key={ticket.id}
                style={{
                  ...ticketTypeCardStyle,
                  ...(selectedTicketType?.id === ticket.id ? ticketTypeCardSelectedStyle : {}),
                }}
                onClick={() => setSelectedTicketType(ticket)}
              >
                <div style={ticketTypeHeaderStyle}>
                  <span style={ticketTypeNameStyle}>{ticket.name}</span>
                  <span style={ticketTypePriceStyle}>UGX {ticket.price.toLocaleString()}</span>
                </div>
                <div style={ticketTypeDescriptionStyle}>{ticket.description}</div>
                {ticket.id === "secure" && (
                  <div style={secureNoteStyle}>
                    <span style={secureIconStyle}>🔒</span>
                    <span style={secureTextStyle}>Includes photo verification at entrance</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Quantity Selection */}
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Quantity</h3>
          <div style={quantityContainerStyle}>
            <button
              style={quantityButtonStyle}
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
            >
              -
            </button>
            <span style={quantityTextStyle}>{quantity}</span>
            <button
              style={quantityButtonStyle}
              onClick={() => setQuantity(Math.min(10, quantity + 1))}
              disabled={quantity >= 10}
            >
              +
            </button>
          </div>
        </div>

        {/* Payment Method */}
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Payment Method</h3>
          <div style={paymentMethodsStyle}>
            <div
              style={{
                ...paymentMethodCardStyle,
                ...(paymentMethod === "mtn" ? paymentMethodCardSelectedStyle : {}),
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
              <span style={paymentIconStyle}>📱</span>
              <span style={paymentMethodNameStyle}>MTN Mobile Money</span>
            </div>
            <div
              style={{
                ...paymentMethodCardStyle,
                ...(paymentMethod === "airtel" ? paymentMethodCardSelectedStyle : {}),
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
              <span style={paymentIconStyle}>📱</span>
              <span style={paymentMethodNameStyle}>Airtel Money</span>
            </div>
          </div>
        </div>

        {/* Phone Number Input */}
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Phone Number</h3>
          <input
            style={phoneInputStyle}
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
          <div style={phoneHintStyle}>
            {paymentMethod === "mtn" ? "MTN numbers: 077, 078, 076" : "Airtel numbers: 070, 075"}
          </div>
        </div>

        {/* Price Breakdown */}
        {selectedTicketType && (
          <div style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Price Breakdown</h3>
            <div style={priceBreakdownStyle}>
              <div style={priceRowStyle}>
                <span>Ticket Price ({quantity}x)</span>
                <span>UGX {(selectedTicketType.price * quantity).toLocaleString()}</span>
              </div>
              <div style={priceRowStyle}>
                <span>App Commission (5%)</span>
                <span>UGX {calculateCommission().toLocaleString()}</span>
              </div>
              <div style={priceRowTotalStyle}>
                <span>Total Amount</span>
                <span>UGX {calculateTotal().toLocaleString()}</span>
              </div>
            </div>
            <div style={commissionNoteStyle}>
              <span style={infoIconStyle}>ℹ️</span>
              <span style={commissionTextStyle}>
                Commission is paid to admin instantly. Event owner receives UGX{" "}
                {(selectedTicketType.price * quantity).toLocaleString()} when ticket is verified at entrance.
              </span>
            </div>
          </div>
        )}

        {/* Purchase Button */}
        <button
          style={{
            ...purchaseButtonStyle,
            ...(purchasing || !selectedTicketType || !phoneNumber.trim() ? purchaseButtonDisabledStyle : {}),
          }}
          onClick={handlePurchase}
          disabled={purchasing || !selectedTicketType || !phoneNumber.trim()}
        >
          {purchasing ? (
            <div style={purchaseButtonContentStyle}>
              <span>Processing Payment...</span>
            </div>
          ) : (
            <div style={purchaseButtonContentStyle}>
              <span style={purchaseIconStyle}>🎫</span>
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

// CSS-in-JS styles (avoiding border and margin)
const containerStyle: React.CSSProperties = {
  flex: 1,
  backgroundColor: "#000",
  minHeight: "100vh",
}

const contentStyle: React.CSSProperties = {
  padding: "20px",
  maxWidth: "600px",
  marginLeft: "auto",
  marginRight: "auto",
}

const loadingContainerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  height: "50vh",
}

const loadingTextStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: "18px",
}

const errorContainerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  height: "50vh",
}

const errorTextStyle: React.CSSProperties = {
  color: "#ef4444",
  fontSize: "18px",
}

const titleStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "bold",
  color: "#fff",
  marginBottom: "20px",
}

const eventCardStyle: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  borderRadius: "12px",
  overflow: "hidden",
  marginBottom: "24px",
  outline: "1px solid #333",
}

const eventImageStyle: React.CSSProperties = {
  width: "100%",
  height: "200px",
  objectFit: "cover",
}

const eventInfoStyle: React.CSSProperties = {
  padding: "16px",
}

const eventNameStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "bold",
  color: "#fff",
  marginBottom: "12px",
}

const eventDetailsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
}

const eventDetailStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  color: "#ccc",
}

const iconStyle: React.CSSProperties = {
  fontSize: "16px",
}

const sectionStyle: React.CSSProperties = {
  marginBottom: "24px",
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: "600",
  color: "#fff",
  marginBottom: "12px",
}

const ticketTypesStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
}

const ticketTypeCardStyle: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  borderRadius: "8px",
  padding: "16px",
  outline: "2px solid #333",
  cursor: "pointer",
  transition: "all 0.2s ease",
}

const ticketTypeCardSelectedStyle: React.CSSProperties = {
  backgroundColor: "#1e1b4b",
  outlineColor: "#6366f1",
}

const ticketTypeHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "8px",
}

const ticketTypeNameStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "600",
  color: "#fff",
}

const ticketTypePriceStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "bold",
  color: "#6366f1",
}

const ticketTypeDescriptionStyle: React.CSSProperties = {
  color: "#ccc",
  fontSize: "14px",
  marginBottom: "8px",
}

const secureNoteStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  backgroundColor: "#065f46",
  padding: "8px",
  borderRadius: "6px",
}

const secureIconStyle: React.CSSProperties = {
  fontSize: "14px",
}

const secureTextStyle: React.CSSProperties = {
  color: "#10b981",
  fontSize: "12px",
  fontWeight: "500",
}

const quantityContainerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "16px",
  justifyContent: "center",
}

const quantityButtonStyle: React.CSSProperties = {
  backgroundColor: "#6366f1",
  borderRadius: "8px",
  width: "40px",
  height: "40px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  fontSize: "18px",
  fontWeight: "bold",
  cursor: "pointer",
}

const quantityTextStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "bold",
  color: "#fff",
  minWidth: "40px",
  textAlign: "center",
}

const paymentMethodsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
}

const paymentMethodCardStyle: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  borderRadius: "8px",
  padding: "16px",
  outline: "2px solid #333",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "12px",
  transition: "all 0.2s ease",
}

const paymentMethodCardSelectedStyle: React.CSSProperties = {
  backgroundColor: "#1e1b4b",
  outlineColor: "#6366f1",
}

const paymentIconStyle: React.CSSProperties = {
  fontSize: "24px",
}

const paymentMethodNameStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "500",
  color: "#fff",
}

const phoneInputStyle: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  borderRadius: "8px",
  padding: "12px",
  color: "#fff",
  outline: "1px solid #333",
  fontSize: "16px",
  width: "100%",
  boxSizing: "border-box",
}

const phoneHintStyle: React.CSSProperties = {
  color: "#666",
  fontSize: "12px",
  marginTop: "4px",
}

const priceBreakdownStyle: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  borderRadius: "8px",
  padding: "16px",
  outline: "1px solid #333",
}

const priceRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  paddingTop: "8px",
  paddingBottom: "8px",
  color: "#ccc",
}

const priceRowTotalStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  paddingTop: "16px",
  paddingBottom: "8px",
  marginTop: "8px",
  fontSize: "18px",
  fontWeight: "bold",
  color: "#fff",
  borderTop: "1px solid #333",
}

const commissionNoteStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "8px",
  backgroundColor: "#1e3a8a",
  padding: "12px",
  borderRadius: "8px",
  marginTop: "12px",
}

const infoIconStyle: React.CSSProperties = {
  fontSize: "16px",
  marginTop: "2px",
}

const commissionTextStyle: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: "12px",
  lineHeight: "1.4",
}

const purchaseButtonStyle: React.CSSProperties = {
  backgroundColor: "#6366f1",
  borderRadius: "8px",
  padding: "16px",
  width: "100%",
  cursor: "pointer",
  fontSize: "16px",
  fontWeight: "600",
  color: "#fff",
}

const purchaseButtonDisabledStyle: React.CSSProperties = {
  backgroundColor: "#333",
  cursor: "not-allowed",
}

const purchaseButtonContentStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
}

const purchaseIconStyle: React.CSSProperties = {
  fontSize: "20px",
}

export default TicketPurchaseScreen
