"use client"

import React, { useEffect, useRef, useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../services/FirebaseService"
import VibeAnalysisService from "../services/VibeAnalysisService"
import { useAuth } from "../contexts/AuthContext"
import type { VibeImage } from "../models/VibeImage"

interface AddVibeScreenProps {
  navigation: any
  route: {
    params: {
      venueId: string
      venueName: string
    }
  }
}

const AddVibeScreen: React.FC<AddVibeScreenProps> = ({ navigation, route }) => {
  const { venueId, venueName } = route.params
  const { user } = useAuth()
  const [image, setImage] = useState<string | null>(null) // data URL or object URL
  const [analyzing, setAnalyzing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<{
    vibeRating: number
    analysisData: any
  } | null>(null)

  // Web camera modal state
  const [webCameraOpen, setWebCameraOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Helper: convert dataURL to Blob
  const dataURLToBlob = (dataURL: string) => {
    const parts = dataURL.split(",")
    const meta = parts[0]
    const base64 = parts[1]
    const mimeMatch = meta.match(/:(.*?);/)
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg"
    const binary = atob(base64)
    const len = binary.length
    const u8 = new Uint8Array(len)
    for (let i = 0; i < len; i++) u8[i] = binary.charCodeAt(i)
    return new Blob([u8], { type: mime })
  }

  // Capture image (mobile web / desktop)
  const captureImage = async () => {
    try {
      // Web path
    if (Platform.OS === "web") {
      // Runtime-safe check: ensure navigator exists, mediaDevices exists, and getUserMedia is callable
      if (
        typeof navigator !== "undefined" &&
        "mediaDevices" in navigator &&
        typeof (navigator as any).mediaDevices?.getUserMedia === "function"
      ) {
        await startWebCamera()
        return
      }

      // Fallback to file input (mobile/desktop)
      openFilePickerFallback()
      return
    }


      // Native web wrapper (if using react-native-web on mobile browsers, this branch won't run)
      // Fallback to file picker for non-web environments in this file
      openFilePickerFallback()
    } catch (error) {
      console.error("captureImage error:", error)
      Alert.alert("Error", "Failed to start camera. Check permissions.")
    }
  }

  // Start web camera and open overlay
  const startWebCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      setWebCameraOpen(true)
      // video element will be attached in useEffect
    } catch (err) {
      console.error("getUserMedia error:", err)
      // If permission denied or not available, fallback to file picker
      Alert.alert("Camera error", "Unable to access the camera on this device or permission denied.")
      openFilePickerFallback()
    }
  }

  // Stop web camera and close overlay
  const stopWebCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      try {
        // @ts-ignore
        videoRef.current.srcObject = null
      } catch (e) {
        // ignore
      }
      videoRef.current = null
    }
    setWebCameraOpen(false)
  }

  // Capture current frame from video to data URL
  const captureFrameFromVideo = () => {
    try {
      const video = videoRef.current
      if (!video) throw new Error("Video element not ready")
      const w = video.videoWidth || 1280
      const h = video.videoHeight || 720
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Canvas context not available")
      ctx.drawImage(video, 0, 0, w, h)
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9)
      setImage(dataUrl)
      setAnalysisResult(null)
    } catch (err) {
      console.error("captureFrameFromVideo error:", err)
      Alert.alert("Capture error", "Failed to capture image from camera.")
    } finally {
      stopWebCamera()
    }
  }

  // Web fallback: open hidden file input
  const openFilePickerFallback = () => {
    if (!fileInputRef.current) {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = "image/*"
      // mobile browsers honor capture attribute to open camera
      input.setAttribute("capture", "environment")
      input.style.display = "none"
      input.onchange = (ev: Event) => {
        const target = ev.target as HTMLInputElement
        const file = target.files && target.files[0]
        if (file) {
          const url = URL.createObjectURL(file)
          setImage(url)
          setAnalysisResult(null)
        }
        // cleanup
        if (input.parentNode) input.parentNode.removeChild(input)
        fileInputRef.current = null
      }
      document.body.appendChild(input)
      fileInputRef.current = input
    }
    fileInputRef.current.click()
  }

  // Attach stream to video element when webCameraOpen becomes true
  useEffect(() => {
    if (Platform.OS !== "web") return
    if (webCameraOpen && videoRef.current && streamRef.current) {
      // @ts-ignore
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {
        // autoplay might be blocked until user interacts; that's okay
      })
    }
    // cleanup handled by stopWebCamera
  }, [webCameraOpen])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      const overlayInput = fileInputRef.current
      if (overlayInput && overlayInput.parentNode) overlayInput.parentNode.removeChild(overlayInput)
      fileInputRef.current = null
    }
  }, [])

  const analyzeVibe = async () => {
    if (!image) {
      Alert.alert("Error", "Please capture an image first")
      return
    }

    setAnalyzing(true)
    try {
      // VibeAnalysisService should accept data URL or object URL; if it needs a Blob, convert here
      const result = await VibeAnalysisService.analyzeVibeImage(image)
      setAnalysisResult(result)
    } catch (error) {
      console.error("Error analyzing vibe:", error)
      Alert.alert("Error", "Failed to analyze vibe")
    } finally {
      setAnalyzing(false)
    }
  }

  const uploadVibe = async () => {
    if (!image || !analysisResult || !user) {
      Alert.alert("Error", "Please analyze the image first")
      return
    }

    setUploading(true)
    try {
      // If image is a data URL, convert to Blob for upload
      // inside uploadVibe
      let uploadTarget: Blob | string = image
      if (typeof image === "string" && image.startsWith("data:")) {
        uploadTarget = dataURLToBlob(image)
      } else if (typeof image === "string" && image.startsWith("blob:")) {
        const resp = await fetch(image)
        uploadTarget = await resp.blob()
      }

      // FirebaseService.uploadVibeImage should accept Blob or File; adapt if it expects a path
      const imageUrl = await FirebaseService.uploadVibeImage(uploadTarget as any);

      const vibeImageData: Omit<VibeImage, "id"> = {
        venueId,
        imageUrl,
        vibeRating: analysisResult.vibeRating,
        uploadedAt: new Date(),
        uploadedBy: user.id,
        analysisData: analysisResult.analysisData,
      }

      await FirebaseService.addVibeImage(vibeImageData)

      Alert.alert("Success", "Vibe image uploaded successfully!", [
        {
          text: "OK",
          onPress: () => {
            navigation.goBack()
          },
        },
      ])
    } catch (error) {
      console.error("Error uploading vibe:", error)
      Alert.alert("Error", "Failed to upload vibe image")
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Add Today's Vibe</Text>
          <Text style={styles.headerSubtitle}>{venueName}</Text>
          <Text style={styles.headerDescription}>Capture the current atmosphere and let our AI analyze the vibe!</Text>
        </View>

        <View style={styles.imageSection}>
          {image ? (
            <View style={styles.imageContainer}>
              <Image source={{ uri: image }} style={styles.selectedImage} />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => {
                  setImage(null)
                  setAnalysisResult(null)
                }}
              >
                <Ionicons name="close-circle" size={28} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.imagePicker} onPress={captureImage}>
              <Ionicons name="camera" size={56} color="#666666" />
              <Text style={styles.imagePickerText}>Tap to capture image (camera only)</Text>
            </TouchableOpacity>
          )}
        </View>

        {image && !analysisResult && (
          <TouchableOpacity
            style={[styles.analyzeButton, analyzing && styles.disabledButton]}
            onPress={analyzeVibe}
            disabled={analyzing}
          >
            {analyzing ? (
              <>
                <ActivityIndicator color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.analyzeButtonText}>Analyzing Vibe...</Text>
              </>
            ) : (
              <>
                <Ionicons name="analytics" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.analyzeButtonText}>Analyze Vibe</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {analysisResult && (
          <View style={styles.resultsSection}>
            <Text style={styles.resultsTitle}>Vibe Analysis Results</Text>

            <View style={styles.overallRating}>
              <Text style={styles.ratingLabel}>Overall Vibe Rating</Text>
              <View style={styles.ratingContainer}>
                <Text
                  style={[styles.ratingValue, { color: VibeAnalysisService.getVibeColor(analysisResult.vibeRating) }]}
                >
                  {analysisResult.vibeRating.toFixed(1)}
                </Text>
                <Text style={styles.ratingMax}>/5.0</Text>
              </View>
              <Text style={styles.vibeDescription}>
                {VibeAnalysisService.getVibeDescription(analysisResult.vibeRating)}
              </Text>
            </View>

            <View style={styles.detailedAnalysis}>
              <Text style={styles.detailedTitle}>Detailed Analysis</Text>

              <View style={styles.analysisItem}>
                <Text style={styles.analysisLabel}>Crowd Density</Text>
                <Text style={styles.analysisValue}>{analysisResult.analysisData.crowdDensity.toFixed(1)}/5.0</Text>
              </View>

              <View style={styles.analysisItem}>
                <Text style={styles.analysisLabel}>Lighting Quality</Text>
                <Text style={styles.analysisValue}>{analysisResult.analysisData.lightingQuality.toFixed(1)}/5.0</Text>
              </View>

              <View style={styles.analysisItem}>
                <Text style={styles.analysisLabel}>Energy Level</Text>
                <Text style={styles.analysisValue}>{analysisResult.analysisData.energyLevel.toFixed(1)}/5.0</Text>
              </View>

              <View style={styles.analysisItem}>
                <Text style={styles.analysisLabel}>Music Vibes</Text>
                <Text style={styles.analysisValue}>{analysisResult.analysisData.musicVibes.toFixed(1)}/5.0</Text>
              </View>

              <View style={styles.analysisItem}>
                <Text style={styles.analysisLabel}>Overall Atmosphere</Text>
                <Text style={styles.analysisValue}>{analysisResult.analysisData.overallAtmosphere.toFixed(1)}/5.0</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.uploadButton, uploading && styles.disabledButton]}
              onPress={uploadVibe}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <ActivityIndicator color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.uploadButtonText}>Uploading...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.uploadButtonText}>Upload Vibe</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Web camera overlay */}
      {webCameraOpen && Platform.OS === "web" && (
        <div style={webOverlayStyles.overlay as any}>
          <div style={webOverlayStyles.modal as any}>
            <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} playsInline />
            <div style={webOverlayStyles.controls as any}>
              <button onClick={captureFrameFromVideo} style={webOverlayStyles.captureButton as any}>
                Capture
              </button>
              <button onClick={stopWebCamera} style={webOverlayStyles.cancelButton as any}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 18,
    color: "#2196F3",
    marginBottom: 8,
  },
  headerDescription: {
    fontSize: 14,
    color: "#BBBBBB",
    lineHeight: 20,
  },
  imageSection: {
    padding: 16,
  },
  imagePicker: {
    height: 200,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#333",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1E1E1E",
  },
  imagePickerText: {
    color: "#666666",
    marginTop: 8,
    fontSize: 16,
  },
  imageContainer: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
  },
  selectedImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
  },
  removeImageButton: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 15,
    padding: 2,
  },
  analyzeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    margin: 16,
    padding: 16,
    borderRadius: 8,
  },
  analyzeButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  resultsSection: {
    margin: 16,
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 16,
  },
  resultsTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 16,
    textAlign: "center",
  },
  overallRating: {
    alignItems: "center",
    marginBottom: 24,
    padding: 16,
    backgroundColor: "#2A2A2A",
    borderRadius: 8,
  },
  ratingLabel: {
    fontSize: 16,
    color: "#BBBBBB",
    marginBottom: 8,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 8,
  },
  ratingValue: {
    fontSize: 48,
    fontWeight: "bold",
  },
  ratingMax: {
    fontSize: 24,
    color: "#666666",
    marginLeft: 4,
  },
  vibeDescription: {
    fontSize: 18,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  detailedAnalysis: {
    marginBottom: 24,
  },
  detailedTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  analysisItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  analysisLabel: {
    fontSize: 16,
    color: "#FFFFFF",
  },
  analysisValue: {
    fontSize: 16,
    color: "#2196F3",
    fontWeight: "bold",
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#34C759",
    padding: 16,
    borderRadius: 8,
  },
  uploadButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  cameraContainer: {
    width: "90%",
    height: "80%",
    backgroundColor: "#000",
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
  },
  closeButton: {
    position: "absolute",
    top: 20,
    left: 20,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
    padding: 8,
  },
  captureButton: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.3)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 6,
    borderColor: "#FFF",
  },
  captureInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFF",
  },
  
})

const webOverlayStyles = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  modal: {
    width: "92%",
    maxWidth: 720,
    height: "60vh",
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as any,
  },
  controls: {
    display: "flex",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: "#111",
  },
  captureButton: {
    backgroundColor: "#1f8ef1",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: 8,
    border: "none",
    fontWeight: 700,
  },
  cancelButton: {
    backgroundColor: "#ef4444",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: 8,
    border: "none",
    fontWeight: 700,
    marginLeft: 8,
  }
}
export default AddVibeScreen
