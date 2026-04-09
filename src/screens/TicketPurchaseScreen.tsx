"use client"

import type React from "react"
import { useState, useMemo } from "react"
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView, TextInput, Image } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../contexts/AuthContext"
import TicketService from "../services/TicketService"
import PaymentService from "../services/PaymentService"
import PesaPalService from "../services/PesaPalService"
import * as ImagePicker from "expo-image-picker"
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
  const [photoCaptured, setPhotoCaptured] = useState(false)
  const [buyerPhotoUrl, setBuyerPhotoUrl] = useState("")
  const [securityPhotoEnabled, setSecurityPhotoEnabled] = useState(false)
  
  // Visitor info for unauthenticated users
  const [visitorName, setVisitorName] = useState("")
  const [visitorEmail, setVisitorEmail] = useState("")
  
  // Payment method state
  const [paymentMethod, setPaymentMethod] = useState<"mobile_money" | "credit_card" | "bank_transfer" | null>(null)
  const [mobileMoneyProvider, setMobileMoneyProvider] = useState<"mtn" | "airtel">("mtn")
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState("")
  const [mobileMoneyName, setMobileMoneyName] = useState("")
  const [cardNumber, setCardNumber] = useState("")
  const [cardExpiry, setCardExpiry] = useState("")
  const [cardCvv, setCardCvv] = useState("")
  const [bankName, setBankName] = useState("")
  const [bankAccountNumber, setBankAccountNumber] = useState("")
  const [bankAccountName, setBankAccountName] = useState("")

  // Get base price from event entry fees
  const basePrice = event.entryFees && event.entryFees.length > 0 
    ? Number.parseInt(event.entryFees[0].amount?.replace(/[^0-9]/g, "") || "0")
    : 0

  // Calculate prices with late fee using useMemo for efficiency
  const pricing = useMemo(() => {
    if (!event.date) {
      return { subtotal: 0, lateFee: 0, total: 0, isLatePurchase: false }
    }
    return PesaPalService.calculateTicketPrice(basePrice, quantity, event.date)
  }, [basePrice, quantity, event.date])

  const { subtotal, lateFee, total, isLatePurchase } = pricing
  const { appCommission, venueRevenue } = PaymentService.calculateRevenueSplit(total)

  const handleCapturePhoto = async () => {
    try {
      setLoading(true)

      // Request camera permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== "granted") {
        Alert.alert("Permission Required", "Camera permission is needed to capture your photo for verification.")
        return
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      })

      if (!result.canceled && result.assets[0]) {
        const photoUri = result.assets[0].uri
        setBuyerPhotoUrl(photoUri)
        setPhotoCaptured(true)
        Alert.alert("Success", "Photo captured successfully!")
      }
    } catch (error) {
      Alert.alert("Error", "Failed to capture photo")
    } finally {
      setLoading(false)
    }
  }

  const handlePurchase = async () => {
    // Determine buyer ID, name, and email based on auth status
    let buyerId: string
    let buyerName: string
    let buyerEmail: string
    
    if (user) {
      // Authenticated user - use their registered details
      buyerId = user.id
      buyerName = user.displayName || user.email || "Unknown"
      buyerEmail = user.email || ""
    } else {
      // Unauthenticated user - require name and email
      if (!visitorName.trim()) {
        Alert.alert("Name Required", "Please enter your name")
        return
      }
      if (!visitorEmail.trim()) {
        Alert.alert("Email Required", "Please enter your email address")
        return
      }
      
      // Generate unique visitor ID
      buyerId = `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      buyerName = visitorName.trim()
      buyerEmail = visitorEmail.trim()
    }

    // Validate payment details - security photo is now optional
    const includePhoto = securityPhotoEnabled && photoCaptured
    
    if (securityPhotoEnabled && !photoCaptured) {
      Alert.alert("Photo Required", "Please capture your security photo or disable the security option")
      return
    }
    if (paymentMethod === "mobile_money") {
      if (!mobileMoneyNumber.trim() || !mobileMoneyName.trim()) {
        Alert.alert("Error", "Please enter your mobile money details")
        return
      }
    } else if (paymentMethod === "credit_card") {
      if (!cardNumber.trim() || !cardExpiry.trim() || !cardCvv.trim()) {
        Alert.alert("Error", "Please enter your card details")
        return
      }
    } else if (paymentMethod === "bank_transfer") {
      if (!bankName.trim() || !bankAccountNumber.trim() || !bankAccountName.trim()) {
        Alert.alert("Error", "Please enter your bank transfer details")
        return
      }
    }

    try {
      setLoading(true)

      const paymentDetails = {
        method: paymentMethod!,
        ...(paymentMethod === "mobile_money" && { provider: mobileMoneyProvider, number: mobileMoneyNumber, name: mobileMoneyName }),
        ...(paymentMethod === "credit_card" && { cardNumber: cardNumber.slice(-4), expiry: cardExpiry }),
        ...(paymentMethod === "bank_transfer" && { bankName, accountNumber: bankAccountNumber, accountName: bankAccountName }),
      }

      const ticket = await TicketService.purchaseTicket(
        event,
        buyerId,
        buyerName,
        buyerEmail,
        quantity,
        includePhoto ? buyerPhotoUrl : "",
        total,
        paymentDetails,
      )

      Alert.alert("Purchase Successful!", `Your ticket has been purchased successfully. Ticket ID: ${ticket.id}`, [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
        },
      ])
    } catch (error) {
      console.error("Purchase error:", error)
      Alert.alert("Purchase Failed", "Failed to purchase ticket. Please try again.")
    } finally {
      setLoading(false)
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

      {/* Show visitor info form for unauthenticated users */}
      {!user && (
        <View style={styles.visitorSection}>
          <Text style={styles.sectionTitle}>Your Information</Text>
          <Text style={styles.visitorInfo}>
            Please provide your details for ticket purchase
          </Text>
          <TextInput
            style={styles.input}
            value={visitorName}
            onChangeText={setVisitorName}
            placeholder="Full Name"
            placeholderTextColor="#999"
          />
          <TextInput
            style={styles.input}
            value={visitorEmail}
            onChangeText={setVisitorEmail}
            placeholder="Email Address"
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>
      )}

      <View style={styles.ticketSection}>
        <Text style={styles.sectionTitle}>Ticket Details</Text>

        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Price per ticket:</Text>
          <Text style={styles.priceValue}>UGX {basePrice.toLocaleString()}</Text>
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

      <View style={styles.securitySection}>
        <Text style={styles.sectionTitle}>Security (Optional)</Text>
        <Text style={styles.securityInfo}>
          Enable security photo to add an extra layer of verification to your ticket. This will help verify your identity at the event entrance.
        </Text>

        <TouchableOpacity
          style={[styles.toggleButton, securityPhotoEnabled && styles.toggleButtonActive]}
          onPress={() => setSecurityPhotoEnabled(!securityPhotoEnabled)}
        >
          <View style={styles.toggleContent}>
            <Ionicons name={securityPhotoEnabled ? "shield-checkmark" : "shield-outline"} size={24} color={securityPhotoEnabled ? "#00FF9F" : "#888888"} />
            <View style={styles.toggleTextContainer}>
              <Text style={[styles.toggleText, securityPhotoEnabled && styles.toggleTextActive]}>
                {securityPhotoEnabled ? "Security Photo Enabled" : "Enable Security Photo"}
              </Text>
              <Text style={styles.toggleSubtext}>
                {securityPhotoEnabled ? "Photo will be added to your ticket" : "Add photo verification to your ticket"}
              </Text>
            </View>
          </View>
          <View style={[styles.toggleSwitch, securityPhotoEnabled && styles.toggleSwitchActive]}>
            <View style={[styles.toggleKnob, securityPhotoEnabled && styles.toggleKnobActive]} />
          </View>
        </TouchableOpacity>

        {securityPhotoEnabled && (
          <View style={styles.photoSection}>
            <Text style={styles.photoSectionText}>
              {photoCaptured ? "Photo added to ticket" : "Tap below to capture your security photo"}
            </Text>
            <TouchableOpacity
              style={[styles.photoButton, photoCaptured && styles.photoButtonCaptured]}
              onPress={handleCapturePhoto}
              disabled={loading}
            >
              <Ionicons name={photoCaptured ? "checkmark-circle" : "camera"} size={24} color="#FFFFFF" />
              <Text style={styles.photoButtonText}>
                {photoCaptured ? "Photo Captured" : "Capture Photo"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.paymentSection}>
        <Text style={styles.sectionTitle}>Payment Method</Text>
        
        {/* Mobile Money */}
        <TouchableOpacity
          style={[styles.paymentOption, paymentMethod === "mobile_money" && styles.paymentOptionSelected]}
          onPress={() => setPaymentMethod("mobile_money")}
        >
          <Ionicons name="phone-portrait" size={24} color={paymentMethod === "mobile_money" ? "#00D4FF" : "#888888"} />
          <Text style={[styles.paymentOptionText, paymentMethod === "mobile_money" && styles.paymentOptionTextSelected]}>Mobile Money</Text>
        </TouchableOpacity>
        
        {/* Credit Card */}
        <TouchableOpacity
          style={[styles.paymentOption, paymentMethod === "credit_card" && styles.paymentOptionSelected]}
          onPress={() => setPaymentMethod("credit_card")}
        >
          <Ionicons name="card" size={24} color={paymentMethod === "credit_card" ? "#00D4FF" : "#888888"} />
          <Text style={[styles.paymentOptionText, paymentMethod === "credit_card" && styles.paymentOptionTextSelected]}>Credit Card</Text>
        </TouchableOpacity>
        
        {/* Bank Transfer */}
        <TouchableOpacity
          style={[styles.paymentOption, paymentMethod === "bank_transfer" && styles.paymentOptionSelected]}
          onPress={() => setPaymentMethod("bank_transfer")}
        >
          <Ionicons name="business" size={24} color={paymentMethod === "bank_transfer" ? "#00D4FF" : "#888888"} />
          <Text style={[styles.paymentOptionText, paymentMethod === "bank_transfer" && styles.paymentOptionTextSelected]}>Bank Transfer</Text>
        </TouchableOpacity>
        
        {/* Payment Details Form */}
        {paymentMethod === "mobile_money" && (
          <View style={styles.paymentForm}>
            <Text style={styles.paymentFormTitle}>Mobile Money Details</Text>
            <View style={styles.providerButtons}>
              <TouchableOpacity
                style={[styles.providerButton, mobileMoneyProvider === "mtn" && styles.providerButtonActive]}
                onPress={() => setMobileMoneyProvider("mtn")}
              >
                <Text style={[styles.providerButtonText, mobileMoneyProvider === "mtn" && styles.providerButtonTextActive]}>MTN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.providerButton, mobileMoneyProvider === "airtel" && styles.providerButtonActive]}
                onPress={() => setMobileMoneyProvider("airtel")}
              >
                <Text style={[styles.providerButtonText, mobileMoneyProvider === "airtel" && styles.providerButtonTextActive]}>Airtel</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={mobileMoneyNumber}
              onChangeText={setMobileMoneyNumber}
              placeholder="Mobile money number"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              value={mobileMoneyName}
              onChangeText={setMobileMoneyName}
              placeholder="Account holder name"
              placeholderTextColor="#999"
            />
          </View>
        )}
        
        {paymentMethod === "credit_card" && (
          <View style={styles.paymentForm}>
            <Text style={styles.paymentFormTitle}>Card Details</Text>
            <TextInput
              style={styles.input}
              value={cardNumber}
              onChangeText={setCardNumber}
              placeholder="Card number"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
            <View style={styles.cardRow}>
              <TextInput
                style={[styles.input, styles.cardHalfInput]}
                value={cardExpiry}
                onChangeText={setCardExpiry}
                placeholder="MM/YY"
                placeholderTextColor="#999"
              />
              <TextInput
                style={[styles.input, styles.cardHalfInput]}
                value={cardCvv}
                onChangeText={setCardCvv}
                placeholder="CVV"
                placeholderTextColor="#999"
                keyboardType="numeric"
                secureTextEntry
              />
            </View>
          </View>
        )}
        
        {paymentMethod === "bank_transfer" && (
          <View style={styles.paymentForm}>
            <Text style={styles.paymentFormTitle}>Bank Transfer Details</Text>
            <TextInput
              style={styles.input}
              value={bankName}
              onChangeText={setBankName}
              placeholder="Bank name"
              placeholderTextColor="#999"
            />
            <TextInput
              style={styles.input}
              value={bankAccountNumber}
              onChangeText={setBankAccountNumber}
              placeholder="Account number"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              value={bankAccountName}
              onChangeText={setBankAccountName}
              placeholder="Account name"
              placeholderTextColor="#999"
            />
          </View>
        )}
      </View>

      <View style={styles.summarySection}>
        <Text style={styles.sectionTitle}>Order Summary</Text>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Tickets ({quantity}x):</Text>
          <Text style={styles.summaryValue}>UGX {subtotal.toLocaleString()}</Text>
        </View>

        {isLatePurchase && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Late Fee (15%):</Text>
            <Text style={styles.summaryValue}>UGX {lateFee.toLocaleString()}</Text>
          </View>
        )}

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>YoVibe Fee (8%):</Text>
          <Text style={styles.summaryValue}>UGX {appCommission.toLocaleString()}</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Venue Revenue:</Text>
          <Text style={styles.summaryValue}>UGX {venueRevenue.toLocaleString()}</Text>
        </View>

        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total:</Text>
          <Text style={styles.totalValue}>UGX {total.toLocaleString()}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.purchaseButton, (!paymentMethod || loading) && styles.purchaseButtonDisabled]}
        onPress={handlePurchase}
        disabled={!paymentMethod || loading}
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
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    paddingBottom: 100, // Extra bottom padding for mobile navigation
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
  visitorSection: {
    padding: 16,
    backgroundColor: "#1E1E1E",
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
  },
  visitorInfo: {
    fontSize: 14,
    color: "#DDDDDD",
    marginBottom: 16,
    lineHeight: 20,
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
  securitySection: {
    padding: 16,
    backgroundColor: "#1E1E1E",
    margin: 16,
    borderRadius: 12,
  },
  securityInfo: {
    fontSize: 14,
    color: "#DDDDDD",
    lineHeight: 20,
    marginBottom: 16,
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#333333",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  toggleButtonActive: {
    borderColor: "#00FF9F",
    backgroundColor: "rgba(0, 255, 159, 0.1)",
  },
  toggleContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  toggleTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  toggleText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#888888",
  },
  toggleTextActive: {
    color: "#00FF9F",
  },
  toggleSubtext: {
    fontSize: 12,
    color: "#666666",
    marginTop: 2,
  },
  toggleSwitch: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#444444",
    padding: 3,
    justifyContent: "center",
  },
  toggleSwitchActive: {
    backgroundColor: "#00FF9F",
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  toggleKnobActive: {
    alignSelf: "flex-end",
  },
  photoSection: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#252525",
    borderRadius: 8,
  },
  photoSectionText: {
    fontSize: 14,
    color: "#DDDDDD",
    textAlign: "center",
    marginBottom: 12,
  },
  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF9800",
    padding: 16,
    borderRadius: 8,
  },
  photoButtonCaptured: {
    backgroundColor: "#4CAF50",
  },
  photoButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
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
  // Payment section styles
  paymentSection: {
    padding: 16,
    backgroundColor: "#1E1E1E",
    margin: 16,
    borderRadius: 12,
  },
  paymentOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#333333",
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  paymentOptionSelected: {
    borderColor: "#00D4FF",
    backgroundColor: "rgba(0, 212, 255, 0.1)",
  },
  paymentOptionText: {
    color: "#888888",
    fontSize: 16,
    marginLeft: 12,
  },
  paymentOptionTextSelected: {
    color: "#00D4FF",
  },
  paymentForm: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#252525",
    borderRadius: 8,
  },
  paymentFormTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 12,
  },
  providerButtons: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  providerButton: {
    flex: 1,
    padding: 12,
    alignItems: "center",
    backgroundColor: "#333333",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  providerButtonActive: {
    backgroundColor: "#2196F3",
    borderColor: "#2196F3",
  },
  providerButtonText: {
    color: "#888888",
    fontWeight: "600",
  },
  providerButtonTextActive: {
    color: "#FFFFFF",
  },
  input: {
    backgroundColor: "#333333",
    color: "#FFFFFF",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 14,
  },
  cardRow: {
    flexDirection: "row",
    gap: 10,
  },
  cardHalfInput: {
    flex: 1,
  },
})

export default TicketPurchaseScreen
