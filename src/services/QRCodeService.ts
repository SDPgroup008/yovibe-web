import QRCode from "qrcode"
import jsQR from "jsqr"
import type { TicketType } from "../models/Ticket"

export interface QRCodeData {
  ticketId: string
  eventId: string
  buyerId: string
  ticketType: TicketType
  timestamp: number
  signature: string
}

export class QRCodeService {
  private static SECRET_KEY = "yovibe_secret_key_2024" // In production, use environment variable

  static async generateQRCode(
    ticketId: string,
    eventId: string,
    buyerId: string,
    ticketType: TicketType,
  ): Promise<string> {
    try {
      const timestamp = Date.now()

      // Create the data payload
      const payload = {
        ticketId,
        eventId,
        buyerId,
        ticketType,
        timestamp,
      }

      // Generate signature to prevent tampering
      const dataString = JSON.stringify(payload)
      const signature = await this.generateSignature(`${dataString}_${this.SECRET_KEY}`)

      // Create final QR code data
      const qrData: QRCodeData = {
        ...payload,
        signature,
      }

      // Encode as base64 for QR code
      const qrString = JSON.stringify(qrData)
      const base64Data = btoa(qrString)

      console.log("QR Code generated for ticket:", ticketId, "Type:", ticketType)
      return base64Data
    } catch (error) {
      console.error("Error generating QR code:", error)
      throw error
    }
  }

  static async validateQRCode(qrCodeData: string): Promise<{ valid: boolean; data?: QRCodeData; error?: string }> {
    try {
      // Decode from base64
      const decodedString = atob(qrCodeData)
      const qrData: QRCodeData = JSON.parse(decodedString)

      // Verify signature
      const payload = {
        ticketId: qrData.ticketId,
        eventId: qrData.eventId,
        buyerId: qrData.buyerId,
        ticketType: qrData.ticketType,
        timestamp: qrData.timestamp,
      }

      const dataString = JSON.stringify(payload)
      const expectedSignature = await this.generateSignature(`${dataString}_${this.SECRET_KEY}`)

      if (expectedSignature !== qrData.signature) {
        return {
          valid: false,
          error: "Invalid QR code signature",
        }
      }

      // Check if QR code is not too old (24 hours)
      const maxAge = 24 * 60 * 60 * 1000 // 24 hours in milliseconds
      const age = Date.now() - qrData.timestamp

      if (age > maxAge) {
        return {
          valid: false,
          error: "QR code has expired",
        }
      }

      console.log("QR Code validated successfully for ticket:", qrData.ticketId, "Type:", qrData.ticketType)
      return {
        valid: true,
        data: qrData,
      }
    } catch (error) {
      console.error("Error validating QR code:", error)
      return {
        valid: false,
        error: "Invalid QR code format",
      }
    }
  }

  static async generateQRCodeImage(data: string, size = 200): Promise<string> {
    try {
      // Generate QR code as data URL
      const qrCodeDataURL = await QRCode.toDataURL(data, {
        width: size,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      })

      return qrCodeDataURL
    } catch (error) {
      console.error("Error generating QR code image:", error)
      throw error
    }
  }

  static async scanQRCodeFromVideo(videoElement: HTMLVideoElement): Promise<string | null> {
    try {
      // Create canvas to capture video frame
      const canvas = document.createElement("canvas")
      const context = canvas.getContext("2d")!

      canvas.width = videoElement.videoWidth
      canvas.height = videoElement.videoHeight

      // Draw current video frame to canvas
      context.drawImage(videoElement, 0, 0, canvas.width, canvas.height)

      // Get image data from canvas
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height)

      // Scan for QR code
      const code = jsQR(imageData.data, imageData.width, imageData.height)

      if (code) {
        console.log("QR Code detected:", code.data.substring(0, 50) + "...")
        return code.data
      }

      return null
    } catch (error) {
      console.error("Error scanning QR code:", error)
      return null
    }
  }

  static async scanQRCodeFromImage(imageFile: File): Promise<string | null> {
    try {
      return new Promise((resolve, reject) => {
        const canvas = document.createElement("canvas")
        const context = canvas.getContext("2d")!
        const img = new Image()

        img.onload = () => {
          canvas.width = img.width
          canvas.height = img.height
          context.drawImage(img, 0, 0)

          const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height)

          if (code) {
            console.log("QR Code detected from image:", code.data.substring(0, 50) + "...")
            resolve(code.data)
          } else {
            resolve(null)
          }
        }

        img.onerror = () => reject(new Error("Failed to load image"))
        img.src = URL.createObjectURL(imageFile)
      })
    } catch (error) {
      console.error("Error scanning QR code from image:", error)
      return null
    }
  }

  private static async generateSignature(data: string): Promise<string> {
    try {
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

  static generateQRCodeSVG(data: string, size = 200): string {
    // This is a simplified QR code SVG generator
    // In production, you'd use the qrcode library's SVG output
    const cellSize = size / 25 // 25x25 grid
    let svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">`

    // Generate a simple pattern based on the data hash
    const hash = data.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)

    for (let row = 0; row < 25; row++) {
      for (let col = 0; col < 25; col++) {
        const shouldFill = (hash + row * col) % 3 === 0
        if (shouldFill) {
          const x = col * cellSize
          const y = row * cellSize
          svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="black"/>`
        }
      }
    }

    svg += "</svg>"
    return svg
  }
}

export default QRCodeService
