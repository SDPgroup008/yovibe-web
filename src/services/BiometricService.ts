export interface BiometricData {
  faceImage: string
  hash: string
  timestamp: Date
  confidence: number
}

export interface BiometricVerificationResult {
  isValid: boolean
  confidence: number
  message: string
}

export class BiometricService {
  private static instance: BiometricService
  private stream: MediaStream | null = null

  static getInstance(): BiometricService {
    if (!BiometricService.instance) {
      BiometricService.instance = new BiometricService()
    }
    return BiometricService.instance
  }

  async requestCameraPermission(): Promise<boolean> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn("Camera not supported in this browser")
        return false
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
      })

      // Test if we can access the camera
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
        return true
      }
      return false
    } catch (error) {
      console.error("Camera permission denied:", error)
      return false
    }
  }

  async startCamera(): Promise<MediaStream | null> {
    try {
      if (this.stream) {
        return this.stream
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
      })

      return this.stream
    } catch (error) {
      console.error("Error starting camera:", error)
      return null
    }
  }

  stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }
  }

  async captureImage(videoElement: HTMLVideoElement): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const canvas = document.createElement("canvas")
        const context = canvas.getContext("2d")

        if (!context) {
          reject(new Error("Could not get canvas context"))
          return
        }

        canvas.width = videoElement.videoWidth || 640
        canvas.height = videoElement.videoHeight || 480

        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height)

        const imageData = canvas.toDataURL("image/jpeg", 0.8)
        resolve(imageData)
      } catch (error) {
        reject(error)
      }
    })
  }

  async generateBiometricHash(imageData: string): Promise<string> {
    try {
      // Convert base64 to array buffer
      const base64Data = imageData.split(",")[1]
      const binaryString = atob(base64Data)
      const bytes = new Uint8Array(binaryString.length)

      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // Generate hash using Web Crypto API
      const hashBuffer = await crypto.subtle.digest("SHA-256", bytes)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")

      return hashHex
    } catch (error) {
      console.error("Error generating biometric hash:", error)
      // Fallback to simple hash
      return this.simpleHash(imageData)
    }
  }

  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16)
  }

  async captureBiometricData(videoElement: HTMLVideoElement): Promise<BiometricData> {
    try {
      const faceImage = await this.captureImage(videoElement)
      const hash = await this.generateBiometricHash(faceImage)

      return {
        faceImage,
        hash,
        timestamp: new Date(),
        confidence: 0.85, // Simulated confidence score
      }
    } catch (error) {
      console.error("Error capturing biometric data:", error)
      throw error
    }
  }

  async verifyBiometric(capturedHash: string, storedHash: string): Promise<BiometricVerificationResult> {
    try {
      // Simple hash comparison for now
      const isValid = capturedHash === storedHash

      return {
        isValid,
        confidence: isValid ? 0.95 : 0.1,
        message: isValid ? "Biometric verification successful" : "Biometric verification failed",
      }
    } catch (error) {
      console.error("Error verifying biometric:", error)
      return {
        isValid: false,
        confidence: 0,
        message: "Verification error occurred",
      }
    }
  }

  // Face detection simulation (placeholder for real implementation)
  async detectFace(imageData: string): Promise<boolean> {
    try {
      // This is a placeholder - in a real implementation, you would use
      // a face detection library like face-api.js or TensorFlow.js

      // For now, we'll simulate face detection by checking image size and format
      if (!imageData || !imageData.startsWith("data:image/")) {
        return false
      }

      // Simulate processing time
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Return true if image seems valid (90% success rate simulation)
      return Math.random() > 0.1
    } catch (error) {
      console.error("Error detecting face:", error)
      return false
    }
  }

  async processForTicketValidation(videoElement: HTMLVideoElement): Promise<{
    success: boolean
    biometricData?: BiometricData
    error?: string
  }> {
    try {
      // Capture the image
      const faceImage = await this.captureImage(videoElement)

      // Check if face is detected
      const faceDetected = await this.detectFace(faceImage)
      if (!faceDetected) {
        return {
          success: false,
          error: "No face detected. Please position your face clearly in the camera.",
        }
      }

      // Generate biometric data
      const biometricData = await this.captureBiometricData(videoElement)

      return {
        success: true,
        biometricData,
      }
    } catch (error) {
      console.error("Error processing biometric for ticket validation:", error)
      return {
        success: false,
        error: "Failed to process biometric data. Please try again.",
      }
    }
  }
}

export default BiometricService.getInstance()
