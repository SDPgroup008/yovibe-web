"use client"

import type React from "react"
import { useState, useEffect } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../contexts/AuthContext"
import FirebaseService from "../services/FirebaseService"
import PaymentService from "../services/PaymentService"
import ImageCaptureService from "../services/ImageCaptureService"
import QRCodeService from "../services/QRCodeService"
import type { Event } from "../models/Event"
import type { Ticket } from "../models/Ticket"
import type { PaymentMethod } from "../services/PaymentService"

interface TicketPurchaseScreenProps {
  navigation: any
  route: {
    params: {
      eventId: string
    }
  }
}

const TicketPurchaseScreen: React.FC<TicketPurchaseScreenProps> = ({ navigation, route }) => {
  const { user } = useAuth()
  const { eventId } = route.params

  // Event and ticket data
  const [event, setEvent] = useState<Event | null>(null)
  const [selectedTicketType, setSelectedTicketType] = useState<"regular" | "secure">("regular")
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)

  // Buyer information
  const [buyerName, setBuyerName] = useState("")
  const [buyerEmail, setBuyerEmail] = useState("")
  const [buyerPhone, setBuyerPhone] = useState("")
  const [buyerImageUri, setBuyerImageUri] = useState<string | null>(null)

  // Payment
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null)
  const [paymentDetails, setPaymentDetails] = useState({
    phoneNumber: "",
    cardDetails: {
      cardNumber: "",
      expiryMonth: "",
      expiryYear: "",
      cvv: "",
      cardholderName: "",
    },
  })

  // UI states
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showPricingBreakdown, setShowPricingBreakdown] = useState(false)

  useEffect(() => {
    loadEventData()
    loadPaymentMethods()
    if (user) {
      setBuyerName(user.displayName || "")
      setBuyerEmail(user.email || "")
    }
  }, [eventId, user])

  const loadEventData = async () => {
    try {
      setLoading(true)
      const eventData = await FirebaseService.getEventById(eventId)
      if (eventData) {
        setEvent(eventData)
      } else {
        Alert.alert("Error", "Event not found")
        navigation.goBack()
      }
    } catch (error) {
      console.error("Error loading event:", error)
      Alert.alert("Error", "Failed to load event details")
    } finally {
      setLoading(false)
    }
  }

  const loadPaymentMethods = () => {
    const methods = PaymentService.getAvailablePaymentMethods()
    setPaymentMethods(methods)
    if (methods.length > 0) {
      setSelectedPaymentMethod(methods[0])
    }
  }

  const calculatePricing = () => {
    if (!event || !selectedPaymentMethod) {
      return {
        ticketPrice: 0,
        subtotal: 0,
        paymentFees: 0,
        total: 0,
        appCommission: 0,
        sellerRevenue: 0,
      }
    }

    // Parse entry fee to get numeric value
    const entryFeeString = event.entryFee || "0"
    const basePrice = Number.parseFloat(entryFeeString.replace(/[^0-9.]/g, "")) || 0

    // Apply premium for secure tickets (50% more)
    const ticketPrice = selectedTicketType === "secure" ? basePrice * 1.5 : basePrice
    const subtotal = ticketPrice * quantity
    const paymentFees = PaymentService.calculatePaymentFees(subtotal, selectedPaymentMethod)
    const total = subtotal + paymentFees
    const appCommission = subtotal * 0.05 // 5% app commission
    const sellerRevenue = subtotal - appCommission

    return {
      ticketPrice,
      subtotal,
      paymentFees,
      total,
      appCommission,
      sellerRevenue,
    }
  }

  const handleImageCapture = async () => {
    try {
      const imageUri = await ImageCaptureService.captureImage()
      if (imageUri) {
        setBuyerImageUri(imageUri)
      }
    } catch (error) {
      console.error("Error capturing image:", error)
      Alert.alert("Error", "Failed to capture image. Please try again.")
    }
  }

  const validatePurchaseData = (): string | null => {
    if (!event || !selectedPaymentMethod) {
      return "Missing required event or payment information"
    }

    if (!buyerName.trim() || !buyerEmail.trim()) {
      return "Please fill in your name and email"
    }

    // Validate payment details based on method
    if (selectedPaymentMethod.type === "mobile_money") {
      if (!paymentDetails.phoneNumber.trim()) {
        return "Please enter your phone number for mobile money payment"
      }
      const phoneValidation = PaymentService.validatePhoneNumber(paymentDetails.phoneNumber)
      if (!phoneValidation.valid) {
        return phoneValidation.message || "Invalid phone number"
      }
    } else if (selectedPaymentMethod.type === "credit_card") {
      const cardValidation = PaymentService.validateCreditCard(paymentDetails.cardDetails)
      if (!cardValidation.valid) {
        return cardValidation.message || "Invalid card details"
      }
    }

    // Validate secure ticket requirements
    if (selectedTicketType === "secure" && !buyerImageUri) {
      return "Secure tickets require photo verification. Please capture your photo."
    }

    return null
  }

  const handlePurchase = async () => {
    if (!user) {
      Alert.alert("Error", "You must be logged in to purchase tickets")
      return
    }

    const validationError = validatePurchaseData()
    if (validationError) {
      Alert.alert("Validation Error", validationError)
      return
    }

    if (!event || !selectedPaymentMethod) {
      return
    }

    setPurchasing(true)

    try {
      const pricing = calculatePricing()

      // Simulate payment processing
      console.log("TicketPurchaseScreen: Processing payment...")

      // Create payment request for simulation
      const paymentRequest = {
        amount: pricing.total,
        currency: "UGX",
        paymentMethod: selectedPaymentMethod,
        customerInfo: {
          name: buyerName,
          email: buyerEmail,
          phone: buyerPhone || undefined,
        },
        metadata: {
          eventName: event.name,
          ticketType: selectedTicketType,
          quantity,
          eventId: event.id,
        },
      }

      const paymentResult = await PaymentService.processPayment(paymentRequest)

      if (!paymentResult.success) {
        Alert.alert("Payment Failed", paymentResult.error || "Payment processing failed")
        return
      }

      console.log("TicketPurchaseScreen: Payment successful, creating ticket...")

      // Upload buyer image if provided
      let buyerImageUrl: string | undefined
      if (buyerImageUri) {
        try {
          buyerImageUrl = await FirebaseService.uploadVibeImage(buyerImageUri)
        } catch (error) {
          console.error("Error uploading buyer image:", error)
          // Continue without image for now
        }
      }

      // Create ticket
      const ticketId = `ticket_${Date.now()}_${Math.random().toString(36).substring(7)}`
      const now = new Date()

      // Generate QR code data
      const qrData = {
        ticketId,
        eventId: event.id,
        buyerId: user.id,
        ticketType: selectedTicketType,
        purchaseDate: now.toISOString(),
        signature: btoa(`${ticketId}_${event.id}_${user.id}_${now.getTime()}`).substring(0, 16),
        version: "1.0",
      }

      const qrCodeDataUrl = await QRCodeService.generateQRCode(JSON.stringify(qrData))

      const ticket: Ticket = {
        id: ticketId,
        eventId: event.id,
        eventName: event.name,
        eventPosterUrl: event.posterImageUrl,
        buyerId: user.id,
        buyerName,
        buyerEmail,
        buyerPhone: buyerPhone || null,
        buyerImageUrl,
        quantity,
        ticketType: selectedTicketType,
        ticketTypeName: selectedTicketType === "secure" ? "Secure Ticket" : "Regular Ticket",
        pricePerTicket: pricing.ticketPrice,
        totalAmount: pricing.subtotal,
        paymentFees: pricing.paymentFees,
        appCommission: pricing.appCommission,
        sellerRevenue: pricing.sellerRevenue,
        paymentMethod: selectedPaymentMethod.name,
        paymentReference: paymentResult.reference || `ref_${Date.now()}`,
        paymentAccount: "simulated_account",
        qrCode: qrCodeDataUrl,
        qrData: JSON.stringify(qrData),
        status: "active",
        purchaseDate: now,
        validationHistory: [],
        isVerified: selectedTicketType === "secure" ? !!buyerImageUrl : true,
        createdAt: now,
        updatedAt: now,
      }

      // Save ticket to database
      await FirebaseService.saveTicket(ticket)

      // Save payment confirmation
      if (paymentResult.confirmation) {
        await FirebaseService.savePaymentConfirmation({
          id: `conf_${Date.now()}`,
          ticketId: ticket.id,
          eventId: event.id,
          buyerId: user.id,
          sellerId: event.createdBy || "",
          amount: pricing.subtotal,
          paymentMethod: selectedPaymentMethod.name,
          paymentReference: paymentResult.reference || "",
          timestamp: now,
          type: "purchase",
          status: "success",
        })
      }

      Alert.alert(
        "Purchase Successful! 🎉",
        `Your ${selectedTicketType} ticket${quantity > 1 ? "s" : ""} for ${event.name} ${quantity > 1 ? "have" : "has"} been purchased successfully!

Payment Reference: ${paymentResult.reference || "SIMULATED"}
Total Paid: UGX ${pricing.total.toLocaleString()}

You can view your ticket${quantity > 1 ? "s" : ""} in the "My Tickets" section.`,
        [
          {
            text: "View Tickets",
            onPress: () => navigation.navigate("PurchasedTickets"),
          },
          {
            text: "OK",
            onPress: () => navigation.goBack(),
          },
        ],
      )
    } catch (error) {
      console.error("TicketPurchaseScreen: Error purchasing ticket:", error)
      Alert.alert("Purchase Failed", "An error occurred while processing your purchase. Please try again.")
    } finally {
      setPurchasing(false)
    }
  }

  const renderTicketTypeSelector = () => {
    if (!event) return null

    const basePrice = Number.parseFloat((event.entryFee || "0").replace(/[^0-9.]/g, "")) || 0
    const regularPrice = basePrice
    const securePrice = basePrice * 1.5

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Ticket Type</Text>

        <TouchableOpacity
          style={[styles.ticketTypeCard, selectedTicketType === "regular" && styles.selectedTicketType]}
          onPress={() => setSelectedTicketType("regular")}
        >
          <View style={styles.ticketTypeInfo}>
            <Text style={styles.ticketTypeName}>Regular Ticket</Text>
            <Text style={styles.ticketTypePrice}>UGX {regularPrice.toLocaleString()}</Text>
            <Text style={styles.ticketTypeDescription}>Standard entry to the event</Text>
          </View>
          <View style={styles.ticketTypeSelector}>
            {selectedTicketType === "regular" ? (
              <Ionicons name="radio-button-on" size={24} color="#2196F3" />
            ) : (
              <Ionicons name="radio-button-off" size={24} color="#666" />
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ticketTypeCard, selectedTicketType === "secure" && styles.selectedTicketType]}
          onPress={() => setSelectedTicketType("secure")}
        >
          <View style={styles.ticketTypeInfo}>
            <Text style={styles.ticketTypeName}>Secure Ticket</Text>
            <Text style={styles.ticketTypePrice}>UGX {securePrice.toLocaleString()}</Text>
            <Text style={styles.ticketTypeDescription}>Enhanced security with photo verification</Text>
          </View>
          <View style={styles.ticketTypeSelector}>
            {selectedTicketType === "secure" ? (
              <Ionicons name="radio-button-on" size={24} color="#2196F3" />
            ) : (
              <Ionicons name="radio-button-off" size={24} color="#666" />
            )}
          </View>
        </TouchableOpacity>
      </View>
    )
  }

  const renderPricingBreakdown = () => {
    const pricing = calculatePricing()

    return (
      <View style={styles.section}>
        <TouchableOpacity style={styles.pricingHeader} onPress={() => setShowPricingBreakdown(!showPricingBreakdown)}>
          <Text style={styles.sectionTitle}>Pricing Breakdown</Text>
          <Ionicons name={showPricingBreakdown ? "chevron-up" : "chevron-down"} size={24} color="#FFFFFF" />
        </TouchableOpacity>

        {showPricingBreakdown && (
          <View style={styles.pricingBreakdown}>
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>Ticket Price ({selectedTicketType})</Text>
              <Text style={styles.pricingValue}>UGX {pricing.ticketPrice.toLocaleString()}</Text>
            </View>
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>Quantity</Text>
              <Text style={styles.pricingValue}>×{quantity}</Text>
            </View>
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>Subtotal</Text>
              <Text style={styles.pricingValue}>UGX {pricing.subtotal.toLocaleString()}</Text>
            </View>
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>Payment Fees</Text>
              <Text style={styles.pricingValue}>UGX {pricing.paymentFees.toLocaleString()}</Text>
            </View>
            <View style={[styles.pricingRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total You Pay</Text>
              <Text style={styles.totalValue}>UGX {pricing.total.toLocaleString()}</Text>
            </View>
            <View style={styles.commissionNote}>
              <Text style={styles.commissionText}>
                * App commission (5%) is deducted from seller's revenue, not added to your cost
              </Text>
            </View>
          </View>
        )}
      </View>
    )
  }

  const renderPaymentMethodModal = () => (
    <Modal visible={showPaymentModal} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Payment Details</Text>
            <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.label}>Payment Method</Text>
            {paymentMethods.map((method) => (
              <TouchableOpacity
                key={method.id}
                style={[
                  styles.paymentMethodCard,
                  selectedPaymentMethod?.id === method.id && styles.selectedPaymentMethod,
                ]}
                onPress={() => setSelectedPaymentMethod(method)}
              >
                <View style={styles.paymentMethodInfo}>
                  <Text style={styles.paymentMethodName}>{method.name}</Text>
                  <Text style={styles.paymentMethodFees}>
                    Fees: UGX {method.fees.fixed.toLocaleString()} + {(method.fees.percentage * 100).toFixed(1)}%
                  </Text>
                </View>
                <Ionicons
                  name={selectedPaymentMethod?.id === method.id ? "radio-button-on" : "radio-button-off"}
                  size={24}
                  color="#2196F3"
                />
              </TouchableOpacity>
            ))}

            {selectedPaymentMethod?.type === "mobile_money" && (
              <>
                <Text style={styles.label}>Phone Number</Text>
                <TextInput
                  style={styles.input}
                  value={paymentDetails.phoneNumber}
                  onChangeText={(text) => setPaymentDetails({ ...paymentDetails, phoneNumber: text })}
                  placeholder="+256701234567"
                  keyboardType="phone-pad"
                  placeholderTextColor="#666"
                />
              </>
            )}

            {selectedPaymentMethod?.type === "credit_card" && (
              <>
                <Text style={styles.label}>Card Number</Text>
                <TextInput
                  style={styles.input}
                  value={paymentDetails.cardDetails.cardNumber}
                  onChangeText={(text) =>
                    setPaymentDetails({
                      ...paymentDetails,
                      cardDetails: { ...paymentDetails.cardDetails, cardNumber: text },
                    })
                  }
                  placeholder="1234 5678 9012 3456"
                  keyboardType="numeric"
                  placeholderTextColor="#666"
                />

                <View style={styles.cardRow}>
                  <View style={styles.cardField}>
                    <Text style={styles.label}>Expiry Month</Text>
                    <TextInput
                      style={styles.input}
                      value={paymentDetails.cardDetails.expiryMonth}
                      onChangeText={(text) =>
                        setPaymentDetails({
                          ...paymentDetails,
                          cardDetails: { ...paymentDetails.cardDetails, expiryMonth: text },
                        })
                      }
                      placeholder="MM"
                      keyboardType="numeric"
                      maxLength={2}
                      placeholderTextColor="#666"
                    />
                  </View>

                  <View style={styles.cardField}>
                    <Text style={styles.label}>Expiry Year</Text>
                    <TextInput
                      style={styles.input}
                      value={paymentDetails.cardDetails.expiryYear}
                      onChangeText={(text) =>
                        setPaymentDetails({
                          ...paymentDetails,
                          cardDetails: { ...paymentDetails.cardDetails, expiryYear: text },
                        })
                      }
                      placeholder="YY"
                      keyboardType="numeric"
                      maxLength={2}
                      placeholderTextColor="#666"
                    />
                  </View>

                  <View style={styles.cardField}>
                    <Text style={styles.label}>CVV</Text>
                    <TextInput
                      style={styles.input}
                      value={paymentDetails.cardDetails.cvv}
                      onChangeText={(text) =>
                        setPaymentDetails({
                          ...paymentDetails,
                          cardDetails: { ...paymentDetails.cardDetails, cvv: text },
                        })
                      }
                      placeholder="123"
                      keyboardType="numeric"
                      maxLength={4}
                      secureTextEntry
                      placeholderTextColor="#666"
                    />
                  </View>
                </View>

                <Text style={styles.label}>Cardholder Name</Text>
                <TextInput
                  style={styles.input}
                  value={paymentDetails.cardDetails.cardholderName}
                  onChangeText={(text) =>
                    setPaymentDetails({
                      ...paymentDetails,
                      cardDetails: { ...paymentDetails.cardDetails, cardholderName: text },
                    })
                  }
                  placeholder="John Doe"
                  placeholderTextColor="#666"
                />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading event details...</Text>
      </View>
    )
  }

  if (!event) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Event not found</Text>
      </View>
    )
  }

  const pricing = calculatePricing()

  return (
    <ScrollView style={styles.container}>
      {/* Event Header */}
      <View style={styles.eventHeader}>
        <Image source={{ uri: event.posterImageUrl }} style={styles.eventImage} />
        <View style={styles.eventInfo}>
          <Text style={styles.eventName}>{event.name}</Text>
          <Text style={styles.eventDate}>{event.date.toLocaleDateString()}</Text>
          <Text style={styles.eventVenue}>{event.venueName}</Text>
        </View>
      </View>

      {renderTicketTypeSelector()}

      {/* Quantity Selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quantity</Text>
        <View style={styles.quantitySelector}>
          <TouchableOpacity style={styles.quantityButton} onPress={() => setQuantity(Math.max(1, quantity - 1))}>
            <Ionicons name="remove" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.quantityText}>{quantity}</Text>
          <TouchableOpacity style={styles.quantityButton} onPress={() => setQuantity(quantity + 1)}>
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Buyer Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Buyer Information</Text>

        <Text style={styles.label}>Full Name *</Text>
        <TextInput
          style={styles.input}
          value={buyerName}
          onChangeText={setBuyerName}
          placeholder="Enter your full name"
          placeholderTextColor="#666"
        />

        <Text style={styles.label}>Email *</Text>
        <TextInput
          style={styles.input}
          value={buyerEmail}
          onChangeText={setBuyerEmail}
          placeholder="Enter your email"
          keyboardType="email-address"
          placeholderTextColor="#666"
        />

        <Text style={styles.label}>Phone Number (Optional)</Text>
        <TextInput
          style={styles.input}
          value={buyerPhone}
          onChangeText={setBuyerPhone}
          placeholder="+256701234567"
          keyboardType="phone-pad"
          placeholderTextColor="#666"
        />

        {/* Photo verification for secure tickets */}
        {selectedTicketType === "secure" && (
          <View style={styles.photoVerification}>
            <Text style={styles.label}>Photo Verification (Required for Secure Tickets)</Text>
            {buyerImageUri ? (
              <View style={styles.capturedImageContainer}>
                <Image source={{ uri: buyerImageUri }} style={styles.capturedImage} />
                <TouchableOpacity style={styles.retakeButton} onPress={() => setBuyerImageUri(null)}>
                  <Text style={styles.retakeButtonText}>Retake Photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.captureButton} onPress={handleImageCapture}>
                <Ionicons name="camera" size={24} color="#FFFFFF" />
                <Text style={styles.captureButtonText}>Capture Photo</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {renderPricingBreakdown()}

      {/* Payment Method */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Method</Text>
        <TouchableOpacity style={styles.paymentMethodSelector} onPress={() => setShowPaymentModal(true)}>
          <View style={styles.selectedPaymentInfo}>
            <Text style={styles.selectedPaymentName}>{selectedPaymentMethod?.name || "Select Payment Method"}</Text>
            {selectedPaymentMethod && (
              <Text style={styles.selectedPaymentFees}>
                Fees: UGX {selectedPaymentMethod.fees.fixed.toLocaleString()} +{" "}
                {(selectedPaymentMethod.fees.percentage * 100).toFixed(1)}%
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Purchase Summary */}
      <View style={styles.purchaseSummary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Amount</Text>
          <Text style={styles.summaryValue}>UGX {pricing.total.toLocaleString()}</Text>
        </View>

        <TouchableOpacity
          style={[styles.purchaseButton, purchasing && styles.disabledButton]}
          onPress={handlePurchase}
          disabled={purchasing}
        >
          {purchasing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="card" size={20} color="#FFFFFF" />
              <Text style={styles.purchaseButtonText}>
                Purchase {quantity} Ticket{quantity > 1 ? "s" : ""} - UGX {pricing.total.toLocaleString()}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {renderPaymentMethodModal()}
    </ScrollView>
  )
}

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
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
  },
  errorText: {
    color: "#FF3B30",
    fontSize: 16,
  },
  eventHeader: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: "#1E1E1E",
    marginBottom: 16,
  },
  eventImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 16,
  },
  eventInfo: {
    flex: 1,
    justifyContent: "center",
  },
  eventName: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  eventDate: {
    color: "#2196F3",
    fontSize: 14,
    marginBottom: 2,
  },
  eventVenue: {
    color: "#999",
    fontSize: 14,
  },
  section: {
    backgroundColor: "#1E1E1E",
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  ticketTypeCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#2A2A2A",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  selectedTicketType: {
    borderColor: "#2196F3",
    backgroundColor: "#1E3A8A",
  },
  ticketTypeInfo: {
    flex: 1,
  },
  ticketTypeName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  ticketTypePrice: {
    color: "#2196F3",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  ticketTypeDescription: {
    color: "#999",
    fontSize: 12,
  },
  ticketTypeSelector: {
    marginLeft: 16,
  },
  quantitySelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButton: {
    backgroundColor: "#2196F3",
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 16,
  },
  quantityText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    minWidth: 40,
    textAlign: "center",
  },
  label: {
    color: "#FFFFFF",
    fontSize: 14,
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: "#2A2A2A",
    borderRadius: 8,
    padding: 12,
    color: "#FFFFFF",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  photoVerification: {
    marginTop: 16,
  },
  capturedImageContainer: {
    alignItems: "center",
  },
  capturedImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 12,
  },
  retakeButton: {
    backgroundColor: "#FF3B30",
    borderRadius: 8,
    padding: 8,
    paddingHorizontal: 16,
  },
  retakeButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  captureButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    borderRadius: 8,
    padding: 16,
  },
  captureButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    marginLeft: 8,
  },
  pricingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  pricingBreakdown: {
    backgroundColor: "#2A2A2A",
    borderRadius: 8,
    padding: 16,
  },
  pricingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  pricingLabel: {
    color: "#999",
    fontSize: 14,
  },
  pricingValue: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: "#333",
    paddingTop: 8,
    marginTop: 8,
  },
  totalLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  totalValue: {
    color: "#2196F3",
    fontSize: 16,
    fontWeight: "bold",
  },
  commissionNote: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  commissionText: {
    color: "#999",
    fontSize: 12,
    fontStyle: "italic",
  },
  paymentMethodSelector: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#2A2A2A",
    borderRadius: 8,
    padding: 16,
  },
  selectedPaymentInfo: {
    flex: 1,
  },
  selectedPaymentName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  selectedPaymentFees: {
    color: "#999",
    fontSize: 12,
  },
  purchaseSummary: {
    backgroundColor: "#1E1E1E",
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  summaryLabel: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  summaryValue: {
    color: "#2196F3",
    fontSize: 18,
    fontWeight: "bold",
  },
  purchaseButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    borderRadius: 8,
    padding: 16,
  },
  disabledButton: {
    opacity: 0.6,
  },
  purchaseButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    width: "90%",
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  modalContent: {
    padding: 16,
  },
  paymentMethodCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#2A2A2A",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  selectedPaymentMethod: {
    borderColor: "#2196F3",
    backgroundColor: "#1E3A8A",
  },
  paymentMethodInfo: {
    flex: 1,
  },
  paymentMethodName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  paymentMethodFees: {
    color: "#999",
    fontSize: 12,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardField: {
    flex: 1,
    marginRight: 8,
  },
})

export default TicketPurchaseScreen
