"use client"

import type React from "react"
import { useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../contexts/AuthContext"
import TicketService from "../services/TicketService"
import BiometricService from "../services/BiometricService"
import PaymentService, { type PaymentMethod } from "../services/PaymentService"
import type { Event } from "../models/Event"

interface TicketPurchaseScreenProps {
  route: {
    params: {
      event: Event
    }
  }
  navigation: any
}

const TicketPurchaseScreen: React.FC<TicketPurchaseScreenProps> = ({ route, navigation }) => {
  const { event } = route.params
  const { user } = useAuth()
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(false)
  const [biometricCaptured, setBiometricCaptured] = useState(false)
  const [biometricHash, setBiometricHash] = useState("")
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null)
  const [showPaymentMethods, setShowPaymentMethods] = useState(false)
  const [paymentDetails, setPaymentDetails] = useState<any>({})

  const ticketPrice = Number.parseInt(event.entryFee?.replace(/[^0-9]/g, "") || "0")
  const totalAmount = ticketPrice * quantity
  const { appCommission, venueRevenue } = PaymentService.calculateRevenueSplit(totalAmount)

  const paymentMethods = PaymentService.getAvailablePaymentMethods()

  const handleCaptureBiometric = async () => {
    try {
      setLoading(true)

      const isAvailable = await BiometricService.isAvailable()
      if (!isAvailable) {
        Alert.alert("Error", "Biometric scanner not available on this device")
        return
      }

      Alert.alert(
        "Biometric Capture",
        "Please look directly at the camera for eye scanning. This will be used to verify your identity at the event.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Start Scan",
            onPress: async () => {
              try {
                const hash = await BiometricService.captureBiometric()
                setBiometricHash(hash)
                setBiometricCaptured(true)
                Alert.alert("Success", "Biometric data captured successfully!")
              } catch (error) {
                Alert.alert("Error", "Failed to capture biometric data")
              }
            },
          },
        ],
      )
    } catch (error) {
      Alert.alert("Error", "Failed to initialize biometric scanner")
    } finally {
      setLoading(false)
    }
  }

  const handleSelectPaymentMethod = (method: PaymentMethod) => {
    setSelectedPaymentMethod(method)
    setShowPaymentMethods(false)
    setPaymentDetails({}) // Reset payment details
  }

  const handlePurchase = async () => {
    if (!user) {
      Alert.alert("Error", "Please sign in to purchase tickets")
      return
    }

    if (!biometricCaptured) {
      Alert.alert("Biometric Required", "Please capture your biometric data first")
      return
    }

    if (!selectedPaymentMethod) {
      Alert.alert("Payment Method Required", "Please select a payment method")
      return
    }

    // Validate payment details
    if (!PaymentService.validatePaymentMethod(selectedPaymentMethod, paymentDetails)) {
      Alert.alert("Invalid Payment Details", "Please check your payment information")
      return
    }

    try {
      setLoading(true)

      const ticket = await TicketService.purchaseTicket(
        event,
        user.id,
        user.displayName || user.email || "Unknown",
        user.email || "",
        quantity,
        biometricHash,
        selectedPaymentMethod,
      )

      Alert.alert(
        "Purchase Successful!",
        `Your ticket has been purchased successfully.\n\nTicket ID: ${ticket.id}\nQR Code generated for entry validation.`,
        [
          {
            text: "View Ticket",
            onPress: () => {
              // Navigate to ticket details screen
              navigation.navigate("TicketDetails", { ticket })
            },
          },
          {
            text: "OK",
            onPress: () => navigation.goBack(),
          },
        ],
      )
    } catch (error) {
      console.error("Purchase error:", error)
      Alert.alert(
        "Purchase Failed",
        error instanceof Error ? error.message : "Failed to purchase ticket. Please try again.",
      )
    } finally {
      setLoading(false)
    }
  }

  const renderPaymentMethodDetails = () => {
    if (!selectedPaymentMethod) return null

    switch (selectedPaymentMethod.type) {
      case "mobile_money":
        return (
          <View style={styles.paymentDetails}>
            <Text style={styles.paymentLabel}>Phone Number:</Text>
            <TextInput
              style={styles.paymentInput}
              placeholder="e.g., +256701234567"
              value={paymentDetails.phoneNumber || ""}
              onChangeText={(text) => setPaymentDetails({ ...paymentDetails, phoneNumber: text })}
              keyboardType="phone-pad"
            />
          </View>
        )

      case "card":
        return (
          <View style={styles.paymentDetails}>
            <Text style={styles.paymentLabel}>Card Number:</Text>
            <TextInput
              style={styles.paymentInput}
              placeholder="1234 5678 9012 3456"
              value={paymentDetails.cardNumber || ""}
              onChangeText={(text) => setPaymentDetails({ ...paymentDetails, cardNumber: text })}
              keyboardType="numeric"
            />
            <View style={styles.cardRow}>
              <View style={styles.cardField}>
                <Text style={styles.paymentLabel}>Expiry:</Text>
                <TextInput
                  style={styles.paymentInput}
                  placeholder="MM/YY"
                  value={paymentDetails.expiryDate || ""}
                  onChangeText={(text) => setPaymentDetails({ ...paymentDetails, expiryDate: text })}
                />
              </View>
              <View style={styles.cardField}>
                <Text style={styles.paymentLabel}>CVV:</Text>
                <TextInput
                  style={styles.paymentInput}
                  placeholder="123"
                  value={paymentDetails.cvv || ""}
                  onChangeText={(text) => setPaymentDetails({ ...paymentDetails, cvv: text })}
                  keyboardType="numeric"
                  secureTextEntry
                />
              </View>
            </View>
          </View>
        )

      case "bank_transfer":
        return (
          <View style={styles.paymentDetails}>
            <Text style={styles.paymentLabel}>Account Number:</Text>
            <TextInput
              style={styles.paymentInput}
              placeholder="Account Number"
              value={paymentDetails.accountNumber || ""}
              onChangeText={(text) => setPaymentDetails({ ...paymentDetails, accountNumber: text })}
              keyboardType="numeric"
            />
            <Text style={styles.paymentLabel}>Bank Code:</Text>
            <TextInput
              style={styles.paymentInput}
              placeholder="Bank Code"
              value={paymentDetails.bankCode || ""}
              onChangeText={(text) => setPaymentDetails({ ...paymentDetails, bankCode: text })}
            />
          </View>
        )

      default:
        return null
    }
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Purchase Tickets</Text>
      </View>

      <View style={styles.eventInfo}>
        <Text style={styles.eventName}>{event.name}</Text>
        <Text style={styles.eventVenue}>{event.venueName}</Text>
        <Text style={styles.eventDate}>{new Date(event.date).toDateString()}</Text>
      </View>

      <View style={styles.ticketSection}>
        <Text style={styles.sectionTitle}>Ticket Details</Text>

        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Price per ticket:</Text>
          <Text style={styles.priceValue}>UGX {ticketPrice.toLocaleString()}</Text>
        </View>

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

      <View style={styles.biometricSection}>
        <Text style={styles.sectionTitle}>Security Verification</Text>
        <Text style={styles.biometricInfo}>
          For security purposes, we need to capture your biometric data. This will be used to verify your identity at
          the event entrance.
        </Text>

        <TouchableOpacity
          style={[styles.biometricButton, biometricCaptured && styles.biometricCaptured]}
          onPress={handleCaptureBiometric}
          disabled={loading || biometricCaptured}
        >
          <Ionicons name={biometricCaptured ? "checkmark-circle" : "eye"} size={24} color="#FFFFFF" />
          <Text style={styles.biometricButtonText}>
            {biometricCaptured ? "Biometric Captured" : "Capture Biometric"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.paymentSection}>
        <Text style={styles.sectionTitle}>Payment Method</Text>

        <TouchableOpacity style={styles.paymentMethodSelector} onPress={() => setShowPaymentMethods(true)}>
          <Text style={styles.paymentMethodText}>
            {selectedPaymentMethod ? selectedPaymentMethod.provider : "Select Payment Method"}
          </Text>
          <Ionicons name="chevron-down" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        {renderPaymentMethodDetails()}
      </View>

      <View style={styles.summarySection}>
        <Text style={styles.sectionTitle}>Order Summary</Text>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Tickets ({quantity}x):</Text>
          <Text style={styles.summaryValue}>UGX {totalAmount.toLocaleString()}</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>App Fee (5%):</Text>
          <Text style={styles.summaryValue}>UGX {appCommission.toLocaleString()}</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Venue Revenue:</Text>
          <Text style={styles.summaryValue}>UGX {venueRevenue.toLocaleString()}</Text>
        </View>

        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total:</Text>
          <Text style={styles.totalValue}>UGX {totalAmount.toLocaleString()}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.purchaseButton,
          (!biometricCaptured || !selectedPaymentMethod || loading) && styles.purchaseButtonDisabled,
        ]}
        onPress={handlePurchase}
        disabled={!biometricCaptured || !selectedPaymentMethod || loading}
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

      {/* Payment Method Selection Modal */}
      <Modal
        visible={showPaymentMethods}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPaymentMethods(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Payment Method</Text>

            {paymentMethods.map((method) => (
              <TouchableOpacity
                key={method.id}
                style={styles.paymentMethodOption}
                onPress={() => handleSelectPaymentMethod(method)}
              >
                <Text style={styles.paymentMethodName}>{method.provider}</Text>
                <Text style={styles.paymentMethodType}>{method.type.replace("_", " ")}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowPaymentMethods(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
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
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  priceLabel: {
    fontSize: 16,
    color: "#DDDDDD",
  },
  priceValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#4CAF50",
  },
  quantitySection: {
    marginBottom: 16,
  },
  quantityLabel: {
    fontSize: 16,
    color: "#DDDDDD",
    marginBottom: 8,
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  quantityButton: {
    backgroundColor: "#2196F3",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  quantityInput: {
    backgroundColor: "#333333",
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginHorizontal: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 60,
  },
  biometricSection: {
    padding: 16,
    backgroundColor: "#1E1E1E",
    margin: 16,
    borderRadius: 12,
  },
  biometricInfo: {
    fontSize: 14,
    color: "#DDDDDD",
    lineHeight: 20,
    marginBottom: 16,
  },
  biometricButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF9800",
    padding: 16,
    borderRadius: 8,
  },
  biometricCaptured: {
    backgroundColor: "#4CAF50",
  },
  biometricButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  paymentSection: {
    padding: 16,
    backgroundColor: "#1E1E1E",
    margin: 16,
    borderRadius: 12,
  },
  paymentMethodSelector: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#333333",
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  paymentMethodText: {
    color: "#FFFFFF",
    fontSize: 16,
  },
  paymentDetails: {
    marginTop: 8,
  },
  paymentLabel: {
    color: "#DDDDDD",
    fontSize: 14,
    marginBottom: 8,
  },
  paymentInput: {
    backgroundColor: "#333333",
    color: "#FFFFFF",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardField: {
    flex: 1,
    marginHorizontal: 4,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 20,
    width: "80%",
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 20,
    textAlign: "center",
  },
  paymentMethodOption: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  paymentMethodName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  paymentMethodType: {
    fontSize: 14,
    color: "#DDDDDD",
    textTransform: "capitalize",
  },
  modalCloseButton: {
    backgroundColor: "#666666",
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
  },
  modalCloseText: {
    color: "#FFFFFF",
    textAlign: "center",
    fontSize: 16,
  },
})

export default TicketPurchaseScreen
