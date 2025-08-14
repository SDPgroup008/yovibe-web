export interface PaymentIntent {
  id: string
  amount: number
  currency: string
  eventId: string
  buyerId: string
  status: "pending" | "processing" | "completed" | "failed"
  createdAt: Date
}

export interface PaymentMethod {
  id: string
  name: string
  provider: "mtn" | "airtel" | "card"
  icon: string
  isAvailable: boolean
}

export interface PaymentResult {
  success: boolean
  transactionId?: string
  error?: string
  paymentMethod?: string
}

export default class PaymentService {
  private static readonly COMMISSION_RATE = 0.05 // 5%

  static async createPaymentIntent(amount: number, eventId: string, buyerId: string): Promise<PaymentIntent> {
    const paymentIntent: PaymentIntent = {
      id: `pi_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      amount,
      currency: "UGX",
      eventId,
      buyerId,
      status: "pending",
      createdAt: new Date(),
    }

    console.log("PaymentService.web: Created payment intent:", paymentIntent)
    return paymentIntent
  }

  static getAvailablePaymentMethods(): PaymentMethod[] {
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

  static async processPayment(
    paymentIntentId: string,
    paymentMethod: PaymentMethod,
    amount: number,
  ): Promise<PaymentResult> {
    try {
      console.log("PaymentService.web: Processing payment:", {
        paymentIntentId,
        paymentMethod: paymentMethod.provider,
        amount,
      })

      // Simulate payment processing delay
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Simulate payment success/failure (90% success rate)
      const isSuccess = Math.random() > 0.1

      if (!isSuccess) {
        return {
          success: false,
          error: "Payment failed. Please try again.",
        }
      }

      const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

      console.log("PaymentService.web: Payment successful:", {
        transactionId,
        paymentMethod: paymentMethod.provider,
      })

      return {
        success: true,
        transactionId,
        paymentMethod: paymentMethod.provider,
      }
    } catch (error) {
      console.error("PaymentService.web: Payment processing error:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Payment processing failed",
      }
    }
  }

  static validatePhoneNumber(phoneNumber: string, provider: "mtn" | "airtel"): boolean {
    const cleanPhone = phoneNumber.replace(/\s+/g, "")

    switch (provider) {
      case "mtn":
        return /^(077|078|076)\d{7}$/.test(cleanPhone) || /^(\+256)(77|78|76)\d{7}$/.test(cleanPhone)
      case "airtel":
        return /^(070|075)\d{7}$/.test(cleanPhone) || /^(\+256)(70|75)\d{7}$/.test(cleanPhone)
      default:
        return false
    }
  }

  static detectPaymentProvider(phoneNumber: string): "mtn" | "airtel" | null {
    const cleanPhone = phoneNumber.replace(/\s+/g, "")

    if (/^(077|078|076)/.test(cleanPhone) || /^(\+256)(77|78|76)/.test(cleanPhone)) {
      return "mtn"
    }
    if (/^(070|075)/.test(cleanPhone) || /^(\+256)(70|75)/.test(cleanPhone)) {
      return "airtel"
    }
    return null
  }

  static calculateCommission(amount: number): number {
    return Math.round(amount * this.COMMISSION_RATE)
  }

  static calculateEventOwnerAmount(amount: number): number {
    return amount - this.calculateCommission(amount)
  }

  static formatAmount(amount: number): string {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  static async processAdminCommission(amount: number, transactionId: string): Promise<boolean> {
    try {
      console.log("PaymentService.web: Processing admin commission:", {
        amount,
        transactionId,
      })

      // Simulate instant commission payment
      await new Promise((resolve) => setTimeout(resolve, 500))

      console.log("PaymentService.web: Admin commission processed successfully")
      return true
    } catch (error) {
      console.error("PaymentService.web: Error processing admin commission:", error)
      return false
    }
  }

  static async processEventOwnerPayout(
    amount: number,
    eventId: string,
    ownerPhoneNumber: string,
    transactionId: string,
  ): Promise<boolean> {
    try {
      console.log("PaymentService.web: Processing event owner payout:", {
        amount,
        eventId,
        ownerPhoneNumber,
        transactionId,
      })

      // Simulate payout processing
      await new Promise((resolve) => setTimeout(resolve, 1000))

      console.log("PaymentService.web: Event owner payout processed successfully")
      return true
    } catch (error) {
      console.error("PaymentService.web: Error processing event owner payout:", error)
      return false
    }
  }
}
