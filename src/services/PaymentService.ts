import type { PaymentIntent } from "../models/Ticket"

// For production, you would integrate with Stripe, PayPal, or local payment providers
// This is a simulation for development purposes

export interface PaymentMethod {
  id: string
  type: "mobile_money" | "card" | "bank_transfer"
  provider: string
  accountNumber?: string
  cardLast4?: string
  isDefault: boolean
}

export interface PaymentResult {
  success: boolean
  transactionId?: string
  error?: string
  paymentMethod?: PaymentMethod
}

export class PaymentService {
  private static APP_COMMISSION_RATE = 0.05 // 5%
  private static instance: PaymentService

  static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService()
    }
    return PaymentService.instance
  }

  static async createPaymentIntent(amount: number, eventId: string, buyerId: string): Promise<PaymentIntent> {
    const appCommission = Math.round(amount * this.APP_COMMISSION_RATE)
    const venueRevenue = amount - appCommission

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
  }

  static async processPayment(
    paymentIntentId: string,
    paymentMethod: PaymentMethod,
    amount: number,
  ): Promise<PaymentResult> {
    try {
      console.log(`Processing payment ${paymentIntentId} for UGX ${amount.toLocaleString()}`)

      // Simulate different payment methods
      switch (paymentMethod.type) {
        case "mobile_money":
          return await this.processMobileMoneyPayment(paymentIntentId, paymentMethod, amount)
        case "card":
          return await this.processCardPayment(paymentIntentId, paymentMethod, amount)
        case "bank_transfer":
          return await this.processBankTransfer(paymentIntentId, paymentMethod, amount)
        default:
          throw new Error("Unsupported payment method")
      }
    } catch (error) {
      console.error("Payment processing error:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Payment failed",
      }
    }
  }

  private static async processMobileMoneyPayment(
    paymentIntentId: string,
    paymentMethod: PaymentMethod,
    amount: number,
  ): Promise<PaymentResult> {
    return new Promise((resolve) => {
      // Simulate mobile money payment process
      console.log(`Processing ${paymentMethod.provider} payment for ${paymentMethod.accountNumber}`)

      setTimeout(() => {
        // Simulate 95% success rate
        const success = Math.random() > 0.05

        if (success) {
          const transactionId = `txn_${paymentMethod.provider.toLowerCase()}_${Date.now()}`
          console.log("Mobile money payment successful:", transactionId)
          resolve({
            success: true,
            transactionId,
            paymentMethod,
          })
        } else {
          console.log("Mobile money payment failed")
          resolve({
            success: false,
            error: "Insufficient funds or network error",
          })
        }
      }, 3000) // Simulate 3 second processing time
    })
  }

  private static async processCardPayment(
    paymentIntentId: string,
    paymentMethod: PaymentMethod,
    amount: number,
  ): Promise<PaymentResult> {
    return new Promise((resolve) => {
      // Simulate card payment process
      console.log(`Processing card payment ending in ${paymentMethod.cardLast4}`)

      setTimeout(() => {
        // Simulate 90% success rate for cards
        const success = Math.random() > 0.1

        if (success) {
          const transactionId = `txn_card_${Date.now()}`
          console.log("Card payment successful:", transactionId)
          resolve({
            success: true,
            transactionId,
            paymentMethod,
          })
        } else {
          console.log("Card payment failed")
          resolve({
            success: false,
            error: "Card declined or insufficient funds",
          })
        }
      }, 2000) // Simulate 2 second processing time
    })
  }

  private static async processBankTransfer(
    paymentIntentId: string,
    paymentMethod: PaymentMethod,
    amount: number,
  ): Promise<PaymentResult> {
    return new Promise((resolve) => {
      // Simulate bank transfer process
      console.log(`Processing bank transfer from ${paymentMethod.accountNumber}`)

      setTimeout(() => {
        // Simulate 98% success rate for bank transfers
        const success = Math.random() > 0.02

        if (success) {
          const transactionId = `txn_bank_${Date.now()}`
          console.log("Bank transfer successful:", transactionId)
          resolve({
            success: true,
            transactionId,
            paymentMethod,
          })
        } else {
          console.log("Bank transfer failed")
          resolve({
            success: false,
            error: "Bank transfer failed or account not found",
          })
        }
      }, 5000) // Simulate 5 second processing time
    })
  }

  static async refundPayment(paymentIntentId: string, amount: number): Promise<boolean> {
    return new Promise((resolve) => {
      console.log(`Processing refund for ${paymentIntentId}: UGX ${amount.toLocaleString()}`)

      setTimeout(() => {
        // Simulate refund processing
        const success = Math.random() > 0.05 // 95% success rate
        console.log(`Refund ${success ? "successful" : "failed"}`)
        resolve(success)
      }, 2000)
    })
  }

  static calculateRevenueSplit(totalAmount: number) {
    const appCommission = Math.round(totalAmount * this.APP_COMMISSION_RATE)
    const venueRevenue = totalAmount - appCommission

    return {
      appCommission,
      venueRevenue,
      commissionRate: this.APP_COMMISSION_RATE,
    }
  }

  // Get available payment methods for Uganda
  static getAvailablePaymentMethods(): PaymentMethod[] {
    return [
      {
        id: "mtn_momo",
        type: "mobile_money",
        provider: "MTN Mobile Money",
        isDefault: true,
      },
      {
        id: "airtel_money",
        type: "mobile_money",
        provider: "Airtel Money",
        isDefault: false,
      },
      {
        id: "visa_card",
        type: "card",
        provider: "Visa",
        isDefault: false,
      },
      {
        id: "mastercard",
        type: "card",
        provider: "Mastercard",
        isDefault: false,
      },
      {
        id: "bank_transfer",
        type: "bank_transfer",
        provider: "Bank Transfer",
        isDefault: false,
      },
    ]
  }

  // Validate payment method details
  static validatePaymentMethod(paymentMethod: PaymentMethod, details: any): boolean {
    switch (paymentMethod.type) {
      case "mobile_money":
        // Validate phone number format for Uganda
        const phoneRegex = /^(\+256|0)[7-9]\d{8}$/
        return phoneRegex.test(details.phoneNumber)

      case "card":
        // Basic card validation
        return details.cardNumber && details.expiryDate && details.cvv

      case "bank_transfer":
        // Validate account number
        return details.accountNumber && details.bankCode

      default:
        return false
    }
  }
}

export default PaymentService
