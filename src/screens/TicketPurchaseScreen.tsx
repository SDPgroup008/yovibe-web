"use client"

import type React from "react"
import { useState, useEffect } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from "react-native"
import { useRoute, useNavigation } from "@react-navigation/native"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../contexts/AuthContext"
import firebaseService from "../services/FirebaseService"
import PaymentService from "../services/PaymentService"
import { ImageCaptureService } from "../services/ImageCaptureService"
import { QRCodeService } from "../services/QRCodeService"
import type { Event, TicketType } from "../models/Event"
import type { Ticket, PaymentMethod, PaymentAccount } from "../models/Ticket"
import type { PaymentBreakdown } from "../services/PaymentService"

interface RouteParams {
  eventId: string
}

const TicketPurchaseScreen: React.FC = () => {
  const route = useRoute()
  const navigation = useNavigation()
  const { user } = useAuth()
  const { eventId } = route.params as RouteParams

  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)

  // Purchase form state
  const [selectedTicketType, setSelectedTicketType] = useState<TicketType | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("mtn")
  const [selectedPaymentAccount, setSelectedPaymentAccount] = useState<PaymentAccount | null>(null)
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentBreakdown | null>(null)

  // Buyer information
  const [buyerName, setBuyerName] = useState(user?.displayName || "")
  const [buyerEmail, setBuyerEmail] = useState(user?.email || "")
  const [buyerPhone, setBuyerPhone] = useState("")
  const [buyerImage, setBuyerImage] = useState<string | null>(null)

  useEffect(() => {
    loadEvent()
  }, [eventId])

  useEffect(() => {
    if (selectedTicketType && event) {
      // Set default payment account
      const activeAccounts = event.paymentAccounts.filter((account) => account.isActive)
      const methodAccount = activeAccounts.find((account) => account.type === paymentMethod)
      setSelectedPaymentAccount(methodAccount || activeAccounts[0] || null)
    }
  }, [paymentMethod, event])

  useEffect(() => {
    if (selectedTicketType) {
      const breakdown = PaymentService.calculatePaymentBreakdown(selectedTicketType.price, quantity, paymentMethod)
      setPaymentBreakdown(breakdown)
    }
  }, [selectedTicketType, quantity, paymentMethod])

  const loadEvent = async () => {
    try {
      const eventData = await firebaseService.getEventById(eventId)
      if (eventData) {
        setEvent(eventData)
        // Set default ticket type to first available
        const availableTickets = eventData.ticketTypes.filter((ticket) => ticket.isAvailable)
        if (availableTickets.length > 0) {
          setSelectedTicketType(availableTickets[0])
        }
      } else {
        Alert.alert("Error", "Event not found")
        navigation.goBack()
      }
    } catch (error) {
      console.error("Error loading event:", error)
      Alert.alert("Error", "Failed to load event details")
      navigation.goBack()
    } finally {
      setLoading(false)
    }
  }

  const handleImageCapture = async () => {
    try {
      const imageUri = await ImageCaptureService.captureImage()
      if (imageUri) {
        setBuyerImage(imageUri)
      }
    } catch (error) {
      console.error("Error capturing image:", error)
      Alert.alert("Error", "Failed to capture image")
    }
  }

  const validatePurchaseForm = (): boolean => {
    if (!selectedTicketType) {
      Alert.alert("Error", "Please select a ticket type")
      return false
    }

    if (quantity < 1 || quantity > 10) {
      Alert.alert("Error", "Quantity must be between 1 and 10")
      return false
    }

    if (!buyerName.trim()) {
      Alert.alert("Error", "Please enter your name")
      return false
    }

    if (!buyerEmail.trim()) {
      Alert.alert("Error", "Please enter your email")
      return false
    }

    // Validate phone number for mobile money payments
    if ((paymentMethod === "mtn" || paymentMethod === "airtel") && !buyerPhone.trim()) {
      Alert.alert("Error", "Phone number is required for mobile money payments")
      return false
    }

    if ((paymentMethod === "mtn" || paymentMethod === "airtel") && buyerPhone.trim()) {
      const phoneValidation = PaymentService.validatePhoneNumber(buyerPhone.trim())
      if (!phoneValidation.valid) {
        Alert.alert("Error", phoneValidation.message || "Invalid phone number")
        return false
      }
    }

    // Require image for secure tickets
    if (selectedTicketType.id === "secure" && !buyerImage) {
      Alert.alert("Error", "Photo verification is required for secure tickets")
      return false
    }

    return true
  }

  const handlePurchase = async () => {
    if (!validatePurchaseForm() || !event || !selectedTicketType || !paymentBreakdown || !user) {
      return
    }

    setPurchasing(true)

    try {
      console.log("Starting purchase process...")

      // Upload buyer image if provided
      let buyerImageUrl: string | undefined
      if (buyerImage) {
        console.log("Uploading buyer image...")
        buyerImageUrl = await firebaseService.uploadVibeImage(buyerImage)
      }

      // Generate QR code data
      const qrData = {
        ticketId: `ticket_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        eventId: event.id,
        eventName: event.name,
        buyerId: user.id,
        buyerName: buyerName.trim(),
        ticketType: selectedTicketType.id,
        quantity,
        purchaseDate: new Date().toISOString(),
      }

      console.log("Generating QR code...")
      const qrCode = await QRCodeService.generateQRCode(JSON.stringify(qrData))

      // Create payment account for the request
      const paymentAccount: PaymentAccount = {
        type: paymentMethod,
        accountNumber: paymentMethod === "mtn" || paymentMethod === "airtel" ? buyerPhone.trim() : "card_placeholder",
        accountName: buyerName.trim(),
        isActive: true,
      }

      // Process payment with MTN API
      const paymentRequest = {
        amount: paymentBreakdown.totalAmount,
        paymentMethod,
        paymentAccount,
        buyerInfo: {
          name: buyerName.trim(),
          email: buyerEmail.trim(),
          phone: buyerPhone.trim() || undefined,
        },
        eventInfo: {
          id: event.id,
          name: event.name,
          venueName: event.venueName,
        },
        ticketInfo: {
          type: selectedTicketType.name,
          quantity,
          pricePerTicket: selectedTicketType.price,
        },
      }

      console.log("Processing payment...")
      const paymentResponse = await PaymentService.processPayment(paymentRequest)

      if (!paymentResponse.success) {
        Alert.alert("Payment Failed", paymentResponse.message)
        return
      }

      console.log("Payment successful, creating ticket...")

      // Create ticket
      const now = new Date()
      const ticket: Ticket = {
        id: qrData.ticketId,
        eventId: event.id,
        eventName: event.name,
        eventPosterUrl: event.posterImageUrl,
        buyerId: user.id,
        buyerName: buyerName.trim(),
        buyerEmail: buyerEmail.trim(),
        buyerPhone: buyerPhone.trim() || undefined,
        buyerImageUrl,
        quantity,
        ticketType: selectedTicketType.id,
        ticketTypeName: selectedTicketType.name,
        pricePerTicket: selectedTicketType.price,
        totalAmount: paymentBreakdown.totalAmount,
        paymentFees: paymentBreakdown.paymentFees,
        appCommission: paymentBreakdown.appCommission,
        sellerRevenue: paymentBreakdown.sellerRevenue,
        paymentMethod,
        paymentReference: paymentResponse.reference,
        paymentAccount: paymentAccount,
        qrCode,
        qrData: JSON.stringify(qrData),
        status: "active",
        purchaseDate: now,
        validationHistory: [],
        isVerified: selectedTicketType.id === "secure" && !!buyerImageUrl,
        createdAt: now,
        updatedAt: now,
      }

      // Save ticket to database
      await firebaseService.saveTicket(ticket)

      // Save payment confirmation for admin logs
      await firebaseService.savePaymentConfirmation({
        id: `conf_${Date.now()}`,
        ticketId: ticket.id,
        eventId: event.id,
        buyerId: user.id,
        sellerId: event.createdBy || "unknown",
        amount: paymentBreakdown.totalAmount,
        paymentMethod,
        paymentReference: paymentResponse.reference || "",
        timestamp: now,
        type: "purchase",
        status: "success",
      })

      // Show success message with detailed breakdown
      Alert.alert(
        "Purchase Successful! 🎉",
        `Your ${selectedTicketType.name} ticket${quantity > 1 ? "s" : ""} for ${event.name} ${quantity > 1 ? "have" : "has"} been purchased successfully!\n\n` +
          `Transaction ID: ${paymentResponse.reference}\n` +
          `Total Paid: UGX ${paymentBreakdown.totalAmount.toLocaleString()}\n` +
          `App Commission: UGX ${paymentBreakdown.appCommission.toLocaleString()} (paid to admin)\n` +
          `Event Owner Revenue: UGX ${paymentBreakdown.sellerRevenue.toLocaleString()} (will be paid upon ticket verification)\n\n` +
          `You will receive a confirmation email shortly.`,
        [
          {
            text: "View Tickets",
            onPress: () => {
              navigation.navigate("PurchasedTickets" as never)
            },
          },
          {
            text: "OK",
            style: "default",
          },
        ],
      )

      // Send notifications (simulated)
      console.log("Buyer notification:", {
        to: buyerEmail.trim(),
        subject: `Ticket Confirmation - ${event.name}`,
        message: `Your ticket purchase was successful! Transaction ID: ${paymentResponse.reference}`,
      })

      console.log("Seller notification:", {
        eventOwner: event.createdBy,
        message: `New ticket sale for ${event.name}. Revenue: UGX ${paymentBreakdown.sellerRevenue.toLocaleString()} (will be paid upon ticket verification)`,
      })
    } catch (error) {
      console.error("Error processing purchase:", error)
      Alert.alert("Error", `Failed to process purchase: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setPurchasing(false)
    }
  }

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
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const availableTicketTypes = event.ticketTypes.filter((ticket) => ticket.isAvailable)

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Purchase Tickets</Text>
      </View>

      <View style={styles.content}>
        {/* Event Header */}
        <View style={styles.eventHeader}>
          <Image source={{ uri: event.posterImageUrl }} style={styles.eventPoster} />
          <View style={styles.eventInfo}>
            <Text style={styles.eventName}>{event.name}</Text>
            <Text style={styles.eventVenue}>{event.venueName}</Text>
            <Text style={styles.eventDate}>
              {event.date.toLocaleDateString()} at{" "}
              {event.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
        </View>

        {/* Payment Flow Information */}
        <View style={styles.paymentFlowInfo}>
          <Text style={styles.paymentFlowTitle}>💳 Payment Process</Text>
          <Text style={styles.paymentFlowText}>
            1. Payment will be initiated on your phone number{"\n"}
            2. App commission (5%) is paid immediately to admin{"\n"}
            3. Event owner receives payment when ticket is verified at entrance
          </Text>
        </View>

        {/* Ticket Type Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Ticket Type</Text>
          {availableTicketTypes.map((ticketType) => (
            <TouchableOpacity
              key={ticketType.id}
              style={[styles.ticketTypeCard, selectedTicketType?.id === ticketType.id && styles.ticketTypeCardSelected]}
              onPress={() => setSelectedTicketType(ticketType)}
            >
              <View style={styles.ticketTypeHeader}>
                <Text style={styles.ticketTypeName}>{ticketType.name}</Text>
                <Text style={styles.ticketTypePrice}>UGX {ticketType.price.toLocaleString()}</Text>
              </View>
              {ticketType.description && <Text style={styles.ticketTypeDescription}>{ticketType.description}</Text>}
              {ticketType.id === "secure" && <Text style={styles.secureNote}>📸 Photo verification required</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* Quantity Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quantity</Text>
          <View style={styles.quantityContainer}>
            <TouchableOpacity style={styles.quantityButton} onPress={() => setQuantity(Math.max(1, quantity - 1))}>
              <Text style={styles.quantityButtonText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.quantityText}>{quantity}</Text>
            <TouchableOpacity style={styles.quantityButton} onPress={() => setQuantity(Math.min(10, quantity + 1))}>
              <Text style={styles.quantityButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Buyer Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Information</Text>

          <TextInput
            style={styles.input}
            placeholder="Full Name"
            value={buyerName}
            onChangeText={setBuyerName}
            placeholderTextColor="#666"
          />

          <TextInput
            style={styles.input}
            placeholder="Email Address"
            value={buyerEmail}
            onChangeText={setBuyerEmail}
            keyboardType="email-address"
            placeholderTextColor="#666"
          />

          <TextInput
            style={styles.input}
            placeholder="Phone Number (256XXXXXXXXX) - Payment will be initiated here"
            value={buyerPhone}
            onChangeText={setBuyerPhone}
            keyboardType="phone-pad"
            placeholderTextColor="#666"
          />

          {/* Phone number validation hint */}
          <Text style={styles.phoneHint}>MTN: 076, 077, 078, 079 | Airtel: 070, 074, 075</Text>

          {/* Photo Verification for Secure Tickets */}
          {selectedTicketType?.id === "secure" && (
            <View style={styles.photoSection}>
              <Text style={styles.photoSectionTitle}>Photo Verification Required</Text>
              <Text style={styles.photoSectionDescription}>Take a photo for ticket verification at the event</Text>

              {buyerImage ? (
                <View style={styles.photoPreview}>
                  <Image source={{ uri: buyerImage }} style={styles.photoImage} />
                  <TouchableOpacity style={styles.retakeButton} onPress={handleImageCapture}>
                    <Text style={styles.retakeButtonText}>Retake Photo</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.captureButton} onPress={handleImageCapture}>
                  <Ionicons name="camera" size={20} color="#FFFFFF" />
                  <Text style={styles.captureButtonText}>Take Photo</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Payment Method Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          <View style={styles.paymentMethods}>
            {(["mtn", "airtel", "card"] as PaymentMethod[]).map((method) => (
              <TouchableOpacity
                key={method}
                style={[styles.paymentMethodCard, paymentMethod === method && styles.paymentMethodCardSelected]}
                onPress={() => setPaymentMethod(method)}
              >
                <View style={styles.paymentMethodContent}>
                  <Text style={styles.paymentMethodName}>{PaymentService.getPaymentMethodName(method)}</Text>
                  <Text style={styles.paymentMethodFees}>
                    Fee: UGX {PaymentService.getPaymentFees(method).fixed} +{" "}
                    {(PaymentService.getPaymentFees(method).percentage * 100).toFixed(1)}%
                  </Text>
                  {method === "mtn" && <Text style={styles.paymentMethodNote}>✅ Real MTN API Integration</Text>}
                  {method === "airtel" && <Text style={styles.paymentMethodNote}>🔄 Placeholder API</Text>}
                  {method === "card" && <Text style={styles.paymentMethodNote}>🔄 Placeholder API</Text>}
                </View>
                {paymentMethod === method && <Ionicons name="checkmark-circle" size={24} color="#2196F3" />}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Payment Breakdown */}
        {paymentBreakdown && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Breakdown</Text>
            <View style={styles.breakdownCard}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>
                  {selectedTicketType?.name} x {quantity}
                </Text>
                <Text style={styles.breakdownValue}>UGX {paymentBreakdown.subtotal.toLocaleString()}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Payment Fees</Text>
                <Text style={styles.breakdownValue}>UGX {paymentBreakdown.paymentFees.toLocaleString()}</Text>
              </View>
              <View style={styles.breakdownDivider} />
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabelTotal}>Total Amount</Text>
                <Text style={styles.breakdownValueTotal}>UGX {paymentBreakdown.totalAmount.toLocaleString()}</Text>
              </View>
              <View style={styles.breakdownDivider} />
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabelSmall}>App Commission (5%)</Text>
                <Text style={styles.breakdownValueSmall}>UGX {paymentBreakdown.appCommission.toLocaleString()}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabelSmall}>Event Owner Revenue</Text>
                <Text style={styles.breakdownValueSmall}>UGX {paymentBreakdown.sellerRevenue.toLocaleString()}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Purchase Button */}
        <TouchableOpacity
          style={[styles.purchaseButton, purchasing && styles.purchaseButtonDisabled]}
          onPress={handlePurchase}
          disabled={purchasing}
        >
          {purchasing ? (
            <View style={styles.purchaseButtonContent}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.purchaseButtonText}>Processing Payment...</Text>
            </View>
          ) : (
            <View style={styles.purchaseButtonContent}>
              <Ionicons name="card" size={20} color="#FFFFFF" />
              <Text style={styles.purchaseButtonText}>
                Purchase for UGX {paymentBreakdown?.totalAmount.toLocaleString() || "0"}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Payment Security Notice */}
        <View style={styles.securityNotice}>
          <Ionicons name="shield-checkmark" size={16} color="#4CAF50" />
          <Text style={styles.securityNoticeText}>
            Your payment is secure. Commission is paid to admin immediately. Event owner receives payment when ticket is
            verified.
          </Text>
        </View>
      </View>
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
    marginTop: 16,
    fontSize: 16,
    color: "#FFFFFF",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: "#FFFFFF",
    marginBottom: 20,
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E1E1E",
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  backButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    flex: 1,
  },
  content: {
    padding: 16,
  },
  eventHeader: {
    flexDirection: "row",
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  eventPoster: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 16,
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  eventVenue: {
    fontSize: 14,
    color: "#DDDDDD",
    marginBottom: 4,
  },
  eventDate: {
    fontSize: 14,
    color: "#2196F3",
    fontWeight: "500",
  },
  paymentFlowInfo: {
    backgroundColor: "#1A237E",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#2196F3",
  },
  paymentFlowTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  paymentFlowText: {
    fontSize: 14,
    color: "#DDDDDD",
    lineHeight: 20,
  },
  section: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  ticketTypeCard: {
    borderWidth: 2,
    borderColor: "#333333",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  ticketTypeCardSelected: {
    borderColor: "#2196F3",
    backgroundColor: "#0D47A1",
  },
  ticketTypeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  ticketTypeName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  ticketTypePrice: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2196F3",
  },
  ticketTypeDescription: {
    fontSize: 14,
    color: "#DDDDDD",
    marginBottom: 4,
  },
  secureNote: {
    fontSize: 12,
    color: "#FFD700",
    fontWeight: "500",
  },
  quantityContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2196F3",
    justifyContent: "center",
    alignItems: "center",
  },
  quantityButtonText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  quantityText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginHorizontal: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: "#333333",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#FFFFFF",
    backgroundColor: "#2A2A2A",
    marginBottom: 12,
  },
  phoneHint: {
    fontSize: 12,
    color: "#DDDDDD",
    marginBottom: 16,
    fontStyle: "italic",
  },
  photoSection: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#2A2A2A",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  photoSectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFD700",
    marginBottom: 4,
  },
  photoSectionDescription: {
    fontSize: 14,
    color: "#DDDDDD",
    marginBottom: 16,
  },
  photoPreview: {
    alignItems: "center",
  },
  photoImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 12,
  },
  retakeButton: {
    backgroundColor: "#FF9800",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retakeButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  captureButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF9800",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  captureButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  paymentMethods: {
    gap: 12,
  },
  paymentMethodCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 2,
    borderColor: "#333333",
    borderRadius: 8,
    padding: 16,
  },
  paymentMethodCardSelected: {
    borderColor: "#2196F3",
    backgroundColor: "#0D47A1",
  },
  paymentMethodContent: {
    flex: 1,
  },
  paymentMethodName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  paymentMethodFees: {
    fontSize: 12,
    color: "#DDDDDD",
    marginBottom: 2,
  },
  paymentMethodNote: {
    fontSize: 11,
    color: "#4CAF50",
    fontWeight: "500",
  },
  breakdownCard: {
    backgroundColor: "#2A2A2A",
    borderRadius: 8,
    padding: 16,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  breakdownLabel: {
    fontSize: 14,
    color: "#DDDDDD",
  },
  breakdownValue: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  breakdownLabelTotal: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  breakdownValueTotal: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2196F3",
  },
  breakdownLabelSmall: {
    fontSize: 12,
    color: "#DDDDDD",
  },
  breakdownValueSmall: {
    fontSize: 12,
    color: "#DDDDDD",
    fontWeight: "500",
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: "#333333",
    marginVertical: 8,
  },
  purchaseButton: {
    backgroundColor: "#4CAF50",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  purchaseButtonDisabled: {
    backgroundColor: "#666666",
  },
  purchaseButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  purchaseButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 8,
  },
  securityNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#1B5E20",
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  securityNoticeText: {
    fontSize: 12,
    color: "#FFFFFF",
    marginLeft: 8,
    flex: 1,
    lineHeight: 16,
  },
})

export default TicketPurchaseScreen
