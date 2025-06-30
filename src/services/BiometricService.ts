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
