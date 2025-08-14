import QRCode from "qrcode"
import jsQR from "jsqr"
import CryptoJS from "crypto-js"
import type { TicketType } from "../models/Ticket"

export interface QRCodeData {
  ticketId: string
  eventId: string
  eventName: string
  buyerId: string
  buyerName: string
  ticketType: TicketType
  quantity: number
  purchaseDate: string
  timestamp: number
  signature: string
  version: string
}

export class QRCodeService {
  private static readonly SECRET_KEY = "yovibe_production_secret_2024_hmac_key" // Production secret key
  private static readonly VERSION = "2.0"

  static async generateQRCode(
    ticketId: string,
    eventId: string,
    buyerId: string,
    ticketType: TicketType,
    eventName?: string,
    buyerName?: string,
    quantity = 1,
  ): Promise<string> {
    try {
      const timestamp = Date.now()
      const purchaseDate = new Date().toISOString()

      // Create the data payload
      const payload = {
        ticketId,
        eventId,
        eventName: eventName || "Unknown Event",
        buyerId,
        buyerName: buyerName || "Unknown Buyer",
        ticketType,
        quantity,
        purchaseDate,
        timestamp,
        version: this.VERSION,
      }

      // Generate HMAC signature to prevent tampering
      const dataString = JSON.stringify(payload)
      const signature = this.generateHMACSignature(dataString)

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

      // Check version compatibility
      if (!qrData.version || qrData.version !== this.VERSION) {
        return {
          valid: false,
          error: "Incompatible QR code version",
        }
      }

      // Verify HMAC signature
      const payload = {
        ticketId: qrData.ticketId,
        eventId: qrData.eventId,
        eventName: qrData.eventName,
        buyerId: qrData.buyerId,
        buyerName: qrData.buyerName,
        ticketType: qrData.ticketType,
        quantity: qrData.quantity,
        purchaseDate: qrData.purchaseDate,
        timestamp: qrData.timestamp,
        version: qrData.version,
      }

      const dataString = JSON.stringify(payload)
      const expectedSignature = this.generateHMACSignature(dataString)

      if (expectedSignature !== qrData.signature) {
        return {
          valid: false,
          error: "Invalid QR code signature - ticket may be forged",
        }
      }

      // Check if QR code is not too old (48 hours for flexibility)
      const maxAge = 48 * 60 * 60 * 1000 // 48 hours in milliseconds
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
        errorCorrectionLevel: "M", // Medium error correction for better scanning
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

  private static generateHMACSignature(data: string): string {
    try {
      // Generate HMAC-SHA256 signature using CryptoJS
      const signature = CryptoJS.HmacSHA256(data, this.SECRET_KEY)
      return signature.toString(CryptoJS.enc.Hex)
    } catch (error) {
      console.error("Error generating HMAC signature:", error)
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

  // Utility method to generate unique ticket IDs
  static generateTicketId(): string {
    const timestamp = Date.now()
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase()
    return `YV_${timestamp}_${randomPart}`
  }

  // Utility method to extract ticket info from QR data
  static extractTicketInfo(qrCodeData: string): QRCodeData | null {
    try {
      const decodedString = atob(qrCodeData)
      return JSON.parse(decodedString) as QRCodeData
    } catch (error) {
      console.error("Error extracting ticket info:", error)
      return null
    }
  }
}

export default QRCodeService
