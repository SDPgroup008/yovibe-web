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
  private static readonly SECRET_KEY = "yovibe_secret_key_2024" // In production, use environment variable

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
      const signature = await this.generateSignature(dataString)

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

  static async validateQRCode(qrCodeData: string): Promise<{
    valid: boolean
    data?: QRCodeData
    error?: string
  }> {
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
      const expectedSignature = await this.generateSignature(dataString)

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

  static async scanQRCodeFromImage(imageData: ImageData): Promise<string | null> {
    try {
      const code = jsQR(imageData.data, imageData.width, imageData.height)
      return code ? code.data : null
    } catch (error) {
      console.error("Error scanning QR code from image:", error)
      return null
    }
  }

  static async scanQRCodeFromVideo(video: HTMLVideoElement): Promise<string | null> {
    try {
      const canvas = document.createElement("canvas")
      const context = canvas.getContext("2d")

      if (!context) return null

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height)

      return code ? code.data : null
    } catch (error) {
      console.error("Error scanning QR code from video:", error)
      return null
    }
  }

  private static async generateSignature(data: string): Promise<string> {
    try {
      // Use Web Crypto API for signature generation
      const encoder = new TextEncoder()
      const keyData = encoder.encode(this.SECRET_KEY)
      const messageData = encoder.encode(data)

      // Import key for HMAC
      const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])

      // Generate signature
      const signature = await crypto.subtle.sign("HMAC", key, messageData)

      // Convert to hex string
      const signatureArray = Array.from(new Uint8Array(signature))
      const signatureHex = signatureArray.map((b) => b.toString(16).padStart(2, "0")).join("")

      return signatureHex
    } catch (error) {
      console.error("Error generating signature:", error)
      throw error
    }
  }

  static createQRScanner(): {
    start: (video: HTMLVideoElement, onScan: (data: string) => void) => void
    stop: () => void
  } {
    let isScanning = false
    let animationFrame: number

    const scanFrame = (video: HTMLVideoElement, onScan: (data: string) => void) => {
      if (!isScanning) return

      this.scanQRCodeFromVideo(video)
        .then((data) => {
          if (data) {
            onScan(data)
            return
          }

          // Continue scanning
          animationFrame = requestAnimationFrame(() => scanFrame(video, onScan))
        })
        .catch((error) => {
          console.error("QR scan error:", error)
          animationFrame = requestAnimationFrame(() => scanFrame(video, onScan))
        })
    }

    return {
      start: (video: HTMLVideoElement, onScan: (data: string) => void) => {
        isScanning = true
        scanFrame(video, onScan)
      },
      stop: () => {
        isScanning = false
        if (animationFrame) {
          cancelAnimationFrame(animationFrame)
        }
      },
    }
  }
}

export default QRCodeService
