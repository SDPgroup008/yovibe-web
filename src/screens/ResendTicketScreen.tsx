import "react-native-get-random-values"
import React from "react"
import { useState } from "react"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useCompatNavigation } from "../utils/compatNavigation"
import TicketService from "../services/TicketService"
import SupabaseService from "../services/SupabaseService"

const ResendTicketScreen: React.FC = () => {
  const navigation = useCompatNavigation()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleResendTickets = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email address")
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      Alert.alert("Error", "Please enter a valid email address")
      return
    }

    setLoading(true)

    try {
      const tickets = await TicketService.getTicketsByEmail(email.trim())

      if (tickets.length === 0) {
        Alert.alert("Not Found", "If we found tickets for this email, they've been resent.")
        return
      }

      // Get event to find ticket designs for each ticket type
      const eventId = tickets[0]?.eventId
      const event = eventId ? await SupabaseService.getEventById(eventId) : null

      let successCount = 0
      let failCount = 0

      for (const ticket of tickets) {
        try {
          const response = await fetch(`/.netlify/functions/send-ticket-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              buyerEmail: ticket.buyerEmail,
              buyerName: ticket.buyerName,
              eventName: ticket.eventName,
              ticketType: ticket.entryFeeType,
              venue: ticket.venueName,
              date: ticket.eventStartTime.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
              time: ticket.eventStartTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              ticketRef: ticket.ticketRef,
              qrCodeDataUrl: ticket.qrCodeDataUrl,
              seatNumber: ticket.seatNumber,
              tableGroupId: ticket.tableGroupId,
              // Find the ticket design from the entry fee
              ticketDesign: event?.entryFees?.find((f: any) => f.name === ticket.entryFeeType)?.ticketDesign,
              posterUrl: event?.posterImageUrl,
            }),
          })

          if (response.ok) {
            successCount++
          } else {
            failCount++
          }
        } catch (err) {
          failCount++
        }
      }

      setSent(true)
      Alert.alert(
        "Tickets Resent",
        `Successfully resent ${successCount} ticket(s)${failCount > 0 ? ` with ${failCount} failure(s)` : ""}.`,
        [{ text: "OK", onPress: () => navigation.goBack() }]
      )
    } catch (error) {
      console.error("Error resending tickets:", error)
      Alert.alert("Error", "Failed to resend tickets. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.formContainer}>
          <Text style={styles.title}>Resend Your Ticket</Text>
          <Text style={styles.subtitle}>
            Enter the email address you used when purchasing to have your ticket(s) sent to you again.
          </Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              placeholderTextColor="#666"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={[styles.sendButton, loading && styles.sendButtonDisabled]}
            onPress={handleResendTickets}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.sendButtonText}>Resend Tickets</Text>
            )}
          </TouchableOpacity>

          {sent && (
            <View style={styles.successContainer}>
              <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
              <Text style={styles.successText}>Tickets have been resent!</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    padding: 16,
    paddingTop: 48,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  content: {
    flex: 1,
    justifyContent: "center",
  },
  formContainer: {
    padding: 24,
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 16,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#888888",
    lineHeight: 20,
    marginBottom: 32,
    textAlign: "center",
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    color: "#FFFFFF",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    padding: 16,
    color: "#FFFFFF",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  sendButton: {
    backgroundColor: "#2196F3",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  successContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  successText: {
    color: "#4CAF50",
    fontSize: 14,
  },
})

export default ResendTicketScreen