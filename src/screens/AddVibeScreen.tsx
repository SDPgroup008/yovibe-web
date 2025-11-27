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
  Modal,
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

  // Web Camera Modal State
  const [webCameraOpen, setWebCameraOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Start camera — web first, then native fallback
  const captureImage = async () => {
    if (Platform.OS === "web") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }, // back camera on mobile
          audio: false,
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
        setWebCameraOpen(true)
      } catch (err) {
        console.warn("Web camera not available, falling back to file picker", err)
        // Fallback: open file picker with camera intent
        const input = document.createElement("input")
        input.type = "file"
        input.accept = "image/*"
        input.capture = "environment" // tries to open camera on mobile browsers
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0]
          if (file) {
            const url = URL.createObjectURL(file)
            setImage(url)
            setAnalysisResult(null)
          }
        }
        input.click()
      }
      return
    }

    // Native (Expo) camera
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (permission.status !== "granted") {
      Alert.alert("Permission Needed", "Camera access is required to capture vibe images.")
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    })

    if (!result.canceled && result.assets?.[0]?.uri) {
      setImage(result.assets[0].uri)
      setAnalysisResult(null)
    }
  }

  // Capture photo from live video stream
  const takePhoto = () => {
    if (!videoRef.current) return

    const video = videoRef.current
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9)

    setImage(dataUrl)
    setAnalysisResult(null)
    closeCamera()
  }

  // Close camera and clean up
  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setWebCameraOpen(false)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeCamera()
    }
  }, [])

  const analyzeVibe = async () => {
    if (!image) return
    setAnalyzing(true)
    try {
      const result = await VibeAnalysisService.analyzeVibeImage(image)
      setAnalysisResult(result)
    } catch (err) {
      Alert.alert("Analysis Failed", "Could not analyze the vibe. Try another photo.")
    } finally {
      setAnalyzing(false)
    }
  }

  const uploadVibe = async () => {
    if (!image || !analysisResult || !user) return

    setUploading(true)
    try {
      const imageUrl = await FirebaseService.uploadVibeImage(image)

      const vibeImageData: Omit<VibeImage, "id"> = {
        venueId,
        imageUrl,
        vibeRating: analysisResult.vibeRating,
        uploadedAt: new Date(),
        uploadedBy: user.id,
        analysisData: analysisResult.analysisData,
      }

      await FirebaseService.addVibeImage(vibeImageData)

      Alert.alert("Success!", "Vibe uploaded and venue rating updated!", [
        { text: "Done", onPress: () => navigation.goBack() },
      ])
    } catch (err) {
      console.error(err)
      Alert.alert("Upload Failed", "Could not save vibe image.")
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
          <Text style={styles.headerDescription}>
            Capture the current atmosphere and let our AI analyze the vibe!
          </Text>
        </View>

        <View style={styles.imageSection}>
          {image ? (
            <View style={styles.imageContainer}>
              <Image source={{ uri: image }} style={styles.selectedImage} resizeMode="cover" />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => {
                  setImage(null)
                  setAnalysisResult(null)
                }}
              >
                <Ionicons name="close-circle" size={32} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.imagePicker} onPress={captureImage}>
              <Ionicons name="camera" size={64} color="#666" />
              <Text style={styles.imagePickerText}>Tap to open camera</Text>
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
                <ActivityIndicator color="#fff" />
                <Text style={styles.buttonText}>Analyzing...</Text>
              </>
            ) : (
              <>
                <Ionicons name="sparkles" size={20} color="#fff" />
                <Text style={styles.buttonText}>Analyze Vibe</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {analysisResult && (
          <View style={styles.resultsSection}>
            <Text style={styles.resultsTitle}>Vibe Analysis Results</Text>

            <View style={styles.overallRating}>
              <Text style={styles.ratingLabel}>Overall Vibe</Text>
              <Text
                style={[
                  styles.ratingValue,
                  { color: VibeAnalysisService.getVibeColor(analysisResult.vibeRating) },
                ]}
              >
                {analysisResult.vibeRating.toFixed(1)}
              </Text>
              <Text style={styles.ratingMax}>/5.0</Text>
              <Text style={styles.vibeDescription}>
                {VibeAnalysisService.getVibeDescription(analysisResult.vibeRating)}
              </Text>
            </View>

            {/* Detailed metrics */}
            <View style={styles.detailedAnalysis}>
              {Object.entries(analysisResult.analysisData).map(([key, value]) => (
                <View key={key} style={styles.analysisItem}>
                  <Text style={styles.analysisLabel}>
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </Text>
                  <Text style={styles.analysisValue}>{(value as number).toFixed(1)}/5.0</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.uploadButton, uploading && styles.disabledButton]}
              onPress={uploadVibe}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.buttonText}>Uploading...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={20} color="#fff" />
                  <Text style={styles.buttonText}>Upload Vibe</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* WEB CAMERA MODAL */}
      <Modal visible={webCameraOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.cameraContainer}>
            <TouchableOpacity style={styles.closeButton} onPress={closeCamera}>
              <Ionicons name="close" size={32} color="#fff" />
            </TouchableOpacity>

            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={{ width: "100%", height: "100%", borderRadius: 16 }}
            />

            <TouchableOpacity style={styles.captureButton} onPress={takePhoto}>
              <View style={styles.captureInner} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  buttonText: { color: "#FFF", fontSize: 18, fontWeight: "600", marginLeft: 8 },
})

export default AddVibeScreen
