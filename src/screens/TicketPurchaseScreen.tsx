"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, StyleSheet, Image } from "react-native"
import { useNavigation, useRoute } from "@react-navigation/native"
import { useAuth } from "../contexts/AuthContext"
import firebaseService from "../services/FirebaseService"
import PaymentService from "../services/PaymentService"
import type { Event, TicketType } from "../models/Event"
import type { Ticket, PaymentMethod } from "../models/Ticket"
import { Ionicons } from "@expo/vector-icons"

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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)

  useEffect(() => {
    loadEvent()
  }, [eventId])

  useEffect(() => {
    // Auto-detect payment method from phone number
    if (phoneNumber) {
      const detectedMethod = PaymentService.getPaymentMethodFromPhone(phoneNumber)
      setPaymentMethod(detectedMethod)
    }
  }, [phoneNumber])

  const loadEvent = async () => {
    try {
      setLoading(true)
      const eventData = await firebaseService.getEvent(eventId)
      if (eventData) {
        setEvent(eventData)
        // Set default ticket type to the first available one
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

  const calculateTotal = () => {
    if (!selectedTicketType) return 0
    return selectedTicketType.price * quantity
  }

  const calculatePricing = () => {
    const total = calculateTotal()
    return PaymentService.calculatePricing(total)
  }

  const validatePhoneNumber = (phone: string): boolean => {
    // Remove any spaces or special characters
    const cleanPhone = phone.replace(/\s+/g, "")

    // Check MTN format
    if (/^(077|078|076)\d{7}$/.test(cleanPhone)) {
      return true
    }

    // Check Airtel format
    if (/^(070|075)\d{7}$/.test(cleanPhone)) {
      return true
    }

    return false
  }

  const handlePurchase = async () => {
    if (!user) {
      Alert.alert("Error", "Please log in to purchase tickets")
      return
    }

    if (!selectedTicketType) {
      Alert.alert("Error", "Please select a ticket type")
      return
    }

    if (!phoneNumber.trim()) {
      Alert.alert("Error", "Please enter your phone number")
      return
    }

    if (!validatePhoneNumber(phoneNumber)) {
      Alert.alert("Error", "Please enter a valid MTN (077/078/076) or Airtel (070/075) phone number")
      return
    }

    if (quantity < 1) {
      Alert.alert("Error", "Please select at least 1 ticket")
      return
    }

    const total = calculateTotal()
    if (total <= 0) {
      Alert.alert("Error", "Invalid ticket price")
      return
    }

    setPurchasing(true)

    try {
      console.log("TicketPurchaseScreen: Starting purchase process", {
        eventId,
        ticketType: selectedTicketType.name,
        quantity,
        total,
        phoneNumber,
        paymentMethod,
      })

      const paymentRequest = {
        amount: total,
        phoneNumber: phoneNumber.replace(/\s+/g, ""),
        eventId,
        ticketType: selectedTicketType.name,
        quantity,
        buyerId: user.id,
        buyerName: user.displayName || user.email || "Unknown User",
        eventName: event?.name || "Unknown Event",
        paymentMethod: paymentMethod || "mtn",
      }

      let paymentResult

      // Process payment based on detected method
      if (paymentMethod === "mtn") {
        paymentResult = await PaymentService.processMTNPayment(paymentRequest)
      } else if (paymentMethod === "airtel") {
        paymentResult = await PaymentService.processAirtelPayment(paymentRequest)
      } else {
        // Default to MTN if detection fails
        paymentResult = await PaymentService.processMTNPayment(paymentRequest)
      }

      console.log("TicketPurchaseScreen: Payment result:", paymentResult)

      if (paymentResult.success && paymentResult.ticketId && paymentResult.qrCodeData && paymentResult.qrCodeImage) {
        // Create ticket record in Firebase
        const ticketData: Omit<Ticket, "id"> = {
          eventId,
          eventName: event?.name || "Unknown Event",
          buyerId: user.id,
          buyerName: user.displayName || user.email || "Unknown User",
          buyerPhone: phoneNumber.replace(/\s+/g, ""),
          ticketType: selectedTicketType.name,
          quantity,
          totalAmount: total,
          paymentMethod: paymentMethod || "mtn",
          transactionId: paymentResult.transactionId!,
          ticketId: paymentResult.ticketId,
          qrCodeData: paymentResult.qrCodeData,
          qrCodeImage: paymentResult.qrCodeImage,
          purchaseDate: new Date(),
          isUsed: false,
          usedAt: null,
          status: "active",
        }

        await firebaseService.addTicket(ticketData)

        console.log("TicketPurchaseScreen: Ticket saved successfully")

        Alert.alert(
          "Payment Successful!",
          `Your ticket has been purchased successfully.\n\nTicket ID: ${paymentResult.ticketId}\n\nYou can view your ticket in the "My Tickets" section.`,
          [
            {
              text: "View Ticket",
              onPress: () => {
                navigation.navigate("PurchasedTickets" as never)
              },
            },
            {
              text: "OK",
              onPress: () => navigation.goBack(),
            },
          ],
        )
      } else {
        Alert.alert("Payment Failed", paymentResult.error || "Unknown error occurred")
      }
    } catch (error) {
      console.error("TicketPurchaseScreen: Purchase error:", error)
      Alert.alert("Error", "Failed to process payment. Please try again.")
    } finally {
      setPurchasing(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
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
  const availableTickets = event.ticketTypes.filter((ticket) => ticket.isAvailable)

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Event Header */}
        <View style={styles.eventHeader}>
          {event.posterImageUrl && <Image source={{ uri: event.posterImageUrl }} style={styles.eventPoster} />}
          <View style={styles.eventInfo}>
            <Text style={styles.eventName}>{event.name}</Text>
            <Text style={styles.eventVenue}>{event.venueName}</Text>
            <Text style={styles.eventDate}>
              {event.date.toLocaleDateString()} at{" "}
              {event.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
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
              <View style={styles.ticketPrice}>
                <Text style={styles.priceText}>{PaymentService.formatAmount(ticket.price)}</Text>
                {selectedTicketType?.id === ticket.id && <Ionicons name="checkmark-circle" size={20} color="#6366f1" />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Quantity Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quantity</Text>
          <View style={styles.quantityContainer}>
            <TouchableOpacity style={styles.quantityButton} onPress={() => setQuantity(Math.max(1, quantity - 1))}>
              <Ionicons name="remove" size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.quantityText}>{quantity}</Text>
            <TouchableOpacity style={styles.quantityButton} onPress={() => setQuantity(quantity + 1)}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Phone Number Input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Phone Number</Text>
          <View style={styles.phoneInputContainer}>
            <TextInput
              style={styles.phoneInput}
              placeholder="Enter MTN or Airtel number (e.g., 0771234567)"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              placeholderTextColor="#666"
            />
            {paymentMethod && (
              <View style={styles.paymentMethodIndicator}>
                <Text style={styles.paymentMethodText}>{paymentMethod.toUpperCase()}</Text>
              </View>
            )}
          </View>
          <Text style={styles.phoneHint}>Supported: MTN (077, 078, 076) • Airtel (070, 075)</Text>
        </View>

        {/* Pricing Breakdown */}
        {selectedTicketType && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pricing Breakdown</Text>
            <View style={styles.pricingCard}>
              <View style={styles.pricingRow}>
                <Text style={styles.pricingLabel}>
                  {selectedTicketType.name} × {quantity}
                </Text>
                <Text style={styles.pricingValue}>{PaymentService.formatAmount(pricing.baseAmount)}</Text>
              </View>
              <View style={styles.pricingRow}>
                <Text style={styles.pricingLabel}>App Commission (5%)</Text>
                <Text style={styles.pricingValue}>{PaymentService.formatAmount(pricing.commission)}</Text>
              </View>
              <View style={styles.pricingDivider} />
              <View style={styles.pricingRow}>
                <Text style={styles.totalLabel}>Total Amount</Text>
                <Text style={styles.totalValue}>{PaymentService.formatAmount(pricing.total)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Purchase Button */}
        <TouchableOpacity
          style={[
            styles.purchaseButton,
            (!selectedTicketType || !phoneNumber || purchasing) && styles.purchaseButtonDisabled,
          ]}
          onPress={handlePurchase}
          disabled={!selectedTicketType || !phoneNumber || purchasing}
        >
          {purchasing ? (
            <View style={styles.purchasingContainer}>
              <Text style={styles.purchaseButtonText}>Processing Payment...</Text>
            </View>
          ) : (
            <View style={styles.purchaseContainer}>
              <Ionicons name="card" size={20} color="#fff" />
              <Text style={styles.purchaseButtonText}>
                Purchase Ticket - {PaymentService.formatAmount(calculateTotal())}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Payment Info */}
        <View style={styles.paymentInfo}>
          <Text style={styles.paymentInfoText}>• Payment will be deducted from your mobile money account</Text>
          <Text style={styles.paymentInfoText}>• You will receive an SMS confirmation</Text>
          <Text style={styles.paymentInfoText}>• Your ticket will be available immediately after payment</Text>
          <Text style={styles.paymentInfoText}>• Admin commission is paid instantly upon purchase</Text>
          <Text style={styles.paymentInfoText}>• Event owner receives payment when ticket is verified at entrance</Text>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  content: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  loadingText: {
    color: "#fff",
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  errorText: {
    color: "#ef4444",
    fontSize: 16,
  },
  eventHeader: {
    marginBottom: 24,
  },
  eventPoster: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
  },
  eventInfo: {
    gap: 4,
  },
  eventName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
  },
  eventVenue: {
    fontSize: 16,
    color: "#6366f1",
  },
  eventDate: {
    fontSize: 14,
    color: "#666",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  ticketOption: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#333",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ticketOptionSelected: {
    borderColor: "#6366f1",
    backgroundColor: "#1e1b4b",
  },
  ticketInfo: {
    flex: 1,
  },
  ticketName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  ticketDescription: {
    fontSize: 14,
    color: "#666",
  },
  ticketPrice: {
    alignItems: "flex-end",
    gap: 4,
  },
  priceText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6366f1",
  },
  quantityContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  quantityButton: {
    backgroundColor: "#6366f1",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  quantityText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    minWidth: 40,
    textAlign: "center",
  },
  phoneInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  phoneInput: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#333",
  },
  paymentMethodIndicator: {
    backgroundColor: "#6366f1",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  paymentMethodText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  phoneHint: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  pricingCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  pricingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  pricingLabel: {
    fontSize: 14,
    color: "#666",
  },
  pricingValue: {
    fontSize: 14,
    color: "#fff",
  },
  pricingDivider: {
    height: 1,
    backgroundColor: "#333",
    marginVertical: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  totalValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6366f1",
  },
  purchaseButton: {
    backgroundColor: "#6366f1",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
  },
  purchaseButtonDisabled: {
    backgroundColor: "#333",
  },
  purchasingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  purchaseContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  purchaseButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  paymentInfo: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  paymentInfoText: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
})

export default TicketPurchaseScreen
