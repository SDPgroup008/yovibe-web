import * as FaceDetector from "expo-face-detector"
import { Camera } from "expo-camera"
import * as MediaLibrary from "expo-media-library"
import * as Crypto from "expo-crypto"

export interface BiometricData {
  faceId: string
  confidence: number
  landmarks: any[]
  bounds: {
    origin: { x: number; y: number }
    size: { width: number; height: number }
  }
  timestamp: number
}

export class BiometricService {
  private static instance: BiometricService
  private cameraRef: any = null

  static getInstance(): BiometricService {
    if (!BiometricService.instance) {
      BiometricService.instance = new BiometricService()
    }
    return BiometricService.instance
  }

  static async isAvailable(): Promise<boolean> {
    try {
      // Check if camera permissions are available
      const { status } = await Camera.requestCameraPermissionsAsync()
      if (status !== "granted") {
        console.log("Camera permission not granted")
        return false
      }

      // Check if face detection is available
      const isAvailable = await FaceDetector.isAvailableAsync()
      console.log("Face detection available:", isAvailable)
      return isAvailable
    } catch (error) {
      console.error("Error checking biometric availability:", error)
      return false
    }
  }

  static async requestPermissions(): Promise<boolean> {
    try {
      const cameraPermission = await Camera.requestCameraPermissionsAsync()
      const mediaLibraryPermission = await MediaLibrary.requestPermissionsAsync()

      return cameraPermission.status === "granted" && mediaLibraryPermission.status === "granted"
    } catch (error) {
      console.error("Error requesting permissions:", error)
      return false
    }
  }

  static async captureBiometric(): Promise<string> {
    try {
      console.log("Starting biometric capture...")

      // Check permissions first
      const hasPermissions = await this.requestPermissions()
      if (!hasPermissions) {
        throw new Error("Camera permissions not granted")
      }

      // This would typically involve:
      // 1. Opening camera
      // 2. Detecting face
      // 3. Capturing face landmarks
      // 4. Generating unique hash

      return new Promise((resolve, reject) => {
        // Simulate the biometric capture process
        // In a real implementation, this would:
        // - Use expo-camera to capture image
        // - Use expo-face-detector to detect face
        // - Extract facial landmarks
        // - Generate a unique hash from the landmarks

        setTimeout(async () => {
          try {
            // Generate a unique biometric hash based on facial features
            const timestamp = Date.now()
            const randomData = Math.random().toString()
            const biometricHash = await Crypto.digestStringAsync(
              Crypto.CryptoDigestAlgorithm.SHA256,
              `${timestamp}_${randomData}_face_data`,
            )

            console.log("Biometric capture completed:", biometricHash.substring(0, 16) + "...")
            resolve(biometricHash)
          } catch (error) {
            console.error("Error generating biometric hash:", error)
            reject(error)
          }
        }, 3000) // Simulate 3 second capture process
      })
    } catch (error) {
      console.error("Error capturing biometric:", error)
      throw error
    }
  }

  static async detectFaceInImage(imageUri: string): Promise<BiometricData | null> {
    try {
      console.log("Detecting face in image:", imageUri)

      const options = {
        mode: FaceDetector.FaceDetectorMode.accurate,
        detectLandmarks: FaceDetector.FaceDetectorLandmarks.all,
        runClassifications: FaceDetector.FaceDetectorClassifications.all,
      }

      const result = await FaceDetector.detectFacesAsync(imageUri, options)

      if (result.faces.length === 0) {
        console.log("No faces detected in image")
        return null
      }

      if (result.faces.length > 1) {
        console.log("Multiple faces detected, using first face")
      }

      const face = result.faces[0]

      // Generate unique face ID based on landmarks
      const landmarkData = JSON.stringify(face.landmarks)
      const faceId = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, landmarkData)

      const biometricData: BiometricData = {
        faceId,
        confidence: face.rollAngle !== undefined ? 0.95 : 0.8, // Simulate confidence
        landmarks: face.landmarks || [],
        bounds: face.bounds,
        timestamp: Date.now(),
      }

      console.log("Face detected successfully:", faceId.substring(0, 16) + "...")
      return biometricData
    } catch (error) {
      console.error("Error detecting face:", error)
      return null
    }
  }

  static async verifyBiometric(storedHash: string, capturedData: string): Promise<boolean> {
    try {
      console.log("Verifying biometric data...")

      // In a real implementation, this would:
      // 1. Extract facial landmarks from both stored and captured data
      // 2. Compare the landmarks using facial recognition algorithms
      // 3. Calculate similarity score
      // 4. Return true if similarity is above threshold

      // For now, we'll simulate verification with some logic
      // In production, you'd use proper facial recognition algorithms

      // Simple hash comparison for demo (not secure for production)
      if (storedHash === capturedData) {
        console.log("Biometric verification: EXACT MATCH")
        return true
      }

      // Simulate facial recognition comparison
      // In reality, you'd compare facial landmarks and features
      const similarity = this.calculateSimilarity(storedHash, capturedData)
      const threshold = 0.85 // 85% similarity threshold

      const isMatch = similarity >= threshold
      console.log(`Biometric verification: ${isMatch ? "MATCH" : "NO MATCH"} (similarity: ${similarity.toFixed(2)})`)

      return isMatch
    } catch (error) {
      console.error("Error verifying biometric:", error)
      return false
    }
  }

  private static calculateSimilarity(hash1: string, hash2: string): number {
    // This is a simplified similarity calculation
    // In production, you'd use proper facial recognition algorithms

    if (hash1 === hash2) return 1.0

    // Calculate Hamming distance for demonstration
    let matches = 0
    const minLength = Math.min(hash1.length, hash2.length)

    for (let i = 0; i < minLength; i++) {
      if (hash1[i] === hash2[i]) {
        matches++
      }
    }

    const similarity = matches / minLength

    // Add some randomness to simulate real-world variance
    const variance = (Math.random() - 0.5) * 0.2 // ±10% variance
    return Math.max(0, Math.min(1, similarity + variance))
  }

  static generateBiometricHash(rawData: string): Promise<string> {
    // Generate a secure hash from biometric data
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `biometric_${rawData}_${Date.now()}`)
  }

  // Camera component helpers
  static getCameraComponent() {
    return Camera
  }

  static getFaceDetectorOptions() {
    return {
      mode: FaceDetector.FaceDetectorMode.accurate,
      detectLandmarks: FaceDetector.FaceDetectorLandmarks.all,
      runClassifications: FaceDetector.FaceDetectorClassifications.all,
    }
  }
}

export default BiometricService
