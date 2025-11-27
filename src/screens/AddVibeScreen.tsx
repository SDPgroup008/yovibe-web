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
import * as ImagePicker from "expo-image-picker"
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
  const [image, setImage] = useState<string | null>(null)
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

  // Start camera capture (web or native)
  const captureImage = async () => {
    try {
      if (Platform.OS === "web") {
        // Try getUserMedia first
        if (navigator.mediaDevices ) {
          await startWebCamera()
          return
        }

        // Fallback to file input (desktop file picker)
        openFilePickerFallback()
        return
      }

      // Native (expo) flow
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync()
      if (permissionResult.status !== "granted") {
        Alert.alert("Permission required", "Camera permission is required to capture a vibe image.")
        return
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      })

      if ("canceled" in result) {
        if (!result.canceled && result.assets && result.assets.length > 0) {
          setImage(result.assets[0].uri)
          setAnalysisResult(null)
        }
      } else if ((result as any).uri) {
        // legacy shape
        // @ts-ignore
        setImage((result as any).uri)
        setAnalysisResult(null)
      }
    } catch (error) {
      console.error("captureImage error:", error)
      Alert.alert("Error", "Failed to start camera. Check permissions.")
    }
  }

  // Web: start camera and open modal
  const startWebCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      streamRef.current = stream
      setWebCameraOpen(true)
      // attach stream to video element when modal renders (useEffect below)
    } catch (err) {
      console.error("getUserMedia error:", err)
      Alert.alert("Camera error", "Unable to access the camera on this device or permission denied.")
    }
  }

  // Web: stop camera and close modal
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

  // Web: capture current frame from video to data URL
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
    // cleanup when modal closes
    return () => {
      // nothing here; stopWebCamera handles cleanup
    }
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
      // Upload image to Firebase Storage
      const imageUrl = await FirebaseService.uploadVibeImage(image)

      // Create vibe image object
      const vibeImageData: Omit<VibeImage, "id"> = {
        venueId,
        imageUrl,
        vibeRating: analysisResult.vibeRating,
        uploadedAt: new Date(),
        uploadedBy: user.id,
        analysisData: analysisResult.analysisData,
      }

      // Save to Firestore (this will also update the venue's vibe rating)
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
})

export default AddVibeScreen
