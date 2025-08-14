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
  signature?: string
}

export interface QRCodeResult {
  success: boolean
  qrCodeData?: string
  qrCodeImage?: string
  error?: string
}

export default class QRCodeService {
  private static readonly SECRET_KEY = "YoVibe_QR_Secret_2024"
  private static readonly QR_VERSION = "1.0"

  // Generate QR code with secure signature
  static async generateQRCode(data: QRCodeData): Promise<QRCodeResult> {
    try {
      console.log("QRCodeService: Generating QR code for ticket:", data.ticketId)

      // Create secure payload
      const payload = {
        v: this.QR_VERSION,
        tid: data.ticketId,
        eid: data.eventId,
        en: data.eventName,
        bid: data.buyerId,
        bn: data.buyerName,
        bp: data.buyerPhone,
        tt: data.ticketType,
        qty: data.quantity,
        amt: data.totalAmount,
        pd: data.purchaseDate,
        ts: Date.now(),
      }

      // Generate HMAC signature
      const signature = this.generateSignature(payload)
      const securePayload = { ...payload, sig: signature }

      // Convert to JSON string
      const qrCodeData = JSON.stringify(securePayload)

      console.log("QRCodeService: Generated secure QR data")

      // Generate QR code image using a simple canvas approach
      const qrCodeImage = await this.generateQRCodeImage(qrCodeData)

      return {
        success: true,
        qrCodeData,
        qrCodeImage,
      }
    } catch (error) {
      console.error("QRCodeService: Error generating QR code:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate QR code",
      }
    }
  }

  // Verify QR code signature
  static verifyQRCode(qrCodeData: string): {
    isValid: boolean
    data?: any
    error?: string
  } {
    try {
      const payload = JSON.parse(qrCodeData)

      if (!payload.sig) {
        return { isValid: false, error: "Missing signature" }
      }

      // Extract signature and verify
      const { sig, ...dataToVerify } = payload
      const expectedSignature = this.generateSignature(dataToVerify)

      if (sig !== expectedSignature) {
        return { isValid: false, error: "Invalid signature" }
      }

      // Check timestamp (valid for 24 hours)
      const now = Date.now()
      const qrTimestamp = payload.ts
      const maxAge = 24 * 60 * 60 * 1000 // 24 hours

      if (now - qrTimestamp > maxAge) {
        return { isValid: false, error: "QR code expired" }
      }

      return {
        isValid: true,
        data: {
          ticketId: payload.tid,
          eventId: payload.eid,
          eventName: payload.en,
          buyerId: payload.bid,
          buyerName: payload.bn,
          buyerPhone: payload.bp,
          ticketType: payload.tt,
          quantity: payload.qty,
          totalAmount: payload.amt,
          purchaseDate: payload.pd,
          timestamp: payload.ts,
        },
      }
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : "Invalid QR code format",
      }
    }
  }

  // Generate HMAC signature
  private static generateSignature(data: any): string {
    const dataString = JSON.stringify(data, Object.keys(data).sort())
    return CryptoJS.HmacSHA256(dataString, this.SECRET_KEY).toString()
  }

  // Generate QR code image (simplified version for web)
  private static async generateQRCodeImage(data: string): Promise<string> {
    try {
      // Create a simple canvas-based QR code representation
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        throw new Error("Canvas context not available")
      }

      const size = 200
      canvas.width = size
      canvas.height = size

      // Fill background
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, size, size)

      // Create a simple pattern based on data hash
      const hash = CryptoJS.SHA256(data).toString()
      const gridSize = 10
      const cellSize = size / gridSize

      ctx.fillStyle = "#000000"

      for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
          const index = (i * gridSize + j) % hash.length
          const charCode = hash.charCodeAt(index)

          if (charCode % 2 === 0) {
            ctx.fillRect(j * cellSize, i * cellSize, cellSize, cellSize)
          }
        }
      }

      // Add corner markers
      const markerSize = cellSize * 3
      ctx.fillStyle = "#000000"

      // Top-left marker
      ctx.fillRect(0, 0, markerSize, markerSize)
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(cellSize, cellSize, cellSize, cellSize)

      // Top-right marker
      ctx.fillStyle = "#000000"
      ctx.fillRect(size - markerSize, 0, markerSize, markerSize)
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(size - markerSize + cellSize, cellSize, cellSize, cellSize)

      // Bottom-left marker
      ctx.fillStyle = "#000000"
      ctx.fillRect(0, size - markerSize, markerSize, markerSize)
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(cellSize, size - markerSize + cellSize, cellSize, cellSize)

      // Convert to data URL
      return canvas.toDataURL("image/png")
    } catch (error) {
      console.error("QRCodeService: Error generating QR image:", error)
      // Return a placeholder data URL
      return "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzMzMyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkdlbmVyYXRpbmcgUVIuLi48L3RleHQ+PC9zdmc+"
    }
  }

  // Validate ticket at entrance
  static async validateTicketAtEntrance(
    qrCodeData: string,
    eventId: string,
    validatorId: string,
  ): Promise<{
    isValid: boolean
    ticketData?: any
    error?: string
    alreadyUsed?: boolean
  }> {
    try {
      // Verify QR code
      const verification = this.verifyQRCode(qrCodeData)

      if (!verification.isValid) {
        return {
          isValid: false,
          error: verification.error,
        }
      }

      const ticketData = verification.data

      // Check if ticket is for the correct event
      if (ticketData.eventId !== eventId) {
        return {
          isValid: false,
          error: "Ticket is not valid for this event",
        }
      }

      // In a real implementation, you would check against the database
      // to see if the ticket has already been used
      console.log("QRCodeService: Ticket validated successfully:", {
        ticketId: ticketData.ticketId,
        eventId: ticketData.eventId,
        validatedBy: validatorId,
      })

      return {
        isValid: true,
        ticketData,
      }
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : "Validation failed",
      }
    }
  }

  // Generate ticket ID
  static generateTicketId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8).toUpperCase()
    const hash = CryptoJS.SHA256(`${timestamp}_${random}`).toString().substring(0, 8).toUpperCase()
    return `YV_${timestamp}_${hash}`
  }
}
