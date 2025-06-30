"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Image } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../contexts/AuthContext"
import FirebaseService from "../services/FirebaseService"
import TicketService, { type TicketPurchaseRequest } from "../services/TicketService"
import PaymentService, { type PaymentMethod } from "../services/PaymentService"
import type { Event } from "../models/Event"

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

  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])

  useEffect(() => {
    loadEventDetails()
    loadPaymentMethods()
  }, [eventId])

  const loadEventDetails = async () => {
    try {
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

  const calculateTicketPrice = (): number => {
    if (!event) return 0

    if (event.entryFee && event.entryFee !== "Free Entry") {
      const priceMatch = event.entryFee.match(/(\d+(?:,\d+)*)/)
      if (priceMatch) {
        return Number.parseInt(priceMatch[1].replace(/,/g, ""))
      }
    }

    switch (event.priceIndicator) {
      case 1:
        return 10000
      case 2:
        return 25000
      case 3:
        return 50000
      default:
        return 15000
    }
  }

  const getTotalAmount = (): number => {
    return calculateTicketPrice() * quantity
  }

  const handleQuantityChange = (delta: number) => {
    const newQuantity = quantity + delta
    if (newQuantity >= 1 && newQuantity <= 10) {
      setQuantity(newQuantity)
    }
  }

  const handlePurchase = async () => {
    if (!user || !event || !selectedPaymentMethod) {
      Alert.alert("Error", "Missing required information")
      return
    }

    setPurchasing(true)

    try {
      const purchaseRequest: TicketPurchaseRequest = {
        eventId: event.id,
        quantity,
        buyerInfo: {
          name: user.displayName || user.email,
          email: user.email,
          phone: user.phone,
        },
        paymentMethod: selectedPaymentMethod,
      }

      const result = await TicketService.purchaseTickets(purchaseRequest)

      if (result.success && result.tickets) {
        Alert.alert("Success!", result.message, [
          {
            text: "View Tickets",
            onPress: () => {
              navigation.navigate("MyTickets", {
                newTickets: result.tickets,
              })
            },
          },
        ])
      } else {
        Alert.alert("Purchase Failed", result.error || result.message)
      }
    } catch (error) {
      console.error("Purchase error:", error)
      Alert.alert("Error", "Failed to purchase tickets. Please try again.")
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
      </View>
    )
  }

  return (
    <ScrollView style={styles.container}>
      {/* Event Header */}
      <View style={styles.eventHeader}>
        <Image source={{ uri: event.posterImageUrl }} style={styles.eventImage} />
        <View style={styles.eventInfo}>
          <Text style={styles.eventName}>{event.name}</Text>
          <Text style={styles.eventDate}>
            {event.date.toLocaleDateString()} at {event.date.toLocaleTimeString()}
          </Text>
          <Text style={styles.eventLocation}>{event.location}</Text>
          <Text style={styles.eventVenue}>{event.venueName}</Text>
        </View>
      </View>

      {/* Ticket Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ticket Quantity</Text>
        <View style={styles.quantityContainer}>
          <TouchableOpacity
            style={styles.quantityButton}
            onPress={() => handleQuantityChange(-1)}
            disabled={quantity <= 1}
          >
            <Ionicons name="remove" size={24} color={quantity <= 1 ? "#666" : "#FFFFFF"} />
          </TouchableOpacity>

          <Text style={styles.quantityText}>{quantity}</Text>

          <TouchableOpacity
            style={styles.quantityButton}
            onPress={() => handleQuantityChange(1)}
            disabled={quantity >= 10}
          >
            <Ionicons name="add" size={24} color={quantity >= 10 ? "#666" : "#FFFFFF"} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Payment Method Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Method</Text>
        {paymentMethods.map((method) => (
          <TouchableOpacity
            key={method.id}
            style={[styles.paymentMethod, selectedPaymentMethod?.id === method.id && styles.selectedPaymentMethod]}
            onPress={() => setSelectedPaymentMethod(method)}
          >
            <View style={styles.paymentMethodInfo}>
              <Text style={styles.paymentMethodName}>{method.name}</Text>
              <Text style={styles.paymentMethodProvider}>{method.provider}</Text>
            </View>
            {selectedPaymentMethod?.id === method.id && <Ionicons name="checkmark-circle" size={24} color="#2196F3" />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Price Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Price Summary</Text>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Ticket Price:</Text>
          <Text style={styles.priceValue}>{PaymentService.formatCurrency(calculateTicketPrice())}</Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Quantity:</Text>
          <Text style={styles.priceValue}>{quantity}</Text>
        </View>
        <View style={[styles.priceRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total:</Text>
          <Text style={styles.totalValue}>{PaymentService.formatCurrency(getTotalAmount())}</Text>
        </View>
      </View>

      {/* Purchase Button */}
      <TouchableOpacity
        style={[styles.purchaseButton, purchasing && styles.disabledButton]}
        onPress={handlePurchase}
        disabled={purchasing || !selectedPaymentMethod}
      >
        {purchasing ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="card" size={20} color="#FFFFFF" />
            <Text style={styles.purchaseButtonText}>
              Purchase Tickets - {PaymentService.formatCurrency(getTotalAmount())}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* Security Notice */}
      <View style={styles.securityNotice}>
        <Ionicons name="shield-checkmark" size={20} color="#4CAF50" />
        <Text style={styles.securityText}>
          Your payment is secure and encrypted. Tickets will include QR codes and biometric verification for enhanced
          security.
        </Text>
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
    color: "#FFFFFF",
    fontSize: 18,
  },
  eventHeader: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: "#1E1E1E",
    marginBottom: 16,
  },
  eventImage: {
    width: 80,
    height: 120,
    borderRadius: 8,
    marginRight: 16,
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  eventDate: {
    color: "#CCCCCC",
    fontSize: 14,
    marginBottom: 4,
  },
  eventLocation: {
    color: "#CCCCCC",
    fontSize: 14,
    marginBottom: 4,
  },
  eventVenue: {
    color: "#2196F3",
    fontSize: 14,
  },
  section: {
    backgroundColor: "#1E1E1E",
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 8,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  quantityContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButton: {
    backgroundColor: "#2196F3",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  quantityText: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "bold",
    marginHorizontal: 32,
  },
  paymentMethod: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
    marginBottom: 8,
  },
  selectedPaymentMethod: {
    borderColor: "#2196F3",
    backgroundColor: "rgba(33, 150, 243, 0.1)",
  },
  paymentMethodInfo: {
    flex: 1,
  },
  paymentMethodName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  paymentMethodProvider: {
    color: "#CCCCCC",
    fontSize: 14,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  priceLabel: {
    color: "#CCCCCC",
    fontSize: 16,
  },
  priceValue: {
    color: "#FFFFFF",
    fontSize: 16,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: "#333",
    paddingTop: 8,
    marginTop: 8,
  },
  totalLabel: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  totalValue: {
    color: "#2196F3",
    fontSize: 18,
    fontWeight: "bold",
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
  disabledButton: {
    opacity: 0.6,
  },
  purchaseButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  securityNotice: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(76, 175, 80, 0.1)",
    margin: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#4CAF50",
  },
  securityText: {
    color: "#4CAF50",
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
  },
})

export default TicketPurchaseScreen
