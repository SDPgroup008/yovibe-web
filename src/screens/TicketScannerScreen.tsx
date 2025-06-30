"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Dimensions } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import QRCodeService, { type QRScanResult } from "../services/QRCodeService"
import { BiometricService } from "../services/BiometricService"
import TicketService from "../services/TicketService"

interface TicketScannerScreenProps {
  navigation: any
}

const { width, height } = Dimensions.get("window")

const TicketScannerScreen: React.FC<TicketScannerScreenProps> = ({ navigation }) => {
  const [isScanning, setIsScanning] = useState(false)
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null)
  const [scanResult, setScanResult] = useState<QRScanResult | null>(null)
  const [validating, setValidating] = useState(false)
  const [biometricRequired, setBiometricRequired] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    requestCameraPermission()
    return () => {
      stopScanning()
    }
  }, [])

  const requestCameraPermission = async () => {
    try {
      const hasPermission = await BiometricService.requestCameraPermission()
      setCameraPermission(hasPermission)
      if (hasPermission) {
        startScanning()
      }
    } catch (error) {
      console.error("Camera permission error:", error)
      setCameraPermission(false)
    }
  }

  const startScanning = async () => {
    try {
      setIsScanning(true)
      const stream = await BiometricService.startCamera()

      if (stream && videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()

        // Start scanning for QR codes
        scanIntervalRef.current = setInterval(scanForQRCode, 500)
      }
    } catch (error) {
      console.error("Error starting camera:", error)
      Alert.alert("Error", "Failed to start camera")
      setIsScanning(false)
    }
  }

  const stopScanning = () => {
    setIsScanning(false)
    BiometricService.stopCamera()

    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }
  }

  const scanForQRCode = async () => {
    if (!videoRef.current || !isScanning) return

    try {
      const result = await QRCodeService.scanFromVideo(videoRef.current)
      if (result.success && result.data) {
        setScanResult(result)
        stopScanning()

        // Check if biometric verification is required
        const requiresBiometric = await checkBiometricRequirement(result.data.ticketId)
        setBiometricRequired(requiresBiometric)

        if (!requiresBiometric) {
          validateTicket(result.data.ticketId, result.data)
        }
      }
    } catch (error) {
      console.error("QR scan error:", error)
    }
  }

  const checkBiometricRequirement = async (ticketId: string): Promise<boolean> => {
    // In a real implementation, you would check the ticket's security level
    // For now, we'll require biometric for all tickets
    return true
  }

  const handleBiometricCapture = async () => {
    if (!scanResult?.data) return

    try {
      setValidating(true)

      // Start camera for biometric capture
      const stream = await BiometricService.startCamera()
      if (!stream || !videoRef.current) {
        throw new Error("Failed to start camera for biometric capture")
      }

      videoRef.current.srcObject = stream
      await videoRef.current.play()

      // Wait a moment for the camera to stabilize
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Capture biometric data
      const biometricResult = await BiometricService.processForTicketValidation(videoRef.current)

      if (biometricResult.success && biometricResult.biometricData) {
        await validateTicket(scanResult.data.ticketId, scanResult.data, biometricResult.biometricData.hash)
      } else {
        Alert.alert("Biometric Capture Failed", biometricResult.error || "Please try again")
      }
    } catch (error) {
      console.error("Biometric capture error:", error)
      Alert.alert("Error", "Failed to capture biometric data")
    } finally {
      setValidating(false)
      BiometricService.stopCamera()
    }
  }

  const validateTicket = async (ticketId: string, qrData: any, biometricHash?: string) => {
    try {
      setValidating(true)

      const result = await TicketService.validateTicket(ticketId, qrData, biometricHash)

      if (result.success) {
        Alert.alert(
          "Ticket Valid! ✅",
          `${result.message}\n\nTicket: ${ticketId}\nEvent: ${result.ticket?.eventName}`,
          [
            {
              text: "Scan Another",
              onPress: () => {
                setScanResult(null)
                setBiometricRequired(false)
                startScanning()
              },
            },
            {
              text: "Done",
              onPress: () => navigation.goBack(),
            },
          ],
        )
      } else {
        Alert.alert("Invalid Ticket ❌", result.error || result.message, [
          {
            text: "Try Again",
            onPress: () => {
              setScanResult(null)
              setBiometricRequired(false)
              startScanning()
            },
          },
        ])
      }
    } catch (error) {
      console.error("Ticket validation error:", error)
      Alert.alert("Error", "Failed to validate ticket")
    } finally {
      setValidating(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setValidating(true)
      const result = await QRCodeService.scanFromFile(file)

      if (result.success && result.data) {
        setScanResult(result)
        const requiresBiometric = await checkBiometricRequirement(result.data.ticketId)
        setBiometricRequired(requiresBiometric)

        if (!requiresBiometric) {
          await validateTicket(result.data.ticketId, result.data)
        }
      } else {
        Alert.alert("Scan Failed", result.error || "No QR code found in image")
      }
    } catch (error) {
      console.error("File upload error:", error)
      Alert.alert("Error", "Failed to scan uploaded image")
    } finally {
      setValidating(false)
    }
  }

  if (cameraPermission === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Requesting camera permission...</Text>
      </View>
    )
  }

  if (cameraPermission === false) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="camera-off" size={64} color="#666" />
        <Text style={styles.errorText}>Camera permission denied</Text>
        <Text style={styles.errorSubtext}>Please enable camera access to scan QR codes</Text>
        <TouchableOpacity style={styles.retryButton} onPress={requestCameraPermission}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Camera View */}
      <View style={styles.cameraContainer}>
        <video ref={videoRef} style={styles.camera} autoPlay playsInline muted />

        {/* Scanning Overlay */}
        {isScanning && (
          <View style={styles.scanningOverlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.scanningText}>Position QR code within the frame</Text>
          </View>
        )}

        {/* QR Code Found Overlay */}
        {scanResult && !biometricRequired && (
          <View style={styles.resultOverlay}>
            <View style={styles.resultCard}>
              <Ionicons name="qr-code" size={48} color="#4CAF50" />
              <Text style={styles.resultText}>QR Code Detected!</Text>
              <Text style={styles.resultSubtext}>Validating ticket...</Text>
            </View>
          </View>
        )}

        {/* Biometric Required Overlay */}
        {biometricRequired && (
          <View style={styles.resultOverlay}>
            <View style={styles.resultCard}>
              <Ionicons name="finger-print" size={48} color="#FF9800" />
              <Text style={styles.resultText}>Biometric Verification Required</Text>
              <Text style={styles.resultSubtext}>Please look at the camera for face verification</Text>
              <TouchableOpacity style={styles.biometricButton} onPress={handleBiometricCapture} disabled={validating}>
                {validating ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.biometricButtonText}>Capture Biometric</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlButton} onPress={isScanning ? stopScanning : startScanning}>
          <Ionicons name={isScanning ? "stop" : "play"} size={24} color="#FFFFFF" />
          <Text style={styles.controlButtonText}>{isScanning ? "Stop Scanning" : "Start Scanning"}</Text>
        </TouchableOpacity>

        {/* File Upload Option */}
        <View style={styles.uploadContainer}>
          <Text style={styles.uploadText}>Or upload QR code image:</Text>
          <input type="file" accept="image/*" onChange={handleFileUpload} style={styles.fileInput} />
        </View>
      </View>

      {/* Hidden canvas for image processing */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
  },
  loadingText: {
    color: "#FFFFFF",
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
    padding: 32,
  },
  errorText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 16,
    textAlign: "center",
  },
  errorSubtext: {
    color: "#CCCCCC",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#2196F3",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  cameraContainer: {
    flex: 1,
    position: "relative",
  },
  camera: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  } as any,
  scanningOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: "#2196F3",
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  scanningText: {
    color: "#FFFFFF",
    fontSize: 16,
    marginTop: 24,
    textAlign: "center",
  },
  resultOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  resultCard: {
    backgroundColor: "#1E1E1E",
    padding: 32,
    borderRadius: 16,
    alignItems: "center",
    marginHorizontal: 32,
  },
  resultText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 16,
    textAlign: "center",
  },
  resultSubtext: {
    color: "#CCCCCC",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  biometricButton: {
    backgroundColor: "#FF9800",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  biometricButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  controls: {
    backgroundColor: "#1E1E1E",
    padding: 16,
  },
  controlButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  controlButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  uploadContainer: {
    alignItems: "center",
  },
  uploadText: {
    color: "#CCCCCC",
    fontSize: 14,
    marginBottom: 8,
  },
  fileInput: {
    color: "#FFFFFF",
    backgroundColor: "#333",
    padding: 8,
    borderRadius: 4,
    border: "1px solid #555",
  } as any,
})

export default TicketScannerScreen
