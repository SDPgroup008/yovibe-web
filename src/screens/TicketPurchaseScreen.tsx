"use client"

import type React from "react"
import { useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../contexts/AuthContext"
import TicketService from "../services/TicketService"
import BiometricService from "../services/BiometricService"
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
  const [biometricModal, setBiometricModal] = useState(false)
  const [paymentModal, setPaymentModal] = useState(false)
  const [biometricStep, setBiometricStep] = useState<"scanning" | "complete" | "failed">("scanning")

  const ticketPrice = Number.parseInt(event.entryFee?.replace(/[^0-9]/g, "") || "0")
  const totalAmount = quantity * ticketPrice

  const handlePurchase = async () => {
    if (!user) {
      Alert.alert("Error", "Please log in to purchase tickets")
      return
    }

    if (ticketPrice === 0) {
      Alert.alert("Error", "This is a free event")
      return
    }

    try {
      setLoading(true)
      setBiometricModal(true)
      setBiometricStep("scanning")

      // Check biometric availability
      const biometricAvailable = await BiometricService.isBiometricAvailable()
      if (!biometricAvailable) {
        Alert.alert("Error", "Biometric scanning is not available on this device")
        return
      }

      // Simulate biometric scanning
      setTimeout(() => {
        setBiometricStep("complete")
        setTimeout(() => {
          setBiometricModal(false)
          setPaymentModal(true)
          processPurchase()
        }, 1000)
      }, 3000)
    } catch (error) {
      console.error("Error starting purchase:", error)
      setBiometricStep("failed")
      setTimeout(() => {
        setBiometricModal(false)
        setLoading(false)
      }, 2000)
    }
  }

  const processPurchase = async () => {
    try {
      const ticket = await TicketService.purchaseTickets(
        event.id,
        event.name,
        event.venueId,
        event.venueName,
        user!.id,
        user!.displayName || user!.email,
        user!.email,
        quantity,
        ticketPrice,
      )

      setPaymentModal(false)
      setLoading(false)

      Alert.alert(
        "Purchase Successful!",
        `Your ticket has been purchased successfully.\nTicket Code: ${ticket.ticketCode}`,
        [
          {
            text: "View Ticket",
            onPress: () => navigation.navigate("TicketDetail", { ticketId: ticket.id }),
          },
          {
            text: "OK",
            onPress: () => navigation.goBack(),
          },
        ],
      )
    } catch (error) {
      console.error("Error processing purchase:", error)
      setPaymentModal(false)
      setLoading(false)
      Alert.alert("Purchase Failed", "There was an error processing your payment. Please try again.")
    }
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Purchase Tickets</Text>
      </View>

      <View style={styles.eventInfo}>
        <Text style={styles.eventName}>{event.name}</Text>
        <Text style={styles.eventVenue}>{event.venueName}</Text>
        <Text style={styles.eventDate}>{event.date.toDateString()}</Text>
        <Text style={styles.eventLocation}>{event.location}</Text>
      </View>

      <View style={styles.ticketSection}>
        <Text style={styles.sectionTitle}>Ticket Information</Text>
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

        <View style={styles.totalSection}>
          <Text style={styles.totalLabel}>Total Amount:</Text>
          <Text style={styles.totalValue}>UGX {totalAmount.toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.securityInfo}>
        <Ionicons name="eye" size={24} color="#2196F3" />
        <Text style={styles.securityText}>
          For security, we'll scan your eyes during purchase and verify them at the event entrance.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.purchaseButton, loading && styles.purchaseButtonDisabled]}
        onPress={handlePurchase}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="card" size={20} color="#FFFFFF" />
            <Text style={styles.purchaseButtonText}>Purchase Tickets</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Biometric Scanning Modal */}
      <Modal visible={biometricModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.biometricModal}>
            <View style={styles.biometricContent}>
              {biometricStep === "scanning" && (
                <>
                  <Ionicons name="eye" size={80} color="#2196F3" />
                  <Text style={styles.biometricTitle}>Scanning Your Eyes</Text>
                  <Text style={styles.biometricText}>Please look directly at the camera</Text>
                  <ActivityIndicator size="large" color="#2196F3" style={styles.biometricLoader} />
                </>
              )}
              {biometricStep === "complete" && (
                <>
                  <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
                  <Text style={styles.biometricTitle}>Scan Complete</Text>
                  <Text style={styles.biometricText}>Biometric data captured successfully</Text>
                </>
              )}
              {biometricStep === "failed" && (
                <>
                  <Ionicons name="close-circle" size={80} color="#F44336" />
                  <Text style={styles.biometricTitle}>Scan Failed</Text>
                  <Text style={styles.biometricText}>Please try again</Text>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Payment Processing Modal */}
      <Modal visible={paymentModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.paymentModal}>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={styles.paymentTitle}>Processing Payment</Text>
            <Text style={styles.paymentText}>Please wait while we process your payment...</Text>
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
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
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
    marginBottom: 4,
  },
  eventLocation: {
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
    color: "#FFFFFF",
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
  totalSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#333333",
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#DDDDDD",
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2196F3",
  },
  securityInfo: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#1E1E1E",
    margin: 16,
    borderRadius: 12,
  },
  securityText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: "#DDDDDD",
    lineHeight: 20,
  },
  purchaseButton: {
    backgroundColor: "#2196F3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    margin: 16,
    borderRadius: 12,
  },
  purchaseButtonDisabled: {
    backgroundColor: "#666666",
  },
  purchaseButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  biometricModal: {
    backgroundColor: "#1E1E1E",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    minWidth: 300,
  },
  biometricContent: {
    alignItems: "center",
  },
  biometricTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: 16,
    marginBottom: 8,
  },
  biometricText: {
    fontSize: 14,
    color: "#DDDDDD",
    textAlign: "center",
    marginBottom: 16,
  },
  biometricLoader: {
    marginTop: 16,
  },
  paymentModal: {
    backgroundColor: "#1E1E1E",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    minWidth: 300,
  },
  paymentTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: 16,
    marginBottom: 8,
  },
  paymentText: {
    fontSize: 14,
    color: "#DDDDDD",
    textAlign: "center",
  },
})

export default TicketPurchaseScreen
