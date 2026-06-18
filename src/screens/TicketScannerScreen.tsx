"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
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
  const scannerRef = useRef<any>(null)
  const scriptLoadedRef = useRef(false)
  
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
      stopScanner()
    }
  }, [])

  const ensureScriptLoaded = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (scriptLoadedRef.current) return resolve()
      const win = window as any
      if (win.Html5Qrcode) {
        scriptLoadedRef.current = true
        return resolve()
      }
      const script = document.createElement("script")
      script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"
      script.async = true
      script.onload = () => {
        scriptLoadedRef.current = true
        resolve()
      }
      script.onerror = () => reject(new Error("Failed to load QR scanner library"))
      document.body.appendChild(script)
    })
  }

  const stopScanner = () => {
    if (scannerRef.current) {
      try { scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
  }

  const startScanner = async () => {
    try {
      await ensureScriptLoaded()
      
      const win = window as any
      const Html5Qrcode = win.Html5Qrcode
      
      // Wait briefly for the div to be in DOM
      await new Promise(r => setTimeout(r, 50))
      
      const scanner = new Html5Qrcode("qr-reader")
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          stopScanner()
          setScanning(false)
          let ticketId = decodedText
          try { const p = JSON.parse(decodedText); ticketId = p.id || decodedText } catch {}
          handleValidateTicket(ticketId)
        },
        () => {}
      )
      
      setScanning(true)
    } catch (error: any) {
      console.error("Scanner error:", error)
      stopScanner()
      setScanning(false)
      Alert.alert("Scanner Error", error?.message || "Failed to start camera. Please ensure camera access is allowed.")
    }
  }

  const handleScanTicket = () => {
    if (scanning) {
      stopScanner()
      setScanning(false)
    } else {
      startScanner()
    }
  }

  const handleValidateTicket = async (qrCodeData: string) => {
    stopScanner()
    if (!user) return

    try {
      setValidating(true)

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
      setScanHistory((prev) => [{
        ticketId: qrCodeData.substring(0, 12) + "...", status: "Invalid",
        time: new Date().toLocaleTimeString(), reason: error?.message || "Failed"
      }, ...prev].slice(0, 10))
      Alert.alert("Error", error?.message || "Failed to validate ticket")
    } finally {
      setValidating(false)
    }
  }

  const handlePhotoConfirm = async (confirmed: boolean) => {
    if (!user || !pendingTicketDocId) { setShowPhotoVerification(false); return }
    setShowPhotoVerification(false)
    setValidating(true)
    try {
      if (confirmed) {
        const r = await TicketService.confirmTicketUsage(pendingTicketDocId, user.id, eventName || "Event Entrance", eventId)
        if (r.success) Alert.alert("✅ Entry Granted", `Photo verified! Confirmed for ${buyerName}.`, [{ text: "OK" }])
        else Alert.alert("❌ Entry Denied", r.reason || "Failed to confirm", [{ text: "OK" }])
      } else {
        Alert.alert("❌ Entry Denied", "The person does not match the photo on file.", [{ text: "OK" }])
      }
    } catch (e: any) {
      Alert.alert("Error", "Failed to process photo verification")
    } finally {
      setPendingTicketDocId(null); setBuyerPhotoUrl(""); setBuyerName(""); setValidating(false)
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
          <div id="qr-reader" style={{ width: scanning ? "100%" : 0, height: scanning ? 300 : 0, overflow: "hidden" }} />
          {!scanning && (
            <>
              <Ionicons name="qr-code-outline" size={120} color="#2196F3" />
              <Text style={styles.scannerText}>Point camera at ticket QR code to validate</Text>
            </>
          )}
          {scanning && (
            <TouchableOpacity style={styles.stopCameraButton} onPress={() => { stopScanner(); setScanning(false) }}>
              <Text style={styles.stopCameraButtonText}>Stop Scanning</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.instructions}>
          <Text style={styles.instructionTitle}>How to Validate:</Text>
          <Text style={styles.instructionText}>1. Tap Scan QR to activate camera{"\n"}2. Point camera at ticket QR code{"\n"}3. System automatically validates{"\n"}4. Grant or deny entry</Text>
        </View>

        <TouchableOpacity style={[styles.scanButton, (scanning || validating) && styles.scanButtonDisabled]} onPress={handleScanTicket} disabled={validating}>
          {scanning || validating ? <ActivityIndicator color="#FFFFFF" /> : <><Ionicons name="scan" size={24} color="#FFFFFF" /><Text style={styles.scanButtonText}>Scan QR</Text></>}
        </TouchableOpacity>

        {scanHistory.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>Recent Scans</Text>
            {scanHistory.map((scan, i) => (
              <View key={i} style={styles.historyItem}>
                <Text style={styles.historyTime}>{scan.time}</Text>
                <Text style={styles.historyId}>{scan.ticketId}</Text>
                <View style={[styles.historyStatus, scan.status === "Valid" ? styles.historyValid : styles.historyInvalid]}>
                  <Text style={[styles.historyStatusText, scan.status === "Valid" ? styles.historyValidText : styles.historyInvalidText]}>{scan.status}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={showPhotoVerification} transparent animationType="fade" onRequestClose={() => setShowPhotoVerification(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Photo Verification Required</Text>
            <Text style={styles.modalSub}>Compare the photo below with the person presenting the ticket</Text>
            <View style={styles.photoWrap}>
              {buyerPhotoUrl ? <Image source={{ uri: buyerPhotoUrl }} style={styles.photo} resizeMode="cover" /> : <View style={styles.photoPlace}><Ionicons name="person" size={60} color="#666" /></View>}
              <Text style={styles.nameText}>{buyerName}</Text>
              <Text style={styles.labelText}>Ticket Buyer</Text>
            </View>
            <Text style={styles.questionText}>Does the person match this photo?</Text>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.denyBtn} onPress={() => handlePhotoConfirm(false)}>
                <Ionicons name="close-circle" size={24} color="#FFF" /><Text style={styles.btnText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={() => handlePhotoConfirm(true)}>
                <Ionicons name="checkmark-circle" size={24} color="#FFF" /><Text style={styles.btnText}>Yes</Text>
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
  headerTitle: { fontSize: 20, fontWeight: "bold", color: "#FFF" },
  headerSubtitle: { fontSize: 14, color: "#00D4FF", marginTop: 2 },
  content: { flex: 1, padding: 16 },
  contentContainer: { paddingBottom: 40 },
  scannerArea: { alignItems: "center", justifyContent: "center", backgroundColor: "#1E1E1E", borderRadius: 12, overflow: "hidden", minHeight: 200, marginBottom: 24 },
  stopCameraButton: { backgroundColor: "#FF6B6B", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, marginTop: 16 },
  stopCameraButtonText: { color: "#FFF", fontWeight: "bold" },
  scannerText: { fontSize: 16, color: "#DDD", textAlign: "center", marginTop: 16, lineHeight: 24 },
  instructions: { backgroundColor: "#1E1E1E", borderRadius: 12, padding: 16, marginBottom: 24 },
  instructionTitle: { fontSize: 18, fontWeight: "bold", color: "#FFF", marginBottom: 12 },
  instructionText: { fontSize: 14, color: "#DDD", lineHeight: 22 },
  scanButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#2196F3", padding: 16, borderRadius: 8, marginBottom: 24 },
  scanButtonDisabled: { backgroundColor: "#666" },
  scanButtonText: { color: "#FFF", fontSize: 16, fontWeight: "bold", marginLeft: 8 },
  historySection: { backgroundColor: "#1E1E1E", borderRadius: 12, padding: 16, marginBottom: 24 },
  historyTitle: { fontSize: 16, fontWeight: "bold", color: "#FFF", marginBottom: 12 },
  historyItem: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#333" },
  historyTime: { color: "#888", fontSize: 12, width: 80 },
  historyId: { color: "#FFF", fontSize: 12, flex: 1, fontFamily: "monospace" },
  historyStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  historyValid: { backgroundColor: "#1B5E20" }, historyInvalid: { backgroundColor: "#B71C1C" },
  historyStatusText: { fontSize: 11, fontWeight: "bold" }, historyValidText: { color: "#4CAF50" }, historyInvalidText: { color: "#FF6B6B" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalBox: { backgroundColor: "#1a1a1a", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, alignItems: "center" },
  modalTitle: { color: "#FFF", fontSize: 22, fontWeight: "bold", textAlign: "center", marginBottom: 8 },
  modalSub: { color: "#888", fontSize: 14, textAlign: "center", marginBottom: 20 },
  photoWrap: { alignItems: "center", marginBottom: 20 },
  photo: { width: 180, height: 180, borderRadius: 90, borderWidth: 3, borderColor: "#00D4FF", marginBottom: 12 },
  photoPlace: { width: 180, height: 180, borderRadius: 90, backgroundColor: "#333", alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#666", marginBottom: 12 },
  nameText: { color: "#FFF", fontSize: 18, fontWeight: "bold", marginBottom: 4 },
  labelText: { color: "#888", fontSize: 12 },
  questionText: { color: "#FFD700", fontSize: 16, fontWeight: "600", textAlign: "center", marginBottom: 20 },
  btnRow: { flexDirection: "row", gap: 16, marginBottom: 16 },
  denyBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#FF4444", paddingVertical: 14, borderRadius: 8 },
  confirmBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#4CAF50", paddingVertical: 14, borderRadius: 8 },
  btnText: { color: "#FFF", fontSize: 16, fontWeight: "bold", marginLeft: 8 },
})

export default TicketScannerScreen