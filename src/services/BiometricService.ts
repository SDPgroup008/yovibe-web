import * as FaceDetector from "expo-face-detector"
import { Camera } from "expo-camera"
import * as MediaLibrary from "expo-media-library"
import * as Crypto from "expo-crypto"

export interface BiometricData {
  faceId: string
  landmarks: FaceDetector.FaceFeature[]
  bounds: {
    origin: { x: number; y: number }
    size: { width: number; height: number }
  }
  rollAngle: number
  yawAngle: number
  smilingProbability: number
  leftEyeOpenProbability: number
  rightEyeOpenProbability: number
  timestamp: number
}

export class BiometricService {
  private static readonly SIMILARITY_THRESHOLD = 0.85
  private static readonly FACE_DETECTION_OPTIONS: FaceDetector.FaceDetectorOptions = {
    mode: FaceDetector.FaceDetectorMode.accurate,
    detectLandmarks: FaceDetector.FaceDetectorLandmarks.all,
    runClassifications: FaceDetector.FaceDetectorClassifications.all,
  }

  static async isAvailable(): Promise<boolean> {
    try {
      // Check if camera is available
      const { status } = await Camera.requestCameraPermissionsAsync()
      if (status !== "granted") {
        return false
      }

      // Check if face detection is available
      const isAvailable = await FaceDetector.isAvailableAsync()
      return isAvailable
    } catch (error) {
      console.error("Error checking biometric availability:", error)
      return false
    }
  }

  static async captureBiometric(): Promise<string> {
    try {
      console.log("Starting biometric capture...")

      // Request camera permissions
      const { status } = await Camera.requestCameraPermissionsAsync()
      if (status !== "granted") {
        throw new Error("Camera permission not granted")
      }

      // Request media library permissions for saving photos
      const mediaStatus = await MediaLibrary.requestPermissionsAsync()
      if (mediaStatus.status !== "granted") {
        throw new Error("Media library permission not granted")
      }

      // In a real implementation, you would:
      // 1. Open camera interface
      // 2. Capture photo with face
      // 3. Detect face features
      // 4. Generate biometric hash

      // For now, we'll simulate the process
      const simulatedBiometricData = await this.simulateBiometricCapture()
      const biometricHash = await this.generateBiometricHash(simulatedBiometricData)

      console.log("Biometric capture completed successfully")
      return biometricHash
    } catch (error) {
      console.error("Error capturing biometric:", error)
      throw error
    }
  }

  static async verifyBiometric(storedHash: string, capturedData: string): Promise<boolean> {
    try {
      console.log("Starting biometric verification...")

      // In a real implementation, you would:
      // 1. Parse the captured biometric data
      // 2. Compare with stored biometric hash
      // 3. Calculate similarity score
      // 4. Return true if similarity > threshold

      // For simulation, we'll use string comparison with some fuzzy matching
      const similarity = this.calculateSimilarity(storedHash, capturedData)
      const isMatch = similarity >= this.SIMILARITY_THRESHOLD

      console.log(`Biometric verification result: ${isMatch ? "MATCH" : "NO MATCH"} (similarity: ${similarity})`)
      return isMatch
    } catch (error) {
      console.error("Error verifying biometric:", error)
      return false
    }
  }

