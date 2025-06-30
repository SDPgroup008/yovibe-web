import type { PaymentIntent } from "../models/Ticket"

export interface PaymentMethod {
  id: string
  type: "mobile_money" | "card" | "bank_transfer"
  provider: string
  isActive: boolean
}

export interface PaymentResult {
  success: boolean
  transactionId?: string
  error?: string
  amount?: number
}

export class PaymentService {
  private static readonly APP_COMMISSION_RATE = 0.05 // 5%

  static getAvailablePaymentMethods(): PaymentMethod[] {
    return [
      {
        id: "mtn_momo",
        type: "mobile_money",
        provider: "MTN Mobile Money",
        isActive: true,
      },
      {
        id: "airtel_money",
        type: "mobile_money",
        provider: "Airtel Money",
        isActive: true,
      },
      {
        id: "visa_card",
        type: "card",
        provider: "Visa Card",
        isActive: true,
      },
      {
        id: "mastercard",
        type: "card",
        provider: "Mastercard",
        isActive: true,
      },
      {
        id: "bank_transfer",
        type: "bank_transfer",
        provider: "Bank Transfer",
        isActive: true,
      },
    ]
  }

  static calculateRevenueSplit(totalAmount: number): {
    appCommission: number
    venueRevenue: number
  } {
    const appCommission = Math.round(totalAmount * this.APP_COMMISSION_RATE)
    const venueRevenue = totalAmount - appCommission

    return {
      appCommission,
      venueRevenue,
    }
  }

  static async createPaymentIntent(amount: number, eventId: string, buyerId: string): Promise<PaymentIntent> {
    try {
      console.log("Creating payment intent for amount:", amount)

      const { appCommission, venueRevenue } = this.calculateRevenueSplit(amount)

      const paymentIntent: PaymentIntent = {
        id: `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount,
        currency: "UGX",
        status: "pending",
        eventId,
        buyerId,
        venueRevenue,
        appCommission,
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

      // Simulate payment processing delay
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Simulate payment processing based on method type
      switch (paymentMethod.type) {
        case "mobile_money":
          return await this.processMobileMoneyPayment(paymentMethod, amount)

        case "card":
          return await this.processCardPayment(paymentMethod, amount)

        case "bank_transfer":
          return await this.processBankTransferPayment(paymentMethod, amount)

        default:
          return {
            success: false,
            error: "Unsupported payment method",
          }
      }
    } catch (error) {
      console.error("Error processing payment:", error)
      return {
        success: false,
        error: "Payment processing failed",
      }
    }
  }

  private static async processMobileMoneyPayment(paymentMethod: PaymentMethod, amount: number): Promise<PaymentResult> {
    // Simulate mobile money payment processing
    console.log(`Processing ${paymentMethod.provider} payment for UGX ${amount}`)

    // In a real implementation, you would integrate with:
    // - MTN MoMo API
    // - Airtel Money API
    // - Other mobile money providers

    // Simulate success/failure (90% success rate)
    const isSuccess = Math.random() > 0.1

    if (isSuccess) {
      return {
        success: true,
        transactionId: `momo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount,
      }
    } else {
      return {
        success: false,
        error: "Insufficient balance or payment declined",
      }
    }
  }

  private static async processCardPayment(paymentMethod: PaymentMethod, amount: number): Promise<PaymentResult> {
    // Simulate card payment processing
    console.log(`Processing ${paymentMethod.provider} payment for UGX ${amount}`)

    // In a real implementation, you would integrate with:
    // - Stripe
    // - PayPal
    // - Local payment processors

    // Simulate success/failure (85% success rate)
    const isSuccess = Math.random() > 0.15

    if (isSuccess) {
      return {
        success: true,
        transactionId: `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount,
      }
    } else {
      const errors = ["Card declined", "Insufficient funds", "Invalid card details", "Payment timeout"]
      return {
        success: false,
        error: errors[Math.floor(Math.random() * errors.length)],
      }
    }
  }

  private static async processBankTransferPayment(
    paymentMethod: PaymentMethod,
    amount: number,
  ): Promise<PaymentResult> {
    // Simulate bank transfer processing
    console.log(`Processing ${paymentMethod.provider} payment for UGX ${amount}`)

    // In a real implementation, you would integrate with:
    // - Bank APIs
    // - SWIFT network
    // - Local banking systems

    // Bank transfers typically have higher success rate but take longer
    const isSuccess = Math.random() > 0.05

    if (isSuccess) {
      return {
        success: true,
        transactionId: `bank_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount,
      }
    } else {
      return {
        success: false,
        error: "Bank transfer failed or account details invalid",
      }
    }
  }

