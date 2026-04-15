"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from "react-native"
import { CameraView } from "expo-camera"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../contexts/AuthContext"
import TicketService from "../services/TicketService"
import type { TicketScannerScreenProps } from "../navigation/types"

const TicketScannerScreen: React.FC<TicketScannerScreenProps> = ({ navigation, route }) => {
  const { user } = useAuth()
  const { eventId, eventName } = route.params || {}
  const [scanning, setScanning] = useState(false)
  const [validating, setValidating] = useState(false)
  const [scanHistory, setScanHistory] = useState<Array<{ ticketId: string; status: string; time: string }>>([])

  // Check if user is admin or club_owner
  useEffect(() => {
    if (user && user.userType !== "admin" && user.userType !== "club_owner") {
      Alert.alert("Access Denied", "You don't have permission to access this page")
      navigation.goBack()
    }
  }, [user, navigation])

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    if (!scanning) return
    
    console.log("📱 QR Code raw data:", data)
    setScanning(false)
    
    await handleValidateTicket(data)
  }

  const handleScanTicket = async () => {
    setScanning(true)
  }

  const handleValidateTicket = async (qrCodeData: string) => {
    if (!user) {
      Alert.alert("Error", "Please sign in to validate tickets")
      return
    }

    try {
      setValidating(true)
      console.log("Validating ticket with QR:", qrCodeData)
      console.log("Event ID:", eventId)
      console.log("Event Name:", eventName)

      const result = await TicketService.validateTicket(qrCodeData, user.id, eventName || "Event Entrance")
      
      // Add to scan history
      setScanHistory((prev) => [{
        ticketId: qrCodeData.substring(0, 12) + "...",
        status: result.success ? "Valid" : "Invalid",
        time: new Date().toLocaleTimeString()
      }, ...prev].slice(0, 10))

      if (result.success) {
        Alert.alert(
          "✅ Entry Granted",
          `Ticket is valid for ${eventName}. Entry granted.`,
          [{ text: "OK" }]
        )
      } else {
        Alert.alert(
          "❌ Entry Denied",
          `Validation failed: ${result.reason}`,
          [{ text: "OK" }]
        )
      }
    } catch (error) {
      console.error("Validation error:", error)
      Alert.alert("Error", "Failed to validate ticket")
    } finally {
      setValidating(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Ticket Scanner</Text>
          {eventName && <Text style={styles.headerSubtitle}>{eventName}</Text>}
        </View>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        {/* Scanner Preview Area */}
        <View style={styles.scannerArea}>
          {scanning ? (
            <CameraView
              style={styles.cameraView}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ["qr"],
              }}
              onBarcodeScanned={handleBarCodeScanned}
            >
              <View style={styles.cameraOverlay}>
                <View style={styles.scanFrame}>
                  <Ionicons name="qr-code" size={60} color="#00D4FF" />
                </View>
                <Text style={styles.scanText}>Point camera at QR code</Text>
                <TouchableOpacity 
                  style={styles.stopCameraButton}
                  onPress={() => setScanning(false)}
                >
                  <Text style={styles.stopCameraButtonText}>Stop Scanning</Text>
                </TouchableOpacity>
              </View>
            </CameraView>
          ) : (
            <>
              <Ionicons name="qr-code-outline" size={120} color="#2196F3" />
              <Text style={styles.scannerText}>
                Point camera at ticket QR code to validate
              </Text>
            </>
          )}
        </View>

        {/* Instructions */}
        <View style={styles.instructions}>
          <Text style={styles.instructionTitle}>How to Validate:</Text>
          <Text style={styles.instructionText}>
            1. Tap Scan QR to activate camera{"\n"}
            2. Point camera at ticket QR code{"\n"}
            3. System automatically validates{"\n"}
            4. Grant or deny entry based on result
          </Text>
        </View>

        {/* Scan Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.scanButton, (scanning || validating) && styles.scanButtonDisabled]}
            onPress={handleScanTicket}
            disabled={scanning || validating}
          >
            {scanning || validating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="scan" size={24} color="#FFFFFF" />
                <Text style={styles.scanButtonText}>Scan QR</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Scan History */}
        {scanHistory.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>Recent Scans</Text>
            {scanHistory.map((scan, index) => (
              <View key={index} style={styles.historyItem}>
                <Text style={styles.historyTime}>{scan.time}</Text>
                <Text style={styles.historyId}>{scan.ticketId}</Text>
                <View style={[
                  styles.historyStatus,
                  scan.status === "Valid" ? styles.historyValid : styles.historyInvalid
                ]}>
                  <Text style={[
                    styles.historyStatusText,
                    scan.status === "Valid" ? styles.historyValidText : styles.historyInvalidText
                  ]}>
                    {scan.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Status Indicators */}
        <View style={styles.statusSection}>
          <Text style={styles.statusTitle}>System Status</Text>
          <View style={styles.statusItem}>
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            <Text style={styles.statusText}>QR Scanner Ready</Text>
          </View>
          <View style={styles.statusItem}>
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            <Text style={styles.statusText}>Network Connected</Text>
          </View>
          <View style={styles.statusItem}>
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            <Text style={styles.statusText}>Validation Service Active</Text>
          </View>
        </View>
      </View>
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
    justifyContent: "space-between",
    padding: 16,
    paddingTop: 50,
  },
  headerTextContainer: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#00D4FF",
    marginTop: 2,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  scannerArea: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 40,
    marginBottom: 24,
  },
  cameraPreview: {
    alignItems: "center",
    justifyContent: "center",
  },
  cameraView: {
    flex: 1,
    width: "100%",
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: "#00D4FF",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  scanText: {
    color: "#FFFFFF",
    fontSize: 16,
    marginTop: 20,
    textAlign: "center",
  },
  cameraActiveText: {
    fontSize: 16,
    color: "#4CAF50",
    marginTop: 16,
    marginBottom: 16,
  },
  stopCameraButton: {
    backgroundColor: "#FF6B6B",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  stopCameraButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  scannerText: {
    fontSize: 16,
    color: "#DDDDDD",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 24,
  },
  instructions: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  instructionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  instructionText: {
    fontSize: 14,
    color: "#DDDDDD",
    lineHeight: 22,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  scanButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    padding: 16,
    borderRadius: 8,
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
  manualButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    padding: 16,
    borderRadius: 8,
  },
  historySection: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  historyTime: {
    color: "#888888",
    fontSize: 12,
    width: 80,
  },
  historyId: {
    color: "#FFFFFF",
    fontSize: 12,
    flex: 1,
    fontFamily: "monospace",
  },
  historyStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  historyValid: {
    backgroundColor: "#1B5E20",
  },
  historyInvalid: {
    backgroundColor: "#B71C1C",
  },
  historyStatusText: {
    fontSize: 11,
    fontWeight: "bold",
  },
  historyValidText: {
    color: "#4CAF50",
  },
  historyInvalidText: {
    color: "#FF6B6B",
  },
  statusSection: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 16,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  statusText: {
    fontSize: 14,
    color: "#DDDDDD",
    marginLeft: 8,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 24,
    width: "90%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
  },
  modalInput: {
    backgroundColor: "#333333",
    color: "#FFFFFF",
    padding: 16,
    borderRadius: 8,
    fontSize: 16,
    marginBottom: 20,
    fontFamily: "monospace",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#333333",
    alignItems: "center",
  },
  modalCancelText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  modalValidateButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#00D4FF",
    alignItems: "center",
  },
  modalValidateText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  modalHelper: {
    color: "#666666",
    fontSize: 12,
    textAlign: "center",
    marginTop: 16,
  },
})

export default TicketScannerScreen