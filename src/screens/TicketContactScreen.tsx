"use client"

import type React from "react"
import { useState } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import type { TicketContactScreenProps } from "../navigation/types"

const TicketContactScreen: React.FC<TicketContactScreenProps> = ({ navigation, route }) => {
  const { ticketContacts } = route.params
  const [linkingError, setLinkingError] = useState<string | null>(null)

  const handleContactPress = async (number: string, type: "call" | "whatsapp") => {
    try {
      let url: string
      if (type === "call") {
        url = `tel:${number}`
      } else {
        // Remove any non-digit characters except the leading "+" for WhatsApp
        const cleanNumber = number.replace(/[^0-9+]/g, "")
        url = `whatsapp://send?phone=${cleanNumber}`
      }

      const supported = await Linking.canOpenURL(url)
      if (!supported) {
        setLinkingError(`Cannot open ${type === "call" ? "dialer" : "WhatsApp"}. Please ensure ${type === "call" ? "your device supports calling" : "WhatsApp is installed"}.`)
        return
      }

      await Linking.openURL(url)
    } catch (error) {
      console.error(`Error opening ${type} for number ${number}:`, error)
      setLinkingError(`Failed to open ${type === "call" ? "dialer" : "WhatsApp"}. Please try again.`)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ticket Contacts</Text>
      </View>

      {linkingError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{linkingError}</Text>
        </View>
      )}

      {ticketContacts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No contact information available</Text>
          <Text style={styles.emptySubtext}>Please contact the event organizer directly.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.contactsList}>
          {ticketContacts.map((contact, index) => (
            <View key={index} style={styles.contactItem}>
              <View style={styles.contactInfo}>
                <Text style={styles.contactNumber}>{contact.number}</Text>
                <Text style={styles.contactType}>{contact.type === "call" ? "Phone Call" : "WhatsApp"}</Text>
              </View>
              <TouchableOpacity
                style={styles.contactButton}
                onPress={() => handleContactPress(contact.number, contact.type)}
              >
                <Ionicons
                  name={contact.type === "call" ? "call" : "logo-whatsapp"}
                  size={24}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0A",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    paddingTop: Platform.OS === "ios" ? 60 : 30,
    backgroundColor: "#1A1A2E",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    textShadowColor: "rgba(0, 212, 255, 0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  errorContainer: {
    padding: 16,
    backgroundColor: "#FF3B30",
    marginHorizontal: 20,
    marginVertical: 12,
    borderRadius: 8,
  },
  errorText: {
    color: "#FFFFFF",
    fontSize: 14,
    textAlign: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  emptySubtext: {
    color: "#999999",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  contactsList: {
    padding: 20,
    paddingBottom: 100,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E1E1E",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  contactInfo: {
    flex: 1,
  },
  contactNumber: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  contactType: {
    fontSize: 14,
    color: "#999999",
  },
  contactButton: {
    backgroundColor: "#2196F3",
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
})

export default TicketContactScreen