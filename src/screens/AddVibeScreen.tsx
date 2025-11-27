"use client"

import React, { useState } from "react"
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
  const [image, setImage] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<{
    vibeRating: number
    analysisData: any
  } | null>(null)

  // Exact same behavior as your mobile app: open camera directly (no video preview)
  const pickImage = async () => {
    if (Platform.OS !== "web") return

    // Create hidden file input with camera capture intent
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.capture = "environment" // This triggers camera on mobile browsers
    input.style.display = "none"

    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement)?.files?.[0]
      if (!file) {
        console.log("User cancelled camera")
        return
      }

      const url = URL.createObjectURL(file)
      setImage(url)
      setAnalysisResult(null)
    }

    // Append to DOM and click
    document.body.appendChild(input)
    input.click()

    // Cleanup
    setTimeout(() => {
      if (input.parentNode) {
        input.parentNode.removeChild(input)
      }
    }, 1000)
  }

  const analyzeVibe = async () => {
    if (!image) {
      Alert.alert("Error", "Please take a photo first")
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

      Alert.alert("Success", "Vibe image uploaded successfully!", [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
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
          <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
            <Ionicons name="camera" size={64} color="#666" />
            <Text style={styles.imagePickerText}>Tap to take a photo</Text>
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
              <ActivityIndicator color="#FFFFFF" />
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
                style={[
                  styles.ratingValue,
                  { color: VibeAnalysisService.getVibeColor(analysisResult.vibeRating) },
                ]}
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
              <Text style={styles.analysisValue}>
                {analysisResult.analysisData.crowdDensity.toFixed(1)}/5.0
              </Text>
            </View>
            <View style={styles.analysisItem}>
              <Text style={styles.analysisLabel}>Lighting Quality</Text>
              <Text style={styles.analysisValue}>
                {analysisResult.analysisData.lightingQuality.toFixed(1)}/5.0
              </Text>
            </View>
            <View style={styles.analysisItem}>
              <Text style={styles.analysisLabel}>Energy Level</Text>
              <Text style={styles.analysisValue}>
                {analysisResult.analysisData.energyLevel.toFixed(1)}/5.0
              </Text>
            </View>
            <View style={styles.analysisItem}>
              <Text style={styles.analysisLabel}>Music Vibes</Text>
              <Text style={styles.analysisValue}>
                {analysisResult.analysisData.musicVibes.toFixed(1)}/5.0
              </Text>
            </View>
            <View style={styles.analysisItem}>
              <Text style={styles.analysisLabel}>Overall Atmosphere</Text>
              <Text style={styles.analysisValue}>
                {analysisResult.analysisData.overallAtmosphere.toFixed(1)}/5.0
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
                <ActivityIndicator color="#FFFFFF" />
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
  buttonText: { color: "#FFF", fontSize: 18, fontWeight: "600", marginLeft: 8 },
})

export default AddVibeScreen
