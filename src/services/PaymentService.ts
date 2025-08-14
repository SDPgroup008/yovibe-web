import type { PaymentMethod, PaymentAccount } from "../models/Ticket"
import { calculatePaymentFees, calculateAppCommission, calculateSellerRevenue, PAYMENT_FEES } from "../models/Ticket"

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
    accessToken:
      "eyJ0eXAiOiJKV1QiLCJhbGciOiJSMjU2In0.eyJjbGllbnRJZCI6IjUyMTQwMjc3LTBhNjUtNGNhNS1hZDc0LTdmMjEzOWU5NzdmMSIsImV4cGlyZXMiOiIyMDI1LTA3LTI0VDE1OjE4OjUxLjg0NCIsInNlc3Npb25JZCI6IjBmYWQ1NjI5LTI5MTMtNDEzMC1hNzNkLTZjMzNmNzE1ZTc3YiJ9.l7_ugwq0ZkYAMk9Yi57NcA1P0vcF8EWzOfi9_hhvVeX5X2nJsypqciVuzTNztasMJO5ZHx9JR8pg6qN89Ymdypi6UwGOMNu-LX0nOvpj7x-pfE3CxyiVmspqpSlkwiZ8SYao4vvkLtrfhz9u4S4tNTQHv92jedqu-7I_Q2A3-X8yCGDCjcvkI2dtupO9b10w5rww2a9lnbzZ1mDlzRW1JWuOfwuB_3bwQTbDVSwg23D3UXItD2O2ngy1kIfXqSRBUekh9nl502KAbqEU9oSsEYAfdHIkyC3QeibuQgxwdt_-1fZB06jsRa8zOzJn6pkBHSqs_XDU7DvrwUBWvBWWyQ",
    baseUrl: "https://sandbox.momodeveloper.mtn.com/collection",
    environment: "sandbox", // Change to "production" for live
  },
  disbursement: {
    apiUser: "bc53667a-e27a-4980-8031-f7b4fa063d99",
    apiKey: "9165d5d736b5409e8f8a43a7cf644e6b",
    accessToken:
      "eyJ0eXAiOiJKV1QiLCJhbGciOiJSMjU2In0.eyJjbGllbnRJZCI6ImJjNTM2NjdhLWUyN2EtNDk4MC04MDMxLWY3YjRmYTA2M2Q5OSIsImV4cGlyZXMiOiIyMDI1LTA3LTI0VDE2OjA4OjE4LjM2NyIsInNlc3Npb25JZCI6IjQ2MTViODZiLTE2ZjItNDcxNy1hMTE3LTRhYTU5OTk5NjYxZSJ9.iPsvFSoKLm7QXDTfVrBfwFrN-tSh3_y_ZabTRnV7dtfD_RU9KjfIAsxTb2spk1ClXx0nLu13sm9vOxXagHZ5xwM0KdNqKcPQAw4vRdPv4DHxXBbeQkH_m2YlfjJqrKoikZH3QpW2JxlfrPyMeDcKmPHoGySycp7hZOT6-sW-aLQzdrZFFx_ppWphcYd26KN-yRfZRwb0HWzFqv_Rt-8IVtBEV6MCpyd39qPUP_jB1OIeD5QbbbnPMxmthmzhmciQxS-KTI7RUnCewpXwsSukGsLyw00YNnyKcQZ5bMXMWjBw127esEe0u7W0gWmLHtR_Zmq0gHJvNJrCYpxBO_CZ7w",
    baseUrl: "https://sandbox.momodeveloper.mtn.com/disbursement",
    environment: "sandbox", // Change to "production" for live
  },
}

// Admin configuration for commission payments
const ADMIN_CONFIG = {
  phone: "256777123456", // Admin's MTN number for commission payments
  name: "YoVibe Admin",
}

class PaymentService {
  private static instance: PaymentService

  private constructor() {}

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
    const appCommission = calculateAppCommission(subtotal)
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

