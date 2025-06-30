export interface BiometricData {
  hash: string
  confidence: number
  timestamp: Date
  features: number[]
}

export interface BiometricResult {
  success: boolean
  biometricData?: BiometricData
  error?: string
  message?: string
}

export interface BiometricVerificationResult {
  isValid: boolean
  confidence: number
  message: string
}

export class BiometricService {
  private static stream: MediaStream | null = null
  private static isCapturing = false

  static async isAvailable(): Promise<boolean> {
    try {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    } catch (error) {
      console.error("BiometricService: Error checking availability:", error)
      return false
    }
  }

  static async requestCameraPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
      })

      // Stop the stream immediately after getting permission
      stream.getTracks().forEach((track) => track.stop())
      return true
    } catch (error) {
      console.error("BiometricService: Camera permission denied:", error)
      return false
    }
  }

  static async startCamera(): Promise<MediaStream | null> {
    try {
      if (this.stream) {
        this.stopCamera()
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
      })

      return this.stream
    } catch (error) {
      console.error("BiometricService: Error starting camera:", error)
      throw error
    }
  }

  static stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }
    this.isCapturing = false
  }

  static async startCameraPreview(videoElement: HTMLVideoElement): Promise<void> {
    try {
      const stream = await this.startCamera()
      if (stream && videoElement) {
        videoElement.srcObject = stream
        await videoElement.play()
      }
    } catch (error) {
      console.error("BiometricService: Error starting camera preview:", error)
      throw error
    }
  }

  static stopCameraPreview(): void {
    this.stopCamera()
  }

  static async captureBiometric(): Promise<string> {
    try {
      if (this.isCapturing) {
        throw new Error("Biometric capture already in progress")
      }

      this.isCapturing = true

      // Start camera if not already started
      if (!this.stream) {
        await this.startCamera()
      }

      // Create a video element for capture
      const video = document.createElement("video")
      video.srcObject = this.stream
      video.autoplay = true
      video.muted = true

      // Wait for video to be ready
      await new Promise((resolve) => {
        video.onloadedmetadata = () => resolve(void 0)
      })

      // Wait a moment for the camera to stabilize
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Capture frame
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")!
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      ctx.drawImage(video, 0, 0)

      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      // Generate biometric hash from image data
      const hash = await this.generateBiometricHash(imageData)

      this.isCapturing = false
      return hash
    } catch (error) {
      this.isCapturing = false
      console.error("BiometricService: Error capturing biometric:", error)
      throw error
    }
  }

  static async processForTicketValidation(videoElement: HTMLVideoElement): Promise<BiometricResult> {
    try {
      if (!videoElement || videoElement.videoWidth === 0) {
        return {
          success: false,
          error: "Video element not ready",
        }
      }

      // Capture frame from video
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")!
      canvas.width = videoElement.videoWidth
      canvas.height = videoElement.videoHeight

      ctx.drawImage(videoElement, 0, 0)

      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      // Simulate face detection
      const faceDetected = await this.detectFace(imageData)
      if (!faceDetected) {
        return {
          success: false,
          error: "No face detected. Please look directly at the camera.",
        }
      }

      // Generate biometric hash
      const hash = await this.generateBiometricHash(imageData)

      // Extract features (simplified)
      const features = this.extractFeatures(imageData)

      const biometricData: BiometricData = {
        hash,
        confidence: 0.85 + Math.random() * 0.1, // Simulate confidence
        timestamp: new Date(),
        features,
      }

      return {
        success: true,
        biometricData,
        message: "Biometric data captured successfully",
      }
    } catch (error) {
      console.error("BiometricService: Error processing for validation:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  static async verifyBiometric(storedHash: string, capturedHash: string): Promise<BiometricVerificationResult> {
    try {
      // In a real implementation, this would use sophisticated biometric matching algorithms
      // For now, we'll simulate the verification process

      if (!storedHash || !capturedHash) {
        return {
          isValid: false,
          confidence: 0,
          message: "Missing biometric data",
        }
      }

      // Remove placeholder suffix if present
      const cleanStoredHash = storedHash.replace("_PLACEHOLDER", "")

      // Simulate biometric matching with some tolerance
      const similarity = this.calculateHashSimilarity(cleanStoredHash, capturedHash)
      const threshold = 0.7 // 70% similarity threshold

      const isValid = similarity >= threshold

      return {
        isValid,
        confidence: similarity,
        message: isValid
          ? `Biometric verification successful (${Math.round(similarity * 100)}% match)`
          : `Biometric verification failed (${Math.round(similarity * 100)}% match, required ${Math.round(threshold * 100)}%)`,
      }
    } catch (error) {
      console.error("BiometricService: Error verifying biometric:", error)
      return {
        isValid: false,
        confidence: 0,
        message: "Verification error occurred",
      }
    }
  }

  private static async generateBiometricHash(imageData: ImageData): Promise<string> {
    try {
      // Convert image data to a string representation
      const dataString = Array.from(imageData.data).join(",")

      // Use Web Crypto API to generate hash
      const encoder = new TextEncoder()
      const data = encoder.encode(dataString)
      const hashBuffer = await crypto.subtle.digest("SHA-256", data)

      // Convert to hex string
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")

      return hashHex
    } catch (error) {
      console.error("BiometricService: Error generating hash:", error)
      // Fallback to simple hash
      return this.simpleHash(imageData.data.toString())
    }
  }

  private static simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16)
  }

  private static async detectFace(imageData: ImageData): Promise<boolean> {
    // Simplified face detection simulation
    // In a real implementation, you would use a library like face-api.js or MediaPipe

    const { width, height, data } = imageData

    // Look for skin-tone pixels in the center region (very basic)
    const centerX = Math.floor(width / 2)
    const centerY = Math.floor(height / 2)
    const regionSize = Math.min(width, height) / 4

    let skinPixels = 0
    let totalPixels = 0

    for (let y = centerY - regionSize; y < centerY + regionSize; y++) {
      for (let x = centerX - regionSize; x < centerX + regionSize; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const index = (y * width + x) * 4
          const r = data[index]
          const g = data[index + 1]
          const b = data[index + 2]

          // Very basic skin tone detection
          if (this.isSkinTone(r, g, b)) {
            skinPixels++
          }
          totalPixels++
        }
      }
    }

    const skinRatio = skinPixels / totalPixels
    return skinRatio > 0.1 // At least 10% skin-tone pixels
  }

  private static isSkinTone(r: number, g: number, b: number): boolean {
    // Very basic skin tone detection
    return r > 95 && g > 40 && b > 20 && r > g && r > b && r - g > 15 && Math.abs(r - g) > 15
  }

  private static extractFeatures(imageData: ImageData): number[] {
    // Simplified feature extraction
    // In a real implementation, you would extract facial landmarks, distances, etc.

    const features: number[] = []
    const { width, height, data } = imageData

    // Extract some basic statistical features
    let rSum = 0,
      gSum = 0,
      bSum = 0
    let rVar = 0,
      gVar = 0,
      bVar = 0

    for (let i = 0; i < data.length; i += 4) {
      rSum += data[i]
      gSum += data[i + 1]
      bSum += data[i + 2]
    }

    const pixelCount = data.length / 4
    const rMean = rSum / pixelCount
    const gMean = gSum / pixelCount
    const bMean = bSum / pixelCount

    for (let i = 0; i < data.length; i += 4) {
      rVar += Math.pow(data[i] - rMean, 2)
      gVar += Math.pow(data[i + 1] - gMean, 2)
      bVar += Math.pow(data[i + 2] - bMean, 2)
    }

    features.push(rMean, gMean, bMean)
    features.push(rVar / pixelCount, gVar / pixelCount, bVar / pixelCount)
    features.push(width, height)

    return features
  }

  private static calculateHashSimilarity(hash1: string, hash2: string): number {
    if (hash1 === hash2) return 1.0

    const minLength = Math.min(hash1.length, hash2.length)
    let matches = 0

    for (let i = 0; i < minLength; i++) {
      if (hash1[i] === hash2[i]) {
        matches++
      }
    }

    return matches / Math.max(hash1.length, hash2.length)
  }
}
