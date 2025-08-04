import type { PaymentMethod, PaymentAccount } from "../models/Ticket"
import { calculatePaymentFees, calculateAppCommission, calculateSellerRevenue, PAYMENT_FEES } from "../models/Ticket"
import axios from "axios"

export interface PaymentRequest {
  amount: number
  paymentMethod: PaymentMethod
  paymentAccount: PaymentAccount
  buyerInfo: {
    name: string
    email: string
    phone?: string
  }
  eventInfo: {
    id: string
    name: string
    venueName: string
  }
  ticketInfo: {
    type: string
    quantity: number
    pricePerTicket: number
  }
}

export interface PaymentResponse {
  success: boolean
  transactionId?: string
  reference?: string
  message: string
  errorCode?: string
  processingTime?: number
}

export interface PaymentBreakdown {
  ticketPrice: number
  quantity: number
  subtotal: number
  paymentFees: number
  totalAmount: number
  appCommission: number
  sellerRevenue: number
}

export interface DisbursementRequest {
  amount: number
  recipientPhone: string
  recipientName: string
  reference: string
  description: string
}

export interface DisbursementResponse {
  success: boolean
  transactionId?: string
  reference?: string
  message: string
  errorCode?: string
}

// MTN MoMo API Configuration
const MTN_CONFIG = {
  collection: {
    apiUser: "52140277-0a65-4ca5-ad74-7f2139e977f1",
    apiKey: "ae5e26731c9d4e3ab7f61b4d5ea85ae9",
    baseUrl: "https://sandbox.momodeveloper.mtn.com/collection",
    environment: "sandbox",
  },
  disbursement: {
    apiUser: "bc53667a-e27a-4980-8031-f7b4fa063d99",
    api_key: "b8b4b8b4b8b4b8b4b8b4b8b4b8b4b8b4",
    baseUrl: "https://sandbox.momodeveloper.mtn.com/disbursement",
    environment: "sandbox",
  },
}

class PaymentService {
  private static instance: PaymentService
  private mtnCollectionToken: string | null = null
  private mtnDisbursementToken: string | null = null
  private tokenExpiryTime = 0

  private constructor() {
    console.log("PaymentService initialized")
  }

