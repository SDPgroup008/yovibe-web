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
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return false
      }

      // Check if Web Crypto API is available
      if (!window.crypto || !window.crypto.subtle) {
        return false
      }

      return true
    } catch (error) {
      console.error("Error checking biometric availability:", error)
      return false
    }
  }

  static async captureBiometric(): Promise<string> {
    try {
      console.log("Starting biometric capture...")

      // Check if biometric is available
      const isAvailable = await this.isAvailable()
      if (!isAvailable) {
        throw new Error("Biometric capture not available on this device")
      }

      // For web, we'll simulate the process with camera access
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
      this.videoElement = videoElement
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

  static async captureFromCanvas(canvas: HTMLCanvasElement): Promise<BiometricData> {
    try {
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        throw new Error("Unable to get canvas context")
      }

      // Simulate face detection on the canvas
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      // For demo purposes, generate simulated face data
      const biometricData: BiometricData = {
        faceId: `canvas_face_${Date.now()}`,
        landmarks: [
          { x: canvas.width / 2, y: canvas.height / 2 },
          { x: canvas.width / 2 - 20, y: canvas.height / 2 - 20 },
          { x: canvas.width / 2 + 20, y: canvas.height / 2 - 20 },
        ],
        bounds: {
          x: canvas.width / 2 - 60,
          y: canvas.height / 2 - 60,
          width: 120,
          height: 120,
        },
        confidence: 0.9,
        timestamp: Date.now(),
      }

      return biometricData
    } catch (error) {
      console.error("Error capturing from canvas:", error)
      throw error
    }
  }
}

export default BiometricService
