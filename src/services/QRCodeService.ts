import QRCode from "qrcode"
import jsQR from "jsqr"

export interface QRCodeData {
  ticketId: string
  eventId: string
  timestamp: number
  signature: string
  version: string
}

export interface QRScanResult {
  success: boolean
  data?: QRCodeData
  error?: string
}

export class QRCodeService {
  private static readonly SECRET_KEY = "YoVibe_QR_Secret_2024"
  private static readonly VERSION = "1.0"

  static createTicketQRData(ticketId: string, eventId: string): QRCodeData {
    const timestamp = Date.now()
    const dataToSign = `${ticketId}:${eventId}:${timestamp}`
    const signature = this.generateSignature(dataToSign)

    return {
      ticketId,
      eventId,
      timestamp,
      signature,
      version: this.VERSION,
    }
  }

  static async generateQRCode(data: string | QRCodeData): Promise<string> {
    try {
      let jsonString: string

      if (typeof data === "string") {
        jsonString = data
      } else {
        jsonString = JSON.stringify(data)
      }

      const base64Data = btoa(jsonString)

      const qrCodeDataURL = await QRCode.toDataURL(base64Data, {
        errorCorrectionLevel: "M",
        type: "image/png",
        margin: 1,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
        width: 256,
      })

      return qrCodeDataURL
    } catch (error) {
      console.error("QRCodeService: Error generating QR code:", error)
      throw error
    }
  }

  static async generateQRCodeImage(data: string, size = 256): Promise<string> {
    try {
      return await QRCode.toDataURL(data, {
        errorCorrectionLevel: "M",
        type: "image/png",
        margin: 1,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
        width: size,
      })
    } catch (error) {
      console.error("QRCodeService: Error generating QR code image:", error)
      throw error
    }
  }

  static async scanFromVideo(videoElement: HTMLVideoElement): Promise<QRScanResult> {
    try {
      if (!videoElement || videoElement.videoWidth === 0) {
        return {
          success: false,
          error: "Video element not ready",
        }
      }

      // Create canvas and capture frame
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")!

      canvas.width = videoElement.videoWidth
      canvas.height = videoElement.videoHeight

      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height)

      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      // Scan for QR code
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      })

      if (code) {
        return this.parseQRCode(code.data)
      }

      return {
        success: false,
        error: "No QR code detected",
      }
    } catch (error) {
      console.error("QRCodeService: Error scanning from video:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Scan error",
      }
    }
  }

  static async scanFromFile(file: File): Promise<QRScanResult> {
    try {
      return new Promise((resolve) => {
        const reader = new FileReader()

        reader.onload = (event) => {
          const img = new Image()

          img.onload = () => {
            const canvas = document.createElement("canvas")
            const ctx = canvas.getContext("2d")!

            canvas.width = img.width
            canvas.height = img.height

            ctx.drawImage(img, 0, 0)

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "dontInvert",
            })

            if (code) {
              resolve(this.parseQRCode(code.data))
            } else {
              resolve({
                success: false,
                error: "No QR code found in image",
              })
            }
          }

          img.onerror = () => {
            resolve({
              success: false,
              error: "Failed to load image",
            })
          }

          img.src = event.target?.result as string
        }

        reader.onerror = () => {
          resolve({
            success: false,
            error: "Failed to read file",
          })
        }

        reader.readAsDataURL(file)
      })
    } catch (error) {
      console.error("QRCodeService: Error scanning from file:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "File scan error",
      }
    }
  }

  static parseQRCode(qrData: string): QRScanResult {
    try {
      // Decode base64
      const jsonString = atob(qrData)
      const data: QRCodeData = JSON.parse(jsonString)

      // Validate structure
      if (!data.ticketId || !data.eventId || !data.signature || !data.timestamp) {
        return {
          success: false,
          error: "Invalid QR code format",
        }
      }

      // Validate signature
      if (!this.validateSignature(data)) {
        return {
          success: false,
          error: "Invalid QR code signature",
        }
      }

      // Check if not too old (24 hours)
      const maxAge = 24 * 60 * 60 * 1000 // 24 hours in milliseconds
      if (Date.now() - data.timestamp > maxAge) {
        return {
          success: false,
          error: "QR code has expired",
        }
      }

      return {
        success: true,
        data,
      }
    } catch (error) {
      console.error("QRCodeService: Error parsing QR code:", error)
      return {
        success: false,
        error: "Failed to parse QR code",
      }
    }
  }

  static validateSignature(data: QRCodeData): boolean {
    try {
      const dataToSign = `${data.ticketId}:${data.eventId}:${data.timestamp}`
      const expectedSignature = this.generateSignature(dataToSign)
      return data.signature === expectedSignature
    } catch (error) {
      console.error("QRCodeService: Error validating signature:", error)
      return false
    }
  }

  private static generateSignature(data: string): string {
    // Simple signature generation using the secret key
    // In production, use a proper HMAC or digital signature
    let hash = 0
    const combined = data + this.SECRET_KEY

    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(16)
  }

  static async scanQRCodeFromVideo(videoElement: HTMLVideoElement): Promise<string | null> {
    try {
      const result = await this.scanFromVideo(videoElement)
      if (result.success && result.data) {
        return btoa(JSON.stringify(result.data))
      }
      return null
    } catch (error) {
      console.error("QRCodeService: Error scanning QR code from video:", error)
      return null
    }
  }

  static async scanQRCodeFromImage(file: File): Promise<string | null> {
    try {
      const result = await this.scanFromFile(file)
      if (result.success && result.data) {
        return btoa(JSON.stringify(result.data))
      }
      return null
    } catch (error) {
      console.error("QRCodeService: Error scanning QR code from image:", error)
      return null
    }
  }

  static async validateQRCode(qrData: string): Promise<{ valid: boolean; data?: QRCodeData; error?: string }> {
    try {
      const result = this.parseQRCode(qrData)
      return {
        valid: result.success,
        data: result.data,
        error: result.error,
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Validation error",
      }
    }
  }
}

export default QRCodeService