  // Generate unique reference ID
  private generateReferenceId(): string {
    return `yovibe_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
  }

  // Validate MTN phone number format - Updated for Uganda MTN numbers
  private validateMTNPhoneNumber(phoneNumber: string): boolean {
    // MTN Uganda numbers: 256 076X XXXXXX, 256 077X XXXXXX, 256 078X XXXXXX, 256 079X XXXXXX
    const mtnPattern = /^256(076|077|078|079)[0-9]{6}$/
    return mtnPattern.test(phoneNumber.replace(/\s+/g, ""))
  }

  // Validate Airtel phone number format - Updated for Uganda Airtel numbers
  private validateAirtelPhoneNumber(phoneNumber: string): boolean {
    // Airtel Uganda numbers: 256 070X XXXXXX, 256 074X XXXXXX, 256 075X XXXXXX
    const airtelPattern = /^256(070|074|075)[0-9]{6}$/
    return airtelPattern.test(phoneNumber.replace(/\s+/g, ""))
  }

  // MTN Mobile Money payment processing
  async processMTNPayment(request: PaymentRequest): Promise<PaymentResponse> {
    console.log("Processing MTN Mobile Money payment:", request)

    try {
      const referenceId = this.generateReferenceId()
      const phoneNumber = request.paymentAccount.accountNumber

      // Validate MTN phone number format
      if (!this.validateMTNPhoneNumber(phoneNumber)) {
        return {
          success: false,
          message:
            "Invalid MTN phone number format. MTN numbers should start with 076, 077, 078, or 079 (256XXXXXXXXX)",
          errorCode: "INVALID_PHONE_NUMBER",
        }
      }

      // Step 1: Request to Pay
      const requestToPayPayload = {
        amount: request.amount.toString(),
        currency: "UGX",
        externalId: referenceId,
        payer: {
          partyIdType: "MSISDN",
          partyId: phoneNumber,
        },
        payerMessage: `Payment for ${request.eventInfo.name} tickets`,
        payeeNote: `YoVibe ticket purchase - ${request.ticketInfo.type} x${request.ticketInfo.quantity}`,
      }

      console.log("MTN Request to Pay payload:", requestToPayPayload)

      const requestToPayResponse = await fetch(`${MTN_CONFIG.collection.baseUrl}/v1_0/requesttopay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MTN_CONFIG.collection.accessToken}`,
          "X-Reference-Id": referenceId,
          "X-Target-Environment": MTN_CONFIG.collection.environment,
          "Ocp-Apim-Subscription-Key": MTN_CONFIG.collection.apiKey,
        },
        body: JSON.stringify(requestToPayPayload),
      })

      if (!requestToPayResponse.ok) {
        const errorData = await requestToPayResponse.text()
        console.error("MTN Request to Pay failed:", errorData)
        return {
          success: false,
          message: "Failed to initiate MTN Mobile Money payment. Please try again.",
          errorCode: "REQUEST_TO_PAY_FAILED",
        }
      }

      console.log("MTN Request to Pay initiated successfully")

      // Step 2: Poll for payment status
      let attempts = 0
      const maxAttempts = 30 // 30 attempts with 2-second intervals = 1 minute timeout

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000)) // Wait 2 seconds
        attempts++

        try {
          const statusResponse = await fetch(`${MTN_CONFIG.collection.baseUrl}/v1_0/requesttopay/${referenceId}`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${MTN_CONFIG.collection.accessToken}`,
              "X-Target-Environment": MTN_CONFIG.collection.environment,
              "Ocp-Apim-Subscription-Key": MTN_CONFIG.collection.apiKey,
            },
          })

          if (statusResponse.ok) {
            const statusData = await statusResponse.json()
            console.log(`MTN Payment status check ${attempts}:`, statusData)

            if (statusData.status === "SUCCESSFUL") {
              // Payment successful - now process commission payment to admin
              await this.processCommissionPayment(request, referenceId)

              return {
                success: true,
                transactionId: statusData.financialTransactionId || referenceId,
                reference: referenceId,
                message: `Payment successful via MTN Mobile Money. Transaction ID: ${statusData.financialTransactionId || referenceId}`,
                processingTime: attempts * 2000,
              }
            } else if (statusData.status === "FAILED") {
              return {
                success: false,
                message:
                  statusData.reason ||
                  "MTN Mobile Money payment failed. Please check your account balance and try again.",
                errorCode: "PAYMENT_FAILED",
                processingTime: attempts * 2000,
              }
            }
            // If status is PENDING, continue polling
          }
        } catch (statusError) {
          console.error("Error checking MTN payment status:", statusError)
        }
      }

      // Timeout reached
      return {
        success: false,
        message:
          "Payment timeout. Please check your MTN Mobile Money account and contact support if money was deducted.",
        errorCode: "PAYMENT_TIMEOUT",
        processingTime: maxAttempts * 2000,
      }
    } catch (error) {
      console.error("MTN Payment processing error:", error)
      return {
        success: false,
        message: "MTN Mobile Money payment failed due to technical error. Please try again.",
        errorCode: "TECHNICAL_ERROR",
      }
    }
  }

  // Process commission payment to admin immediately after successful ticket purchase
  private async processCommissionPayment(request: PaymentRequest, originalReference: string): Promise<void> {
    try {
      const breakdown = this.calculatePaymentBreakdown(
        request.ticketInfo.pricePerTicket,
        request.ticketInfo.quantity,
        request.paymentMethod,
      )

      if (breakdown.appCommission > 0) {
        console.log(`Processing commission payment of UGX ${breakdown.appCommission} to admin`)

        const commissionRequest: DisbursementRequest = {
          amount: breakdown.appCommission,
          recipientPhone: ADMIN_CONFIG.phone,
          recipientName: ADMIN_CONFIG.name,
          reference: `commission_${originalReference}`,
          description: `Commission from ${request.eventInfo.name} ticket sale`,
        }

        const commissionResult = await this.processMTNDisbursement(commissionRequest)

        if (commissionResult.success) {
          console.log("Commission payment successful:", commissionResult.transactionId)
        } else {
          console.error("Commission payment failed:", commissionResult.message)
          // Log this for manual processing but don't fail the main transaction
        }
      }
    } catch (error) {
      console.error("Error processing commission payment:", error)
      // Don't throw error - commission failure shouldn't affect main transaction
    }
  }

  // MTN Mobile Money disbursement (for paying event owners and admin commission)
  async processMTNDisbursement(request: DisbursementRequest): Promise<DisbursementResponse> {
    console.log("Processing MTN Mobile Money disbursement:", request)

    try {
      const referenceId = this.generateReferenceId()

      // Validate MTN phone number format
      if (!this.validateMTNPhoneNumber(request.recipientPhone)) {
        return {
          success: false,
          message: "Invalid MTN phone number format for disbursement",
          errorCode: "INVALID_PHONE_NUMBER",
        }
      }

      // Step 1: Transfer request
      const transferPayload = {
        amount: request.amount.toString(),
        currency: "UGX",
        externalId: referenceId,
        payee: {
          partyIdType: "MSISDN",
          partyId: request.recipientPhone,
        },
        payerMessage: request.description,
        payeeNote: `YoVibe payment: ${request.description}`,
      }

      console.log("MTN Transfer payload:", transferPayload)

      const transferResponse = await fetch(`${MTN_CONFIG.disbursement.baseUrl}/v1_0/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MTN_CONFIG.disbursement.accessToken}`,
          "X-Reference-Id": referenceId,
          "X-Target-Environment": MTN_CONFIG.disbursement.environment,
          "Ocp-Apim-Subscription-Key": MTN_CONFIG.disbursement.apiKey,
        },
        body: JSON.stringify(transferPayload),
      })

      if (!transferResponse.ok) {
        const errorData = await transferResponse.text()
        console.error("MTN Transfer failed:", errorData)
        return {
          success: false,
          message: "Failed to initiate MTN Mobile Money transfer",
          errorCode: "TRANSFER_FAILED",
        }
      }

      console.log("MTN Transfer initiated successfully")

      // Step 2: Poll for transfer status
      let attempts = 0
      const maxAttempts = 30

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        attempts++

        try {
          const statusResponse = await fetch(`${MTN_CONFIG.disbursement.baseUrl}/v1_0/transfer/${referenceId}`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${MTN_CONFIG.disbursement.accessToken}`,
              "X-Target-Environment": MTN_CONFIG.disbursement.environment,
              "Ocp-Apim-Subscription-Key": MTN_CONFIG.disbursement.apiKey,
            },
          })

          if (statusResponse.ok) {
            const statusData = await statusResponse.json()
            console.log(`MTN Transfer status check ${attempts}:`, statusData)

            if (statusData.status === "SUCCESSFUL") {
              return {
                success: true,
                transactionId: statusData.financialTransactionId || referenceId,
                reference: referenceId,
                message: `Transfer successful to ${request.recipientPhone}. Amount: UGX ${request.amount}`,
              }
            } else if (statusData.status === "FAILED") {
              return {
                success: false,
                message: statusData.reason || "MTN Mobile Money transfer failed",
                errorCode: "TRANSFER_FAILED",
              }
            }
          }
        } catch (statusError) {
          console.error("Error checking MTN transfer status:", statusError)
        }
      }

      return {
        success: false,
        message: "Transfer timeout",
        errorCode: "TRANSFER_TIMEOUT",
      }
    } catch (error) {
      console.error("MTN Disbursement error:", error)
      return {
        success: false,
        message: "Transfer failed due to technical error",
        errorCode: "TECHNICAL_ERROR",
      }
    }
  }

  // Process payment to event owner after ticket verification
  async payEventOwner(
    eventOwnerPhone: string,
    eventOwnerName: string,
    amount: number,
    eventName: string,
    ticketReference: string,
  ): Promise<DisbursementResponse> {
    console.log(`Processing payment to event owner: UGX ${amount} to ${eventOwnerPhone}`)

    const disbursementRequest: DisbursementRequest = {
      amount,
      recipientPhone: eventOwnerPhone,
      recipientName: eventOwnerName,
      reference: `payout_${ticketReference}`,
      description: `Revenue from ${eventName} ticket verification`,
    }

    return await this.processMTNDisbursement(disbursementRequest)
  }

  // Simulate Airtel Money payment (placeholder)
  async processAirtelPayment(request: PaymentRequest): Promise<PaymentResponse> {
    console.log("Processing Airtel Money payment (PLACEHOLDER):", request)

    // Validate Airtel phone number format
    if (!this.validateAirtelPhoneNumber(request.paymentAccount.accountNumber)) {
      return {
        success: false,
        message: "Invalid Airtel phone number format. Airtel numbers should start with 070, 074, or 075 (256XXXXXXXXX)",
        errorCode: "INVALID_PHONE_NUMBER",
      }
    }

    // TODO: Implement Airtel Money API integration
    // Placeholder implementation with simulation
    await new Promise((resolve) => setTimeout(resolve, 2500))

    // Simulate 95% success rate for now
    const isSuccess = Math.random() > 0.05

    if (isSuccess) {
      const transactionId = `AIRTEL${Date.now()}${Math.floor(Math.random() * 1000)}`

      // Process commission payment for Airtel as well (simulated)
      const breakdown = this.calculatePaymentBreakdown(
        request.ticketInfo.pricePerTicket,
        request.ticketInfo.quantity,
        request.paymentMethod,
      )

      console.log(`Simulated commission payment of UGX ${breakdown.appCommission} to admin via Airtel`)

      return {
        success: true,
        transactionId,
        reference: transactionId,
        message: `Payment successful via Airtel Money (SIMULATED). Transaction ID: ${transactionId}`,
        processingTime: 2500,
      }
    } else {
      return {
        success: false,
        message:
          "Airtel Money payment failed (SIMULATED). Please ensure your account is active and has sufficient balance.",
        errorCode: "PAYMENT_DECLINED",
        processingTime: 2500,
      }
    }
  }

  // Simulate Credit Card payment (placeholder)
  async processCardPayment(request: PaymentRequest): Promise<PaymentResponse> {
    console.log("Processing Credit Card payment (PLACEHOLDER):", request)

    // TODO: Implement Credit Card API integration (Stripe, Flutterwave, etc.)
    // Placeholder implementation with simulation
    await new Promise((resolve) => setTimeout(resolve, 4000))

    // Simulate 90% success rate for now
    const isSuccess = Math.random() > 0.1

    if (isSuccess) {
      const transactionId = `CARD${Date.now()}${Math.floor(Math.random() * 1000)}`

      // Process commission payment for Card as well (simulated)
      const breakdown = this.calculatePaymentBreakdown(
        request.ticketInfo.pricePerTicket,
        request.ticketInfo.quantity,
        request.paymentMethod,
      )

      console.log(`Simulated commission payment of UGX ${breakdown.appCommission} to admin via Card`)

      return {
        success: true,
        transactionId,
        reference: transactionId,
        message: `Payment successful via Credit Card (SIMULATED). Transaction ID: ${transactionId}`,
        processingTime: 4000,
      }
    } else {
      return {
        success: false,
        message: "Credit Card payment failed (SIMULATED). Please check your card details and try again.",
        errorCode: "CARD_DECLINED",
        processingTime: 4000,
      }
    }
  }

  // Main payment processing method
  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      console.log(`Processing ${request.paymentMethod} payment for UGX ${request.amount}`)

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
            errorCode: "INVALID_PAYMENT_METHOD",
          }
      }
    } catch (error) {
      console.error("Payment processing error:", error)
      return {
        success: false,
        message: "Payment processing failed due to technical error. Please try again.",
        errorCode: "TECHNICAL_ERROR",
      }
    }
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

  // Get payment method fees
  getPaymentFees(method: PaymentMethod): { fixed: number; percentage: number } {
    return PAYMENT_FEES[method]
  }

  // Validate payment account
  validatePaymentAccount(account: PaymentAccount): boolean {
    if (!account.accountNumber || !account.accountName) {
      return false
    }

    switch (account.type) {
      case "mtn":
        return this.validateMTNPhoneNumber(account.accountNumber)
      case "airtel":
        return this.validateAirtelPhoneNumber(account.accountNumber)
      case "card":
        // Basic card number validation (16 digits)
        return /^\d{16}$/.test(account.accountNumber.replace(/\s/g, ""))
      default:
        return false
    }
  }

  // Format currency
  formatCurrency(amount: number): string {
    return `UGX ${amount.toLocaleString()}`
  }

  // Generate payment reference
  generatePaymentReference(method: PaymentMethod): string {
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 1000)
    return `${method.toUpperCase()}_${timestamp}_${random}`
  }

  // Get available payment methods (for compatibility with existing code)
  getAvailablePaymentMethods() {
    return [
      {
        id: "mtn",
        name: "MTN Mobile Money",
        type: "mobile_money",
        fees: PAYMENT_FEES.mtn,
      },
      {
        id: "airtel",
        name: "Airtel Money",
        type: "mobile_money",
        fees: PAYMENT_FEES.airtel,
      },
      {
        id: "card",
        name: "Credit/Debit Card",
        type: "credit_card",
        fees: PAYMENT_FEES.card,
      },
    ]
  }

  // Calculate payment fees (for compatibility)
  calculatePaymentFees(amount: number, method: any): number {
    const paymentMethod = typeof method === "string" ? method : method.id
    return calculatePaymentFees(amount, paymentMethod as PaymentMethod)
  }

  // Validate phone number (for compatibility) - Updated with correct patterns
  validatePhoneNumber(phoneNumber: string) {
    const cleanNumber = phoneNumber.replace(/\s+/g, "")

    if (this.validateMTNPhoneNumber(cleanNumber)) {
      return { valid: true, message: "Valid MTN number (076, 077, 078, 079)" }
    }

    if (this.validateAirtelPhoneNumber(cleanNumber)) {
      return { valid: true, message: "Valid Airtel number (070, 074, 075)" }
    }

    return {
      valid: false,
      message: "Invalid phone number format. MTN: 076/077/078/079, Airtel: 070/074/075 (256XXXXXXXXX)",
    }
  }

  // Validate credit card (for compatibility)
  validateCreditCard(cardDetails: any) {
    if (!cardDetails.cardNumber || !cardDetails.expiryMonth || !cardDetails.expiryYear || !cardDetails.cvv) {
      return { valid: false, message: "All card fields are required" }
    }

    if (!/^\d{16}$/.test(cardDetails.cardNumber.replace(/\s/g, ""))) {
      return { valid: false, message: "Invalid card number" }
    }

    return { valid: true, message: "Valid card details" }
  }
}

export default PaymentService.getInstance()
