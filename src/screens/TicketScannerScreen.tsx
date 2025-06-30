"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Modal } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../contexts/AuthContext"
import TicketService from "../services/TicketService"
import { BiometricService } from "../services/BiometricService"
import QRCodeService from "../services/QRCodeService"
import type { TicketScannerScreenProps } from "../navigation/types"
import type { QRCodeData } from "../services/QRCodeService"

const TicketScannerScreen: React.FC<TicketScannerScreenProps> = ({ navigation }) => {
  const { user } = useAuth()
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [scanning, setScanning] = useState(false)
  const [validating, setValidating] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [scannedData, setScannedData] = useState<string | null>(null)
  const [qrCodeInfo, setQrCodeInfo] = useState<QRCodeData | null>(null)
  const [showBiometricCapture, setShowBiometricCapture] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    requestCameraPermissions()
    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current)
      }
    }
  }, [])

  const requestCameraPermissions = async () => {
    try {
      const isAvailable = await BiometricService.isAvailable()
      setHasPermission(isAvailable)
    } catch (error) {
      console.error("Error requesting camera permissions:", error)
      setHasPermission(false)
    }
  }

  const handleStartScanning = async () => {
    if (!hasPermission) {
      Alert.alert("Permission Required", "Camera permission is required to scan tickets")
      return
    }

    setShowCamera(true)
    setScanning(true)

    try {
      if (videoRef.current) {
        await BiometricService.startCameraPreview(videoRef.current)
        startQRScanning()
      }
    } catch (error) {
      console.error("Error starting camera:", error)
      Alert.alert("Camera Error", "Failed to start camera")
      setShowCamera(false)
      setScanning(false)
    }
  }

  const startQRScanning = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
    }

    scanIntervalRef.current = setInterval(async () => {
      if (videoRef.current && scanning) {
        try {
          const qrData = await QRCodeService.scanQRCodeFromVideo(videoRef.current)
          if (qrData) {
            handleQRCodeDetected(qrData)
          }
        } catch (error) {
          console.error("Error scanning QR code:", error)
        }
      }
    }, 500) // Scan every 500ms
  }

  const handleQRCodeDetected = (data: string) => {
    if (!scanning) return

    console.log("QR Code scanned:", data.substring(0, 50) + "...")
    setScannedData(data)
    setScanning(false)
    setShowCamera(false)

    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
    }

    BiometricService.stopCameraPreview()

    // Parse QR code to determine ticket type
    try {
      const decodedString = atob(data)
      const qrData: QRCodeData = JSON.parse(decodedString)
      setQrCodeInfo(qrData)

      if (qrData.ticketType === "secure") {
        // For secure tickets, require biometric verification
        setShowBiometricCapture(true)
      } else {
        // For regular tickets, validate immediately
        handleValidateTicket(data)
      }
    } catch (error) {
      Alert.alert("Invalid QR Code", "The scanned QR code is not valid")
      setScannedData(null)
    }
  }

  const handleValidateTicket = async (qrData: string, biometricData?: string) => {
    if (!user) {
      Alert.alert("Error", "Please sign in to validate tickets")
      return
    }

    try {
      setValidating(true)

      const result = await TicketService.validateTicket(qrData, biometricData, user.id, "Event Entrance")

      if (result.success && result.ticket) {
        const ticketTypeText = result.ticket.ticketType === "secure" ? "Secure Ticket" : "Regular Ticket"
        const securityInfo =
          result.ticket.ticketType === "secure"
            ? "\n🔒 Biometric verification successful"
            : "\n📱 QR code verification successful"

        Alert.alert(
          "✅ Entry Granted",
          `${ticketTypeText} validated successfully!${securityInfo}\n\nTicket ID: ${result.ticket.id}\nEvent: ${result.ticket.eventName}\nHolder: ${result.ticket.buyerName}`,
          [
            {
              text: "OK",
              onPress: () => {
                resetScanner()
              },
            },
          ],
        )
      } else {
        const ticketTypeText = qrCodeInfo?.ticketType === "secure" ? "Secure Ticket" : "Regular Ticket"
        Alert.alert("❌ Entry Denied", `${ticketTypeText} validation failed: ${result.reason}`, [
          {
            text: "OK",
            onPress: () => {
              resetScanner()
            },
          },
        ])
      }
    } catch (error) {
      Alert.alert("Error", "Failed to validate ticket")
      resetScanner()
    } finally {
      setValidating(false)
      setShowBiometricCapture(false)
    }
  }

  const handleBiometricCapture = async () => {
    if (!scannedData) {
      Alert.alert("Error", "No ticket data found")
      return
    }

    try {
      setValidating(true)

      Alert.alert(
        "Biometric Verification Required",
        "This is a secure ticket. Please ask the ticket holder to look at the camera for biometric verification.",
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => {
              setShowBiometricCapture(false)
              resetScanner()
            },
          },
          {
            text: "Start Biometric Scan",
            onPress: async () => {
              try {
                const biometricData = await BiometricService.captureBiometric()
                await handleValidateTicket(scannedData, biometricData)
              } catch (error) {
                Alert.alert("Error", "Failed to capture biometric data")
                setShowBiometricCapture(false)
                resetScanner()
              }
            },
          },
        ],
      )
    } catch (error) {
      Alert.alert("Error", "Failed to start biometric verification")
      setShowBiometricCapture(false)
      resetScanner()
    } finally {
      setValidating(false)
    }
  }

  const handleManualEntry = () => {
    Alert.prompt(
      "Manual Ticket Entry",
      "Enter ticket ID or QR code data:",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Validate",
          onPress: async (ticketData) => {
            if (ticketData) {
              try {
                // Try to parse as QR code data first
                const decodedString = atob(ticketData)
                const qrData: QRCodeData = JSON.parse(decodedString)
                setQrCodeInfo(qrData)
                setScannedData(ticketData)

                if (qrData.ticketType === "secure") {
                  setShowBiometricCapture(true)
                } else {
                  await handleValidateTicket(ticketData)
                }
              } catch (error) {
                // If parsing fails, treat as regular ticket ID
                await handleValidateTicket(ticketData)
              }
            }
          },
        },
      ],
      "plain-text",
    )
  }

  const handleFileUpload = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (file) {
        try {
          const qrData = await QRCodeService.scanQRCodeFromImage(file)
          if (qrData) {
            handleQRCodeDetected(qrData)
          } else {
            Alert.alert("No QR Code Found", "No QR code was detected in the uploaded image")
          }
        } catch (error) {
          Alert.alert("Error", "Failed to scan QR code from image")
        }
      }
    }
    input.click()
  }

  const resetScanner = () => {
    setScannedData(null)
    setQrCodeInfo(null)
    setShowBiometricCapture(false)
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
    }
    BiometricService.stopCameraPreview()
  }

  const stopScanning = () => {
    setShowCamera(false)
    setScanning(false)
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
    }
    BiometricService.stopCameraPreview()
  }

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>Requesting camera permission...</Text>
      </View>
    )
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>No access to camera</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermissions}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    )
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
        <View style={styles.scannerArea}>
          <Ionicons name="qr-code" size={120} color="#2196F3" />
          <Text style={styles.scannerText}>Scan ticket QR code or upload image</Text>
        </View>

        <View style={styles.instructions}>
          <Text style={styles.instructionTitle}>Validation Process:</Text>
          <Text style={styles.instructionText}>
            1. Scan the ticket QR code{"\n"}
            2. For regular tickets: Entry granted immediately{"\n"}
            3. For secure tickets: Biometric verification required{"\n"}
            4. Grant or deny entry based on validation result
          </Text>
        </View>

        <View style={styles.ticketTypeInfo}>
          <Text style={styles.ticketTypeTitle}>Supported Ticket Types:</Text>
          <View style={styles.ticketTypeItem}>
            <Ionicons name="qr-code" size={20} color="#4CAF50" />
            <Text style={styles.ticketTypeText}>Regular Tickets - QR code only</Text>
          </View>
          <View style={styles.ticketTypeItem}>
            <Ionicons name="shield-checkmark" size={20} color="#FF9800" />
            <Text style={styles.ticketTypeText}>Secure Tickets - QR code + Biometric</Text>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.scanButton, (scanning || validating) && styles.scanButtonDisabled]}
            onPress={handleStartScanning}
            disabled={scanning || validating}
          >
            {scanning ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="scan" size={24} color="#FFFFFF" />
                <Text style={styles.scanButtonText}>Scan QR Code</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.uploadButton, validating && styles.scanButtonDisabled]}
            onPress={handleFileUpload}
            disabled={validating}
          >
            <Ionicons name="cloud-upload" size={24} color="#FFFFFF" />
            <Text style={styles.scanButtonText}>Upload Image</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.manualButton, validating && styles.scanButtonDisabled]}
            onPress={handleManualEntry}
            disabled={validating}
          >
            <Ionicons name="keypad" size={24} color="#FFFFFF" />
            <Text style={styles.scanButtonText}>Manual Entry</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statusSection}>
          <Text style={styles.statusTitle}>Scanner Status</Text>
          <View style={styles.statusItem}>
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            <Text style={styles.statusText}>Camera Ready</Text>
          </View>
          <View style={styles.statusItem}>
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            <Text style={styles.statusText}>Biometric Scanner Ready</Text>
          </View>
          <View style={styles.statusItem}>
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            <Text style={styles.statusText}>Network Connected</Text>
          </View>
        </View>
      </View>

      {/* Camera Modal */}
      <Modal visible={showCamera} animationType="slide" onRequestClose={stopScanning}>
        <View style={styles.cameraContainer}>
          <View style={styles.cameraHeader}>
            <TouchableOpacity onPress={stopScanning}>
              <Ionicons name="close" size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.cameraTitle}>Scan QR Code</Text>
          </View>

          <div style={{ flex: 1, position: "relative" }}>
            <video
              ref={videoRef}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              autoPlay
              muted
              playsInline
            />

            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "250px",
                height: "250px",
                border: "2px solid #2196F3",
                borderRadius: "12px",
                backgroundColor: "transparent",
              }}
            />

            <div
              style={{
                position: "absolute",
                bottom: "20px",
                left: "50%",
                transform: "translateX(-50%)",
                backgroundColor: "rgba(0, 0, 0, 0.7)",
                color: "white",
                padding: "10px",
                borderRadius: "8px",
                textAlign: "center",
              }}
            >
              Position the QR code within the frame
            </div>
          </div>
        </View>
      </Modal>

      {/* Biometric Capture Modal */}
      <Modal
        visible={showBiometricCapture}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowBiometricCapture(false)
          resetScanner()
        }}
      >
        <View style={styles.biometricModalOverlay}>
          <View style={styles.biometricModalContent}>
            <Ionicons name="shield-checkmark" size={48} color="#FF9800" />
            <Text style={styles.biometricModalTitle}>Secure Ticket Detected</Text>
            <Text style={styles.biometricModalText}>
              This is a secure ticket that requires biometric verification. Please capture the ticket holder's biometric
              data to complete validation.
            </Text>

            <View style={styles.ticketInfo}>
              <Text style={styles.ticketInfoLabel}>Ticket Type:</Text>
              <Text style={styles.ticketInfoValue}>🔒 Secure Ticket</Text>
            </View>

            <View style={styles.biometricModalButtons}>
              <TouchableOpacity
                style={styles.biometricCancelButton}
                onPress={() => {
                  setShowBiometricCapture(false)
                  resetScanner()
                }}
              >
                <Text style={styles.biometricCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.biometricStartButton}
                onPress={handleBiometricCapture}
                disabled={validating}
              >
                {validating ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="eye" size={20} color="#FFFFFF" />
                    <Text style={styles.biometricStartText}>Start Verification</Text>
                  </>
                )}
              </TouchableOpacity>
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
    marginBottom: 16,
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
    lineHeight: 20,
  },
  ticketTypeInfo: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  ticketTypeTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  ticketTypeItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  ticketTypeText: {
    fontSize: 14,
    color: "#DDDDDD",
    marginLeft: 8,
  },
  buttonContainer: {
    marginBottom: 24,
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  manualButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF9800",
    padding: 16,
    borderRadius: 8,
  },
  scanButtonDisabled: {
    backgroundColor: "#666666",
  },
  scanButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 8,
  },
  statusSection: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 16,
  },
  statusTitle: {
    fontSize: 18,
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
  permissionText: {
    fontSize: 18,
    color: "#FFFFFF",
    textAlign: "center",
    marginTop: 100,
  },
  permissionButton: {
    backgroundColor: "#2196F3",
    padding: 16,
    borderRadius: 8,
    margin: 20,
  },
  permissionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  cameraHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    paddingTop: 50,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  cameraTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginLeft: 16,
  },
  biometricModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  biometricModalContent: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 24,
    width: "85%",
    maxWidth: 400,
    alignItems: "center",
  },
  biometricModalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    textAlign: "center",
    marginTop: 16,
    marginBottom: 16,
  },
  biometricModalText: {
    fontSize: 16,
    color: "#DDDDDD",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 20,
  },
  ticketInfo: {
    backgroundColor: "#333333",
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
    width: "100%",
  },
  ticketInfoLabel: {
    fontSize: 14,
    color: "#AAAAAA",
    marginBottom: 4,
  },
  ticketInfoValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  biometricModalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  biometricCancelButton: {
    flex: 1,
    backgroundColor: "#666666",
    padding: 16,
    borderRadius: 8,
    marginRight: 8,
  },
  biometricCancelText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  biometricStartButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF9800",
    padding: 16,
    borderRadius: 8,
    marginLeft: 8,
  },
  biometricStartText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
})

export default TicketScannerScreen
