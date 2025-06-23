"use client"

import type React from "react"
import { useState } from "react"
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator, ScrollView } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import ImagePickerService from "../services/ImagePickerService"
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

  const pickImage = async () => {
    try {
      const result = await ImagePickerService.launchImageLibraryAsync({
        mediaTypes: "Images",
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      })

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedImage = result.assets[0]
        setImage(selectedImage.uri)
        setAnalysisResult(null)
      }
    } catch (error) {
      console.error("Error picking image:", error)
      Alert.alert("Error", "Failed to pick image")
    }
  }

  const analyzeVibe = async () => {
    if (!image) {
      Alert.alert("Error", "Please select an image first")
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

      // Save to Firestore
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
    <ScrollView style={styles.container}>
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
              <Ionicons name="close-circle" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
            <Ionicons name="camera" size={48} color="#666666" />
            <Text style={styles.imagePickerText}>Tap to capture or select image</Text>
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
              <Ionicons name="analytics" size={20} color="#FFFFFF" />
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
                <ActivityIndicator color="#FFFFFF" />
                <Text style={styles.uploadButtonText}>Uploading...</Text>
              </>
            ) : (
              <>
                <Ionicons name="cloud-upload" size={20} color="#FFFFFF" />
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
})

export default AddVibeScreen
