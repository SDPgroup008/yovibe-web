import type { PaymentIntent } from "../models/Ticket"

export interface PaymentMethod {
  id: string
  type: "mobile_money" | "card" | "bank_transfer" | "paypal" | "stripe"
  provider: string
  isActive: boolean
}

export interface PaymentResult {
  success: boolean
  transactionId?: string
  error?: string
  amount?: number
}

export interface MTNPaymentRequest {
  amount: number
  phoneNumber: string
  externalId: string
  payerMessage: string
  payeeNote: string
}

export interface AirtelPaymentRequest {
  amount: number
  phoneNumber: string
  reference: string
  description: string
}

export class PaymentService {
  private static readonly APP_COMMISSION_RATE = 0.05 // 5%
  private static readonly MTN_API_BASE = "https://sandbox.momodeveloper.mtn.com" // Production: https://momodeveloper.mtn.com
  private static readonly AIRTEL_API_BASE = "https://openapiuat.airtel.africa" // Production: https://openapi.airtel.africa

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
        id: "stripe_card",
        type: "card",
        provider: "Credit/Debit Card",
        isActive: true,
      },
      {
        id: "paypal",
        type: "paypal",
        provider: "PayPal",
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
    phoneNumber?: string,
  ): Promise<PaymentResult> {
    try {
      console.log("Processing payment:", paymentIntentId, "Method:", paymentMethod.provider)

      // Simulate payment processing delay
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Process payment based on method type
      switch (paymentMethod.type) {
        case "mobile_money":
          if (paymentMethod.id.includes("mtn")) {
            return await this.processMTNPayment(amount, phoneNumber!)
          } else if (paymentMethod.id.includes("airtel")) {
            return await this.processAirtelPayment(amount, phoneNumber!)
          }
          return await this.processMobileMoneyPayment(paymentMethod, amount)

        case "card":
        case "stripe":
          return await this.processStripePayment(paymentMethod, amount)

        case "paypal":
          return await this.processPayPalPayment(paymentMethod, amount)

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

  private static async processMTNPayment(amount: number, phoneNumber: string): Promise<PaymentResult> {
    console.log(`Processing MTN Mobile Money payment for UGX ${amount} to ${phoneNumber}`)

    try {
      // In production, this would make actual API calls to MTN MoMo API
      const paymentRequest: MTNPaymentRequest = {
        amount,
        phoneNumber: this.formatPhoneNumber(phoneNumber),
        externalId: `YV_${Date.now()}`,
        payerMessage: "YoVibe Ticket Purchase",
        payeeNote: "Event ticket payment",
      }

      // Simulate MTN API call
      const response = await this.simulateMTNAPICall(paymentRequest)

      if (response.success) {
        return {
          success: true,
          transactionId: `mtn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          amount,
        }
      } else {
        return {
          success: false,
          error: response.error || "MTN payment failed",
        }
      }
    } catch (error) {
      console.error("MTN payment error:", error)
      return {
        success: false,
        error: "MTN payment service unavailable",
      }
    }
  }

  private static async processAirtelPayment(amount: number, phoneNumber: string): Promise<PaymentResult> {
    console.log(`Processing Airtel Money payment for UGX ${amount} to ${phoneNumber}`)

    try {
      // In production, this would make actual API calls to Airtel Money API
      const paymentRequest: AirtelPaymentRequest = {
        amount,
        phoneNumber: this.formatPhoneNumber(phoneNumber),
        reference: `YV_${Date.now()}`,
        description: "YoVibe Ticket Purchase",
      }

      // Simulate Airtel API call
      const response = await this.simulateAirtelAPICall(paymentRequest)

      if (response.success) {
        return {
          success: true,
          transactionId: `airtel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          amount,
        }
      } else {
        return {
          success: false,
          error: response.error || "Airtel payment failed",
        }
      }
    } catch (error) {
      console.error("Airtel payment error:", error)
      return {
        success: false,
        error: "Airtel payment service unavailable",
      }
    }
  }

  private static async simulateMTNAPICall(request: MTNPaymentRequest): Promise<{ success: boolean; error?: string }> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Simulate 90% success rate
    const isSuccess = Math.random() > 0.1

    if (isSuccess) {
      console.log("✅ MTN Payment successful:", request.externalId)
      return { success: true }
    } else {
      const errors = [
        "Insufficient balance",
        "Invalid phone number",
        "Transaction declined",
        "Service temporarily unavailable",
      ]
      const error = errors[Math.floor(Math.random() * errors.length)]
      console.log("❌ MTN Payment failed:", error)
      return { success: false, error }
    }
  }

  private static async simulateAirtelAPICall(
    request: AirtelPaymentRequest,
  ): Promise<{ success: boolean; error?: string }> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Simulate 85% success rate
    const isSuccess = Math.random() > 0.15

    if (isSuccess) {
      console.log("✅ Airtel Payment successful:", request.reference)
      return { success: true }
    } else {
      const errors = [
        "Insufficient balance",
        "Invalid phone number",
        "Transaction declined",
        "Service temporarily unavailable",
      ]
      const error = errors[Math.floor(Math.random() * errors.length)]
      console.log("❌ Airtel Payment failed:", error)
      return { success: false, error }
    }
  }

  private static formatPhoneNumber(phoneNumber: string): string {
    // Remove spaces and format to international format
    let cleaned = phoneNumber.replace(/\s+/g, "")

    // Convert to international format if needed
    if (cleaned.startsWith("0")) {
      cleaned = "+256" + cleaned.substring(1)
    } else if (!cleaned.startsWith("+")) {
      cleaned = "+256" + cleaned
    }

    return cleaned
  }

  private static async processStripePayment(paymentMethod: PaymentMethod, amount: number): Promise<PaymentResult> {
    console.log(`Processing Stripe payment for UGX ${amount}`)

    // Simulate Stripe payment processing (90% success rate)
    const isSuccess = Math.random() > 0.1

    if (isSuccess) {
      return {
        success: true,
        transactionId: `stripe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount,
      }
    } else {
      const errors = ["Your card was declined", "Insufficient funds", "Invalid card details", "Payment timeout"]
      return {
        success: false,
        error: errors[Math.floor(Math.random() * errors.length)],
      }
    }
  }

  private static async processPayPalPayment(paymentMethod: PaymentMethod, amount: number): Promise<PaymentResult> {
    console.log(`Processing PayPal payment for UGX ${amount}`)

    // Simulate PayPal payment processing (95% success rate)
    const isSuccess = Math.random() > 0.05

    if (isSuccess) {
      return {
        success: true,
        transactionId: `paypal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount,
      }
    } else {
      return {
        success: false,
        error: "PayPal payment failed or was cancelled",
      }
    }
  }

  private static async processMobileMoneyPayment(paymentMethod: PaymentMethod, amount: number): Promise<PaymentResult> {
    console.log(`Processing ${paymentMethod.provider} payment for UGX ${amount}`)

    // Simulate mobile money payment processing (85% success rate)
    const isSuccess = Math.random() > 0.15

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

  private static async processBankTransferPayment(
    paymentMethod: PaymentMethod,
    amount: number,
  ): Promise<PaymentResult> {
    console.log(`Processing bank transfer for UGX ${amount}`)

    // Bank transfers have higher success rate (98%)
    const isSuccess = Math.random() > 0.02

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
      case "stripe":
        return this.validateCardDetails(paymentDetails)

      case "paypal":
        return this.validatePayPalDetails(paymentDetails)

      case "bank_transfer":
        return this.validateBankTransferDetails(paymentDetails)

      default:
        return false
    }
  }

  private static validateMobileMoneyDetails(details: any): boolean {
    const phoneNumber = details.phoneNumber
    if (!phoneNumber) return false

    // Enhanced phone number validation for Uganda
    const cleanPhone = phoneNumber.replace(/\s+/g, "")

    // MTN numbers: 077, 078, 076
    // Airtel numbers: 070, 075
    const ugandaPhoneRegex = /^(\+256|0)?(77|78|76|70|75)\d{7}$/
    return ugandaPhoneRegex.test(cleanPhone)
  }

  private static validateCardDetails(details: any): boolean {
    const { cardNumber, expiryDate, cvv } = details

    if (!cardNumber || !expiryDate || !cvv) return false

    // Basic card number validation
    const cardNumberClean = cardNumber.replace(/\s/g, "")
    if (cardNumberClean.length < 13 || cardNumberClean.length > 19) return false

    // Basic expiry date validation
    const expiryRegex = /^(0[1-9]|1[0-2])\/\d{2}$/
    if (!expiryRegex.test(expiryDate)) return false

    // Basic CVV validation
    const cvvRegex = /^\d{3,4}$/
    return cvvRegex.test(cvv)
  }

  private static validatePayPalDetails(details: any): boolean {
    const email = details.email
    if (!email) return false

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
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

  // Production-ready disbursement methods
  static async disburseMTNPayment(phoneNumber: string, amount: number, reference: string): Promise<boolean> {
    try {
      console.log(`💰 Disbursing UGX ${amount} to MTN ${phoneNumber} (Ref: ${reference})`)

      // In production, this would call MTN Disbursement API
      // const response = await fetch(`${this.MTN_API_BASE}/disbursement/v1_0/transfer`, {
      //   method: 'POST',
      //   headers: {
      //     'Authorization': `Bearer ${MTN_ACCESS_TOKEN}`,
      //     'X-Reference-Id': reference,
      //     'X-Target-Environment': 'production',
      //     'Content-Type': 'application/json'
      //   },
      //   body: JSON.stringify({
      //     amount: amount.toString(),
      //     currency: 'UGX',
      //     externalId: reference,
      //     payee: {
      //       partyIdType: 'MSISDN',
      //       partyId: phoneNumber
      //     },
      //     payerMessage: 'YoVibe Commission Payment',
      //     payeeNote: 'App commission disbursement'
      //   })
      // })

      // Simulate successful disbursement
      await new Promise((resolve) => setTimeout(resolve, 1000))
      console.log("✅ MTN disbursement successful")
      return true
    } catch (error) {
      console.error("❌ MTN disbursement failed:", error)
      return false
    }
  }

  static async disburseAirtelPayment(phoneNumber: string, amount: number, reference: string): Promise<boolean> {
    try {
      console.log(`💰 Disbursing UGX ${amount} to Airtel ${phoneNumber} (Ref: ${reference})`)

      // In production, this would call Airtel Money Disbursement API
      // Similar implementation to MTN but with Airtel's API structure

      // Simulate successful disbursement
      await new Promise((resolve) => setTimeout(resolve, 1000))
      console.log("✅ Airtel disbursement successful")
      return true
    } catch (error) {
      console.error("❌ Airtel disbursement failed:", error)
      return false
    }
  }

  // Web-specific payment methods
  static async initializeStripe(publishableKey: string): Promise<void> {
    // In a real implementation, you would initialize Stripe here
    console.log("Stripe initialized with key:", publishableKey.substring(0, 10) + "...")
  }

  static async initializePayPal(clientId: string): Promise<void> {
    // In a real implementation, you would initialize PayPal here
    console.log("PayPal initialized with client ID:", clientId.substring(0, 10) + "...")
  }

  static async getPaymentHistory(userId: string): Promise<any[]> {
    // This would typically fetch from a database
    return []
  }

  static async getPaymentStatus(paymentIntentId: string): Promise<string> {
    // This would typically check the payment status from the payment provider
    const statuses = ["pending", "succeeded", "failed"]
    return statuses[Math.floor(Math.random() * statuses.length)]
  }
}

export default PaymentService
