import QRCode from "qrcode"
import jsQR from "jsqr"

export interface QRCodeData {
  ticketId: string
  eventId: string
  buyerId: string
  ticketType: "regular" | "secure"
  timestamp: number
  signature: string
}

export class QRCodeService {
  private static readonly SECRET_KEY = "yovibe_qr_secret_2024"

  static async generateQRCode(
    ticketId: string,
    eventId: string,
    buyerId: string,
    ticketType: "regular" | "secure",
  ): Promise<string> {
    try {
      const timestamp = Date.now()
      const qrData: QRCodeData = {
        ticketId,
        eventId,
        buyerId,
        ticketType,
        timestamp,
        signature: await this.generateSignature(ticketId, eventId, buyerId, ticketType, timestamp),
      }

      const qrDataString = JSON.stringify(qrData)
      const encodedData = btoa(qrDataString) // Base64 encode

      console.log("Generated QR code for ticket:", ticketId, "Type:", ticketType)
      return encodedData
    } catch (error) {
      console.error("Error generating QR code:", error)
      throw error
    }
  }

  static async validateQRCode(qrCodeData: string): Promise<{ valid: boolean; data?: QRCodeData; error?: string }> {
    try {
      // Decode the base64 data
      const decodedString = atob(qrCodeData)
      const qrData: QRCodeData = JSON.parse(decodedString)

      // Validate signature
      const expectedSignature = await this.generateSignature(
        qrData.ticketId,
        qrData.eventId,
        qrData.buyerId,
        qrData.ticketType,
        qrData.timestamp,
      )

      if (qrData.signature !== expectedSignature) {
        return { valid: false, error: "Invalid QR code signature" }
      }

      // Check if QR code is not too old (24 hours)
      const maxAge = 24 * 60 * 60 * 1000 // 24 hours in milliseconds
      if (Date.now() - qrData.timestamp > maxAge) {
        return { valid: false, error: "QR code has expired" }
      }

      return { valid: true, data: qrData }
    } catch (error) {
      console.error("Error validating QR code:", error)
      return { valid: false, error: "Invalid QR code format" }
    }
  }

  private static async generateSignature(
    ticketId: string,
    eventId: string,
    buyerId: string,
    ticketType: string,
    timestamp: number,
  ): Promise<string> {
    try {
      const data = `${ticketId}:${eventId}:${buyerId}:${ticketType}:${timestamp}:${this.SECRET_KEY}`
      const encoder = new TextEncoder()
      const dataBuffer = encoder.encode(data)
      const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
      return hashHex
    } catch (error) {
      console.error("Error generating signature:", error)
      throw error
    }
  }

  static async generateQRCodeImage(qrCodeData: string, size = 200): Promise<string> {
    try {
      const qrCodeImageURL = await QRCode.toDataURL(qrCodeData, {
        width: size,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      })
      return qrCodeImageURL
    } catch (error) {
      console.error("Error generating QR code image:", error)
      throw error
    }
  }

  static async scanQRCodeFromVideo(videoElement: HTMLVideoElement): Promise<string | null> {
    try {
      const canvas = document.createElement("canvas")
      const context = canvas.getContext("2d")

      if (!context) {
        throw new Error("Unable to create canvas context")
      }

      canvas.width = videoElement.videoWidth
      canvas.height = videoElement.videoHeight

      context.drawImage(videoElement, 0, 0, canvas.width, canvas.height)

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height)

      if (code) {
        return code.data
      }

      return null
    } catch (error) {
      console.error("Error scanning QR code from video:", error)
      return null
    }
  }

  static async scanQRCodeFromImage(imageFile: File): Promise<string | null> {
    try {
      return new Promise((resolve, reject) => {
        const canvas = document.createElement("canvas")
        const context = canvas.getContext("2d")
        const img = new Image()

        if (!context) {
          reject(new Error("Unable to create canvas context"))
          return
        }

        img.onload = () => {
          canvas.width = img.width
          canvas.height = img.height
          context.drawImage(img, 0, 0)

          const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height)

          if (code) {
            resolve(code.data)
          } else {
            resolve(null)
          }
        }

        img.onerror = () => {
          reject(new Error("Failed to load image"))
        }

        img.src = URL.createObjectURL(imageFile)
      })
    } catch (error) {
      console.error("Error scanning QR code from image:", error)
      return null
    }
  }

  static async generateTicketQRCode(ticketData: any): Promise<{ qrCode: string; qrImage: string }> {
    try {
      const qrCode = await this.generateQRCode(
        ticketData.ticketId,
        ticketData.eventId,
        ticketData.buyerId,
        ticketData.ticketType,
      )

      const qrImage = await this.generateQRCodeImage(qrCode, 300)

      return { qrCode, qrImage }
    } catch (error) {
      console.error("Error generating ticket QR code:", error)
      throw error
    }
  }
}

export default QRCodeService
