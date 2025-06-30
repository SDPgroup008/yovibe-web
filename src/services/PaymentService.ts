export interface PaymentMethod {
  id: string
  name: string
  provider: string
  type: "mobile_money" | "card" | "bank_transfer" | "crypto"
  isActive: boolean
  fees: {
    fixed: number
    percentage: number
  }
}

export interface PaymentRequest {
  amount: number
  currency: string
  method: PaymentMethod
  customerInfo: {
    name: string
    email: string
    phone?: string
  }
  metadata?: Record<string, any>
}

export interface PaymentResult {
  success: boolean
  transactionId?: string
  error?: string
  message?: string
}

export default class PaymentService {
  private static readonly SUPPORTED_CURRENCIES = ["UGX", "USD", "EUR"]
  private static readonly APP_COMMISSION_RATE = 0.15 // 15%

  static getAvailablePaymentMethods(): PaymentMethod[] {
    return [
      {
        id: "mtn_momo",
        name: "MTN Mobile Money",
        provider: "MTN Uganda",
        type: "mobile_money",
        isActive: true,
        fees: { fixed: 500, percentage: 0.01 },
      },
      {
        id: "airtel_money",
        name: "Airtel Money",
        provider: "Airtel Uganda",
        type: "mobile_money",
        isActive: true,
        fees: { fixed: 500, percentage: 0.01 },
      },
      {
        id: "visa_card",
        name: "Visa Card",
        provider: "Visa",
        type: "card",
        isActive: true,
        fees: { fixed: 1000, percentage: 0.025 },
      },
      {
        id: "mastercard",
        name: "Mastercard",
        provider: "Mastercard",
        type: "card",
        isActive: true,
        fees: { fixed: 1000, percentage: 0.025 },
      },
      {
        id: "bank_transfer",
        name: "Bank Transfer",
        provider: "Local Banks",
        type: "bank_transfer",
        isActive: true,
        fees: { fixed: 2000, percentage: 0.005 },
      },
    ]
  }