  static validatePaymentMethod(paymentMethod: PaymentMethod, paymentDetails: any): boolean {
    switch (paymentMethod.type) {
      case "mobile_money":
        return this.validateMobileMoneyDetails(paymentDetails)

      case "card":
        return this.validateCardDetails(paymentDetails)

      case "bank_transfer":
        return this.validateBankTransferDetails(paymentDetails)

      default:
        return false
    }
  }

  private static validateMobileMoneyDetails(details: any): boolean {
    const phoneNumber = details.phoneNumber
    if (!phoneNumber) return false

    // Basic phone number validation for Uganda
    const ugandaPhoneRegex = /^(\+256|0)[7-9]\d{8}$/
    return ugandaPhoneRegex.test(phoneNumber)
  }

  private static validateCardDetails(details: any): boolean {
    const { cardNumber, expiryDate, cvv } = details

    if (!cardNumber || !expiryDate || !cvv) return false

    // Basic card number validation (Luhn algorithm would be better)
    const cardNumberClean = cardNumber.replace(/\s/g, "")
    if (cardNumberClean.length < 13 || cardNumberClean.length > 19) return false

    // Basic expiry date validation
    const expiryRegex = /^(0[1-9]|1[0-2])\/\d{2}$/
    if (!expiryRegex.test(expiryDate)) return false

    // Basic CVV validation
    const cvvRegex = /^\d{3,4}$/
    return cvvRegex.test(cvv)
  }

  private static validateBankTransferDetails(details: any): boolean {
    const { accountNumber, bankCode } = details

    if (!accountNumber || !bankCode) return false

    // Basic account number validation
    if (accountNumber.length < 8 || accountNumber.length > 20) return false

    // Basic bank code validation
    if (bankCode.length < 3 || bankCode.length > 10) return false

    return true
  }

  static async refundPayment(paymentIntentId: string, amount: number): Promise<boolean> {
    try {
      console.log("Processing refund for payment:", paymentIntentId, "Amount:", amount)

      // Simulate refund processing
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // In a real implementation, you would:
      // - Call the payment provider's refund API
      // - Handle different refund policies
      // - Update transaction records

      // Simulate refund success (95% success rate)
      const isSuccess = Math.random() > 0.05

      if (isSuccess) {
        console.log("Refund processed successfully")
        return true
      } else {
        console.log("Refund failed")
        return false
      }
    } catch (error) {
      console.error("Error processing refund:", error)
      return false
    }
  }

  static formatCurrency(amount: number, currency = "UGX"): string {
    return `${currency} ${amount.toLocaleString()}`
  }

  static async getPaymentHistory(userId: string): Promise<any[]> {
    // This would typically fetch from a database
    // For now, return empty array
    return []
  }

  static async getPaymentStatus(paymentIntentId: string): Promise<string> {
    // This would typically check the payment status from the payment provider
    // For simulation, return random status
    const statuses = ["pending", "succeeded", "failed"]
    return statuses[Math.floor(Math.random() * statuses.length)]
  }

  // Web-specific payment methods
  static async initializeStripe(publishableKey: string): Promise<void> {
    // Initialize Stripe for card payments
    // This would load the Stripe SDK and configure it
    console.log("Initializing Stripe with key:", publishableKey.substring(0, 10) + "...")
  }

  static async initializePayPal(clientId: string): Promise<void> {
    // Initialize PayPal for payments
    // This would load the PayPal SDK and configure it
    console.log("Initializing PayPal with client ID:", clientId.substring(0, 10) + "...")
  }

  static async processWebPayment(paymentData: any): Promise<PaymentResult> {
    // Process web-specific payments (Stripe, PayPal, etc.)
    try {
      console.log("Processing web payment:", paymentData)

      // Simulate web payment processing
      await new Promise((resolve) => setTimeout(resolve, 2000))

      return {
        success: true,
        transactionId: `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount: paymentData.amount,
      }
    } catch (error) {
      return {
        success: false,
        error: "Web payment processing failed",
      }
    }
  }
}

export default PaymentService
