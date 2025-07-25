export interface PaymentMethod {
  id: string
  name: string
  type: "mobile_money" | "credit_card"
  fees: {
    fixed: number
    percentage: number
  }
}

export interface PaymentRequest {
  amount: number
  currency: string
  paymentMethod: PaymentMethod
  customerInfo: {
    name: string
    email: string
    phone?: string
  }
  metadata?: Record<string, any>
}

export interface PaymentResponse {
  success: boolean
  reference?: string
  error?: string
  confirmation?: {
    buyerMessage: string
    sellerMessage: string
  }
}

export interface CreditCardDetails {
  cardNumber: string
  expiryMonth: string
  expiryYear: string
  cvv: string
  cardholderName: string
}

export interface PhoneValidationResult {
  valid: boolean
  message?: string
}

export interface CardValidationResult {
  valid: boolean
  message?: string
}

export default class PaymentService {
  private static readonly PAYMENT_METHODS: PaymentMethod[] = [
    {
      id: "mtn",
      name: "MTN Mobile Money",
      type: "mobile_money",
      fees: {
        fixed: 500,
        percentage: 0.015, // 1.5%
      },
    },
    {
      id: "airtel",
      name: "Airtel Money",
      type: "mobile_money",
      fees: {
        fixed: 300,
        percentage: 0.012, // 1.2%
      },
    },
    {
      id: "visa",
      name: "Visa Card",
      type: "credit_card",
      fees: {
        fixed: 1000,
        percentage: 0.025, // 2.5%
      },
    },
    {
      id: "mastercard",
      name: "Mastercard",
      type: "credit_card",
      fees: {
        fixed: 1000,
        percentage: 0.025, // 2.5%
      },
    },
  ]

  static getAvailablePaymentMethods(): PaymentMethod[] {
    return this.PAYMENT_METHODS
  }

  static calculatePaymentFees(amount: number, paymentMethod: PaymentMethod): number {
    const fixedFee = paymentMethod.fees.fixed
    const percentageFee = amount * paymentMethod.fees.percentage
    return fixedFee + percentageFee
  }

  static async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      console.log("PaymentService: Processing payment request:", request)

      // Simulate payment processing delay
      await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 3000))

      // Simulate payment success/failure (90% success rate)
      const isSuccess = Math.random() > 0.1

      if (!isSuccess) {
        return {
          success: false,
          error: "Payment failed. Please try again.",
        }
      }

      const reference = `TXN_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`

      const confirmation = {
        buyerMessage: `Payment successful! Your transaction reference is ${reference}. You will receive your ticket shortly.`,
        sellerMessage: `New ticket sale! Amount: UGX ${request.amount.toLocaleString()}. Reference: ${reference}`,
      }

      console.log("PaymentService: Payment processed successfully:", reference)

      return {
        success: true,
        reference,
        confirmation,
      }
    } catch (error) {
      console.error("PaymentService: Error processing payment:", error)
      return {
        success: false,
        error: "Payment processing error. Please try again.",
      }
    }
  }

  static validatePhoneNumber(phoneNumber: string): PhoneValidationResult {
    // Remove spaces and special characters
    const cleanNumber = phoneNumber.replace(/[\s\-$$$$]/g, "")

    // Check if it's a valid Ugandan phone number
    const ugandanPattern = /^(\+256|0)(7[0-9]{8}|3[0-9]{8})$/

    if (!ugandanPattern.test(cleanNumber)) {
      return {
        valid: false,
        message: "Please enter a valid Ugandan phone number (e.g., +256701234567 or 0701234567)",
      }
    }

    return { valid: true }
  }

  static validateCreditCard(cardDetails: CreditCardDetails): CardValidationResult {
    const { cardNumber, expiryMonth, expiryYear, cvv, cardholderName } = cardDetails

    // Basic card number validation (Luhn algorithm would be better)
    const cleanCardNumber = cardNumber.replace(/\s/g, "")
    if (!/^\d{13,19}$/.test(cleanCardNumber)) {
      return {
        valid: false,
        message: "Please enter a valid card number",
      }
    }

    // Expiry month validation
    const month = Number.parseInt(expiryMonth, 10)
    if (month < 1 || month > 12) {
      return {
        valid: false,
        message: "Please enter a valid expiry month (01-12)",
      }
    }

    // Expiry year validation
    const year = Number.parseInt(expiryYear, 10)
    const currentYear = new Date().getFullYear() % 100
    if (year < currentYear || year > currentYear + 20) {
      return {
        valid: false,
        message: "Please enter a valid expiry year",
      }
    }

    // CVV validation
    if (!/^\d{3,4}$/.test(cvv)) {
      return {
        valid: false,
        message: "Please enter a valid CVV (3-4 digits)",
      }
    }

    // Cardholder name validation
    if (!cardholderName.trim() || cardholderName.trim().length < 2) {
      return {
        valid: false,
        message: "Please enter the cardholder name",
      }
    }

    return { valid: true }
  }

  static async processRefund(request: {
    amount: number
    reason: string
    originalTransactionId: string
  }): Promise<PaymentResponse> {
    try {
      console.log("PaymentService: Processing refund request:", request)

      // Simulate refund processing delay
      await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000))

      // Simulate refund success (95% success rate)
      const isSuccess = Math.random() > 0.05

      if (!isSuccess) {
        return {
          success: false,
          error: "Refund processing failed. Please contact support.",
        }
      }

      const reference = `REF_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`

      console.log("PaymentService: Refund processed successfully:", reference)

      return {
        success: true,
        reference,
      }
    } catch (error) {
      console.error("PaymentService: Error processing refund:", error)
      return {
        success: false,
        error: "Refund processing error. Please contact support.",
      }
    }
  }

  static async sendPaymentNotifications(confirmation: {
    buyerMessage: string
    sellerMessage: string
  }): Promise<void> {
    try {
      console.log("PaymentService: Sending payment notifications")
      console.log("Buyer notification:", confirmation.buyerMessage)
      console.log("Seller notification:", confirmation.sellerMessage)

      // In a real implementation, this would send actual notifications
      // via email, SMS, or push notifications
    } catch (error) {
      console.error("PaymentService: Error sending notifications:", error)
    }
  }
}