  static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService()
    }
    return PaymentService.instance
  }

  // Calculate payment breakdown
  calculatePaymentBreakdown(ticketPrice: number, quantity: number, paymentMethod: PaymentMethod): PaymentBreakdown {
    const subtotal = ticketPrice * quantity
    const paymentFees = calculatePaymentFees(subtotal, paymentMethod)
    const totalAmount = subtotal + paymentFees
    const appCommission = calculateAppCommission(ticketPrice) * quantity
    const sellerRevenue = calculateSellerRevenue(ticketPrice, quantity)

    return {
      ticketPrice,
      quantity,
      subtotal,
      paymentFees,
      totalAmount,
      appCommission,
      sellerRevenue,
    }
  }

  // Get MTN Collection Token
  private async getMTNCollectionToken(): Promise<string> {
    try {
      // Check if token is still valid (expires in 1 hour)
      if (this.mtnCollectionToken && Date.now() < this.tokenExpiryTime) {
        return this.mtnCollectionToken
      }

      console.log("PaymentService: Getting new MTN Collection token")

      const response = await axios.post(
        `${MTN_CONFIG.collection.baseUrl}/token/`,
        {},
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${btoa(`${MTN_CONFIG.collection.apiUser}:${MTN_CONFIG.collection.apiKey}`)}`,
            "Ocp-Apim-Subscription-Key": MTN_CONFIG.collection.apiKey,
            "X-Target-Environment": MTN_CONFIG.collection.environment,
          },
        },
      )

      this.mtnCollectionToken = response.data.access_token
      this.tokenExpiryTime = Date.now() + 3600 * 1000 // 1 hour

      console.log("PaymentService: MTN Collection token obtained successfully")
      return this.mtnCollectionToken
    } catch (error) {
      console.error("PaymentService: Error getting MTN Collection token:", error)
      throw new Error("Failed to authenticate with MTN MoMo")
    }
  }

  // Get MTN Disbursement Token
  private async getMTNDisbursementToken(): Promise<string> {
    try {
      // Check if token is still valid
      if (this.mtnDisbursementToken && Date.now() < this.tokenExpiryTime) {
        return this.mtnDisbursementToken
      }

      console.log("PaymentService: Getting new MTN Disbursement token")

      const response = await axios.post(
        `${MTN_CONFIG.disbursement.baseUrl}/token/`,
        {},
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${btoa(`${MTN_CONFIG.disbursement.apiUser}:${MTN_CONFIG.disbursement.api_key}`)}`,
            "Ocp-Apim-Subscription-Key": MTN_CONFIG.disbursement.api_key,
            "X-Target-Environment": MTN_CONFIG.disbursement.environment,
          },
        },
      )

      this.mtnDisbursementToken = response.data.access_token
      this.tokenExpiryTime = Date.now() + 3600 * 1000 // 1 hour

      console.log("PaymentService: MTN Disbursement token obtained successfully")
      return this.mtnDisbursementToken
    } catch (error) {
      console.error("PaymentService: Error getting MTN Disbursement token:", error)
      throw new Error("Failed to authenticate with MTN MoMo Disbursement")
    }
  }

  // Process MTN Mobile Money Payment
  private async processMTNPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      console.log("PaymentService: Processing MTN payment")

      const token = await this.getMTNCollectionToken()
      const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substring(7)}`

      // Format phone number for MTN (remove country code if present)
      let phoneNumber = request.buyerInfo.phone || request.paymentAccount.accountNumber
      phoneNumber = phoneNumber.replace(/^\+?256/, "").replace(/\s/g, "")

      // Ensure phone number starts with appropriate prefix
      if (!phoneNumber.match(/^(76|77|78|79)/)) {
        throw new Error("Invalid MTN phone number format")
      }

      const paymentData = {
        amount: request.amount.toString(),
        currency: "UGX",
        externalId: transactionId,
        payer: {
          partyIdType: "MSISDN",
          partyId: `256${phoneNumber}`,
        },
        payerMessage: `Payment for ${request.eventInfo.name} tickets`,
        payeeNote: `Ticket purchase - ${request.ticketInfo.quantity}x ${request.ticketInfo.type}`,
      }

      console.log("PaymentService: Sending MTN payment request:", paymentData)

      const response = await axios.post(`${MTN_CONFIG.collection.baseUrl}/requesttopay`, paymentData, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Reference-Id": transactionId,
          "X-Target-Environment": MTN_CONFIG.collection.environment,
          "Ocp-Apim-Subscription-Key": MTN_CONFIG.collection.apiKey,
        },
      })

      console.log("PaymentService: MTN payment response:", response.status)

      if (response.status === 202) {
        // Payment request accepted, now check status
        await new Promise((resolve) => setTimeout(resolve, 3000)) // Wait 3 seconds

        const statusResponse = await axios.get(`${MTN_CONFIG.collection.baseUrl}/requesttopay/${transactionId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Target-Environment": MTN_CONFIG.collection.environment,
            "Ocp-Apim-Subscription-Key": MTN_CONFIG.collection.apiKey,
          },
        })

        const status = statusResponse.data.status

        if (status === "SUCCESSFUL") {
          return {
            success: true,
            transactionId,
            reference: transactionId,
            message: "Payment completed successfully",
            processingTime: 3000,
          }
        } else if (status === "PENDING") {
          return {
            success: false,
            message: "Payment is still pending. Please check your phone for the payment prompt.",
            errorCode: "PENDING",
          }
        } else {
          return {
            success: false,
            message: "Payment failed or was cancelled",
            errorCode: status,
          }
        }
      } else {
        return {
          success: false,
          message: "Payment request failed",
          errorCode: "REQUEST_FAILED",
        }
      }
    } catch (error: any) {
      console.error("PaymentService: MTN payment error:", error)

      if (error.response) {
        const errorMessage = error.response.data?.message || "Payment failed"
        return {
          success: false,
          message: errorMessage,
          errorCode: error.response.status.toString(),
        }
      }

      return {
        success: false,
        message: "Network error occurred during payment",
        errorCode: "NETWORK_ERROR",
      }
    }
  }

  // Process Airtel Money Payment (Mock implementation)
  private async processAirtelPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      console.log("PaymentService: Processing Airtel payment (mock)")

      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Mock success response (90% success rate)
      const isSuccess = Math.random() > 0.1

      if (isSuccess) {
        const transactionId = `airtel_${Date.now()}_${Math.random().toString(36).substring(7)}`
        return {
          success: true,
          transactionId,
          reference: transactionId,
          message: "Airtel Money payment completed successfully",
          processingTime: 2000,
        }
      } else {
        return {
          success: false,
          message: "Airtel Money payment failed. Please try again.",
          errorCode: "AIRTEL_FAILED",
        }
      }
    } catch (error) {
      console.error("PaymentService: Airtel payment error:", error)
      return {
        success: false,
        message: "Airtel Money payment failed",
        errorCode: "AIRTEL_ERROR",
      }
    }
  }

  // Process Card Payment (Mock implementation)
  private async processCardPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      console.log("PaymentService: Processing card payment (mock)")

      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 3000))

      // Mock success response (95% success rate)
      const isSuccess = Math.random() > 0.05

      if (isSuccess) {
        const transactionId = `card_${Date.now()}_${Math.random().toString(36).substring(7)}`
        return {
          success: true,
          transactionId,
          reference: transactionId,
          message: "Card payment completed successfully",
          processingTime: 3000,
        }
      } else {
        return {
          success: false,
          message: "Card payment failed. Please check your card details.",
          errorCode: "CARD_DECLINED",
        }
      }
    } catch (error) {
      console.error("PaymentService: Card payment error:", error)
      return {
        success: false,
        message: "Card payment failed",
        errorCode: "CARD_ERROR",
      }
    }
  }

  // Main payment processing method
  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      console.log("PaymentService: Processing payment", request.paymentMethod, request.amount)

      // Validate request
      if (!request.amount || request.amount <= 0) {
        return {
          success: false,
          message: "Invalid payment amount",
          errorCode: "INVALID_AMOUNT",
        }
      }

      if (!request.paymentAccount || !request.paymentAccount.accountNumber) {
        return {
          success: false,
          message: "Payment account information is required",
          errorCode: "MISSING_ACCOUNT",
        }
      }

      // Process payment based on method
      switch (request.paymentMethod) {
        case "mtn":
          return await this.processMTNPayment(request)
        case "airtel":
          return await this.processAirtelPayment(request)
        case "card":
          return await this.processCardPayment(request)
        default:
          return {
            success: false,
            message: "Unsupported payment method",
            errorCode: "UNSUPPORTED_METHOD",
          }
      }
    } catch (error) {
      console.error("PaymentService: Payment processing error:", error)
      return {
        success: false,
        message: "Payment processing failed",
        errorCode: "PROCESSING_ERROR",
      }
    }
  }

  // Disburse payment to seller
  async disburseToSeller(request: DisbursementRequest): Promise<DisbursementResponse> {
    try {
      console.log("PaymentService: Disbursing to seller")

      const token = await this.getMTNDisbursementToken()
      const transactionId = `disbursement_${Date.now()}_${Math.random().toString(36).substring(7)}`

      // Format phone number
      const phoneNumber = request.recipientPhone.replace(/^\+?256/, "").replace(/\s/g, "")

      const disbursementData = {
        amount: request.amount.toString(),
        currency: "UGX",
        externalId: transactionId,
        payee: {
          partyIdType: "MSISDN",
          partyId: `256${phoneNumber}`,
        },
        payerMessage: request.description,
        payeeNote: `Event revenue: ${request.reference}`,
      }

      const response = await axios.post(`${MTN_CONFIG.disbursement.baseUrl}/transfer`, disbursementData, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Reference-Id": transactionId,
          "X-Target-Environment": MTN_CONFIG.disbursement.environment,
          "Ocp-Apim-Subscription-Key": MTN_CONFIG.disbursement.api_key,
        },
      })

      if (response.status === 202) {
        return {
          success: true,
          transactionId,
          reference: transactionId,
          message: "Disbursement completed successfully",
        }
      } else {
        return {
          success: false,
          message: "Disbursement failed",
          errorCode: "DISBURSEMENT_FAILED",
        }
      }
    } catch (error: any) {
      console.error("PaymentService: Disbursement error:", error)
      return {
        success: false,
        message: "Disbursement failed",
        errorCode: "DISBURSEMENT_ERROR",
      }
    }
  }

  // Validate payment account
  validatePaymentAccount(paymentMethod: PaymentMethod, accountNumber: string): { valid: boolean; message: string } {
    switch (paymentMethod) {
      case "mtn":
        const mtnRegex = /^(256)?(76|77|78|79)\d{7}$/
        if (mtnRegex.test(accountNumber.replace(/\s/g, ""))) {
          return { valid: true, message: "Valid MTN number" }
        }
        return { valid: false, message: "Invalid MTN number format" }

      case "airtel":
        const airtelRegex = /^(256)?(70|74|75)\d{7}$/
        if (airtelRegex.test(accountNumber.replace(/\s/g, ""))) {
          return { valid: true, message: "Valid Airtel number" }
        }
        return { valid: false, message: "Invalid Airtel number format" }

      case "card":
        if (accountNumber.length >= 13 && accountNumber.length <= 19) {
          return { valid: true, message: "Valid card number format" }
        }
        return { valid: false, message: "Invalid card number format" }

      default:
        return { valid: false, message: "Unsupported payment method" }
    }
  }

  // Get payment method fees
  getPaymentFees(paymentMethod: PaymentMethod): { fixed: number; percentage: number } {
    return PAYMENT_FEES[paymentMethod]
  }

  // Format currency
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  // Get payment method display name
  getPaymentMethodName(method: PaymentMethod): string {
    switch (method) {
      case "mtn":
        return "MTN Mobile Money"
      case "airtel":
        return "Airtel Money"
      case "card":
        return "Credit/Debit Card"
      default:
        return "Unknown"
    }
  }
}

// Export singleton instance
const paymentService = PaymentService.getInstance()
export default paymentService
