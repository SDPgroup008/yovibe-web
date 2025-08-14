import CryptoJS from "crypto-js"

export interface PaymentRequest {
  amount: number
  phoneNumber: string
  eventId: string
  ticketType: string
  quantity: number
  buyerId: string
  buyerName: string
  eventName: string
  paymentMethod: "mtn" | "airtel" | "card"
}

export interface PaymentResponse {
  success: boolean
  transactionId?: string
  ticketId?: string
  message?: string
  error?: string
  qrCodeData?: string
  qrCodeImage?: string
}

export interface CommissionPayment {
  amount: number
  transactionId: string
  ticketId: string
  adminPhoneNumber: string
}

export interface EventOwnerPayout {
  amount: number
  transactionId: string
  ticketId: string
  ownerPhoneNumber: string
  eventId: string
}

export default class PaymentService {
  private static readonly MTN_API_URL = "https://sandbox.momodeveloper.mtn.com"
  private static readonly AIRTEL_API_URL = "https://openapiuat.airtel.africa"
  private static readonly ADMIN_PHONE = "0777123456" // Admin commission phone
  private static readonly COMMISSION_RATE = 0.05 // 5% commission

  // MTN Mobile Money Integration
  static async processMTNPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      console.log("PaymentService: Processing MTN payment:", {
        amount: request.amount,
        phone: request.phoneNumber,
        eventId: request.eventId,
      })

      // Validate MTN phone number format
      if (!this.validateMTNNumber(request.phoneNumber)) {
        return {
          success: false,
          error: "Invalid MTN phone number format. Use 077XXXXXXX, 078XXXXXXX, or 076XXXXXXX",
        }
      }

      // Generate unique transaction ID
      const transactionId = this.generateTransactionId("MTN")
      const ticketId = this.generateTicketId()

      // In production, this would make actual API calls to MTN
      const mtnPayload = {
        amount: request.amount.toString(),
        currency: "UGX",
        externalId: transactionId,
        payer: {
          partyIdType: "MSISDN",
          partyId: request.phoneNumber,
        },
        payerMessage: `YoVibe ticket purchase for ${request.eventName}`,
        payeeNote: `Ticket payment - ${ticketId}`,
      }

      console.log("PaymentService: MTN API payload prepared:", mtnPayload)

      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Simulate successful payment (90% success rate)
      const isSuccess = Math.random() > 0.1

      if (!isSuccess) {
        return {
          success: false,
          error: "Payment failed. Please check your account balance and try again.",
        }
      }

      // Calculate commission
      const commissionAmount = Math.round(request.amount * this.COMMISSION_RATE)
      const eventOwnerAmount = request.amount - commissionAmount

      // Process admin commission immediately
      await this.payAdminCommission({
        amount: commissionAmount,
        transactionId,
        ticketId,
        adminPhoneNumber: this.ADMIN_PHONE,
      })

      console.log("PaymentService: MTN payment successful:", {
        transactionId,
        ticketId,
        commission: commissionAmount,
        eventOwnerAmount,
      })

      // Generate QR code for the ticket
      const QRCodeService = (await import("./QRCodeService")).default
      const qrResult = await QRCodeService.generateQRCode({
        ticketId,
        eventId: request.eventId,
        eventName: request.eventName,
        buyerId: request.buyerId,
        buyerName: request.buyerName,
        buyerPhone: request.phoneNumber,
        ticketType: request.ticketType,
        quantity: request.quantity,
        totalAmount: request.amount,
        purchaseDate: new Date().toISOString(),
      })

      if (!qrResult.success) {
        console.error("PaymentService: QR code generation failed:", qrResult.error)
        return {
          success: false,
          error: "Payment processed but ticket generation failed. Please contact support.",
        }
      }

