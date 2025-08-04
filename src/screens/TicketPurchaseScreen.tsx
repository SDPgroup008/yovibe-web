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
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../contexts/AuthContext"
import FirebaseService from "../services/FirebaseService"
import PaymentService from "../services/PaymentService"
import QRCodeService from "../services/QRCodeService"
import type { Event, TicketType } from "../models/Event"
import type { Ticket, PaymentMethod } from "../models/Ticket"
import type { TicketPurchaseScreenProps } from "../navigation/types"

const TicketPurchaseScreen: React.FC<TicketPurchaseScreenProps> = ({ route, navigation }) => {
  const { eventId } = route.params
  const { user } = useAuth()

  // State
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)
  const [selectedTicketType, setSelectedTicketType] = useState<TicketType | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>("mtn")
  const [paymentAccount, setPaymentAccount] = useState("")
  const [accountName, setAccountName] = useState("")

  useEffect(() => {
    loadEventData()
  }, [eventId])

  const loadEventData = async () => {
    try {
      console.log("Loading event data for ID:", eventId)
      const eventData = await FirebaseService.getEventById(eventId)

      if (eventData) {
        setEvent(eventData)
        // Set default ticket type to the first available one
        const availableTickets = eventData.ticketTypes.filter((ticket) => ticket.isAvailable)
        if (availableTickets.length > 0) {
          setSelectedTicketType(availableTickets[0])
        }
        console.log("Event data loaded successfully:", eventData.name)
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

  const validatePurchaseForm = (): boolean => {
    console.log("Validating purchase form...")

    if (!user) {
      Alert.alert("Error", "Please log in to purchase tickets")
      return false
    }

    if (!event) {
      Alert.alert("Error", "Event data not loaded")
      return false
    }

    if (!selectedTicketType) {
      Alert.alert("Error", "Please select a ticket type")
      return false
    }

    if (quantity < 1) {
      Alert.alert("Error", "Please select at least 1 ticket")
      return false
    }

    if (!paymentAccount.trim()) {
      Alert.alert("Error", "Please enter your payment account details")
      return false
    }

    if (!accountName.trim()) {
      Alert.alert("Error", "Please enter the account name")
      return false
    }

    // Validate phone number format for mobile money
    if (selectedPaymentMethod === "mtn" || selectedPaymentMethod === "airtel") {
      const validation = PaymentService.validatePhoneNumber(paymentAccount)
      if (!validation.valid) {
        Alert.alert("Error", validation.message)
        return false
      }
    }

    console.log("Form validation passed")
    return true
  }

  const handlePurchase = async () => {
    console.log("Purchase button clicked!")

    if (!validatePurchaseForm()) {
      return
    }

    console.log("Starting purchase process...")
    setPurchasing(true)

    try {
      if (!event || !selectedTicketType || !user) {
        throw new Error("Missing required data for purchase")
      }

      // Calculate payment breakdown
      const breakdown = PaymentService.calculatePaymentBreakdown(
        selectedTicketType.price,
        quantity,
        selectedPaymentMethod,
      )

      console.log("Payment breakdown:", breakdown)

      // Create ticket data for QR code
      const ticketData = QRCodeService.createTicketQRData({
        ticketId: `ticket_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
        eventId: event.id,
        eventName: event.name,
        ticketType: selectedTicketType.name,
        buyerName: user.name,
        buyerEmail: user.email,
        purchaseDate: new Date().toISOString(),
        isSecure: selectedTicketType.name.toLowerCase().includes("secure"),
      })

      console.log("Generating QR code...")
      const qrCodeDataURL = await QRCodeService.generateQRCode(ticketData)
      console.log("QR code generated successfully")

      // Prepare payment request
      const paymentRequest = {
        amount: breakdown.totalAmount,
        paymentMethod: selectedPaymentMethod,
        paymentAccount: {
          type: selectedPaymentMethod,
          accountNumber: paymentAccount,
          accountName: accountName,
        },
        buyerInfo: {
          name: user.name,
          email: user.email,
          phone: selectedPaymentMethod !== "card" ? paymentAccount : undefined,
        },
        eventInfo: {
          id: event.id,
          name: event.name,
          venueName: event.venueName,
        },
        ticketInfo: {
          type: selectedTicketType.name,
          quantity: quantity,
          pricePerTicket: selectedTicketType.price,
        },
      }

      console.log("Processing payment with request:", paymentRequest)

      // Process payment
      const paymentResult = await PaymentService.processPayment(paymentRequest)

      console.log("Payment result:", paymentResult)

      if (paymentResult.success) {
        // Create ticket record
        const ticketRecord: Omit<Ticket, "id"> = {
          eventId: event.id,
          eventName: event.name,
          venueName: event.venueName,
          buyerId: user.id,
          buyerName: user.name,
          buyerEmail: user.email,
          ticketType: selectedTicketType.name,
          quantity: quantity,
          totalAmount: breakdown.totalAmount,
          paymentMethod: selectedPaymentMethod,
          paymentReference: paymentResult.reference || paymentResult.transactionId || "",
          transactionId: paymentResult.transactionId || "",
          qrCodeData: JSON.stringify(ticketData),
          qrCodeImage: qrCodeDataURL,
          purchaseDate: new Date(),
          status: "active",
          isVerified: false,
          verificationDate: null,
          buyerPhoto: selectedTicketType.name.toLowerCase().includes("secure") ? user.profileImageUrl : undefined,
        }

        console.log("Saving ticket to database...")
        const ticketId = await FirebaseService.addTicket(ticketRecord)
        console.log("Ticket saved with ID:", ticketId)

        // Show success message
        Alert.alert(
          "Payment Successful!",
          `Your ticket has been purchased successfully.\n\nTransaction ID: ${paymentResult.transactionId}\n\nYou can view your ticket in the "My Tickets" section.`,
          [
            {
              text: "View Ticket",
              onPress: () => {
                navigation.navigate("PurchasedTickets")
              },
            },
            {
              text: "OK",
              onPress: () => {
                navigation.goBack()
              },
            },
          ],
        )
      } else {
        console.error("Payment failed:", paymentResult.message)
        Alert.alert("Payment Failed", paymentResult.message || "Payment could not be processed. Please try again.")
      }
    } catch (error) {
      console.error("Error processing purchase:", error)
      Alert.alert("Error", "Failed to process purchase. Please try again.")
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
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Event not found</Text>
      </View>
    )
  }

  const availableTickets = event.ticketTypes.filter((ticket) => ticket.isAvailable)
  const breakdown = selectedTicketType
    ? PaymentService.calculatePaymentBreakdown(selectedTicketType.price, quantity, selectedPaymentMethod)
    : null

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Event Header */}
        <View style={styles.eventHeader}>
          <Image source={{ uri: event.posterImageUrl }} style={styles.eventImage} resizeMode="cover" />
          <View style={styles.eventInfo}>
            <Text style={styles.eventName}>{event.name}</Text>
            <Text style={styles.eventVenue}>{event.venueName}</Text>
            <Text style={styles.eventDate}>{event.date.toDateString()}</Text>
          </View>
        </View>

        {/* Ticket Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Ticket Type</Text>
          {availableTickets.map((ticket) => (
            <TouchableOpacity
              key={ticket.id}
              style={[styles.ticketOption, selectedTicketType?.id === ticket.id && styles.ticketOptionSelected]}
              onPress={() => setSelectedTicketType(ticket)}
            >
              <View style={styles.ticketInfo}>
                <Text style={styles.ticketName}>{ticket.name}</Text>
                <Text style={styles.ticketDescription}>{ticket.description}</Text>
              </View>
              <Text style={styles.ticketPrice}>{`UGX ${ticket.price.toLocaleString()}`}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Quantity Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quantity</Text>
          <View style={styles.quantityContainer}>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
            >
              <Ionicons name="remove" size={20} color={quantity <= 1 ? "#666" : "#FFF"} />
            </TouchableOpacity>
            <Text style={styles.quantityText}>{quantity}</Text>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => setQuantity(quantity + 1)}
              disabled={quantity >= 10}
            >
              <Ionicons name="add" size={20} color={quantity >= 10 ? "#666" : "#FFF"} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Payment Method Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          <View style={styles.paymentMethods}>
            <TouchableOpacity
              style={[styles.paymentMethod, selectedPaymentMethod === "mtn" && styles.paymentMethodSelected]}
              onPress={() => setSelectedPaymentMethod("mtn")}
            >
              <Text style={styles.paymentMethodText}>MTN Mobile Money</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.paymentMethod, selectedPaymentMethod === "airtel" && styles.paymentMethodSelected]}
              onPress={() => setSelectedPaymentMethod("airtel")}
            >
              <Text style={styles.paymentMethodText}>Airtel Money</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.paymentMethod, selectedPaymentMethod === "card" && styles.paymentMethodSelected]}
              onPress={() => setSelectedPaymentMethod("card")}
            >
              <Text style={styles.paymentMethodText}>Credit/Debit Card</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Payment Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Details</Text>
          <TextInput
            style={styles.input}
            placeholder={
              selectedPaymentMethod === "card"
                ? "Card Number"
                : selectedPaymentMethod === "mtn"
                  ? "MTN Number (256XXXXXXXXX)"
                  : "Airtel Number (256XXXXXXXXX)"
            }
            value={paymentAccount}
            onChangeText={setPaymentAccount}
            keyboardType={selectedPaymentMethod === "card" ? "numeric" : "phone-pad"}
            placeholderTextColor="#666"
          />
          <Text style={styles.phoneHint}>
            {selectedPaymentMethod === "mtn"
              ? "MTN numbers: 076, 077, 078, 079"
              : selectedPaymentMethod === "airtel"
                ? "Airtel numbers: 070, 074, 075"
                : "Enter 16-digit card number"}
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Account/Card Holder Name"
            value={accountName}
            onChangeText={setAccountName}
            placeholderTextColor="#666"
          />
        </View>

        {/* Payment Breakdown */}
        {breakdown && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Summary</Text>
            <View style={styles.breakdown}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{`${selectedTicketType?.name} x ${quantity}`}</Text>
                <Text style={styles.breakdownValue}>{`UGX ${breakdown.subtotal.toLocaleString()}`}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Payment Fees</Text>
                <Text style={styles.breakdownValue}>{`UGX ${breakdown.paymentFees.toLocaleString()}`}</Text>
              </View>
              <View style={[styles.breakdownRow, styles.breakdownTotal]}>
                <Text style={styles.breakdownTotalLabel}>Total Amount</Text>
                <Text style={styles.breakdownTotalValue}>{`UGX ${breakdown.totalAmount.toLocaleString()}`}</Text>
              </View>
              <View style={styles.breakdownNote}>
                <Text style={styles.breakdownNoteText}>
                  {`App commission (5%): UGX ${breakdown.appCommission.toLocaleString()}`}
                </Text>
                <Text style={styles.breakdownNoteText}>
                  {`Event owner receives: UGX ${breakdown.sellerRevenue.toLocaleString()}`}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Purchase Button */}
        <TouchableOpacity
          style={[styles.purchaseButton, purchasing && styles.purchaseButtonDisabled]}
          onPress={handlePurchase}
          disabled={purchasing || !selectedTicketType}
        >
          {purchasing ? (
            <View style={styles.purchaseButtonContent}>
              <ActivityIndicator size="small" color="#FFF" />
              <Text style={styles.purchaseButtonText}>Processing Payment...</Text>
            </View>
          ) : (
            <Text style={styles.purchaseButtonText}>
              {breakdown ? `Purchase for UGX ${breakdown.totalAmount.toLocaleString()}` : "Select Ticket Type"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
  },
  loadingText: {
    color: "#FFF",
    fontSize: 16,
    marginTop: 16,
  },
  errorText: {
    color: "#FF3B30",
    fontSize: 16,
  },
  eventHeader: {
    flexDirection: "row",
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  eventImage: {
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
    color: "#FFF",
    marginBottom: 4,
  },
  eventVenue: {
    fontSize: 14,
    color: "#BBB",
    marginBottom: 4,
  },
  eventDate: {
    fontSize: 14,
    color: "#2196F3",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFF",
    marginBottom: 12,
  },
  ticketOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1E1E1E",
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  ticketOptionSelected: {
    borderColor: "#2196F3",
  },
  ticketInfo: {
    flex: 1,
  },
  ticketName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFF",
    marginBottom: 4,
  },
  ticketDescription: {
    fontSize: 14,
    color: "#BBB",
  },
  ticketPrice: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2196F3",
  },
  quantityContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    padding: 16,
  },
  quantityButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2A2A2A",
    justifyContent: "center",
    alignItems: "center",
  },
  quantityText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFF",
    marginHorizontal: 24,
  },
  paymentMethods: {
    gap: 8,
  },
  paymentMethod: {
    backgroundColor: "#1E1E1E",
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  paymentMethodSelected: {
    borderColor: "#2196F3",
  },
  paymentMethodText: {
    fontSize: 16,
    color: "#FFF",
    textAlign: "center",
  },
  input: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    padding: 16,
    color: "#FFF",
    fontSize: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  phoneHint: {
    fontSize: 12,
    color: "#666",
    marginBottom: 12,
    fontStyle: "italic",
  },
  breakdown: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    padding: 16,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  breakdownLabel: {
    fontSize: 14,
    color: "#BBB",
  },
  breakdownValue: {
    fontSize: 14,
    color: "#FFF",
  },
  breakdownTotal: {
    borderTopWidth: 1,
    borderTopColor: "#333",
    marginTop: 8,
    paddingTop: 16,
  },
  breakdownTotalLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFF",
  },
  breakdownTotalValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2196F3",
  },
  breakdownNote: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  breakdownNoteText: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  purchaseButton: {
    backgroundColor: "#2196F3",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },
  purchaseButtonDisabled: {
    backgroundColor: "#333",
  },
  purchaseButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  purchaseButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFF",
  },
})

export default TicketPurchaseScreen
