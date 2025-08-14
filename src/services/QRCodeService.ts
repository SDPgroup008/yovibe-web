import QRCode from "qrcode"
import CryptoJS from "crypto-js"

export interface QRCodeData {
  ticketId: string
  eventId: string
  eventName: string
  buyerId: string
  buyerName: string
  buyerPhone: string
  ticketType: string
  quantity: number
  totalAmount: number
  purchaseDate: string
  timestamp: number
  signature: string
  version: string
}

export interface QRCodeGenerationResult {
  success: boolean
  qrCodeData?: string
  qrCodeImage?: string
  error?: string
}

export default class QRCodeService {
  private static readonly SECRET_KEY = "YoVibe_Production_Secret_Key_2024_v2.0"
  private static readonly VERSION = "2.0"

  static generateTicketId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8).toUpperCase()
    const hash = CryptoJS.SHA256(`${timestamp}_${random}`).toString().substring(0, 8).toUpperCase()
    return `YV_${timestamp}_${hash}`
  }

  static generateHMACSignature(data: Omit<QRCodeData, "signature">): string {
    const dataString = JSON.stringify(data, Object.keys(data).sort())
    return CryptoJS.HmacSHA256(dataString, this.SECRET_KEY).toString()
  }

  static async generateQRCode(ticketData: {
    ticketId: string
    eventId: string
    eventName: string
    buyerId: string
    buyerName: string
    buyerPhone: string
    ticketType: string
    quantity: number
    totalAmount: number
    purchaseDate: string
  }): Promise<QRCodeGenerationResult> {
    try {
      console.log("QRCodeService.web: Generating QR code for ticket:", ticketData.ticketId)

      const timestamp = Date.now()

      // Create QR code data without signature first
      const qrDataWithoutSignature: Omit<QRCodeData, "signature"> = {
        ...ticketData,
        timestamp,
        version: this.VERSION,
      }

      // Generate HMAC signature
      const signature = this.generateHMACSignature(qrDataWithoutSignature)

      // Complete QR code data with signature
      const qrCodeData: QRCodeData = {
        ...qrDataWithoutSignature,
        signature,
      }

      console.log("QRCodeService.web: QR code data prepared:", {
        ticketId: qrCodeData.ticketId,
        eventName: qrCodeData.eventName,
        hasSignature: !!qrCodeData.signature,
      })

      // Generate QR code image with proper options
      const qrCodeImage = await QRCode.toDataURL(JSON.stringify(qrCodeData), {
        errorCorrectionLevel: "H",
        type: "image/png",
        margin: 1,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
        width: 512,
      })

      console.log("QRCodeService.web: QR code generated successfully")

      return {
        success: true,
        qrCodeData: JSON.stringify(qrCodeData),
        qrCodeImage,
      }
    } catch (error) {
      console.error("QRCodeService.web: Error generating QR code:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate QR code",
      }
    }
  }

  static validateQRCode(qrCodeDataString: string): {
    valid: boolean
    data?: QRCodeData
    error?: string
  } {
    try {
      console.log("QRCodeService.web: Validating QR code")

      const qrCodeData: QRCodeData = JSON.parse(qrCodeDataString)

      // Validate required fields
      const requiredFields = [
        "ticketId",
        "eventId",
        "eventName",
        "buyerId",
        "buyerName",
        "buyerPhone",
        "ticketType",
        "quantity",
        "totalAmount",
        "purchaseDate",
        "timestamp",
        "signature",
        "version",
      ]

      for (const field of requiredFields) {
        if (!(field in qrCodeData)) {
          return {
            valid: false,
            error: `Missing required field: ${field}`,
          }
        }
      }

      // Validate ticket ID format
      if (!this.validateTicketId(qrCodeData.ticketId)) {
        return {
          valid: false,
          error: "Invalid ticket ID format",
        }
      }

      // Validate version
      if (qrCodeData.version !== this.VERSION) {
        return {
          valid: false,
          error: `Unsupported QR code version: ${qrCodeData.version}`,
        }
      }

      // Validate HMAC signature
      const dataWithoutSignature = { ...qrCodeData }
      delete (dataWithoutSignature as any).signature
      const expectedSignature = this.generateHMACSignature(dataWithoutSignature)

      if (qrCodeData.signature !== expectedSignature) {
        return {
          valid: false,
          error: "Invalid signature - ticket may be forged",
        }
      }

      // Validate timestamp (not too old, not in future)
      const now = Date.now()
      const ticketAge = now - qrCodeData.timestamp
      const maxAge = 365 * 24 * 60 * 60 * 1000 // 1 year
      const futureThreshold = 5 * 60 * 1000 // 5 minutes

      if (ticketAge > maxAge) {
        return {
          valid: false,
          error: "Ticket is too old",
        }
      }

      if (qrCodeData.timestamp > now + futureThreshold) {
        return {
          valid: false,
          error: "Ticket timestamp is in the future",
        }
      }

      console.log("QRCodeService.web: QR code validation successful")

      return {
        valid: true,
        data: qrCodeData,
      }
    } catch (error) {
      console.error("QRCodeService.web: Error validating QR code:", error)
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Invalid QR code format",
      }
    }
  }

  static validateTicketId(ticketId: string): boolean {
    // Format: YV_[timestamp]_[hash]
    const pattern = /^YV_\d{13}_[A-F0-9]{8}$/
    return pattern.test(ticketId)
  }

  static extractTicketInfo(ticketId: string): {
    timestamp?: number
    hash?: string
    valid: boolean
  } {
    if (!this.validateTicketId(ticketId)) {
      return { valid: false }
    }

    const parts = ticketId.split("_")
    const timestamp = Number.parseInt(parts[1], 10)
    const hash = parts[2]

    return {
      timestamp,
      hash,
      valid: true,
    }
  }

  static async generateQRCodeImage(
    data: string,
    options?: {
      size?: number
      errorCorrectionLevel?: "L" | "M" | "Q" | "H"
    },
  ): Promise<string> {
    try {
      return await QRCode.toDataURL(data, {
        errorCorrectionLevel: options?.errorCorrectionLevel || "H",
        type: "image/png",
        margin: 1,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
        width: options?.size || 512,
      })
    } catch (error) {
      console.error("QRCodeService.web: Error generating QR code image:", error)
      throw error
    }
  }
}
