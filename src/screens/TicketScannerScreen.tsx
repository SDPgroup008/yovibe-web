"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Image, Modal } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useCompatNavigation } from "../utils/compatNavigation"
import { useRouter } from "../utils/URLRouter"

import { useAuth } from "../contexts/AuthContext"
import TicketService from "../services/TicketService"

type TicketScannerScreenProps = {
  eventId?: string
  eventName?: string
  isTokenAuth?: boolean
}

const TicketScannerScreen: React.FC<TicketScannerScreenProps> = ({
  eventId: propEventId,
  eventName: propEventName,
  isTokenAuth = false
}) => {
  const navigation = useCompatNavigation()
  const { currentPath } = useRouter()
  const { user } = useAuth()

  const pathParts = currentPath.split('/').filter(Boolean)
  const eventId = propEventId || pathParts[2] || ""
  const eventName = propEventName || "Event"

  const [scanning, setScanning] = useState(false)
  const [validating, setValidating] = useState(false)
  const [scanHistory, setScanHistory] = useState<Array<{ ticketId: string; status: string; time: string; reason?: string }>>([])
  
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const hasCheckedAuth = useRef(false)
  
  // Photo verification state
  const [showPhotoVerification, setShowPhotoVerification] = useState(false)
  const [pendingTicketDocId, setPendingTicketDocId] = useState<string | null>(null)
  const [buyerPhotoUrl, setBuyerPhotoUrl] = useState<string>("")
  const [buyerName, setBuyerName] = useState<string>("")

  // Re-entry state
  const [showReentryModal, setShowReentryModal] = useState(false)
  const [reentryInfo, setReentryInfo] = useState<{ buyerName: string; grantedByName: string; grantedAt: string } | null>(null)

  // Auth check - only for non-token auth
  useEffect(() => {
    if (!isTokenAuth && !hasCheckedAuth.current) {
      hasCheckedAuth.current = true
      if (!user) {
        Alert.alert("Access Denied", "Please sign in to access this page")
        navigation.goBack()
      }
    }
  }, [user, navigation, isTokenAuth])

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    videoRef.current = null
    canvasRef.current = null
  }, [])

  const [libLoaded, setLibLoaded] = useState(false)

  useEffect(() => {
    // Load jsQR from CDN
    if (typeof window !== "undefined" && !(window as any).jsQR) {
      const script = document.createElement("script")
      script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"
      script.async = true
      script.onload = () => setLibLoaded(true)
      document.body.appendChild(script)
    } else if (typeof window !== "undefined" && (window as any).jsQR) {
      setLibLoaded(true)
    }
  }, [])

  const scanLoop = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    const jsQR = (window as any).jsQR
    
    if (!jsQR) {
      rafRef.current = requestAnimationFrame(scanLoop)
      return
    }
    
    if (video.readyState !== video.HAVE_ENOUGH_DATA || video.videoWidth === 0) {
      rafRef.current = requestAnimationFrame(scanLoop)
      return
    }
    
    // Use smaller scan region for performance - center of frame
    const scanW = Math.min(video.videoWidth, 320)
    const scanH = Math.min(video.videoHeight, 320)
    const offX = Math.max(0, (video.videoWidth - scanW) / 2)
    const offY = Math.max(0, (video.videoHeight - scanH) / 2)
    
    canvas.width = scanW
    canvas.height = scanH
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return
    ctx.drawImage(video, offX, offY, scanW, scanH, 0, 0, scanW, scanH)
    
    const imageData = ctx.getImageData(0, 0, scanW, scanH)
    const code = jsQR(imageData.data, scanW, scanH, { inversionAttempts: "dontInvert" })
    
    if (code && code.data) {
      onQrDetected(code.data)
      return
    }
    
    rafRef.current = requestAnimationFrame(scanLoop)
  }, [])

  const onQrDetected = useCallback((decodedText: string) => {
    stopCamera()
    setScanning(false)
    let ticketId = decodedText
    try { const p = JSON.parse(decodedText); ticketId = p.id || decodedText } catch {}
    handleValidateTicket(ticketId)
  }, [stopCamera])

  const startScanner = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } }
      })
      streamRef.current = stream

      // Use a short timeout to ensure DOM elements are created before accessing refs
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => {
            videoRef.current!.play().catch(() => {})
            scanLoop()
          }
          // Ensure video plays even if onloadedmetadata doesn't fire
          videoRef.current.oncanplay = () => {
            videoRef.current!.play().catch(() => {})
          }
        }
      }, 100)
      setScanning(true)
    } catch (error: any) {
      console.error("Camera error:", error)
      setScanning(false)
      Alert.alert("Camera Error", error?.message?.includes("permission") ? "Permission denied." : "Could not start camera.")
    }
  }, [scanLoop])

  const handleScanTicket = useCallback(() => {
    if (scanning) { stopCamera(); setScanning(false) }
    else { startScanner() }
  }, [scanning, stopCamera, startScanner])

  const handleValidateTicket = useCallback(async (qrCodeData: string) => {
    stopCamera()
    if (!user && !isTokenAuth) return

    try {
      setValidating(true)
      const result = await TicketService.validateTicket(qrCodeData, user?.id || "", eventName || "Event Entrance")
      
      setScanHistory((prev) => [{
        ticketId: qrCodeData.substring(0, 12) + "...",
        status: result.success ? "Valid" : "Invalid",
        time: new Date().toLocaleTimeString(),
        reason: result.reason || (result.success ? "Valid ticket" : "Validation failed")
      }, ...prev].slice(0, 10))

      if (result.success) {
        if (result.isReentry) {
          setReentryInfo({
            buyerName: result.buyerName || "Attendee",
            grantedByName: result.reentryGrantedByName || "Organiser",
            grantedAt: result.reentryGrantedAt || new Date().toISOString(),
          })
          setShowReentryModal(true)
          setValidating(false)
          return
        }
        if (result.needsPhotoVerification && result.buyerPhotoUrl && result.ticketDocId) {
          setPendingTicketDocId(result.ticketDocId)
          setBuyerPhotoUrl(result.buyerPhotoUrl)
          setBuyerName(result.buyerName || "Ticket Buyer")
          setShowPhotoVerification(true)
          setValidating(false)
          return
        }
        Alert.alert("✅ Entry Granted", `Ticket is valid. Entry granted.`, [{ text: "OK" }])
      } else {
        Alert.alert("❌ Entry Denied", `Validation failed: ${result.reason}`, [{ text: "OK" }])
      }
    } catch (error: any) {
      setScanHistory((prev) => [{ ticketId: qrCodeData.substring(0, 12) + "...", status: "Invalid", time: new Date().toLocaleTimeString(), reason: error?.message || "Failed" }, ...prev].slice(0, 10))
      Alert.alert("Error", error?.message || "Failed to validate ticket")
    } finally {
      setValidating(false)
    }
  }, [user, isTokenAuth, eventName, stopCamera])

  const handlePhotoConfirm = useCallback(async (confirmed: boolean) => {
    if ((!user && !isTokenAuth) || !pendingTicketDocId) { setShowPhotoVerification(false); return }
    setShowPhotoVerification(false)
    setValidating(true)
    try {
      if (confirmed) {
        const r = await TicketService.confirmTicketUsage(pendingTicketDocId, user?.id || "", eventName || "Event Entrance", eventId)
        if (r.success) Alert.alert("✅ Entry Granted", `Photo verified for ${buyerName}.`, [{ text: "OK" }])
        else Alert.alert("❌ Entry Denied", r.reason || "Failed to confirm", [{ text: "OK" }])
      } else {
        Alert.alert("❌ Entry Denied", "The person does not match the photo on file.", [{ text: "OK" }])
      }
    } catch (e: any) {
      Alert.alert("Error", "Failed to process photo verification")
    } finally {
      setPendingTicketDocId(null); setBuyerPhotoUrl(""); setBuyerName(""); setValidating(false)
    }
  }, [user, isTokenAuth, eventName, eventId, buyerName])

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
              <div
                ref={(el) => {
                  if (el && !videoRef.current) {
                    const video = document.createElement("video")
                    video.setAttribute("playsinline", "")
                    video.setAttribute("muted", "")
                    video.style.cssText = "width:100%;height:260px;object-fit:cover;border-radius:8px;display:block;background:#000"
                    el.appendChild(video)
                    videoRef.current = video

                    const canvas = document.createElement("canvas")
                    canvas.style.display = "none"
                    el.appendChild(canvas)
                    canvasRef.current = canvas
                  } else if (!el) {
                    videoRef.current = null
                    canvasRef.current = null
                  }
                }}
                style={{ width: "100%" }}
              />
              <TouchableOpacity style={styles.stopCameraButton} onPress={() => { stopCamera(); setScanning(false) }}>
                <Text style={styles.stopCameraButtonText}>Stop Scanning</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Ionicons name="qr-code-outline" size={120} color="#2196F3" />
              <Text style={styles.scannerText}>Point camera at ticket QR code to validate</Text>
            </>
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

      {/* Re-entry Modal */}
      <Modal visible={showReentryModal} transparent animationType="fade" onRequestClose={() => setShowReentryModal(false)}>
        <View style={styles.overlay}>
          <View style={[styles.modalBox, { borderWidth: 2, borderColor: "#F59E0B" }]}>
            <View style={{ backgroundColor: "rgba(245,158,11,0.15)", borderRadius: 50, padding: 16, marginBottom: 16 }}>
              <Ionicons name="refresh-circle" size={48} color="#F59E0B" />
            </View>
            <Text style={[styles.modalTitle, { color: "#F59E0B" }]}>Re-entry Authorised</Text>
            <Text style={[styles.modalSub, { marginBottom: 8 }]}>This attendee was granted permission to leave and return.</Text>
            <View style={{ backgroundColor: "#1a1a1a", borderRadius: 10, padding: 14, width: "100%", marginBottom: 20, gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: "#888", fontSize: 13 }}>Attendee</Text>
                <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "700" }}>{reentryInfo?.buyerName}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: "#888", fontSize: 13 }}>Authorised by</Text>
                <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "700" }}>{reentryInfo?.grantedByName}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: "#888", fontSize: 13 }}>Left at</Text>
                <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "700" }}>
                  {reentryInfo?.grantedAt ? new Date(reentryInfo.grantedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--"}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={{ backgroundColor: "#F59E0B", paddingVertical: 14, paddingHorizontal: 32, borderRadius: 8, width: "100%", alignItems: "center" }}
              onPress={() => { setShowReentryModal(false); setReentryInfo(null) }}
            >
              <Text style={{ color: "#000", fontWeight: "bold", fontSize: 16 }}>Confirm Re-entry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Photo Verification Modal */}
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
  scannerContainer: { width: "100%", overflow: "hidden", borderRadius: 8, backgroundColor: "#000" },
  scannerText: { fontSize: 16, color: "#DDD", textAlign: "center", marginTop: 16, lineHeight: 24 },
  stopCameraButton: { backgroundColor: "#FF6B6B", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, alignSelf: "center", margin: 16 },
  stopCameraButtonText: { color: "#FFF", fontWeight: "bold" },
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