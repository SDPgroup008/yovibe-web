"use client"

import type React from "react"
import { useState } from "react"
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../contexts/AuthContext"
import TicketService from "../services/TicketService"
import type { Ticket } from "../models/Ticket"

interface TicketScannerScreenProps {
  navigation: any
}

const TicketScannerScreen: React.FC<TicketScannerScreenProps> = ({ navigation }) => {
  const { user } = useAuth()
  const [scanning, setScanning] = useState(false)
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [validationModal, setValidationModal] = useState(false)
  const [validationStep, setValidationStep] = useState<"scanning" | "verifying" | "success" | "failed">("scanning")
  const [ticketCode, setTicketCode] = useState("")

  // Simulate QR code scanning
  const startScanning = () => {
    setScanning(true)
    // In production, integrate with actual QR code scanner
    setTimeout(() => {
      // Simulate scanned ticket code
      const mockTicketCode = "TKT-SAMPLE-123456"
      setTicketCode(mockTicketCode)
      setScanning(false)
      validateTicket(mockTicketCode)
    }, 3000)
  }

  const validateTicket = async (code: string) => {
    try {
      setValidationModal(true)
      setValidationStep("scanning")

      // Get ticket details
      const ticketData = await TicketService.getTicketByCode(code)
      if (!ticketData) {
        setValidationStep("failed")
        setTimeout(() => {
          setValidationModal(false)
          Alert.alert("Invalid Ticket", "Ticket not found or invalid")
        }, 2000)
        return
      }

      setTicket(ticketData)
      setValidationStep("verifying")

      // Validate ticket with biometric verification
      const validation = await TicketService.validateTicket(code, user!.id)

      if (validation.entryGranted) {
        setValidationStep("success")
        setTimeout(() => {
          setValidationModal(false)
          Alert.alert("Entry Granted", `Welcome ${ticketData.buyerName}!\nTicket validated successfully.`, [
            { text: "OK", onPress: () => setTicket(null) },
          ])
        }, 2000)
      } else {
        setValidationStep("failed")
        setTimeout(() => {
          setValidationModal(false)
          Alert.alert("Entry Denied", "Biometric verification failed or ticket is invalid")
        }, 2000)
      }
    } catch (error) {
      console.error("Error validating ticket:", error)
      setValidationStep("failed")
      setTimeout(() => {
        setValidationModal(false)
        Alert.alert("Validation Error", "There was an error validating the ticket")
      }, 2000)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ticket Scanner</Text>
      </View>

      <View style={styles.scannerContainer}>
        <View style={styles.scannerFrame}>
          {scanning ? (
            <ActivityIndicator size="large" color="#2196F3" />
          ) : (
            <Ionicons name="qr-code-outline" size={120} color="#666666" />
          )}
        </View>

        <Text style={styles.instructionText}>
          {scanning ? "Scanning QR code..." : "Tap the button below to scan a ticket"}
        </Text>

        <TouchableOpacity
          style={[styles.scanButton, scanning && styles.scanButtonDisabled]}
          onPress={startScanning}
          disabled={scanning}
        >
          <Ionicons name="scan" size={24} color="#FFFFFF" />
          <Text style={styles.scanButtonText}>{scanning ? "Scanning..." : "Start Scanning"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>How it works:</Text>
        <View style={styles.infoItem}>
          <Ionicons name="qr-code" size={20} color="#2196F3" />
          <Text style={styles.infoText}>1. Scan the QR code on the ticket</Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="eye" size={20} color="#2196F3" />
          <Text style={styles.infoText}>2. Verify the holder's biometric data</Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="checkmark-circle" size={20} color="#2196F3" />
          <Text style={styles.infoText}>3. Grant or deny entry</Text>
        </View>
      </View>

      {/* Validation Modal */}
      <Modal visible={validationModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.validationModal}>
            <View style={styles.validationContent}>
              {validationStep === "scanning" && (
                <>
                  <Ionicons name="qr-code" size={80} color="#2196F3" />
                  <Text style={styles.validationTitle}>Reading Ticket</Text>
                  <Text style={styles.validationText}>Processing ticket information...</Text>
                  <ActivityIndicator size="large" color="#2196F3" style={styles.validationLoader} />
                </>
              )}
              {validationStep === "verifying" && (
                <>
                  <Ionicons name="eye" size={80} color="#FF9800" />
                  <Text style={styles.validationTitle}>Verifying Identity</Text>
                  <Text style={styles.validationText}>Please look at the camera for biometric verification</Text>
                  <ActivityIndicator size="large" color="#FF9800" style={styles.validationLoader} />
                </>
              )}
              {validationStep === "success" && (
                <>
                  <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
                  <Text style={styles.validationTitle}>Entry Granted</Text>
                  <Text style={styles.validationText}>Ticket validated successfully</Text>
                  {ticket && (
                    <View style={styles.ticketInfo}>
                      <Text style={styles.ticketInfoText}>Holder: {ticket.buyerName}</Text>
                      <Text style={styles.ticketInfoText}>Event: {ticket.eventName}</Text>
                      <Text style={styles.ticketInfoText}>Quantity: {ticket.quantity}</Text>
                    </View>
                  )}
                </>
              )}
              {validationStep === "failed" && (
                <>
                  <Ionicons name="close-circle" size={80} color="#F44336" />
                  <Text style={styles.validationTitle}>Entry Denied</Text>
                  <Text style={styles.validationText}>Ticket validation failed</Text>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
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
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  scannerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  scannerFrame: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: "#2196F3",
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 32,
  },
  instructionText: {
    fontSize: 16,
    color: "#DDDDDD",
    textAlign: "center",
    marginBottom: 32,
  },
  scanButton: {
    backgroundColor: "#2196F3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  scanButtonDisabled: {
    backgroundColor: "#666666",
  },
  scanButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  infoSection: {
    padding: 16,
    backgroundColor: "#1E1E1E",
    margin: 16,
    borderRadius: 12,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: "#DDDDDD",
    marginLeft: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  validationModal: {
    backgroundColor: "#1E1E1E",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    minWidth: 300,
  },
  validationContent: {
    alignItems: "center",
  },
  validationTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: 16,
    marginBottom: 8,
  },
  validationText: {
    fontSize: 14,
    color: "#DDDDDD",
    textAlign: "center",
    marginBottom: 16,
  },
  validationLoader: {
    marginTop: 16,
  },
  ticketInfo: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#333333",
    borderRadius: 8,
    width: "100%",
  },
  ticketInfoText: {
    fontSize: 14,
    color: "#FFFFFF",
    marginBottom: 4,
  },
})

export default TicketScannerScreen
