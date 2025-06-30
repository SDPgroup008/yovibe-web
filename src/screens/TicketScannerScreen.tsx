"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Modal } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import type { Camera } from "expo-camera"
import { BarCodeScanner } from "expo-barcode-scanner"
import { useAuth } from "../contexts/AuthContext"
import TicketService from "../services/TicketService"
import BiometricService from "../services/BiometricService"
import type { TicketScannerScreenProps } from "../navigation/types"

const TicketScannerScreen: React.FC<TicketScannerScreenProps> = ({ navigation }) => {
  const { user } = useAuth()
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [scanning, setScanning] = useState(false)
  const [validating, setValidating] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [scannedData, setScannedData] = useState<string | null>(null)
  const [showBiometricCapture, setShowBiometricCapture] = useState(false)
  const cameraRef = useRef<Camera>(null)

  useEffect(() => {
    requestCameraPermissions()
  }, [])

  const requestCameraPermissions = async () => {
    const { status } = await BarCodeScanner.requestPermissionsAsync()
    setHasPermission(status === "granted")
  }

  const handleStartScanning = async () => {
    if (!hasPermission) {
      Alert.alert("Permission Required", "Camera permission is required to scan tickets")
      return
    }

    setShowCamera(true)
    setScanning(true)
  }

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    if (!scanning) return

    console.log("QR Code scanned:", data.substring(0, 50) + "...")
    setScannedData(data)
    setScanning(false)
    setShowCamera(false)

    // Start biometric capture process
    setShowBiometricCapture(true)
  }

  const handleBiometricCapture = async () => {
    if (!user || !scannedData) {
      Alert.alert("Error", "Missing required data for validation")
      return
    }

    try {
      setValidating(true)

      Alert.alert(
        "Biometric Verification",
        "Please ask the ticket holder to look at the camera for biometric verification.",
        [
          { text: "Cancel", style: "cancel", onPress: () => setShowBiometricCapture(false) },
          {
            text: "Start Biometric Scan",
            onPress: async () => {
              try {
                const biometricData = await BiometricService.captureBiometric()

                const result = await TicketService.validateTicket(scannedData, biometricData, user.id, "Event Entrance")

                setShowBiometricCapture(false)

                if (result.success) {
                  Alert.alert(
                    "✅ Entry Granted",
                    `Ticket validated successfully!\n\nTicket ID: ${result.ticket?.id}\nEvent: ${result.ticket?.eventName}\nHolder: ${result.ticket?.buyerName}`,
                    [
                      {
                        text: "OK",
                        onPress: () => {
                          setScannedData(null)
                          // Ready for next scan
                        },
                      },
                    ],
                  )
                } else {
                  Alert.alert("❌ Entry Denied", `Validation failed: ${result.reason}`, [
                    {
                      text: "OK",
                      onPress: () => {
                        setScannedData(null)
                        // Ready for next scan
                      },
                    },
                  ])
                }
              } catch (error) {
                Alert.alert("Error", "Failed to capture biometric data")
                setShowBiometricCapture(false)
              }
            },
          },
        ],
      )
    } catch (error) {
      Alert.alert("Error", "Failed to validate ticket")
      setShowBiometricCapture(false)
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
              setScannedData(ticketData)
              setShowBiometricCapture(true)
            }
          },
        },
      ],
      "plain-text",
    )
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
          <Text style={styles.scannerText}>Scan ticket QR code or enter ticket ID manually</Text>
        </View>

        <View style={styles.instructions}>
          <Text style={styles.instructionTitle}>Validation Process:</Text>
          <Text style={styles.instructionText}>
            1. Scan the ticket QR code{"\n"}
            2. Ask ticket holder for biometric verification{"\n"}
            3. Grant or deny entry based on validation result
          </Text>
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
      <Modal
        visible={showCamera}
        animationType="slide"
        onRequestClose={() => {
          setShowCamera(false)
          setScanning(false)
        }}
      >
        <View style={styles.cameraContainer}>
          <View style={styles.cameraHeader}>
            <TouchableOpacity
              onPress={() => {
                setShowCamera(false)
                setScanning(false)
              }}
            >
              <Ionicons name="close" size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.cameraTitle}>Scan QR Code</Text>
          </View>

          <BarCodeScanner onBarCodeScanned={scanning ? handleBarCodeScanned : undefined} style={styles.camera} />

          <View style={styles.scannerOverlay}>
            <View style={styles.scannerFrame} />
            <Text style={styles.scannerInstructions}>Position the QR code within the frame</Text>
          </View>
        </View>
      </Modal>

      {/* Biometric Capture Modal */}
      <Modal
        visible={showBiometricCapture}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBiometricCapture(false)}
      >
        <View style={styles.biometricModalOverlay}>
          <View style={styles.biometricModalContent}>
            <Text style={styles.biometricModalTitle}>Biometric Verification Required</Text>
            <Text style={styles.biometricModalText}>
              QR code scanned successfully. Now capture the ticket holder's biometric data for verification.
            </Text>

            <View style={styles.biometricModalButtons}>
              <TouchableOpacity
                style={styles.biometricCancelButton}
                onPress={() => {
                  setShowBiometricCapture(false)
                  setScannedData(null)
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
                  <Text style={styles.biometricStartText}>Start Verification</Text>
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
    lineHeight: 20,
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
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  scannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: "#2196F3",
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  scannerInstructions: {
    fontSize: 16,
    color: "#FFFFFF",
    textAlign: "center",
    marginTop: 20,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 10,
    borderRadius: 8,
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
  },
  biometricModalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 16,
  },
  biometricModalText: {
    fontSize: 16,
    color: "#DDDDDD",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  biometricModalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  biometricCancelButton: {
    backgroundColor: "#666666",
    padding: 16,
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
  },
  biometricStartButton: {
    backgroundColor: "#4CAF50",
    padding: 16,
    borderRadius: 8,
    flex: 1,
    marginLeft: 8,
  },
  biometricCancelText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  biometricStartText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
})

export default TicketScannerScreen
