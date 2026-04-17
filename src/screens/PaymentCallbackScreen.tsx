import React, { useEffect, useState } from "react"
import { View, Text, StyleSheet, ActivityIndicator, Alert } from "react-native"
import { useRoute, useNavigation } from "@react-navigation/native"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import PesaPalService from "../services/PesaPalService"
import TicketService from "../services/TicketService"
import type { EventsStackParamList } from "../navigation/types"

type PaymentCallbackScreenProps = NativeStackScreenProps<EventsStackParamList, "PaymentCallback">

const PaymentCallbackScreen: React.FC<PaymentCallbackScreenProps> = ({ navigation }) => {
  const route = useRoute()
  const [status, setStatus] = useState<"verifying" | "success" | "failed">("verifying")
  const [message, setMessage] = useState("Verifying your payment...")

  useEffect(() => {
    const handlePaymentCallback = async () => {
      try {
        // Get URL parameters from PesaPal callback
        const urlParams = new URLSearchParams(window.location.search)
        const orderId = urlParams.get("pesapal_merchant_reference") || urlParams.get("order_id")
        const status = urlParams.get("pesapal_response_data")

        console.log("💳 Payment callback received:")
        console.log("   - Order ID:", orderId)
        console.log("   - Status:", status)

        if (!orderId) {
          throw new Error("No order ID found in callback")
        }

        // Verify payment with PesaPal
        const verification = await PesaPalService.verifyPayment(orderId)

        if (verification.status === "completed") {
          setStatus("success")
          setMessage("Payment successful! Your ticket is being processed...")

          // Navigate to MyTickets after a short delay
          setTimeout(() => {
            navigation.navigate("MyTickets")
          }, 2000)

        } else if (verification.status === "failed") {
          setStatus("failed")
          setMessage("Payment failed. Please try again.")
        } else {
          setStatus("failed")
          setMessage("Payment is still processing. Please check your tickets later.")
        }

      } catch (error: any) {
        console.error("Payment callback error:", error)
        setStatus("failed")
        setMessage("Failed to verify payment. Please contact support.")
      }
    }

    handlePaymentCallback()
  }, [navigation])

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {status === "verifying" && (
          <>
            <ActivityIndicator size="large" color="#00D4FF" />
            <Text style={styles.title}>Processing Payment</Text>
            <Text style={styles.message}>{message}</Text>
          </>
        )}

        {status === "success" && (
          <>
            <View style={styles.successIcon}>
              <Text style={styles.successText}>✓</Text>
            </View>
            <Text style={styles.title}>Payment Successful!</Text>
            <Text style={styles.message}>
              Your ticket purchase has been completed. Redirecting to your tickets...
            </Text>
          </>
        )}

        {status === "failed" && (
          <>
            <View style={styles.errorIcon}>
              <Text style={styles.errorText}>✗</Text>
            </View>
            <Text style={styles.title}>Payment Failed</Text>
            <Text style={styles.message}>{message}</Text>
            <Text style={styles.retryText}>
              Please try purchasing your ticket again.
            </Text>
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
    padding: 40,
    maxWidth: 400,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    textAlign: "center",
    marginTop: 20,
    marginBottom: 10,
  },
  message: {
    fontSize: 16,
    color: "#CCCCCC",
    textAlign: "center",
    lineHeight: 24,
  },
  retryText: {
    fontSize: 14,
    color: "#888888",
    textAlign: "center",
    marginTop: 20,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#4CAF50",
    justifyContent: "center",
    alignItems: "center",
  },
  successText: {
    fontSize: 40,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F44336",
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 40,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
})

export default PaymentCallbackScreen