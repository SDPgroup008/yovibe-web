import * as faceapi from "face-api.js"

export interface BiometricData {
  faceId: string
  landmarks: number[][]
  descriptor: Float32Array
  confidence: number
  timestamp: number
}

export class BiometricService {
  private static isInitialized = false
  private static readonly SIMILARITY_THRESHOLD = 0.6

  static async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      console.log("Initializing face-api.js...")

      // Load face detection models
      await faceapi.nets.tinyFaceDetector.loadFromUri("/models")
      await faceapi.nets.faceLandmark68Net.loadFromUri("/models")
      await faceapi.nets.faceRecognitionNet.loadFromUri("/models")

      this.isInitialized = true
      console.log("Face-api.js initialized successfully")
    } catch (error) {
      console.error("Error initializing face-api.js:", error)
      throw new Error("Failed to initialize biometric service")
    }
  }

  static async isAvailable(): Promise<boolean> {
    try {
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return false
      }

      // Check camera permissions
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      })

      // Stop the stream immediately
      stream.getTracks().forEach((track) => track.stop())

      return true
    } catch (error) {
      console.error("Camera not available:", error)
      return false
    }
  }

  static async captureBiometric(): Promise<string> {
    try {
      if (!this.isInitialized) {
        await this.initialize()
      }

      console.log("Starting biometric capture...")

      // Get camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      })

      // Create video element
      const video = document.createElement("video")
      video.srcObject = stream
      video.autoplay = true
      video.muted = true

      // Wait for video to load
      await new Promise((resolve) => {
        video.onloadedmetadata = resolve
      })

      // Wait a bit for the camera to adjust
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Detect face and extract features
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor()

      // Stop camera stream
      stream.getTracks().forEach((track) => track.stop())

      if (!detection) {
        throw new Error("No face detected. Please ensure your face is clearly visible.")
      }

      // Create biometric data
      const biometricData: BiometricData = {
        faceId: `face_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        landmarks: detection.landmarks.positions.map((p) => [p.x, p.y]),
        descriptor: detection.descriptor,
        confidence: detection.detection.score,
        timestamp: Date.now(),
      }

      // Generate hash from biometric data
      const biometricHash = await this.generateBiometricHash(biometricData)

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
      // 1. Parse both biometric data
      // 2. Compare face descriptors using euclidean distance
      // 3. Return true if distance is below threshold

      // For simulation with some realistic logic
      const similarity = this.calculateSimilarity(storedHash, capturedData)
      const isMatch = similarity >= this.SIMILARITY_THRESHOLD

      console.log(`Biometric verification: ${isMatch ? "MATCH" : "NO MATCH"} (similarity: ${similarity.toFixed(3)})`)
      return isMatch
    } catch (error) {
      console.error("Error verifying biometric:", error)
      return false
    }
  }

  private static async generateBiometricHash(biometricData: BiometricData): Promise<string> {
    try {
      // Create a unique fingerprint from face descriptor
      const descriptorArray = Array.from(biometricData.descriptor)

      // Combine with landmarks for additional uniqueness
      const features = {
        descriptor: descriptorArray,
        landmarkCount: biometricData.landmarks.length,
        confidence: Math.round(biometricData.confidence * 1000) / 1000,
        timestamp: biometricData.timestamp,
      }

      // Convert to string and create hash
      const featuresString = JSON.stringify(features)

      // Use Web Crypto API for hashing
      const encoder = new TextEncoder()
      const data = encoder.encode(featuresString)
      const hashBuffer = await crypto.subtle.digest("SHA-256", data)

      // Convert to hex string
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")

      return hashHex
    } catch (error) {
      console.error("Error generating biometric hash:", error)
      throw error
    }
  }

  private static calculateSimilarity(hash1: string, hash2: string): number {
    if (hash1 === hash2) return 1.0

    // Calculate Hamming distance
    let matches = 0
    const minLength = Math.min(hash1.length, hash2.length)

    for (let i = 0; i < minLength; i++) {
      if (hash1[i] === hash2[i]) {
        matches++
      }
    }

    const similarity = matches / Math.max(hash1.length, hash2.length)

    // Add some variance to simulate real biometric matching
    const variance = (Math.random() - 0.5) * 0.1
    return Math.max(0, Math.min(1, similarity + variance))
  }

  static async createCameraPreview(): Promise<HTMLVideoElement> {
    const video = document.createElement("video")
    video.style.width = "100%"
    video.style.height = "100%"
    video.style.objectFit = "cover"
    video.autoplay = true
    video.muted = true

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    })

    video.srcObject = stream
    return video
  }

  static stopCameraStream(video: HTMLVideoElement): void {
    const stream = video.srcObject as MediaStream
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
    }
  }
}

export default BiometricService
import * as FaceDetector from "expo-face-detector"
import { Camera } from "expo-camera"
import * as MediaLibrary from "expo-media-library"

export interface BiometricData {
  faceId: string
  landmarks: Array<{ x: number; y: number }>
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  confidence: number
  timestamp: number
}

export class BiometricService {
  private static readonly SIMILARITY_THRESHOLD = 0.85
  private static videoElement: HTMLVideoElement | null = null
  private static canvasElement: HTMLCanvasElement | null = null
  private static stream: MediaStream | null = null

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

      const similarity = this.calculateSimilarity(storedHash, capturedData)
      const isMatch = similarity >= this.SIMILARITY_THRESHOLD

      console.log(
        `Biometric verification result: ${isMatch ? "MATCH" : "NO MATCH"} (similarity: ${similarity.toFixed(2)})`,
      )
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
        { x: 320, y: 200 }, // Center of face
        { x: 300, y: 180 }, // Left eye
        { x: 340, y: 180 }, // Right eye
        { x: 320, y: 210 }, // Nose tip
        { x: 320, y: 240 }, // Mouth center
        { x: 280, y: 160 }, // Left eyebrow
        { x: 360, y: 160 }, // Right eyebrow
        { x: 290, y: 250 }, // Left mouth corner
        { x: 350, y: 250 }, // Right mouth corner
      ],
      bounds: {
        x: 260,
        y: 140,
        width: 120,
        height: 140,
      },
      confidence: 0.85 + Math.random() * 0.15, // 85-100% confidence
      timestamp: Date.now(),
    }

    return biometricData
  }

  private static async generateBiometricHash(biometricData: BiometricData): Promise<string> {
    try {
      // Create a unique fingerprint from biometric features
      const features = {
        landmarks: biometricData.landmarks,
        bounds: biometricData.bounds,
        faceId: biometricData.faceId,
        confidence: Math.round(biometricData.confidence * 100) / 100,
      }

      // Convert to string and hash using Web Crypto API
      const featuresString = JSON.stringify(features)
      const encoder = new TextEncoder()
      const data = encoder.encode(featuresString)
      const hashBuffer = await crypto.subtle.digest("SHA-256", data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")

      return hashHex
    } catch (error) {
      console.error("Error generating biometric hash:", error)
      throw error
    }
  }

  private static calculateSimilarity(hash1: string, hash2: string): number {
    if (hash1 === hash2) {
      return 1.0
    }

    // Calculate Hamming distance for similarity
    let matches = 0
    const minLength = Math.min(hash1.length, hash2.length)

    for (let i = 0; i < minLength; i++) {
      if (hash1[i] === hash2[i]) {
        matches++
      }
    }

    const similarity = matches / Math.max(hash1.length, hash2.length)

    // Add some variance to simulate real biometric matching
    const variance = (Math.random() - 0.5) * 0.1 // ±5% variance
    return Math.max(0, Math.min(1, similarity + variance))
  }

  private static cleanup(): void {
    // Stop video stream
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }

    // Remove video element
    if (this.videoElement) {
      this.videoElement.srcObject = null
      this.videoElement = null
    }

    // Clean up canvas
    this.canvasElement = null
  }

  static async startCameraPreview(videoElement: HTMLVideoElement): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 640,
          height: 480,
          facingMode: "user",
        },
      })

      videoElement.srcObject = stream
      this.stream = stream
    } catch (error) {
      console.error("Error starting camera preview:", error)
      throw error
    }
  }

  static stopCameraPreview(): void {
    this.cleanup()
  }

  static validateBiometricQuality(biometricData: BiometricData): {
    isValid: boolean
    issues: string[]
  } {
    const issues: string[] = []

    // Check confidence level
    if (biometricData.confidence < 0.7) {
      issues.push("Face detection confidence too low")
    }

    // Check face size
    if (biometricData.bounds.width < 80 || biometricData.bounds.height < 80) {
      issues.push("Face should be closer to camera")
    }

    // Check if face is centered
    const centerX = biometricData.bounds.x + biometricData.bounds.width / 2
    const centerY = biometricData.bounds.y + biometricData.bounds.height / 2

    if (Math.abs(centerX - 320) > 100 || Math.abs(centerY - 240) > 80) {
      issues.push("Face should be centered in frame")
    }

    return {
      isValid: issues.length === 0,
      issues,
    }
  }
}

export DBiometricService.web"