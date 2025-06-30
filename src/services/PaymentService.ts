export interface PaymentMethod {
  id: string
  type: "mobile_money" | "card" | "bank_transfer"
  provider: string
  enabled: boolean
}

export interface PaymentIntent {
  id: string
  amount: number
  currency: string
  eventId: string
  buyerId: string
  venueRevenue: number
  appCommission: number
  status: "pending" | "processing" | "succeeded" | "failed"
  createdAt: Date
}

export interface PaymentResult {
  success: boolean
  transactionId?: string
  error?: string
}

export class PaymentService {
  private static readonly APP_COMMISSION_RATE = 0.05 // 5%
  private static readonly CURRENCY = "UGX"

  static getAvailablePaymentMethods(): PaymentMethod[] {
    return [
      {
        id: "mtn_momo",
        type: "mobile_money",
        provider: "MTN Mobile Money",
        enabled: true,
      },
      {
        id: "airtel_money",
        type: "mobile_money",
        provider: "Airtel Money",
        enabled: true,
      },
      {
        id: "visa_card",
        type: "card",
        provider: "Visa Card",
        enabled: true,
      },
      {
        id: "mastercard",
        type: "card",
        provider: "Mastercard",
        enabled: true,
      },
      {
        id: "bank_transfer",
        type: "bank_transfer",
        provider: "Bank Transfer",
        enabled: true,
      },
    ]
  }

  static calculateRevenueSplit(totalAmount: number): { appCommission: number; venueRevenue: number } {
    const appCommission = Math.round(totalAmount * this.APP_COMMISSION_RATE)
    const venueRevenue = totalAmount - appCommission

    return { appCommission, venueRevenue }
  }

  static async createPaymentIntent(amount: number, eventId: string, buyerId: string): Promise<PaymentIntent> {
    try {
      const { appCommission, venueRevenue } = this.calculateRevenueSplit(amount)

      const paymentIntent: PaymentIntent = {
        id: `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount,
        currency: this.CURRENCY,
        eventId,
        buyerId,
        venueRevenue,
        appCommission,
        status: "pending",
        createdAt: new Date(),
      }

      console.log("Payment intent created:", paymentIntent.id)
      return paymentIntent
    } catch (error) {
      console.error("Error creating payment intent:", error)
      throw error
    }
  }

  static async processPayment(
    paymentIntentId: string,
    paymentMethod: PaymentMethod,
    amount: number,
  ): Promise<PaymentResult> {
    try {
      console.log("Processing payment:", paymentIntentId, "Method:", paymentMethod.provider)

      // Simulate payment processing
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Simulate different success rates for different payment methods
      const successRate = paymentMethod.type === "mobile_money" ? 0.95 : 0.98
      const isSuccess = Math.random() < successRate

      if (isSuccess) {
        const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

        console.log("Payment successful:", transactionId)
        return {
          success: true,
          transactionId,
        }
      } else {
        const errorMessages = ["Insufficient funds", "Payment method declined", "Network error", "Payment timeout"]
        const error = errorMessages[Math.floor(Math.random() * errorMessages.length)]

        console.log("Payment failed:", error)
        return {
          success: false,
          error,
        }
      }
    } catch (error) {
      console.error("Error processing payment:", error)
      return {
        success: false,
        error: "Payment processing error",
      }
    }
  }

  static validatePaymentMethod(paymentMethod: PaymentMethod, paymentDetails: any): boolean {
    try {
      switch (paymentMethod.type) {
        case "mobile_money":
          return (
            paymentDetails.phoneNumber &&
            paymentDetails.phoneNumber.length >= 10 &&
            /^\+?[0-9]{10,15}$/.test(paymentDetails.phoneNumber)
          )

        case "card":
          return (
            paymentDetails.cardNumber &&
            paymentDetails.expiryDate &&
            paymentDetails.cvv &&
            paymentDetails.cardNumber.replace(/\s/g, "").length >= 13 &&
            /^[0-9]{3,4}$/.test(paymentDetails.cvv) &&
            /^(0[1-9]|1[0-2])\/([0-9]{2})$/.test(paymentDetails.expiryDate)
          )

        case "bank_transfer":
          return paymentDetails.accountNumber && paymentDetails.bankCode && paymentDetails.accountNumber.length >= 8

        default:
          return false
      }
    } catch (error) {
      console.error("Error validating payment method:", error)
      return false
    }
  }

  static async refundPayment(paymentIntentId: string, amount: number): Promise<boolean> {
    try {
      console.log("Processing refund:", paymentIntentId, "Amount:", amount)

      // Simulate refund processing
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // Simulate 90% success rate for refunds
      const isSuccess = Math.random() < 0.9

      console.log("Refund result:", isSuccess ? "SUCCESS" : "FAILED")
      return isSuccess
    } catch (error) {
      console.error("Error processing refund:", error)
      return false
    }
  }

  static async getPaymentStatus(paymentIntentId: string): Promise<PaymentIntent | null> {
    try {
      // In a real implementation, this would query the payment provider
      console.log("Getting payment status:", paymentIntentId)
      return null
    } catch (error) {
      console.error("Error getting payment status:", error)
      return null
    }
  }

  // Web-specific payment methods
  static async processWebPayment(paymentData: any): Promise<PaymentResult> {
    try {
      // This would integrate with Stripe, PayPal, or other web payment processors
      console.log("Processing web payment:", paymentData)

      // Simulate web payment processing
      await new Promise((resolve) => setTimeout(resolve, 2000))

      return {
        success: true,
        transactionId: `web_txn_${Date.now()}`,
      }
    } catch (error) {
      console.error("Error processing web payment:", error)
      return {
        success: false,
        error: "Web payment processing failed",
      }
    }
  }

  static async setupPaymentGateway(gatewayType: "stripe" | "paypal" | "flutterwave"): Promise<boolean> {
    try {
      console.log("Setting up payment gateway:", gatewayType)

      // Gateway-specific setup logic would go here
      switch (gatewayType) {
        case "stripe":
          // Initialize Stripe
          break
        case "paypal":
          // Initialize PayPal
          break
        case "flutterwave":
          // Initialize Flutterwave for African payments
          break
      }

      return true
    } catch (error) {
      console.error("Error setting up payment gateway:", error)
      return false
    }
  }
}

export default PaymentService
