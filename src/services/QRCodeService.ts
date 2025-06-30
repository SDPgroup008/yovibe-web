import * as Crypto from "expo-crypto"

export interface QRCodeData {
  ticketId: string
  eventId: string
  buyerId: string
  timestamp: number
  signature: string
}

export class QRCodeService {
  private static SECRET_KEY = "yovibe_secret_key_2024" // In production, use environment variable

  static async generateQRCode(ticketId: string, eventId: string, buyerId: string): Promise<string> {
    try {
      const timestamp = Date.now()

      // Create the data payload
      const payload = {
        ticketId,
        eventId,
        buyerId,
        timestamp,
      }

      // Generate signature to prevent tampering
      const dataString = JSON.stringify(payload)
      const signature = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${dataString}_${this.SECRET_KEY}`,
      )

      // Create final QR code data
      const qrData: QRCodeData = {
        ...payload,
        signature,
      }

      // Encode as base64 for QR code
      const qrString = JSON.stringify(qrData)
      const base64Data = btoa(qrString)

      console.log("QR Code generated for ticket:", ticketId)
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
        timestamp: qrData.timestamp,
      }

      const dataString = JSON.stringify(payload)
      const expectedSignature = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${dataString}_${this.SECRET_KEY}`,
      )

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

      console.log("QR Code validated successfully for ticket:", qrData.ticketId)
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

  static generateQRCodeSVG(data: string, size = 200): string {
    // This is a simplified QR code SVG generator
    // In production, you'd use a proper QR code library like 'qrcode' or 'react-native-qrcode-svg'

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
