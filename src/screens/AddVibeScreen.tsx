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
  Image as RNImage,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../services/FirebaseService"
import VibeAnalysisService from "../services/VibeAnalysisService"
import { useAuth } from "../contexts/AuthContext"
import type { VibeImage } from "../models/VibeImage"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { ProfileStackParamList } from "../navigation/types"

type Props = NativeStackScreenProps<ProfileStackParamList, "AddVibe">

const AddVibeScreen: React.FC<Props> = ({ navigation, route }) => {
  const { venueId, venueName } = route.params
  const { user } = useAuth()

  // image is a data URL or object URL (string) for preview/analysis
  const [image, setImage] = useState<string | null>(null)
  // optional: keep the last Blob produced from the file for direct upload
  const lastBlobRef = useRef<Blob | null>(null)

  const [analyzing, setAnalyzing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<{
    vibeRating: number
    analysisData: any
  } | null>(null)

  // hidden file input ref (used to open camera on mobile)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  /**
   * Resize/compress an image File to a data URL and Blob.
   * - maxWidth: target maximum width in pixels (preserves aspect ratio)
   * - quality: JPEG quality 0..1
   */
  const fileToDataUrlAndBlob = (file: File, maxWidth = 1600, quality = 0.85) => {
    return new Promise<{ dataUrl: string; blob: Blob }>((resolve, reject) => {
      // Use the browser Image constructor explicitly via window to avoid the react-native Image type
      if (typeof window === "undefined" || typeof (window as any).Image === "undefined") {
        reject(new Error("Browser Image API not available"))
        return
      }

      const img = new (window as any).Image() as HTMLImageElement
      const url = URL.createObjectURL(file)

      img.onload = () => {
        try {
          const ratio = img.naturalWidth / img.naturalHeight
          let targetWidth = img.naturalWidth
          let targetHeight = img.naturalHeight
          if (img.naturalWidth > maxWidth) {
            targetWidth = maxWidth
            targetHeight = Math.round(maxWidth / ratio)
          }

          const canvas = document.createElement("canvas")
          canvas.width = targetWidth
          canvas.height = targetHeight
          const ctx = canvas.getContext("2d")
          if (!ctx) throw new Error("Canvas context not available")
          ctx.drawImage(img as CanvasImageSource, 0, 0, targetWidth, targetHeight)

          const dataUrl = canvas.toDataURL("image/jpeg", quality)

          canvas.toBlob(
            (b) => {
              if (!b) {
                reject(new Error("Failed to create blob from canvas"))
                return
              }
              resolve({ dataUrl, blob: b })
            },
            "image/jpeg",
            quality
          )
        } catch (err) {
          reject(err)
        } finally {
          URL.revokeObjectURL(url)
        }
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error("Failed to load image file"))
      }

      // Start loading
      img.src = url
    })
  }

  /**
   * Open a hidden file input. On mobile browsers this will open the camera UI
   * when capture="environment" is present.
   */
  const openFilePickerFallback = () => {
    if (!fileInputRef.current) {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = "image/*"
      input.setAttribute("capture", "environment") // mobile: open back camera
      input.style.display = "none"

      input.onchange = async (ev: Event) => {
        const target = ev.target as HTMLInputElement
        const file = target.files && target.files[0]
        if (file) {
          try {
            const { dataUrl, blob } = await fileToDataUrlAndBlob(file, 1600, 0.85)
            setImage(dataUrl)
            setAnalysisResult(null)
            lastBlobRef.current = blob
          } catch (err) {
            console.error("File processing error:", err)
            Alert.alert("Error", "Failed to process selected image.")
          }
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

  /**
   * Entry point to capture image. For web we open the file picker (camera on mobile).
   * For native (expo) we keep the existing camera flow (if you use it).
   */
  const captureImage = async () => {
    try {
      if (Platform.OS === "web") {
        openFilePickerFallback()
        return
      }

      // Native (expo) flow - keep your existing implementation if needed
      // Example (if using expo-image-picker):
      // const permissionResult = await ImagePicker.requestCameraPermissionsAsync()
      // if (permissionResult.status !== 'granted') { Alert.alert(...); return }
      // const result = await ImagePicker.launchCameraAsync({...})
      // handle result -> setImage(result.uri) etc.
      openFilePickerFallback()
    } catch (error) {
      console.error("captureImage error:", error)
      Alert.alert("Error", "Failed to start camera. Check permissions.")
    }
  }

  /**
   * Convert a data URL to a Blob.
   */
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

  /**
   * Analyze the captured image using VibeAnalysisService.
   * VibeAnalysisService.analyzeVibeImage should accept a data URL or object URL.
   */
  const analyzeVibe = async () => {
    if (!image) {
      Alert.alert("Error", "Please capture an image first")
      return
    }

    setAnalyzing(true)
    try {
      const result = await VibeAnalysisService.analyzeVibeImage(image)
      setAnalysisResult(result)
    } catch (error) {
      console.error("Error analyzing vibe:", error)
      Alert.alert("Error", "Failed to analyze vibe")
    } finally {
      setAnalyzing(false)
    }
  }

  /**
   * Upload the vibe image. If we have a Blob from the file processing step, use it.
   * Otherwise, convert the data URL to a Blob before uploading.
   */
  const uploadVibe = async () => {
    if (!image || !analysisResult || !user) {
      Alert.alert("Error", "Please analyze the image first")
      return
    }

    setUploading(true)
    try {
      let uploadTarget: Blob | string = image

      // Prefer the blob we created earlier (if available)
      if (lastBlobRef.current) {
        uploadTarget = lastBlobRef.current
      } else if (typeof image === "string" && image.startsWith("data:")) {
        uploadTarget = dataURLToBlob(image)
      } else if (typeof image === "string" && image.startsWith("blob:")) {
        // fetch object URL to blob
        const resp = await fetch(image)
        uploadTarget = await resp.blob()
      }

      // FirebaseService.uploadVibeImage should accept Blob | string (web branch handles both)
      const imageUrl = await FirebaseService.uploadVibeImage(uploadTarget, venueId)

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

  // Cleanup hidden input on unmount
  useEffect(() => {
    return () => {
      const input = fileInputRef.current
      if (input && input.parentNode) input.parentNode.removeChild(input)
      fileInputRef.current = null
      lastBlobRef.current = null
    }
  }, [])

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Add Today's Vibe</Text>
        <Text style={styles.headerSubtitle}>{venueName}</Text>
        <Text style={styles.headerDescription}>Capture the current atmosphere and let our AI analyze the vibe!</Text>
      </View>

      <View style={styles.imageSection}>
        {image ? (
          <View style={styles.imageContainer}>
            <RNImage source={{ uri: image }} style={styles.selectedImage} />
            <TouchableOpacity
              style={styles.removeImageButton}
              onPress={() => {
                setImage(null)
                setAnalysisResult(null)
                lastBlobRef.current = null
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
              <Text style={[styles.ratingValue, { color: VibeAnalysisService.getVibeColor(analysisResult.vibeRating) }]}>
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
              <Text style={styles.analysisValue}>
                {analysisResult.analysisData?.crowdDensity != null
                  ? analysisResult.analysisData.crowdDensity.toFixed(1)
                  : "0.0"}
                /5.0
              </Text>
            </View>

            <View style={styles.analysisItem}>
              <Text style={styles.analysisLabel}>Lighting Quality</Text>
              <Text style={styles.analysisValue}>
                {analysisResult.analysisData?.lightingQuality != null
                  ? analysisResult.analysisData.lightingQuality.toFixed(1)
                  : "0.0"}
                /5.0
              </Text>
            </View>

            <View style={styles.analysisItem}>
              <Text style={styles.analysisLabel}>Energy Level</Text>
              <Text style={styles.analysisValue}>
                {analysisResult.analysisData?.energyLevel != null
                  ? analysisResult.analysisData.energyLevel.toFixed(1)
                  : "0.0"}
                /5.0
              </Text>
            </View>

            <View style={styles.analysisItem}>
              <Text style={styles.analysisLabel}>Music Vibes</Text>
              <Text style={styles.analysisValue}>
                {analysisResult.analysisData?.musicVibes != null
                  ? analysisResult.analysisData.musicVibes.toFixed(1)
                  : "0.0"}
                /5.0
              </Text>
            </View>

            <View style={styles.analysisItem}>
              <Text style={styles.analysisLabel}>Overall Atmosphere</Text>
              <Text style={styles.analysisValue}>
                {analysisResult.analysisData?.overallAtmosphere != null
                  ? analysisResult.analysisData.overallAtmosphere.toFixed(1)
                  : "0.0"}
                /5.0
              </Text>
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
