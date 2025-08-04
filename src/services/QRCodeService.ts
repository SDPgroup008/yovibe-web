import QRCode from "qrcode"

export interface QRCodeData {
  ticketId: string
  eventId: string
  eventName: string
  ticketType: string
  buyerName: string
  buyerEmail: string
  purchaseDate: string
  verificationCode: string
  isSecure?: boolean
  buyerPhoto?: string
}

class QRCodeService {
  private static instance: QRCodeService

  private constructor() {}

  static getInstance(): QRCodeService {
    if (!QRCodeService.instance) {
      QRCodeService.instance = new QRCodeService()
    }
    return QRCodeService.instance
  }

  // Generate QR code from data
  async generateQRCode(data: QRCodeData | string): Promise<string> {
    try {
      console.log("Generating QR code with data:", data)

      // Convert data to string if it's an object
      const qrData = typeof data === "string" ? data : JSON.stringify(data)

      // Generate QR code as data URL
      const qrCodeDataURL = await QRCode.toDataURL(qrData, {
        errorCorrectionLevel: "M",
        type: "image/png",
        quality: 0.92,
        margin: 1,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
        width: 256,
      })

      console.log("QR code generated successfully")
      return qrCodeDataURL
    } catch (error) {
      console.error("Error generating QR code:", error)
      // Return a fallback QR code with basic data
      try {
        const fallbackData = typeof data === "string" ? data : `Ticket: ${data.ticketId}`
        return await QRCode.toDataURL(fallbackData, {
          errorCorrectionLevel: "L",
          width: 256,
        })
      } catch (fallbackError) {
        console.error("Error generating fallback QR code:", fallbackError)
        // Return a simple data URL as last resort
        return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
      }
    }
  }

  // Verify QR code data
  verifyQRCode(qrData: string): QRCodeData | null {
    try {
      // Try to parse as JSON first
      const parsedData = JSON.parse(qrData)

      // Validate required fields
      if (parsedData.ticketId && parsedData.eventId && parsedData.verificationCode) {
        return parsedData as QRCodeData
      }

      return null
    } catch (error) {
      console.error("Error verifying QR code:", error)
      return null
    }
  }

  // Generate verification code
  generateVerificationCode(): string {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 15)
    return `${timestamp}-${random}`.toUpperCase()
  }

  // Create ticket QR data
  createTicketQRData(ticketData: Omit<QRCodeData, "verificationCode">): QRCodeData {
    return {
      ...ticketData,
      verificationCode: this.generateVerificationCode(),
    }
  }
}

export default QRCodeService.getInstance()
