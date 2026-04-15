"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, TextInput, Modal, Platform } from "react-native"
import { CameraView, useCameraPermissions } from "expo-camera"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../contexts/AuthContext"
import TicketService from "../services/TicketService"
import type { TicketScannerScreenProps } from "../navigation/types"

const TicketScannerScreen: React.FC<TicketScannerScreenProps> = ({ navigation }) => {
  const { user } = useAuth()
  const [scanning, setScanning] = useState(false)
  const [validating, setValidating] = useState(false)
  const [manualInput, setManualInput] = useState("")
  const [showManualModal, setShowManualModal] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [scanHistory, setScanHistory] = useState<Array<{ ticketId: string; status: string; time: string }>>([])
  
  const videoRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Check if user is admin or club_owner
  useEffect(() => {
    if (user && user.userType !== "admin" && user.userType !== "club_owner") {
      Alert.alert("Access Denied", "You don't have permission to access this page")
      navigation.goBack()
    }
  }, [user, navigation])

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  const startCamera = async () => {
    try {
      console.log("📷 Starting camera for QR scanning...")
      setScanning(true)
      setCameraActive(true)
    } catch (error) {
      console.error("Error starting camera:", error)
      Alert.alert("Error", "Failed to start camera. Please use manual entry.")
      setScanning(false)
      setCameraActive(false)
    }
  }

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    if (!scanning) return
    
    console.log("📱 QR Code raw data:", data)
    setScanning(false)
    setCameraActive(false)
    
    // Parse QR data - could be JSON (new format) or plain string (legacy)
    let ticketData: { id?: string; eventId?: string } = {}
    let ticketId = data
    
    try {
      ticketData = JSON.parse(data)
      ticketId = ticketData.id || data
      console.log("📱 Parsed QR data - ID:", ticketId, "Event:", ticketData.eventId)
    } catch {
      console.log("📱 Could not parse as JSON, using raw data as ticket ID")
    }
    
    await handleValidateTicket(ticketId)
  }

  const stopCamera = () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track: any) => track.stop())
        streamRef.current = null
      }
    } catch (error) {
      console.error("Error stopping camera:", error)
    }
    setCameraActive(false)
    setScanning(false)
  }

  const handleScanTicket = async () => {
    // Start camera scanning - set scanning state to true
    // The CameraView component will handle QR code detection
    setScanning(true)
    setCameraActive(true)
  }

  const handleManualSubmit = async () => {
    if (!manualInput.trim()) {
      Alert.alert("Error", "Please enter a ticket ID")
      return
    }
    
    setShowManualModal(false)
    await handleValidateTicket(manualInput.trim())
    setManualInput("")
  }

  const handleValidateTicket = async (ticketId: string) => {
    if (!user) {
      Alert.alert("Error", "Please sign in to validate tickets")
      return
    }

    try {
      setValidating(true)
      console.log("Validating ticket:", ticketId)

      const result = await TicketService.validateTicket(ticketId, user.id, "Event Entrance")
      
      // Add to scan history
      setScanHistory((prev) => [{
        ticketId: ticketId.substring(0, 12) + "...",
        status: result.success ? "Valid" : "Invalid",
        time: new Date().toLocaleTimeString()
      }, ...prev].slice(0, 10))

      if (result.success) {
        Alert.alert(
          "✅ Entry Granted",
          `Ticket ${ticketId} is valid. Entry granted.`,
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
        <Text style={styles.headerTitle}>Ticket Scanner</Text>
      </View>

      <View style={styles.content}>
        {/* Scanner Preview Area */}
        <View style={styles.scannerArea}>
          {cameraActive ? (
            <CameraView
              style={styles.cameraView}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ["qr"],
              }}
              onBarcodeScanned={scanning ? handleBarCodeScanned : undefined}
            >
              <View style={styles.cameraOverlay}>
                <View style={styles.scanFrame}>
                  <Ionicons name="qr-code" size={60} color="#00D4FF" />
                </View>
                <Text style={styles.scanText}>Point camera at QR code</Text>
                <TouchableOpacity 
                  style={styles.stopCameraButton}
                  onPress={stopCamera}
                >
                  <Text style={styles.stopCameraButtonText}>Stop Scanning</Text>
                </TouchableOpacity>
              </View>
            </CameraView>
          ) : (
            <>
              <Ionicons name="qr-code-outline" size={120} color="#2196F3" />
              <Text style={styles.scannerText}>
                Scan ticket QR code or enter ticket ID manually
              </Text>
            </>
          )}
        </View>

        {/* Instructions */}
        <View style={styles.instructions}>
          <Text style={styles.instructionTitle}>How to Validate:</Text>
          <Text style={styles.instructionText}>
            1. Point camera at ticket QR code{"\n"}
            2. Or enter ticket ID manually{"\n"}
            3. Click Validate to verify{"\n"}
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

          <TouchableOpacity
            style={styles.manualButton}
            onPress={() => setShowManualModal(true)}
            disabled={validating}
          >
            <Ionicons name="keypad" size={24} color="#FFFFFF" />
            <Text style={styles.scanButtonText}>Enter ID</Text>
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

      {/* Manual Entry Modal */}
      <Modal
        visible={showManualModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowManualModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enter Ticket ID</Text>
              <TouchableOpacity onPress={() => setShowManualModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            
            <TextInput
              style={styles.modalInput}
              value={manualInput}
              onChangeText={setManualInput}
              placeholder="Enter ticket ID (e.g., ticket_123...)"
              placeholderTextColor="#666"
              autoFocus
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowManualModal(false)
                  setManualInput("")
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.modalValidateButton}
                onPress={handleManualSubmit}
                disabled={!manualInput.trim() || validating}
              >
                {validating ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalValidateText}>Validate</Text>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.modalHelper}>
              Tip: You can find the ticket ID in the ticket details or QR code text
            </Text>
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
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginLeft: 16,
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