"use client"

import { useState, useRef, useEffect } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Platform } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../contexts/AuthContext"
import TicketService from "../services/TicketService"
import BiometricService from "../services/BiometricService"
import type { Event } from "../models/Event"
import type { TicketPurchaseData } from "../services/TicketService"

interface TicketPurchaseScreenProps {
  navigation: any
  route: {
    params: {
      event: Event
    }
  }
}

export default function TicketPurchaseScreen({ navigation, route }: TicketPurchaseScreenProps) {
  const { event } = route.params
  const { user } = useAuth()

  const [quantity, setQuantity] = useState(1)
  const [ticketType, setTicketType] = useState<"regular" | "secure">("regular")
  const [paymentMethod, setPaymentMethod] = useState("card")
  const [isProcessing, setIsProcessing] = useState(false)
  const [biometricCaptured, setBiometricCaptured] = useState(false)
  const [biometricHash, setBiometricHash] = useState<string>()
  const [showBiometricCapture, setShowBiometricCapture] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)

  // Form fields
  const [buyerName, setBuyerName] = useState(user?.displayName || "")
  const [buyerEmail, setBuyerEmail] = useState(user?.email || "")
  const [buyerPhone, setBuyerPhone] = useState(user?.phone || "")

  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    return () => {
      if (Platform.OS === "web") {
        BiometricService.stopCamera()
      }
    }
  }, [])

  const pricing = TicketService.calculateTicketPrice(event.entryFee || 0, ticketType, quantity)

  const handleTicketTypeChange = (type: "regular" | "secure") => {
    setTicketType(type)
    if (type === "regular") {
      setBiometricCaptured(false)
      setBiometricHash(undefined)
      setShowBiometricCapture(false)
      if (cameraActive) {
        BiometricService.stopCamera()
        setCameraActive(false)
      }
    }
  }

  const startBiometricCapture = async () => {
    try {
      if (Platform.OS === "web" && videoRef.current) {
        const permission = await BiometricService.requestCameraPermission()
        if (!permission.granted) {
          Alert.alert("Camera Permission Required", "Please allow camera access for biometric capture")
          return
        }

        const success = await BiometricService.startCamera(videoRef.current)
        if (success) {
          setCameraActive(true)
          setShowBiometricCapture(true)
        } else {
          Alert.alert("Error", "Failed to start camera")
        }
      }
    } catch (error) {
      console.error("Error starting biometric capture:", error)
      Alert.alert("Error", "Failed to start biometric capture")
    }
  }

  const captureBiometric = async () => {
    try {
      if (Platform.OS === "web" && videoRef.current) {
        const hash = await BiometricService.processForTicketValidation(videoRef.current)
        setBiometricHash(hash)
        setBiometricCaptured(true)
        setShowBiometricCapture(false)
        BiometricService.stopCamera()
        setCameraActive(false)
        Alert.alert("Success", "Biometric data captured successfully")
      }
    } catch (error) {
      console.error("Error capturing biometric:", error)
      Alert.alert("Error", "Failed to capture biometric data")
    }
  }

  const handlePurchase = async () => {
    try {
      if (!user) {
        Alert.alert("Error", "Please log in to purchase tickets")
        return
      }

      if (!buyerName.trim() || !buyerEmail.trim()) {
        Alert.alert("Error", "Please fill in all required fields")
        return
      }

      if (ticketType === "secure" && !biometricCaptured) {
        Alert.alert("Error", "Biometric capture required for secure tickets")
        return
      }

      setIsProcessing(true)

      const purchaseData: TicketPurchaseData = {
        eventId: event.id,
        eventName: event.name,
        buyerId: user.id,
        buyerName: buyerName.trim(),
        buyerEmail: buyerEmail.trim(),
        buyerPhone: buyerPhone.trim() || undefined,
        quantity,
        ticketType,
        totalAmount: pricing.totalPrice,
        paymentMethod,
        biometricHash: ticketType === "secure" ? biometricHash : undefined,
      }

      const ticket = await TicketService.purchaseTicket(purchaseData)

      Alert.alert(
        "Purchase Successful! 🎉",
        `Your ${ticketType} ticket for ${event.name} has been purchased successfully.`,
        [
          {
            text: "View Ticket",
            onPress: () => {
              navigation.replace("TicketDetails", { ticket })
            },
          },
        ],
      )
    } catch (error) {
      console.error("Error purchasing ticket:", error)
      Alert.alert("Purchase Failed", error instanceof Error ? error.message : "Failed to purchase ticket")
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Purchase Ticket</Text>
      </View>

      <View style={styles.eventInfo}>
        <Text style={styles.eventName}>{event.name}</Text>
        <Text style={styles.eventDate}>{event.date.toLocaleDateString()}</Text>
        <Text style={styles.eventLocation}>{event.location}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Buyer Information</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Full Name *</Text>
          <TextInput
            style={styles.input}
            value={buyerName}
            onChangeText={setBuyerName}
            placeholder="Enter your full name"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email *</Text>
          <TextInput
            style={styles.input}
            value={buyerEmail}
            onChangeText={setBuyerEmail}
            placeholder="Enter your email"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={buyerPhone}
            onChangeText={setBuyerPhone}
            placeholder="Enter your phone number"
            keyboardType="phone-pad"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ticket Options</Text>

        <View style={styles.quantityContainer}>
          <Text style={styles.label}>Quantity</Text>
          <View style={styles.quantityControls}>
            <TouchableOpacity style={styles.quantityButton} onPress={() => setQuantity(Math.max(1, quantity - 1))}>
              <Ionicons name="remove" size={20} color="#007AFF" />
            </TouchableOpacity>
            <Text style={styles.quantityText}>{quantity}</Text>
            <TouchableOpacity style={styles.quantityButton} onPress={() => setQuantity(Math.min(10, quantity + 1))}>
              <Ionicons name="add" size={20} color="#007AFF" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.ticketTypeContainer}>
          <Text style={styles.label}>Ticket Type</Text>

          <TouchableOpacity
            style={[styles.ticketTypeOption, ticketType === "regular" && styles.selectedOption]}
            onPress={() => handleTicketTypeChange("regular")}
          >
            <View style={styles.ticketTypeInfo}>
              <Text style={styles.ticketTypeName}>Regular Ticket</Text>
              <Text style={styles.ticketTypeDescription}>Standard entry with QR code verification</Text>
              <Text style={styles.ticketTypePrice}>${(event.entryFee || 0).toFixed(2)}</Text>
            </View>
            <Ionicons
              name={ticketType === "regular" ? "radio-button-on" : "radio-button-off"}
              size={24}
              color="#007AFF"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.ticketTypeOption, ticketType === "secure" && styles.selectedOption]}
            onPress={() => handleTicketTypeChange("secure")}
          >
            <View style={styles.ticketTypeInfo}>
              <Text style={styles.ticketTypeName}>Secure Ticket</Text>
              <Text style={styles.ticketTypeDescription}>Enhanced security with biometric verification</Text>
              <Text style={styles.ticketTypePrice}>${((event.entryFee || 0) * 1.2).toFixed(2)}</Text>
            </View>
            <Ionicons
              name={ticketType === "secure" ? "radio-button-on" : "radio-button-off"}
              size={24}
              color="#007AFF"
            />
          </TouchableOpacity>
        </View>

        {ticketType === "secure" && (
          <View style={styles.biometricSection}>
            <Text style={styles.biometricTitle}>Biometric Setup Required</Text>
            <Text style={styles.biometricDescription}>
              Secure tickets require biometric verification for enhanced security
            </Text>

            {!biometricCaptured ? (
              <TouchableOpacity style={styles.biometricButton} onPress={startBiometricCapture}>
                <Ionicons name="camera" size={20} color="#fff" />
                <Text style={styles.biometricButtonText}>Capture Biometric</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.biometricSuccess}>
                <Ionicons name="checkmark-circle" size={24} color="#34C759" />
                <Text style={styles.biometricSuccessText}>Biometric captured successfully</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {showBiometricCapture && Platform.OS === "web" && (
        <View style={styles.biometricCapture}>
          <Text style={styles.biometricCaptureTitle}>Biometric Capture</Text>
          <View style={styles.videoContainer}>
            <video ref={videoRef} style={styles.video} autoPlay playsInline muted />
          </View>
          <View style={styles.biometricControls}>
            <TouchableOpacity style={styles.captureButton} onPress={captureBiometric}>
              <Text style={styles.captureButtonText}>Capture</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setShowBiometricCapture(false)
                BiometricService.stopCamera()
                setCameraActive(false)
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Method</Text>

        <TouchableOpacity
          style={[styles.paymentOption, paymentMethod === "card" && styles.selectedOption]}
          onPress={() => setPaymentMethod("card")}
        >
          <Ionicons name="card" size={24} color="#007AFF" />
          <Text style={styles.paymentText}>Credit/Debit Card</Text>
          <Ionicons
            name={paymentMethod === "card" ? "radio-button-on" : "radio-button-off"}
            size={24}
            color="#007AFF"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.paymentOption, paymentMethod === "paypal" && styles.selectedOption]}
          onPress={() => setPaymentMethod("paypal")}
        >
          <Ionicons name="logo-paypal" size={24} color="#007AFF" />
          <Text style={styles.paymentText}>PayPal</Text>
          <Ionicons
            name={paymentMethod === "paypal" ? "radio-button-on" : "radio-button-off"}
            size={24}
            color="#007AFF"
          />
        </TouchableOpacity>
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>Order Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Ticket Price ({quantity}x)</Text>
          <Text style={styles.summaryValue}>${pricing.unitPrice.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>${pricing.totalPrice.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>App Fee</Text>
          <Text style={styles.summaryValue}>${pricing.appCommission.toFixed(2)}</Text>
        </View>
        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>${pricing.totalPrice.toFixed(2)}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.purchaseButton, isProcessing && styles.disabledButton]}
        onPress={handlePurchase}
        disabled={isProcessing}
      >
        <Text style={styles.purchaseButtonText}>
          {isProcessing ? "Processing..." : `Purchase for $${pricing.totalPrice.toFixed(2)}`}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  eventInfo: {
    backgroundColor: "#fff",
    padding: 16,
    marginBottom: 16,
  },
  eventName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  eventDate: {
    fontSize: 16,
    color: "#666",
    marginBottom: 4,
  },
  eventLocation: {
    fontSize: 16,
    color: "#666",
  },
  section: {
    backgroundColor: "#fff",
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#f9f9f9",
  },
  quantityContainer: {
    marginBottom: 16,
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  quantityButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  quantityText: {
    fontSize: 18,
    fontWeight: "bold",
    marginHorizontal: 20,
    minWidth: 30,
    textAlign: "center",
  },
  ticketTypeContainer: {
    marginBottom: 16,
  },
  ticketTypeOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    marginBottom: 12,
  },
  selectedOption: {
    borderColor: "#007AFF",
    backgroundColor: "#f0f8ff",
  },
  ticketTypeInfo: {
    flex: 1,
  },
  ticketTypeName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  ticketTypeDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  ticketTypePrice: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#007AFF",
  },
  biometricSection: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
  },
  biometricTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  biometricDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
  },
  biometricButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#007AFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: "center",
  },
  biometricButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  biometricSuccess: {
    flexDirection: "row",
    alignItems: "center",
  },
  biometricSuccessText: {
    color: "#34C759",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  biometricCapture: {
    backgroundColor: "#fff",
    padding: 16,
    marginBottom: 16,
  },
  biometricCaptureTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 16,
    textAlign: "center",
  },
  videoContainer: {
    height: 300,
    backgroundColor: "#000",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 16,
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  biometricControls: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  captureButton: {
    backgroundColor: "#34C759",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  captureButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  cancelButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  paymentOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    marginBottom: 12,
  },
  paymentText: {
    flex: 1,
    fontSize: 16,
    color: "#333",
    marginLeft: 12,
  },
  summary: {
    backgroundColor: "#fff",
    padding: 16,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 16,
    color: "#666",
  },
  summaryValue: {
    fontSize: 16,
    color: "#333",
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    paddingTop: 8,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#007AFF",
  },
  purchaseButton: {
    backgroundColor: "#007AFF",
    margin: 16,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  disabledButton: {
    backgroundColor: "#ccc",
  },
  purchaseButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
})
