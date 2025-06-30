export interface PaymentMethod {
  id: string
  name: string
  type: "mobile_money" | "card" | "bank_transfer"
  provider: string
  isAvailable: boolean
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
  reference?: string
  message: string
  error?: string
}

export class PaymentService {
  private static instance: PaymentService

  static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService()
    }
    return PaymentService.instance
  }

  getAvailablePaymentMethods(): PaymentMethod[] {
    return [
      {
        id: "mtn_momo",
        name: "MTN Mobile Money",
        type: "mobile_money",
        provider: "MTN",
        isAvailable: true,
      },
      {
        id: "airtel_money",
        name: "Airtel Money",
        type: "mobile_money",
        provider: "Airtel",
        isAvailable: true,
      },
      {
        id: "visa_card",
        name: "Visa Card",
        type: "card",
        provider: "Visa",
        isAvailable: true,
      },
      {
        id: "mastercard",
        name: "Mastercard",
        type: "card",
        provider: "Mastercard",
        isAvailable: true,
      },
      {
        id: "bank_transfer",
        name: "Bank Transfer",
        type: "bank_transfer",
        provider: "Various Banks",
        isAvailable: true,
      },
    ]
  }

  validatePaymentRequest(request: PaymentRequest): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!request.amount || request.amount <= 0) {
      errors.push("Amount must be greater than 0")
    }

    if (!request.currency) {
      errors.push("Currency is required")
    }

    if (!request.method) {
      errors.push("Payment method is required")
    }

    if (!request.customerInfo.name) {
      errors.push("Customer name is required")
    }

    if (!request.customerInfo.email) {
      errors.push("Customer email is required")
    }

    if (request.method?.type === "mobile_money" && !request.customerInfo.phone) {
      errors.push("Phone number is required for mobile money payments")
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    try {
      // Validate request
      const validation = this.validatePaymentRequest(request)
      if (!validation.isValid) {
        return {
          success: false,
          message: "Payment validation failed",
          error: validation.errors.join(", "),
        }
      }

      // Simulate payment processing
      console.log("Processing payment:", request)

      // Simulate different payment methods
      switch (request.method.type) {
        case "mobile_money":
          return await this.processMobileMoneyPayment(request)
        case "card":
          return await this.processCardPayment(request)
        case "bank_transfer":
          return await this.processBankTransferPayment(request)
        default:
          return {
            success: false,
            message: "Unsupported payment method",
            error: "Payment method not supported",
          }
      }
    } catch (error) {
      console.error("Payment processing error:", error)
      return {
        success: false,
        message: "Payment processing failed",
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  private async processMobileMoneyPayment(request: PaymentRequest): Promise<PaymentResult> {
    // Simulate mobile money payment processing
    await this.simulateProcessingDelay()

    // Simulate success/failure (90% success rate)
    const isSuccess = Math.random() > 0.1

    if (isSuccess) {
      return {
        success: true,
        transactionId: this.generateTransactionId(),
        reference: this.generateReference("MM"),
        message: `Payment of ${request.amount} ${request.currency} successful via ${request.method.name}`,
      }
    } else {
      return {
        success: false,
        message: "Mobile money payment failed",
        error: "Insufficient balance or network error",
      }
    }
  }

  private async processCardPayment(request: PaymentRequest): Promise<PaymentResult> {
    // Simulate card payment processing
    await this.simulateProcessingDelay()

    // Simulate success/failure (95% success rate)
    const isSuccess = Math.random() > 0.05

    if (isSuccess) {
      return {
        success: true,
        transactionId: this.generateTransactionId(),
        reference: this.generateReference("CD"),
        message: `Card payment of ${request.amount} ${request.currency} successful`,
      }
    } else {
      return {
        success: false,
        message: "Card payment failed",
        error: "Card declined or insufficient funds",
      }
    }
  }

  private async processBankTransferPayment(request: PaymentRequest): Promise<PaymentResult> {
    // Simulate bank transfer processing
    await this.simulateProcessingDelay()

    // Bank transfers are usually successful but take longer
    return {
      success: true,
      transactionId: this.generateTransactionId(),
      reference: this.generateReference("BT"),
      message: `Bank transfer of ${request.amount} ${request.currency} initiated successfully. Processing may take 1-3 business days.`,
    }
  }

  private async simulateProcessingDelay(): Promise<void> {
    // Simulate network delay
    const delay = Math.random() * 2000 + 1000 // 1-3 seconds
    return new Promise((resolve) => setTimeout(resolve, delay))
  }

  private generateTransactionId(): string {
    return "TXN_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8).toUpperCase()
  }

  private generateReference(prefix: string): string {
    return prefix + "_" + Date.now().toString().slice(-8) + Math.random().toString(36).substring(2, 6).toUpperCase()
  }

  async verifyPayment(transactionId: string): Promise<PaymentResult> {
    try {
      // Simulate payment verification
      await this.simulateProcessingDelay()

      // In a real implementation, you would call the payment provider's API
      // to verify the transaction status

      return {
        success: true,
        transactionId,
        message: "Payment verified successfully",
      }
    } catch (error) {
      console.error("Payment verification error:", error)
      return {
        success: false,
        message: "Payment verification failed",
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  formatCurrency(amount: number, currency = "UGX"): string {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
    }).format(amount)
  }
}

export default PaymentService.getInstance()
