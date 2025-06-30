import QRCode from "qrcode"
import jsQR from "jsqr"

export interface QRCodeData {
  ticketId: string
  eventId: string
  timestamp: number
  signature: string
}

export interface QRScanResult {
  success: boolean
  data?: QRCodeData
  error?: string
}

export class QRCodeService {
  private static instance: QRCodeService

  static getInstance(): QRCodeService {
    if (!QRCodeService.instance) {
      QRCodeService.instance = new QRCodeService()
    }
    return QRCodeService.instance
  }

  async generateQRCode(data: QRCodeData): Promise<string> {
    try {
      const jsonData = JSON.stringify(data)
      const qrCodeDataURL = await QRCode.toDataURL(jsonData, {
        width: 256,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      })
      return qrCodeDataURL
    } catch (error) {
      console.error("Error generating QR code:", error)
      throw new Error("Failed to generate QR code")
    }
  }

  async scanQRCode(imageData: string): Promise<QRScanResult> {
    try {
      // Convert data URL to image data
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        return { success: false, error: "Could not create canvas context" }
      }

      return new Promise((resolve) => {
        const img = new Image()
        img.crossOrigin = "anonymous"

        img.onload = () => {
          canvas.width = img.width
          canvas.height = img.height
          ctx.drawImage(img, 0, 0)

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height)

          if (code) {
            try {
              const qrData = JSON.parse(code.data) as QRCodeData
              resolve({ success: true, data: qrData })
            } catch (parseError) {
              resolve({ success: false, error: "Invalid QR code format" })
            }
          } else {
            resolve({ success: false, error: "No QR code found in image" })
          }
        }

        img.onerror = () => {
          resolve({ success: false, error: "Failed to load image" })
        }

        img.src = imageData
      })
    } catch (error) {
      console.error("Error scanning QR code:", error)
      return { success: false, error: "Failed to scan QR code" }
    }
  }

  async scanFromVideo(videoElement: HTMLVideoElement): Promise<QRScanResult> {
    try {
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        return { success: false, error: "Could not create canvas context" }
      }

      canvas.width = videoElement.videoWidth
      canvas.height = videoElement.videoHeight
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height)

      if (code) {
        try {
          const qrData = JSON.parse(code.data) as QRCodeData
          return { success: true, data: qrData }
        } catch (parseError) {
          return { success: false, error: "Invalid QR code format" }
        }
      } else {
        return { success: false, error: "No QR code detected" }
      }
    } catch (error) {
      console.error("Error scanning QR code from video:", error)
      return { success: false, error: "Failed to scan QR code" }
    }
  }

  async scanFromFile(file: File): Promise<QRScanResult> {
    try {
      return new Promise((resolve) => {
        const reader = new FileReader()

        reader.onload = async (e) => {
          if (e.target?.result) {
            const result = await this.scanQRCode(e.target.result as string)
            resolve(result)
          } else {
            resolve({ success: false, error: "Failed to read file" })
          }
        }

        reader.onerror = () => {
          resolve({ success: false, error: "Failed to read file" })
        }

        reader.readAsDataURL(file)
      })
    } catch (error) {
      console.error("Error scanning QR code from file:", error)
      return { success: false, error: "Failed to scan QR code from file" }
    }
  }

  generateSignature(ticketId: string, eventId: string, timestamp: number): string {
    // Simple signature generation - in production, use proper cryptographic signing
    const data = `${ticketId}-${eventId}-${timestamp}`
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16)
  }

  validateSignature(data: QRCodeData): boolean {
    const expectedSignature = this.generateSignature(data.ticketId, data.eventId, data.timestamp)
    return data.signature === expectedSignature
  }

  createTicketQRData(ticketId: string, eventId: string): QRCodeData {
    const timestamp = Date.now()
    const signature = this.generateSignature(ticketId, eventId, timestamp)

    return {
      ticketId,
      eventId,
      timestamp,
      signature,
    }
  }
}

export default QRCodeService.getInstance()