      return {
        success: true,
        transactionId,
        ticketId,
        message: "Payment successful! Your ticket has been generated.",
        qrCodeData: qrResult.qrCodeData,
        qrCodeImage: qrResult.qrCodeImage,
      }
    } catch (error) {
      console.error("PaymentService: MTN payment error:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Payment processing failed",
      }
    }
  }

  // Airtel Money Integration
  static async processAirtelPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      console.log("PaymentService: Processing Airtel payment:", {
        amount: request.amount,
        phone: request.phoneNumber,
        eventId: request.eventId,
      })

      // Validate Airtel phone number format
      if (!this.validateAirtelNumber(request.phoneNumber)) {
        return {
          success: false,
          error: "Invalid Airtel phone number format. Use 070XXXXXXX or 075XXXXXXX",
        }
      }

      const transactionId = this.generateTransactionId("AIRTEL")
      const ticketId = this.generateTicketId()

      // Airtel API payload
      const airtelPayload = {
        reference: transactionId,
        subscriber: {
          country: "UG",
          currency: "UGX",
          msisdn: request.phoneNumber,
        },
        transaction: {
          amount: request.amount,
          country: "UG",
          currency: "UGX",
          id: transactionId,
        },
      }

      console.log("PaymentService: Airtel API payload prepared:", airtelPayload)

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Simulate success
      const isSuccess = Math.random() > 0.1

      if (!isSuccess) {
        return {
          success: false,
          error: "Payment failed. Please check your account balance and try again.",
        }
      }

      // Process commission
      const commissionAmount = Math.round(request.amount * this.COMMISSION_RATE)
      await this.payAdminCommission({
        amount: commissionAmount,
        transactionId,
        ticketId,
        adminPhoneNumber: this.ADMIN_PHONE,
      })

      // Generate QR code
      const QRCodeService = (await import("./QRCodeService")).default
      const qrResult = await QRCodeService.generateQRCode({
        ticketId,
        eventId: request.eventId,
        eventName: request.eventName,
        buyerId: request.buyerId,
        buyerName: request.buyerName,
        buyerPhone: request.phoneNumber,
        ticketType: request.ticketType,
        quantity: request.quantity,
        totalAmount: request.amount,
        purchaseDate: new Date().toISOString(),
      })

      if (!qrResult.success) {
        return {
          success: false,
          error: "Payment processed but ticket generation failed. Please contact support.",
        }
      }

      return {
        success: true,
        transactionId,
        ticketId,
        message: "Payment successful! Your ticket has been generated.",
        qrCodeData: qrResult.qrCodeData,
        qrCodeImage: qrResult.qrCodeImage,
      }
    } catch (error) {
      console.error("PaymentService: Airtel payment error:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Payment processing failed",
      }
    }
  }

  // Card Payment Integration
  static async processCardPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      console.log("PaymentService: Processing card payment:", {
        amount: request.amount,
        eventId: request.eventId,
      })

      const transactionId = this.generateTransactionId("CARD")
      const ticketId = this.generateTicketId()

      // Simulate card processing
      await new Promise((resolve) => setTimeout(resolve, 3000))

      const isSuccess = Math.random() > 0.05 // 95% success rate for cards

      if (!isSuccess) {
        return {
          success: false,
          error: "Card payment failed. Please check your card details and try again.",
        }
      }

      // Process commission
      const commissionAmount = Math.round(request.amount * this.COMMISSION_RATE)
      await this.payAdminCommission({
        amount: commissionAmount,
        transactionId,
        ticketId,
        adminPhoneNumber: this.ADMIN_PHONE,
      })

      // Generate QR code
      const QRCodeService = (await import("./QRCodeService")).default
      const qrResult = await QRCodeService.generateQRCode({
        ticketId,
        eventId: request.eventId,
        eventName: request.eventName,
        buyerId: request.buyerId,
        buyerName: request.buyerName,
        buyerPhone: request.phoneNumber,
        ticketType: request.ticketType,
        quantity: request.quantity,
        totalAmount: request.amount,
        purchaseDate: new Date().toISOString(),
      })

      if (!qrResult.success) {
        return {
          success: false,
          error: "Payment processed but ticket generation failed. Please contact support.",
        }
      }

      return {
        success: true,
        transactionId,
        ticketId,
        message: "Payment successful! Your ticket has been generated.",
        qrCodeData: qrResult.qrCodeData,
        qrCodeImage: qrResult.qrCodeImage,
      }
    } catch (error) {
      console.error("PaymentService: Card payment error:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Payment processing failed",
      }
    }
  }

  // Admin Commission Payment
  private static async payAdminCommission(commission: CommissionPayment): Promise<boolean> {
    try {
      console.log("PaymentService: Paying admin commission:", {
        amount: commission.amount,
        ticketId: commission.ticketId,
        adminPhone: commission.adminPhoneNumber,
      })

      // In production, this would use MTN disbursement API
      const disbursementPayload = {
        amount: commission.amount.toString(),
        currency: "UGX",
        externalId: `COMM_${commission.transactionId}`,
        payee: {
          partyIdType: "MSISDN",
          partyId: commission.adminPhoneNumber,
        },
        payerMessage: `YoVibe commission - ${commission.ticketId}`,
        payeeNote: `Commission payment for ticket ${commission.ticketId}`,
      }

      // Simulate disbursement API call
      await new Promise((resolve) => setTimeout(resolve, 1000))

      console.log("PaymentService: Admin commission paid successfully")
      return true
    } catch (error) {
      console.error("PaymentService: Error paying admin commission:", error)
      return false
    }
  }

  // Event Owner Payout (called when ticket is verified at entrance)
  static async payEventOwner(payout: EventOwnerPayout): Promise<boolean> {
    try {
      console.log("PaymentService: Paying event owner:", {
        amount: payout.amount,
        ticketId: payout.ticketId,
        ownerPhone: payout.ownerPhoneNumber,
      })

      const disbursementPayload = {
        amount: payout.amount.toString(),
        currency: "UGX",
        externalId: `PAYOUT_${payout.transactionId}`,
        payee: {
          partyIdType: "MSISDN",
          partyId: payout.ownerPhoneNumber,
        },
        payerMessage: `YoVibe event payout - ${payout.ticketId}`,
        payeeNote: `Event revenue for ticket ${payout.ticketId}`,
      }

      // Simulate disbursement API call
      await new Promise((resolve) => setTimeout(resolve, 1000))

      console.log("PaymentService: Event owner payout successful")
      return true
    } catch (error) {
      console.error("PaymentService: Error paying event owner:", error)
      return false
    }
  }

  // Utility methods
  private static validateMTNNumber(phoneNumber: string): boolean {
    return /^(077|078|076)\d{7}$/.test(phoneNumber)
  }

  private static validateAirtelNumber(phoneNumber: string): boolean {
    return /^(070|075)\d{7}$/.test(phoneNumber)
  }

  private static generateTransactionId(provider: string): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8).toUpperCase()
    return `${provider}_${timestamp}_${random}`
  }

  private static generateTicketId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8).toUpperCase()
    const hash = CryptoJS.SHA256(`${timestamp}_${random}`).toString().substring(0, 8).toUpperCase()
    return `YV_${timestamp}_${hash}`
  }

  // Get payment method from phone number
  static getPaymentMethodFromPhone(phoneNumber: string): "mtn" | "airtel" | null {
    if (this.validateMTNNumber(phoneNumber)) {
      return "mtn"
    }
    if (this.validateAirtelNumber(phoneNumber)) {
      return "airtel"
    }
    return null
  }

  // Format amount for display
  static formatAmount(amount: number): string {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  // Calculate total with commission
  static calculatePricing(baseAmount: number): {
    baseAmount: number
    commission: number
    eventOwnerAmount: number
    total: number
  } {
    const commission = Math.round(baseAmount * this.COMMISSION_RATE)
    const eventOwnerAmount = baseAmount - commission

    return {
      baseAmount,
      commission,
      eventOwnerAmount,
      total: baseAmount,
    }
  }
}
