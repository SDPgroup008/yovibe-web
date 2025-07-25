"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Platform,
  Image,
  Modal,
  Dimensions,
  ActivityIndicator,
} from "react-native"
import { Camera } from "expo-camera"
import { Ionicons } from "@expo/vector-icons"
import QRCodeService from "../services/QRCodeService"
import FirebaseService from "../services/FirebaseService"
import { useAuth } from "../contexts/AuthContext"
import type { Ticket, QRTicketData } from "../models/Ticket"

interface TicketScannerScreenProps {
  navigation: any
  route: any
}

const { width, height } = Dimensions.get("window")

export default function TicketScannerScreen({ navigation, route }: TicketScannerScreenProps) {
  const { user } = useAuth()
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [scanned, setScanned] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [validationResult, setValidationResult] = useState<{
    ticket: Ticket | null
    isValid: boolean
    message: string
  } | null>(null)
  const [showResult, setShowResult] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    requestPermissions()
    return () => {
      if (Platform.OS === "web") {
        stopCamera()
      }
    }
  }, [])

  const requestPermissions = async () => {
    try {
      if (Platform.OS === "web") {
        setHasPermission(true)
      } else {
        const { status } = await Camera.requestCameraPermissionsAsync()
        setHasPermission(status === "granted")
      }
    } catch (error) {
      console.error("Error requesting permissions:", error)
      setHasPermission(false)
    }
  }

  const startCamera = async () => {
    try {
      if (Platform.OS === "web" && videoRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
        videoRef.current.srcObject = stream
        setCameraActive(true)
        startScanning()
      } else {
        setCameraActive(true)
      }
    } catch (error) {
      console.error("Error starting camera:", error)
      Alert.alert("Error", "Failed to start camera")
    }
  }

  const stopCamera = () => {
    try {
      if (Platform.OS === "web" && videoRef.current) {
        const stream = videoRef.current.srcObject as MediaStream
        if (stream) {
          stream.getTracks().forEach((track) => track.stop())
        }
      }
      setCameraActive(false)
      setScanned(false)
    } catch (error) {
      console.error("Error stopping camera:", error)
    }
  }

  const startScanning = () => {
    if (Platform.OS === "web" && videoRef.current) {
      const scanInterval = setInterval(async () => {
        if (!scanned && !isProcessing && videoRef.current) {
          try {
            const qrData = await QRCodeService.scanQRCodeFromVideo(videoRef.current)
            if (qrData) {
              clearInterval(scanInterval)
              await handleQRCodeScanned(qrData)
            }
          } catch (error) {
            console.error("Error scanning QR code:", error)
          }
        }
      }, 1000)

      setTimeout(() => {
        clearInterval(scanInterval)
      }, 30000)
    }
  }

  const handleQRCodeScanned = async (qrData: string) => {
    if (scanned || isProcessing) return

    setScanned(true)
    setIsProcessing(true)

    try {
      console.log("QR Code scanned:", qrData)

      // Parse QR code data
      let ticketData: QRTicketData
      try {
        ticketData = JSON.parse(qrData)
      } catch (error) {
        setValidationResult({
          ticket: null,
          isValid: false,
          message: "Invalid QR code format",
        })
        setShowResult(true)
        return
      }

      // Validate QR code structure
      if (!ticketData.ticketId || !ticketData.eventId || !ticketData.buyerId) {
        setValidationResult({
          ticket: null,
          isValid: false,
          message: "Invalid ticket data",
        })
        setShowResult(true)
        return
      }

      // Get ticket from database
      const ticket = await FirebaseService.getTicketById(ticketData.ticketId)

      if (!ticket) {
        setValidationResult({
          ticket: null,
          isValid: false,
          message: "Ticket not found in database",
        })
        setShowResult(true)
        return
      }

      // Validate ticket status
      if (ticket.status !== "active") {
        setValidationResult({
          ticket,
          isValid: false,
          message: `Ticket is ${ticket.status}`,
        })
        setShowResult(true)
        return
      }

      // Validate ticket data matches QR code
      if (ticket.eventId !== ticketData.eventId || ticket.buyerId !== ticketData.buyerId) {
        setValidationResult({
          ticket,
          isValid: false,
          message: "Ticket data mismatch",
        })
        setShowResult(true)
        return
      }

      // Check if ticket has already been used
      const hasBeenUsed = ticket.validationHistory.some((validation) => validation.isValid)
      if (hasBeenUsed) {
        setValidationResult({
          ticket,
          isValid: false,
          message: "Ticket has already been used",
        })
        setShowResult(true)
        return
      }

      // Ticket is valid - create validation record
      const validation = {
        id: `validation_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        ticketId: ticket.id,
        validatedBy: user?.id || "scanner",
        validatedAt: new Date(),
        validationType: ticket.ticketType === "secure" ? "image_verification" : "qr_only",
        isValid: true,
        location: "Event Entrance",
      }

      // Update ticket status and add validation
      await FirebaseService.updateTicket(ticket.id, {
        status: "used",
        validationHistory: [...ticket.validationHistory, validation],
        isVerified: true,
      })

      setValidationResult({
        ticket: {
          ...ticket,
          status: "used",
          validationHistory: [...ticket.validationHistory, validation],
          isVerified: true,
        },
        isValid: true,
        message: "Ticket verified successfully!",
      })
      setShowResult(true)
    } catch (error) {
      console.error("Error processing QR code:", error)
      setValidationResult({
        ticket: null,
        isValid: false,
        message: "Error validating ticket",
      })
      setShowResult(true)
    } finally {
      setIsProcessing(false)
    }
  }

  const resetScanner = () => {
    setScanned(false)
    setIsProcessing(false)
    setValidationResult(null)
    setShowResult(false)
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setIsProcessing(true)
      const qrData = await QRCodeService.scanQRCodeFromImage(file)
      if (qrData) {
        await handleQRCodeScanned(qrData)
      } else {
        Alert.alert("No QR Code Found", "Could not find a QR code in the selected image")
      }
    } catch (error) {
      console.error("Error scanning image:", error)
      Alert.alert("Error", "Failed to scan image")
    } finally {
      setIsProcessing(false)
    }
  }

  const renderValidationResult = () => (
    <Modal visible={showResult} animationType="slide" transparent={true} onRequestClose={() => setShowResult(false)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.resultModal, { backgroundColor: validationResult?.isValid ? "#00D4AA" : "#FF6B6B" }]}>
          <View style={styles.resultHeader}>
            <Ionicons
              name={validationResult?.isValid ? "checkmark-circle" : "close-circle"}
              size={64}
              color="#FFFFFF"
            />
            <Text style={styles.resultTitle}>{validationResult?.isValid ? "✅ VERIFIED" : "❌ REJECTED"}</Text>
            <Text style={styles.resultMessage}>{validationResult?.message}</Text>
          </View>

          {validationResult?.ticket && (
            <View style={styles.ticketInfo}>
              <View style={styles.ticketHeader}>
                <Text style={styles.ticketEventName}>{validationResult.ticket.eventName}</Text>
                <Text style={styles.ticketType}>{validationResult.ticket.ticketType.toUpperCase()} TICKET</Text>
              </View>

              <View style={styles.ticketDetails}>
                <View style={styles.ticketRow}>
                  <Text style={styles.ticketLabel}>Buyer:</Text>
                  <Text style={styles.ticketValue}>{validationResult.ticket.buyerName}</Text>
                </View>
                <View style={styles.ticketRow}>
                  <Text style={styles.ticketLabel}>Email:</Text>
                  <Text style={styles.ticketValue}>{validationResult.ticket.buyerEmail}</Text>
                </View>
                <View style={styles.ticketRow}>
                  <Text style={styles.ticketLabel}>Quantity:</Text>
                  <Text style={styles.ticketValue}>{validationResult.ticket.quantity}</Text>
                </View>
                <View style={styles.ticketRow}>
                  <Text style={styles.ticketLabel}>Purchase Date:</Text>
                  <Text style={styles.ticketValue}>{validationResult.ticket.purchaseDate.toLocaleDateString()}</Text>
                </View>
              </View>

              {/* Show buyer image for secure tickets */}
              {validationResult.ticket.ticketType === "secure" &&
                validationResult.ticket.buyerImageUrl &&
                validationResult.isValid && (
                  <View style={styles.buyerImageSection}>
                    <Text style={styles.buyerImageTitle}>Buyer Verification Photo:</Text>
                    <Image source={{ uri: validationResult.ticket.buyerImageUrl }} style={styles.buyerImage} />
                    <Text style={styles.buyerImageNote}>
                      Please verify this matches the person presenting the ticket
                    </Text>
                  </View>
                )}
            </View>
          )}

          <View style={styles.resultActions}>
            <TouchableOpacity
              style={styles.resultButton}
              onPress={() => {
                setShowResult(false)
                resetScanner()
              }}
            >
              <Text style={styles.resultButtonText}>Scan Another</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.resultButton, styles.closeButton]}
              onPress={() => {
                setShowResult(false)
                navigation.goBack()
              }}
            >
              <Text style={styles.resultButtonText}>Close Scanner</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )

  if (hasPermission === null) {
    return (
      <View style={[styles.container, styles.gradientBackground]}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#00D4AA" />
          <Text style={styles.statusText}>Requesting camera permission...</Text>
        </View>
      </View>
    )
  }

  if (hasPermission === false) {
    return (
      <View style={[styles.container, styles.gradientBackground]}>
        <View style={styles.centerContent}>
          <Ionicons name="camera-off" size={64} color="#FF6B6B" />
          <Text style={styles.errorText}>Camera permission denied</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermissions}>
            <Text style={styles.permissionButtonText}>Request Permission</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.container, styles.gradientBackground]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>🎫 Ticket Scanner</Text>
      </View>

      <View style={styles.cameraContainer}>
        {Platform.OS === "web" ? (
          <>
            {cameraActive ? (
              <video ref={videoRef} style={styles.video} autoPlay playsInline muted />
            ) : (
              <View style={styles.placeholder}>
                <Ionicons name="camera" size={64} color="#CCCCCC" />
                <Text style={styles.placeholderText}>Camera not active</Text>
              </View>
            )}
          </>
        ) : (
          cameraActive && (
            <Camera
              style={styles.camera}
              type={Camera.Constants.Type.back}
              onBarCodeScanned={scanned ? undefined : ({ data }) => handleQRCodeScanned(data)}
            />
          )
        )}

        {/* Scanning overlay */}
        <View style={styles.overlay}>
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
          <Text style={styles.instructionText}>Position QR code within the frame</Text>
          <Text style={styles.subInstructionText}>The ticket will be automatically validated</Text>
        </View>
      </View>

      <View style={styles.controls}>
        {!cameraActive ? (
          <TouchableOpacity style={styles.controlButton} onPress={startCamera}>
            <View style={[styles.buttonGradient, { backgroundColor: "#00D4AA" }]}>
              <Ionicons name="camera" size={24} color="#FFFFFF" />
              <Text style={styles.buttonText}>Start Scanner</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.controlButton} onPress={stopCamera}>
            <View style={[styles.buttonGradient, { backgroundColor: "#FF6B6B" }]}>
              <Ionicons name="stop" size={24} color="#FFFFFF" />
              <Text style={styles.buttonText}>Stop Scanner</Text>
            </View>
          </TouchableOpacity>
        )}

        {Platform.OS === "web" && (
          <TouchableOpacity style={styles.controlButton} onPress={() => fileInputRef.current?.click()}>
            <View style={[styles.buttonGradient, { backgroundColor: "#6C5CE7" }]}>
              <Ionicons name="image" size={24} color="#FFFFFF" />
              <Text style={styles.buttonText}>Upload Image</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {isProcessing && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingContainer}>
            <ActivityIndicator size="large" color="#00D4AA" />
            <Text style={styles.processingText}>Validating ticket...</Text>
          </View>
        </View>
      )}

      {Platform.OS === "web" && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleFileUpload}
        />
      )}

      {renderValidationResult()}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradientBackground: {
    backgroundColor: "#1a1a2e",
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 16,
    marginTop: 16,
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: 18,
    textAlign: "center",
    marginTop: 16,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: "#00D4AA",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  permissionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    paddingTop: 50,
  },
  backButton: {
    padding: 8,
    marginRight: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  cameraContainer: {
    flex: 1,
    position: "relative",
    margin: 16,
    borderRadius: 16,
    overflow: "hidden",
  },
  camera: {
    flex: 1,
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  placeholderText: {
    color: "#CCCCCC",
    marginTop: 16,
    fontSize: 16,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  scanFrame: {
    width: 250,
    height: 250,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderColor: "#00D4AA",
    borderWidth: 4,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  instructionText: {
    color: "#FFFFFF",
    textAlign: "center",
    marginTop: 32,
    fontSize: 18,
    fontWeight: "600",
  },
  subInstructionText: {
    color: "#CCCCCC",
    textAlign: "center",
    marginTop: 8,
    fontSize: 14,
  },
  controls: {
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 16,
    gap: 12,
  },
  controlButton: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  buttonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  buttonText: {
    color: "#FFFFFF",
    marginLeft: 8,
    fontWeight: "600",
    fontSize: 16,
  },
  processingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  processingContainer: {
    padding: 32,
    borderRadius: 16,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.9)",
  },
  processingText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  resultModal: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 24,
    padding: 24,
  },
  resultHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: 16,
    textAlign: "center",
  },
  resultMessage: {
    fontSize: 16,
    color: "#FFFFFF",
    marginTop: 8,
    textAlign: "center",
    opacity: 0.9,
  },
  ticketInfo: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  ticketHeader: {
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.2)",
  },
  ticketEventName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 4,
  },
  ticketType: {
    fontSize: 14,
    color: "#FFFFFF",
    opacity: 0.8,
    fontWeight: "600",
  },
  ticketDetails: {
    marginBottom: 16,
  },
  ticketRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  ticketLabel: {
    fontSize: 14,
    color: "#FFFFFF",
    opacity: 0.8,
  },
  ticketValue: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },
  buyerImageSection: {
    alignItems: "center",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
  },
  buyerImageTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  buyerImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  buyerImageNote: {
    fontSize: 12,
    color: "#FFFFFF",
    opacity: 0.8,
    textAlign: "center",
    fontStyle: "italic",
  },
  resultActions: {
    flexDirection: "row",
    gap: 12,
  },
  resultButton: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  closeButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  resultButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
})