  static async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    try {
      console.log("PaymentService: Processing payment:", request)

      // Validate request
      const validation = this.validatePaymentRequest(request)
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error,
        }
      }

      // Simulate payment processing based on method type
      const result = await this.simulatePaymentProcessing(request)

      if (result.success) {
        console.log("PaymentService: Payment processed successfully:", result.transactionId)
      } else {
        console.error("PaymentService: Payment failed:", result.error)
      }

      return result
    } catch (error) {
      console.error("PaymentService: Error processing payment:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Payment processing error",
      }
    }
  }

  private static validatePaymentRequest(request: PaymentRequest): { isValid: boolean; error?: string } {
    if (!request.amount || request.amount <= 0) {
      return { isValid: false, error: "Invalid amount" }
    }

    if (!this.SUPPORTED_CURRENCIES.includes(request.currency)) {
      return { isValid: false, error: "Unsupported currency" }
    }

    if (!request.method || !request.method.isActive) {
      return { isValid: false, error: "Invalid or inactive payment method" }
    }

    if (!request.customerInfo.name || !request.customerInfo.email) {
      return { isValid: false, error: "Missing customer information" }
    }

    if (request.method.type === "mobile_money" && !request.customerInfo.phone) {
      return { isValid: false, error: "Phone number required for mobile money" }
    }

    return { isValid: true }
  }

  private static async simulatePaymentProcessing(request: PaymentRequest): Promise<PaymentResult> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000))

    // Simulate different outcomes based on payment method
    const successRate = this.getSuccessRate(request.method.type)
    const isSuccessful = Math.random() < successRate

    if (isSuccessful) {
      const transactionId = this.generateTransactionId(request.method.type)
      return {
        success: true,
        transactionId,
        message: `Payment of ${this.formatCurrency(request.amount, request.currency)} processed successfully via ${request.method.name}`,
      }
    } else {
      const errorMessages = this.getErrorMessages(request.method.type)
      const randomError = errorMessages[Math.floor(Math.random() * errorMessages.length)]

      return {
        success: false,
        error: randomError,
        message: "Payment failed. Please try again.",
      }
    }
  }

  private static getSuccessRate(paymentType: string): number {
    switch (paymentType) {
      case "mobile_money":
        return 0.95
      case "card":
        return 0.9
      case "bank_transfer":
        return 0.98
      case "crypto":
        return 0.85
      default:
        return 0.9
    }
  }

  private static getErrorMessages(paymentType: string): string[] {
    const commonErrors = ["Insufficient funds", "Transaction timeout", "Network error"]

    switch (paymentType) {
      case "mobile_money":
        return [...commonErrors, "Invalid PIN", "Account not found", "Daily limit exceeded"]
      case "card":
        return [...commonErrors, "Card declined", "Invalid CVV", "Card expired", "3D Secure failed"]
      case "bank_transfer":
        return [...commonErrors, "Account blocked", "Invalid account details"]
      case "crypto":
        return [...commonErrors, "Wallet not found", "Gas fee too low", "Network congestion"]
      default:
        return commonErrors
    }
  }

  private static generateTransactionId(paymentType: string): string {
    const prefix = this.getTransactionPrefix(paymentType)
    const timestamp = Date.now().toString()
    const random = Math.random().toString(36).substring(2, 8).toUpperCase()
    return `${prefix}_${timestamp}_${random}`
  }

  private static getTransactionPrefix(paymentType: string): string {
    switch (paymentType) {
      case "mobile_money":
        return "MM"
      case "card":
        return "CD"
      case "bank_transfer":
        return "BT"
      case "crypto":
        return "CR"
      default:
        return "TX"
    }
  }

  static formatCurrency(amount: number, currency = "UGX"): string {
    switch (currency) {
      case "UGX":
        return `UGX ${amount.toLocaleString()}`
      case "USD":
        return `$${(amount / 100).toFixed(2)}`
      case "EUR":
        return `€${(amount / 100).toFixed(2)}`
      default:
        return `${currency} ${amount.toLocaleString()}`
    }
  }

  static calculateRevenueSplit(totalAmount: number): { venueRevenue: number; appCommission: number } {
    const appCommission = Math.round(totalAmount * this.APP_COMMISSION_RATE)
    const venueRevenue = totalAmount - appCommission
    return { venueRevenue, appCommission }
  }

  static calculatePaymentFees(amount: number, method: PaymentMethod): number {
    return method.fees.fixed + amount * method.fees.percentage
  }

  static validatePaymentMethod(method: PaymentMethod, details: any): boolean {
    switch (method.type) {
      case "mobile_money":
        return !!(details.phoneNumber && details.phoneNumber.match(/^\+256\d{9}$/))
      case "card":
        return !!(details.cardNumber && details.expiryDate && details.cvv)
      case "bank_transfer":
        return !!(details.accountNumber && details.bankCode)
      default:
        return true
    }
  }

  static async createPaymentIntent(amount: number, eventId: string, buyerId: string): Promise<any> {
    const { venueRevenue, appCommission } = this.calculateRevenueSplit(amount)

    return {
      id: `pi_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      amount,
      currency: "UGX",
      status: "pending",
      eventId,
      buyerId,
      venueRevenue,
      appCommission,
      createdAt: new Date(),
    }
  }

  static async refundPayment(paymentIntentId: string, amount: number): Promise<boolean> {
    try {
      console.log(`PaymentService: Processing refund for ${paymentIntentId}, amount: ${amount}`)

      // Simulate refund processing
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Simulate 95% success rate for refunds
      const success = Math.random() < 0.95

      if (success) {
        console.log("PaymentService: Refund processed successfully")
        return true
      } else {
        console.error("PaymentService: Refund failed")
        return false
      }
    } catch (error) {
      console.error("PaymentService: Error processing refund:", error)
      return false
    }
  }
}
