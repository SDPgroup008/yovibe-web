"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Image, Modal } from "react-native"
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
  const [scanHistory, setScanHistory] = useState<Array<{ ticketId: string; status: string; time: string; reason?: string }>>([])
  
  // Photo verification state
  const [showPhotoVerification, setShowPhotoVerification] = useState(false)
  const [pendingTicketDocId, setPendingTicketDocId] = useState<string | null>(null)
  const [buyerPhotoUrl, setBuyerPhotoUrl] = useState<string>("")
  const [buyerName, setBuyerName] = useState<string>("")

  // Check if user has permission to scan tickets (admin, club_owner, or user with events)
  useEffect(() => {
    if (!user) {
      Alert.alert("Access Denied", "Please sign in to access this page")
      navigation.goBack()
      return
    }
    
    // Allow: admins, club_owners, or any user (they can scan if they have events)
    // The actual authorization check happens at validation time
    console.log("📱 TicketScanner: User type:", user.userType)
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
        time: new Date().toLocaleTimeString(),
        reason: result.reason || (result.success ? "Valid ticket" : "Validation failed")
      }, ...prev].slice(0, 10))

      if (result.success) {
        // Check if this ticket needs photo verification
        if (result.needsPhotoVerification && result.buyerPhotoUrl && result.ticketDocId) {
          console.log("📸 Ticket requires photo verification")
          console.log("   - Buyer Photo:", result.buyerPhotoUrl)
          console.log("   - Buyer Name:", result.buyerName)
          
          // Show photo verification modal
          setPendingTicketDocId(result.ticketDocId)
          setBuyerPhotoUrl(result.buyerPhotoUrl)
          setBuyerName(result.buyerName || "Ticket Buyer")
          setShowPhotoVerification(true)
          setValidating(false)
          return
        }
        
        // For tickets without photo, grant entry immediately
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
    } catch (error: any) {
      console.error("Validation error:", error)
      const errorMessage = error?.message || "Failed to validate ticket"
      
      // Add error to scan history
      setScanHistory((prev) => [{
        ticketId: qrCodeData.substring(0, 12) + "...",
        status: "Invalid",
        time: new Date().toLocaleTimeString(),
        reason: errorMessage
      }, ...prev].slice(0, 10))
      
      Alert.alert("Error", errorMessage)
    } finally {
      setValidating(false)
    }
  }

  // Handle photo verification confirmation
  const handlePhotoConfirm = async (confirmed: boolean) => {
    if (!user || !pendingTicketDocId) {
      setShowPhotoVerification(false)
      return
    }

    setShowPhotoVerification(false)
    setValidating(true)

    try {
      if (confirmed) {
        console.log("📸 Photo verified - confirming ticket usage")
        
        const result = await TicketService.confirmTicketUsage(
          pendingTicketDocId,
          user.id,
          eventName || "Event Entrance",
          eventId
        )

        if (result.success) {
          Alert.alert(
            "✅ Entry Granted",
            `Photo verified! Ticket confirmed for ${buyerName}. Entry granted.`,
            [{ text: "OK" }]
          )
        } else {
          Alert.alert(
            "❌ Entry Denied",
            `Failed to confirm ticket: ${result.reason}`,
            [{ text: "OK" }]
          )
        }
      } else {
        // Photo verification denied
        console.log("📸 Photo verification denied - entry denied")
        
        // Add to scan history
        setScanHistory((prev) => [{
          ticketId: pendingTicketDocId.substring(0, 12) + "...",
          status: "Invalid",
          time: new Date().toLocaleTimeString(),
          reason: "Photo verification denied - buyer does not match photo"
        }, ...prev].slice(0, 10))

        Alert.alert(
          "❌ Entry Denied",
          "The person presenting the ticket does not match the photo on file.",
          [{ text: "OK" }]
        )
      }
    } catch (error: any) {
      console.error("Photo verification error:", error)
      Alert.alert("Error", "Failed to process photo verification")
    } finally {
      setPendingTicketDocId(null)
      setBuyerPhotoUrl("")
      setBuyerName("")
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

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
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
                {scan.reason && scan.status === "Invalid" && (
                  <Text style={styles.historyReason}>{scan.reason}</Text>
                )}
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
      </ScrollView>

      {/* Photo Verification Modal */}
      <Modal
        visible={showPhotoVerification}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPhotoVerification(false)}
      >
        <View style={styles.photoVerificationOverlay}>
          <View style={styles.photoVerificationContent}>
            <Text style={styles.photoVerificationTitle}>Photo Verification Required</Text>
            <Text style={styles.photoVerificationSubtitle}>
              Compare the photo below with the person presenting the ticket
            </Text>
            
            {/* Buyer Photo */}
            <View style={styles.photoContainer}>
              {buyerPhotoUrl ? (
                <Image 
                  source={{ uri: buyerPhotoUrl }} 
                  style={styles.buyerPhoto}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="person" size={60} color="#666" />
                </View>
              )}
              <Text style={styles.buyerNameText}>{buyerName}</Text>
              <Text style={styles.buyerLabel}>Ticket Buyer</Text>
            </View>

            {/* Verification Question */}
            <Text style={styles.verificationQuestion}>
              Does the person presenting the ticket match this photo?
            </Text>

            {/* Verification Buttons */}
            <View style={styles.verificationButtons}>
              <TouchableOpacity 
                style={styles.denyButton}
                onPress={() => handlePhotoConfirm(false)}
              >
                <Ionicons name="close-circle" size={24} color="#FFFFFF" />
                <Text style={styles.denyButtonText}>No - Deny Entry</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.confirmButton}
                onPress={() => handlePhotoConfirm(true)}
              >
                <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
                <Text style={styles.confirmButtonText}>Yes - Grant Entry</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.verificationNote}>
              Entry will only be granted after photo confirmation
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
  contentContainer: {
    paddingBottom: 40,
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
  historyReason: {
    fontSize: 11,
    color: "#FF6B6B",
    marginTop: 4,
    fontStyle: "italic",
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
  // Photo Verification Styles
  photoVerificationOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  photoVerificationContent: {
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  photoVerificationTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  photoVerificationSubtitle: {
    color: "#888888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  photoContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  buyerPhoto: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 3,
    borderColor: "#00D4FF",
    marginBottom: 12,
  },
  photoPlaceholder: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "#333",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#666",
    marginBottom: 12,
  },
  buyerNameText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  buyerLabel: {
    color: "#888888",
    fontSize: 12,
  },
  verificationQuestion: {
    color: "#FFD700",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 20,
  },
  verificationButtons: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  denyButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF4444",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  denyButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
    marginLeft: 6,
  },
  confirmButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
    marginLeft: 6,
  },
  verificationNote: {
    color: "#666666",
    fontSize: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
})

export default TicketScannerScreen