  private static async simulateBiometricCapture(): Promise<BiometricData> {
    // Simulate face detection process
    await new Promise((resolve) => setTimeout(resolve, 2000)) // Simulate capture time

    // Generate simulated biometric data
    const biometricData: BiometricData = {
      faceId: `face_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      landmarks: [
        // Simulated facial landmarks
        {
          type: "leftEye" as any,
          positions: [{ x: 100, y: 150 }],
        },
        {
          type: "rightEye" as any,
          positions: [{ x: 200, y: 150 }],
        },
        {
          type: "nose" as any,
          positions: [{ x: 150, y: 200 }],
        },
        {
          type: "mouth" as any,
          positions: [{ x: 150, y: 250 }],
        },
      ],
      bounds: {
        origin: { x: 50, y: 100 },
        size: { width: 200, height: 250 },
      },
      rollAngle: Math.random() * 10 - 5, // -5 to 5 degrees
      yawAngle: Math.random() * 20 - 10, // -10 to 10 degrees
      smilingProbability: Math.random(),
      leftEyeOpenProbability: 0.8 + Math.random() * 0.2, // 0.8 to 1.0
      rightEyeOpenProbability: 0.8 + Math.random() * 0.2, // 0.8 to 1.0
      timestamp: Date.now(),
    }

    return biometricData
  }

  private static async generateBiometricHash(biometricData: BiometricData): Promise<string> {
    try {
      // Create a unique fingerprint from biometric features
      const features = {
        landmarks: biometricData.landmarks.map((landmark) => ({
          type: landmark.type,
          positions: landmark.positions,
        })),
        bounds: biometricData.bounds,
        rollAngle: Math.round(biometricData.rollAngle * 100) / 100,
        yawAngle: Math.round(biometricData.yawAngle * 100) / 100,
        eyeRatio: biometricData.leftEyeOpenProbability + biometricData.rightEyeOpenProbability,
      }

      // Convert to string and hash
      const featuresString = JSON.stringify(features)
      const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, featuresString)

      return hash
    } catch (error) {
      console.error("Error generating biometric hash:", error)
      throw error
    }
  }

  private static calculateSimilarity(hash1: string, hash2: string): number {
    // Simple similarity calculation for demonstration
    // In a real implementation, you would use more sophisticated algorithms

    if (hash1 === hash2) {
      return 1.0
    }

    // Calculate character-level similarity
    let matches = 0
    const minLength = Math.min(hash1.length, hash2.length)

    for (let i = 0; i < minLength; i++) {
      if (hash1[i] === hash2[i]) {
        matches++
      }
    }

    const similarity = matches / Math.max(hash1.length, hash2.length)

    // Add some randomness to simulate real biometric matching
    const variance = (Math.random() - 0.5) * 0.1 // ±5% variance
    return Math.max(0, Math.min(1, similarity + variance))
  }

  static async detectFacesInImage(imageUri: string): Promise<FaceDetector.FaceFeature[]> {
    try {
      const faces = await FaceDetector.detectFacesAsync(imageUri, this.FACE_DETECTION_OPTIONS)
      return faces
    } catch (error) {
      console.error("Error detecting faces:", error)
      return []
    }
  }

  static validateBiometricQuality(biometricData: BiometricData): {
    isValid: boolean
    issues: string[]
  } {
    const issues: string[] = []

    // Check eye openness
    if (biometricData.leftEyeOpenProbability < 0.7 || biometricData.rightEyeOpenProbability < 0.7) {
      issues.push("Eyes should be open")
    }

    // Check face angle
    if (Math.abs(biometricData.rollAngle) > 15) {
      issues.push("Face should be straight (not tilted)")
    }

    if (Math.abs(biometricData.yawAngle) > 20) {
      issues.push("Face should be looking forward")
    }

    // Check face size
    if (biometricData.bounds.size.width < 100 || biometricData.bounds.size.height < 100) {
      issues.push("Face should be closer to camera")
    }

    return {
      isValid: issues.length === 0,
      issues,
    }
  }

  static async generateBiometricTemplate(faces: FaceDetector.FaceFeature[]): Promise<string | null> {
    if (faces.length === 0) {
      return null
    }

    try {
      // Use the first detected face
      const face = faces[0]

      const template = {
        bounds: face.bounds,
        rollAngle: face.rollAngle,
        yawAngle: face.yawAngle,
        smilingProbability: face.smilingProbability,
        leftEyeOpenProbability: face.leftEyeOpenProbability,
        rightEyeOpenProbability: face.rightEyeOpenProbability,
        timestamp: Date.now(),
      }

      const templateString = JSON.stringify(template)
      const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, templateString)

      return hash
    } catch (error) {
      console.error("Error generating biometric template:", error)
      return null
    }
  }
}

export default BiometricService
