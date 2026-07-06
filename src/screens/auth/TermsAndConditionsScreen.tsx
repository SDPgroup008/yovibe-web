"use client"

import type React from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from "react-native"
import { useCompatNavigation } from "../../utils/compatNavigation"
import { Ionicons } from "@expo/vector-icons"

const TermsAndConditionsScreen: React.FC = () => {
  const navigation = useCompatNavigation()

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms & Conditions</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.card}>
          <Text style={styles.title}>YoVibe Terms and Conditions</Text>
          <Text style={styles.lastUpdated}>Last Updated: July 6, 2026</Text>

          <Text style={styles.sectionTitle}>1. Introduction</Text>
          <Text style={styles.paragraph}>
            Welcome to YoVibe ("we", "us", or "our"). These Terms and Conditions ("Terms") govern your use of 
            the YoVibe web application and mobile application (collectively, the "App"). By accessing or using 
            the App, you acknowledge that you have read, understood, and agree to be bound by these Terms.
          </Text>

          <Text style={styles.sectionTitle}>2. Account Registration and Security</Text>
          <Text style={styles.paragraph}>
            To use certain features, you must register for an account. You are responsible for maintaining the 
            confidentiality of your account credentials and for all activities that occur under your account.
          </Text>

          <Text style={styles.sectionTitle}>3. User Types and Roles</Text>
          <Text style={styles.paragraph}>
            Users can be Regular Users, Club Owners (Organizers), or Administrators. Each role has specific 
            permissions and responsibilities within the platform.
          </Text>

          <Text style={styles.sectionTitle}>4. Event and Ticket Purchases</Text>
          <Text style={styles.paragraph}>
            Tickets are valid from purchase until 24 hours after event start time. Each ticket includes a 
            unique QR code for validation. A 15% late fee applies to purchases within 24 hours of event start.
          </Text>

          <Text style={styles.sectionTitle}>5. Payment Terms</Text>
          <Text style={styles.paragraph}>
            We accept Mobile Money (MTN, Airtel), Credit/Debit Cards, and Bank Transfers. A 15% platform 
            commission is charged on all ticket sales. We use PesaPal for card payments and PawaPay for 
            mobile money transactions.
          </Text>

          <Text style={styles.sectionTitle}>6. Ticket Validation</Text>
          <Text style={styles.paragraph}>
            Tickets are validated by scanning the QR code at event entrances. Photo verification may be 
            required for security. All validations are logged with timestamp and validator information.
          </Text>

          <Text style={styles.sectionTitle}>7. Refunds and Cancellations</Text>
          <Text style={styles.paragraph}>
            Refunds are provided for event cancellations by organizers or platform. User-requested refunds 
            are typically not provided for change of mind or schedule conflicts.
          </Text>

          <Text style={styles.sectionTitle}>8. Data Privacy</Text>
          <Text style={styles.paragraph}>
            Your data is collected and used in accordance with our Privacy Policy. We implement security 
            measures including encryption and access controls. Data is retained according to legal requirements.
          </Text>

          <Text style={styles.sectionTitle}>9. Limitation of Liability</Text>
          <Text style={styles.paragraph}>
            THE APP IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. TO THE MAXIMUM EXTENT PERMITTED 
            BY LAW, OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT PAID BY YOU IN THE 12 MONTHS PRECEDING 
            THE CLAIM.
          </Text>

          <Text style={styles.sectionTitle}>10. Governing Law</Text>
          <Text style={styles.paragraph}>
            These Terms are governed by the laws of Uganda. Any legal action shall be brought exclusively 
            in the courts of Uganda.
          </Text>

          <TouchableOpacity
            style={styles.agreeButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.agreeButtonText}>I Agree to Terms</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
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
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  card: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
    textAlign: "center",
  },
  lastUpdated: {
    fontSize: 14,
    color: "#888888",
    marginBottom: 20,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#00D4FF",
    marginTop: 16,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    color: "#CCCCCC",
    lineHeight: 20,
    marginBottom: 8,
  },
  agreeButton: {
    backgroundColor: "#FF3B30",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 24,
    shadowColor: "#FF3B30",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  agreeButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
})

export default TermsAndConditionsScreen