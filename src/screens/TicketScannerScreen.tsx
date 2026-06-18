"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Image, Modal } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useCompatNavigation } from "../utils/compatNavigation"
import { useRouter } from "../utils/URLRouter"

import { useAuth } from "../contexts/AuthContext"
import TicketService from "../services/TicketService"

const TicketScannerScreen: React.FC = () => {
  const navigation = useCompatNavigation()
  const { currentPath } = useRouter()
  const { user } = useAuth()

  const pathParts = currentPath.split('/').filter(Boolean)
  const eventId = pathParts[2]
  const eventName = "Event"
  const [scanning, setScanning] = useState(false)
  const [validating, setValidating] = useState(false)
  const [scanHistory, setScanHistory] = useState<Array<{ ticketId: string; status: string; time: string; reason?: string }>>([])
  const [hasCamera, setHasCamera] = useState(true)
  const scannerRef = useRef<any>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Load html5-qrcode from CDN (avoids Metro bundler issues with Node.js dependencies)
  const loadHtml5Qrcode = useCallback(async () => {
    const win = window as any
    if (win.Html5Qrcode) return win.Html5Qrcode
    
    return new Promise((resolve, reject) => {
      const script = document.createElement("script")
      script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"
      script.async = true
      script.onload = () => resolve(win.Html5Qrcode)
      script.onerror = () => reject(new Error("Failed to load QR scanner library"))
      document.body.appendChild(script)
    })
  }, [])
  
  // Photo verification state
  const [showPhotoVerification, setShowPhotoVerification] = useState(false)
  const [pendingTicketDocId, setPendingTicketDocId] = useState<string | null>(null)
  const [buyerPhotoUrl, setBuyerPhotoUrl] = useState<string>("")
  const [buyerName, setBuyerName] = useState<string>("")

  useEffect(() => {
    if (!user) {
      Alert.alert("Access Denied", "Please sign in to access this page")
      navigation.goBack()
    }
  }, [user, navigation])

  // Clean up scanner on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try { scannerRef.current.stop() } catch {}
      }
    }
  }, [])

  const startScanner = async () => {
    try {
      // Load html5-qrcode from CDN at runtime (avoids Metro bundler compatibility issues)
      const Html5Qrcode = await loadHtml5Qrcode()
      
      const scanner = new Html5Qrcode("qr-reader")
      scannerRef.current = scanner
      
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText: string) => {
          scanner.stop().catch(() => {})
          setScanning(false)
          
          // Extract ticket ID from QR data
          let ticketId = decodedText
          try {
            const parsed = JSON.parse(decodedText)
            ticketId = parsed.id || decodedText
          } catch {}
          handleValidateTicket(ticketId)
        },
        () => {} // ignore scan failure
      )
      
      setScanning(true)
      setHasCamera(true)
    } catch (error: any) {
      console.error("Camera error:", error)
      setHasCamera(false)
      setScanning(false)
      Alert.alert(
        "Camera Error",
        error?.message?.includes("permission") 
          ? "Camera permission denied. Please allow camera access."
          : error?.message || "Could not access camera. Please use a device with a camera."
      )
    }
  }

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
    setScanning(false)
  }

  const handleScanTicket = async () => {
    if (scanning) {
      await stopScanner()
    } else {
      await startScanner()
    }
  }

  const handleValidateTicket = async (qrCodeData: string) => {
    await stopScanner()
    
    if (!user) return

    try {
      setValidating(true)
      console.log("Validating ticket:", qrCodeData)

      const result = await TicketService.validateTicket(qrCodeData, user.id, eventName || "Event Entrance")
      
      setScanHistory((prev) => [{
        ticketId: qrCodeData.substring(0, 12) + "...",
        status: result.success ? "Valid" : "Invalid",
        time: new Date().toLocaleTimeString(),
        reason: result.reason || (result.success ? "Valid ticket" : "Validation failed")
      }, ...prev].slice(0, 10))

      if (result.success) {
        if (result.needsPhotoVerification && result.buyerPhotoUrl && result.ticketDocId) {
          setPendingTicketDocId(result.ticketDocId)
          setBuyerPhotoUrl(result.buyerPhotoUrl)
          setBuyerName(result.buyerName || "Ticket Buyer")
          setShowPhotoVerification(true)
          setValidating(false)
          return
        }
        Alert.alert("✅ Entry Granted", `Ticket is valid for ${eventName}. Entry granted.`, [{ text: "OK" }])
      } else {
        Alert.alert("❌ Entry Denied", `Validation failed: ${result.reason}`, [{ text: "OK" }])
      }
    } catch (error: any) {
      console.error("Validation error:", error)
      setScanHistory((prev) => [{
        ticketId: qrCodeData.substring(0, 12) + "...",
        status: "Invalid",
        time: new Date().toLocaleTimeString(),
        reason: error?.message || "Failed to validate ticket"
      }, ...prev].slice(0, 10))
      Alert.alert("Error", error?.message || "Failed to validate ticket")
    } finally {
      setValidating(false)
    }
  }

  const handlePhotoConfirm = async (confirmed: boolean) => {
    if (!user || !pendingTicketDocId) {
      setShowPhotoVerification(false)
      return
    }

    setShowPhotoVerification(false)
    setValidating(true)

    try {
      if (confirmed) {
        const result = await TicketService.confirmTicketUsage(
          pendingTicketDocId, user.id, eventName || "Event Entrance", eventId
        )
        if (result.success) {
          Alert.alert("✅ Entry Granted", `Photo verified! Ticket confirmed for ${buyerName}. Entry granted.`, [{ text: "OK" }])
        } else {
          Alert.alert("❌ Entry Denied", `Failed to confirm ticket: ${result.reason}`, [{ text: "OK" }])
        }
      } else {
        setScanHistory((prev) => [{
          ticketId: pendingTicketDocId.substring(0, 12) + "...",
          status: "Invalid",
          time: new Date().toLocaleTimeString(),
          reason: "Photo verification denied"
        }, ...prev].slice(0, 10))
        Alert.alert("❌ Entry Denied", "The person presenting the ticket does not match the photo on file.", [{ text: "OK" }])
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
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Ticket Scanner</Text>
          {eventName && <Text style={styles.headerSubtitle}>{eventName}</Text>}
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.scannerArea}>
          {scanning ? (
            <View style={styles.scannerContainer}>
              <div id="qr-reader" style={{ width: "100%", minHeight: 300 }} />
              <TouchableOpacity style={styles.stopCameraButton} onPress={() => stopScanner()}>
                <Text style={styles.stopCameraButtonText}>Stop Scanning</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Ionicons name="qr-code-outline" size={120} color="#2196F3" />
              <Text style={styles.scannerText}>
                Point camera at ticket QR code to validate
              </Text>
            </>
          )}
        </View>

        <View style={styles.instructions}>
          <Text style={styles.instructionTitle}>How to Validate:</Text>
          <Text style={styles.instructionText}>
            1. Tap Scan QR to activate camera{"\n"}
            2. Point camera at ticket QR code{"\n"}
            3. System automatically validates{"\n"}
            4. Grant or deny entry based on result
          </Text>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.scanButton, (scanning || validating) && styles.scanButtonDisabled]}
            onPress={handleScanTicket}
            disabled={validating}
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

        {scanHistory.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>Recent Scans</Text>
            {scanHistory.map((scan, index) => (
              <View key={index} style={styles.historyItem}>
                <Text style={styles.historyTime}>{scan.time}</Text>
                <Text style={styles.historyId}>{scan.ticketId}</Text>
                <View style={[styles.historyStatus, scan.status === "Valid" ? styles.historyValid : styles.historyInvalid]}>
                  <Text style={[styles.historyStatusText, scan.status === "Valid" ? styles.historyValidText : styles.historyInvalidText]}>
                    {scan.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={showPhotoVerification} transparent animationType="fade" onRequestClose={() => setShowPhotoVerification(false)}>
        <View style={styles.photoVerificationOverlay}>
          <View style={styles.photoVerificationContent}>
            <Text style={styles.photoVerificationTitle}>Photo Verification Required</Text>
            <Text style={styles.photoVerificationSubtitle}>Compare the photo below with the person presenting the ticket</Text>
            <View style={styles.photoContainer}>
              {buyerPhotoUrl ? (
                <Image source={{ uri: buyerPhotoUrl }} style={styles.buyerPhoto} resizeMode="cover" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="person" size={60} color="#666" />
                </View>
              )}
              <Text style={styles.buyerNameText}>{buyerName}</Text>
              <Text style={styles.buyerLabel}>Ticket Buyer</Text>
            </View>
            <Text style={styles.verificationQuestion}>Does the person presenting the ticket match this photo?</Text>
            <View style={styles.verificationButtons}>
              <TouchableOpacity style={styles.denyButton} onPress={() => handlePhotoConfirm(false)}>
                <Ionicons name="close-circle" size={24} color="#FFFFFF" />
                <Text style={styles.denyButtonText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={() => handlePhotoConfirm(true)}>
                <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
                <Text style={styles.confirmButtonText}>Yes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingTop: 50 },
  headerTextContainer: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: "#FFFFFF" },
  headerSubtitle: { fontSize: 14, color: "#00D4FF", marginTop: 2 },
  content: { flex: 1, padding: 16 },
  contentContainer: { paddingBottom: 40 },
  scannerArea: { alignItems: "center", justifyContent: "center", backgroundColor: "#1E1E1E", borderRadius: 12, overflow: "hidden", minHeight: 200, marginBottom: 24 },
  scannerContainer: { width: "100%" },
  stopCameraButton: { backgroundColor: "#FF6B6B", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, alignSelf: "center", margin: 16 },
  stopCameraButtonText: { color: "#FFFFFF", fontWeight: "bold" },
  scannerText: { fontSize: 16, color: "#DDDDDD", textAlign: "center", marginTop: 16, lineHeight: 24 },
  instructions: { backgroundColor: "#1E1E1E", borderRadius: 12, padding: 16, marginBottom: 24 },
  instructionTitle: { fontSize: 18, fontWeight: "bold", color: "#FFFFFF", marginBottom: 12 },
  instructionText: { fontSize: 14, color: "#DDDDDD", lineHeight: 22 },
  buttonRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  scanButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#2196F3", padding: 16, borderRadius: 8 },
  scanButtonDisabled: { backgroundColor: "#666666" },
  scanButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "bold", marginLeft: 8 },
  historySection: { backgroundColor: "#1E1E1E", borderRadius: 12, padding: 16, marginBottom: 24 },
  historyTitle: { fontSize: 16, fontWeight: "bold", color: "#FFFFFF", marginBottom: 12 },
  historyItem: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#333333" },
  historyTime: { color: "#888888", fontSize: 12, width: 80 },
  historyId: { color: "#FFFFFF", fontSize: 12, flex: 1, fontFamily: "monospace" },
  historyStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  historyValid: { backgroundColor: "#1B5E20" },
  historyInvalid: { backgroundColor: "#B71C1C" },
  historyStatusText: { fontSize: 11, fontWeight: "bold" },
  historyValidText: { color: "#4CAF50" },
  historyInvalidText: { color: "#FF6B6B" },
  photoVerificationOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.9)", justifyContent: "center", alignItems: "center", padding: 20 },
  photoVerificationContent: { backgroundColor: "#1a1a1a", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, alignItems: "center" },
  photoVerificationTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "bold", textAlign: "center", marginBottom: 8 },
  photoVerificationSubtitle: { color: "#888888", fontSize: 14, textAlign: "center", marginBottom: 20 },
  photoContainer: { alignItems: "center", marginBottom: 20 },
  buyerPhoto: { width: 180, height: 180, borderRadius: 90, borderWidth: 3, borderColor: "#00D4FF", marginBottom: 12 },
  photoPlaceholder: { width: 180, height: 180, borderRadius: 90, backgroundColor: "#333", alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#666", marginBottom: 12 },
  buyerNameText: { color: "#FFFFFF", fontSize: 18, fontWeight: "bold", marginBottom: 4 },
  buyerLabel: { color: "#888888", fontSize: 12 },
  verificationQuestion: { color: "#FFD700", fontSize: 16, fontWeight: "600", textAlign: "center", marginBottom: 20 },
  verificationButtons: { flexDirection: "row", gap: 16, marginBottom: 16 },
  denyButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#FF4444", paddingVertical: 14, borderRadius: 8 },
  denyButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "bold", marginLeft: 8 },
  confirmButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#4CAF50", paddingVertical: 14, borderRadius: 8 },
  confirmButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "bold", marginLeft: 8 },
})

export default TicketScannerScreen