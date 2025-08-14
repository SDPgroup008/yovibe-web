import type { PaymentMethod } from "../models/Ticket"
import { calculatePaymentFees, calculateAppCommission } from "../models/Ticket"

export interface PaymentRequest {
  amount: number
  phoneNumber: string
  eventId: string
  ticketType: string
  quantity: number
  buyerId: string
  buyerName: string
  eventName: string
  paymentMethod: PaymentMethod
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

export interface PaymentIntent {
  id: string
  amount: number
  eventId: string
  buyerId: string
  status: "pending" | "processing" | "completed" | "failed"
  createdAt: Date
}

export interface PaymentMethodInfo {
  id: string
  name: string
  provider: PaymentMethod
  icon: string
  isAvailable: boolean
}

export default class PaymentService {
  private static readonly MTN_API_URL = "https://sandbox.momodeveloper.mtn.com"
  private static readonly AIRTEL_API_URL = "https://openapiuat.airtel.africa"
  private static readonly ADMIN_PHONE = "0777123456"
  private static readonly COMMISSION_RATE = 0.05

  // Create payment intent
  static async createPaymentIntent(amount: number, eventId: string, buyerId: string): Promise<PaymentIntent> {
    const paymentIntent: PaymentIntent = {
      id: `pi_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      amount,
      eventId,
      buyerId,
      status: "pending",
      createdAt: new Date(),
    }

    console.log("PaymentService: Created payment intent:", paymentIntent)
    return paymentIntent
  }

  // Get available payment methods
  static getAvailablePaymentMethods(): PaymentMethodInfo[] {
    return [
      {
        id: "mtn_mobile_money",
        name: "MTN Mobile Money",
        provider: "mtn",
        icon: "📱",
        isAvailable: true,
      },
      {
        id: "airtel_money",
        name: "Airtel Money",
        provider: "airtel",
        icon: "📱",
        isAvailable: true,
      },
      {
        id: "credit_card",
        name: "Credit/Debit Card",
        provider: "card",
        icon: "💳",
        isAvailable: true,
      },
    ]
  }

  // Process payment with selected method
  static async processPayment(
    paymentIntentId: string,
    paymentMethod: PaymentMethodInfo,
    amount: number,
  ): Promise<PaymentResponse> {
    try {
      console.log(`PaymentService: Processing payment with ${paymentMethod.provider}`)

      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Simulate success rate (90% for mobile money, 95% for cards)
      const successRate = paymentMethod.provider === "card" ? 0.95 : 0.9
      const isSuccess = Math.random() < successRate

      if (!isSuccess) {
        return {
          success: false,
          error: `${paymentMethod.name} payment failed. Please try again.`,
        }
      }

      const transactionId = this.generateTransactionId(paymentMethod.provider.toUpperCase())

      return {
        success: true,
        transactionId,
        message: `Payment successful via ${paymentMethod.name}`,
      }
    } catch (error) {
      console.error("PaymentService: Payment processing error:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Payment processing failed",
      }
    }
  }

  // MTN Mobile Money payment
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

      // Calculate fees using the new fee structure
      const paymentFees = calculatePaymentFees(request.amount, "mtn")
      const totalWithFees = request.amount + paymentFees

      console.log("PaymentService: Payment breakdown:", {
        baseAmount: request.amount,
        paymentFees,
        totalWithFees,
      })

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

      console.log("PaymentService: MTN payment successful:", { transactionId })

      return {
        success: true,
        transactionId,
        message: "Payment successful! Your ticket has been generated.",
      }
    } catch (error) {
      console.error("PaymentService: MTN payment error:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Payment processing failed",
      }
    }
  }

  // Airtel Money payment
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

      // Calculate fees
      const paymentFees = calculatePaymentFees(request.amount, "airtel")
      const totalWithFees = request.amount + paymentFees

      console.log("PaymentService: Payment breakdown:", {
        baseAmount: request.amount,
        paymentFees,
        totalWithFees,
      })

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

      return {
        success: true,
        transactionId,
        message: "Payment successful! Your ticket has been generated.",
      }
    } catch (error) {
      console.error("PaymentService: Airtel payment error:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Payment processing failed",
      }
    }
  }

  // Card payment
  static async processCardPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      console.log("PaymentService: Processing card payment:", {
        amount: request.amount,
        eventId: request.eventId,
      })

      const transactionId = this.generateTransactionId("CARD")

      // Calculate fees
      const paymentFees = calculatePaymentFees(request.amount, "card")
      const totalWithFees = request.amount + paymentFees

      console.log("PaymentService: Payment breakdown:", {
        baseAmount: request.amount,
        paymentFees,
        totalWithFees,
      })

      // Simulate card processing
      await new Promise((resolve) => setTimeout(resolve, 3000))

      const isSuccess = Math.random() > 0.05 // 95% success rate for cards

      if (!isSuccess) {
        return {
          success: false,
          error: "Card payment failed. Please check your card details and try again.",
        }
      }

      return {
        success: true,
        transactionId,
        message: "Payment successful! Your ticket has been generated.",
      }
    } catch (error) {
      console.error("PaymentService: Card payment error:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Payment processing failed",
      }
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

  // Get payment method from phone number
  static getPaymentMethodFromPhone(phoneNumber: string): PaymentMethod | null {
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

  // Calculate total with fees and commission
  static calculatePricing(
    baseAmount: number,
    paymentMethod: PaymentMethod,
  ): {
    baseAmount: number
    paymentFees: number
    appCommission: number
    eventOwnerAmount: number
    total: number
  } {
    const paymentFees = calculatePaymentFees(baseAmount, paymentMethod)
    const appCommission = calculateAppCommission(baseAmount)
    const eventOwnerAmount = baseAmount - appCommission
    const total = baseAmount + paymentFees

    return {
      baseAmount,
      paymentFees,
      appCommission,
      eventOwnerAmount,
      total,
    }
  }
}
