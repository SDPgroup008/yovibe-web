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
      "eyJ0eXAiOiJKV1QiLCJhbGciOiJSMjU2In0.eyJjbGllbnRJZCI6IjUyMTQwMjc3LTBhNjUtNGNhNS1hZDc0LTdmMjEzOWU5NzdmMSIsImV4cGlyZXMiOiIyMDI1LTA3LTI5VDEyOjEzOjM0LjIzNyIsInNlc3Npb25JZCI6IjA5MzYyNGIyLTRkNjktNDE1NS1iM2ZjLWEyZmQ2ZWEwMmNjNCJ9.Cp1WUJjGKYtSKGQm2_TMnxzSpbYYAbrGs-WVZI6kMUnXqiQcxK5qNOCB3jBqK1zRe_bFW406pqLLBIqPOyHf7EiLQ3jAiOl8m6N8SENCi4T2BWz75AVt0ESPrcziK6V3Txd9U3je041Zo16P8phBXL0OKsJWGeptBrjHAfvXQ-6pxOkru_XrjLt-9MJzb0ITPj6lTIVHHE12TZfVpXVjmhIYKW466R_fUjDMn3vEX74TkqSkdBi4xbCOSACGmbyL20N68m18S35QstOpJN2la6OCFpnABcxopvxV5hOyrw-f79A2j9bkAEUhjwxOOSCy9VaHdbSBB0qu0xTo-Fj8LA",
    baseUrl: "https://sandbox.momodeveloper.mtn.com/collection",
    environment: "sandbox",
  },
  disbursement: {
    apiUser: "bc53667a-e27a-4980-8031-f7b4fa063d99",
    apiKey: "9165d5d736b5409e8f8a43a7cf644e6b",
    accessToken:
      "eyJ0eXAiOiJKV1QiLCJhbGciOiJSMjU2In0.eyJjbGllbnRJZCI6ImJjNTM2NjdhLWUyN2EtNDk4MC04MDMxLWY3YjRmYTA2M2Q5OSIsImV4cGlyZXMiOiIyMDI1LTA3LTI4VDEwOjA1OjI0Ljc5NiIsInNlc3Npb25JZCI6ImIzMzk1ZjhlLTQyNzktNGM0MS1hN2UyLTQzYzhlOWIzMjJmOSJ9.E0MOTcepySyvfhYzj7YxahHuuTG67eLL7MA5a92ZHD085FeiflN0AWPkb9NL1ZyWQDvhMonc5uLYGK6eYxYyWnieX9Y1MftJRZAMDz50XLERzBGsIdQz1-Jc3VNQSBiW6ptjR-qBBzfHyQkkp8b6WF8_XudOlCxvu3yqYB_Rcfw1jW2oBxurXPI34A3eKewGh7fveX-R-95JFQh3rxZ-Wsi_HYXwiI65CmG21114VG1FJ3ekgSkR6nbaApzPDO0Qxw67hzQCjeR1p_r9UkVcheL5MgC2wOmfNOUc3zWIL3n25-wrrBRU-Vs-rKzjnscNoiLEKuaKB38ucqRSiiwoXg",
    baseUrl: "https://sandbox.momodeveloper.mtn.com/disbursement",
    environment: "sandbox",
  },
}

// Admin configuration for commission payments
const ADMIN_CONFIG = {
  phone: "256777123456",
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

  // Validate MTN phone number format
  private validateMTNPhoneNumber(phoneNumber: string): boolean {
    const mtnPattern = /^256(76|77|78|79)[0-9]{7}$|^0(76|77|78|79)[0-9]{7}$/
    return mtnPattern.test(phoneNumber.replace(/\s+/g, ""))
  }

  // Validate Airtel phone number format
  private validateAirtelPhoneNumber(phoneNumber: string): boolean {
    const airtelPattern = /^256(70|74|75)[0-9]{7}$|^0(70|74|75)[0-9]{7}$/
    return airtelPattern.test(phoneNumber.replace(/\s+/g, ""))
  }

  // MTN Mobile Money payment initialization
async initiateMtnPayment(request: {
  amount: number
  currency: string
  externalId: string
  payer: { partyIdType: string; partyId: string }
  payerMessage: string
  payeeNote: string
}): Promise<PaymentResponse> {
  console.log("Initiating MTN Mobile Money payment:", request)

  try {
    const referenceId = request.externalId || this.generateReferenceId()
    const phoneNumber = request.payer.partyId

    console.log("Generated reference ID:", referenceId)
    console.log("Phone number for payment:", phoneNumber)

    if (!this.validateMTNPhoneNumber(phoneNumber)) {
      console.error("Invalid MTN phone number:", phoneNumber)
      return {
        success: false,
        message:
          "Invalid MTN phone number format. MTN numbers should start with 25676, 25677, 25678, or 25679 (12 digits) or 076, 077, 078, or 079 (10 digits with leading 0)",
        errorCode: "INVALID_PHONE_NUMBER",
      }
    }

    console.log("Phone number validation passed")

    const fetchUrl = `https://cors-anywhere.herokuapp.com/https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay`;
    console.log("Fetching from:", fetchUrl);
    const requestToPayResponse = await fetch(fetchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MTN_CONFIG.collection.accessToken}`,
        "X-Reference-Id": referenceId,
        "X-Target-Environment": MTN_CONFIG.collection.environment,
        "Ocp-Apim-Subscription-Key": MTN_CONFIG.collection.apiKey,
        "X-Requested-With": "XMLHttpRequest", // Required for cors-anywhere
      },
      body: JSON.stringify(request),
    })

    console.log("MTN API response status:", requestToPayResponse.status)
    const responseText = await requestToPayResponse.clone().text();
    console.log("MTN API raw response:", responseText);

    if (!requestToPayResponse.ok) {
      const errorData = responseText;
      console.error("MTN Request to Pay failed:", errorData)
      return {
        success: false,
        message: "Failed to initiate MTN Mobile Money payment. Please try again.",
        errorCode: "REQUEST_TO_PAY_FAILED",
      }
    }

    let responseData;
    try {
      responseData = await requestToPayResponse.json();
    } catch (jsonError) {
      console.error("Failed to parse JSON:", responseText);
      return {
        success: false,
        message: "Invalid response from MTN API. Please contact support.",
        errorCode: "INVALID_RESPONSE",
      };
    }
    console.log("MTN Request to Pay response:", responseData)

    return {
      success: true,
      transactionId: responseData.financialTransactionId || referenceId,
      reference: referenceId,
      message: "MTN Mobile Money payment initiated successfully. Please approve on your MoMo app.",
    }
  } catch (error) {
    console.error("MTN Payment initialization error:", error)
    return {
      success: false,
      message: "MTN Mobile Money payment initialization failed due to technical error. Please try again.",
      errorCode: "TECHNICAL_ERROR",
    }
  }
}

  // MTN Mobile Money payment processing
  async processMTNPayment(request: PaymentRequest): Promise<PaymentResponse> {
    console.log("Processing MTN Mobile Money payment:", request)

    try {
      const referenceId = this.generateReferenceId()
      const phoneNumber = request.paymentAccount.accountNumber

      console.log("Generated reference ID:", referenceId)
      console.log("Phone number for payment:", phoneNumber)

      if (!this.validateMTNPhoneNumber(phoneNumber)) {
        console.error("Invalid MTN phone number:", phoneNumber)
        return {
          success: false,
          message:
            "Invalid MTN phone number format. MTN numbers should start with 25676, 25677, 25678, or 25679 (12 digits) or 076, 077, 078, or 079 (10 digits)",
          errorCode: "INVALID_PHONE_NUMBER",
        }
      }

      console.log("Phone number validation passed")

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
      console.log("Making API call to MTN...")

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

      console.log("MTN API response status:", requestToPayResponse.status)

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

      let attempts = 0
      const maxAttempts = 30

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        attempts++

        try {
          console.log(`Checking payment status, attempt ${attempts}/${maxAttempts}`)

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
              console.log("Payment successful! Processing commission...")
              await this.processCommissionPayment(request, referenceId)

              return {
                success: true,
                transactionId: statusData.financialTransactionId || referenceId,
                reference: referenceId,
                message: `Payment successful via MTN Mobile Money. Transaction ID: ${statusData.financialTransactionId || referenceId}`,
                processingTime: attempts * 2000,
              }
            } else if (statusData.status === "FAILED") {
              console.error("Payment failed:", statusData)
              return {
                success: false,
                message:
                  statusData.reason ||
                  "MTN Mobile Money payment failed. Please check your account balance and try again.",
                errorCode: "PAYMENT_FAILED",
                processingTime: attempts * 2000,
              }
            }
            console.log("Payment still pending, continuing to poll...")
          } else {
            console.error("Status check failed:", statusResponse.status)
          }
        } catch (statusError) {
          console.error("Error checking MTN payment status:", statusError)
        }
      }

      console.error("Payment timeout reached")
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
        }
      }
    } catch (error) {
      console.error("Error processing commission payment:", error)
    }
  }

  async processMTNDisbursement(request: DisbursementRequest): Promise<DisbursementResponse> {
    console.log("Processing MTN Mobile Money disbursement:", request)

    try {
      const referenceId = this.generateReferenceId()

      if (!this.validateMTNPhoneNumber(request.recipientPhone)) {
        return {
          success: false,
          message: "Invalid MTN phone number format for disbursement",
          errorCode: "INVALID_PHONE_NUMBER",
        }
      }

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

  async processAirtelPayment(request: PaymentRequest): Promise<PaymentResponse> {
    console.log("Processing Airtel Money payment (PLACEHOLDER):", request)

    if (!this.validateAirtelPhoneNumber(request.paymentAccount.accountNumber)) {
      return {
        success: false,
        message: "Invalid Airtel phone number format. Airtel numbers should start with 25670, 25674, or 25675 (12 digits) or 070, 074, or 075 (9 digits)",
        errorCode: "INVALID_PHONE_NUMBER",
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2500))

    const isSuccess = Math.random() > 0.05

    if (isSuccess) {
      const transactionId = `AIRTEL${Date.now()}${Math.floor(Math.random() * 1000)}`

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

  async processCardPayment(request: PaymentRequest): Promise<PaymentResponse> {
    console.log("Processing Credit Card payment (PLACEHOLDER):", request)

    await new Promise((resolve) => setTimeout(resolve, 4000))

    const isSuccess = Math.random() > 0.1

    if (isSuccess) {
      const transactionId = `CARD${Date.now()}${Math.floor(Math.random() * 1000)}`

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

  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      console.log(`Processing ${request.paymentMethod} payment for UGX ${request.amount}`)
      console.log("Payment request details:", JSON.stringify(request, null, 2))

      switch (request.paymentMethod) {
        case "mtn":
          console.log("Calling processMTNPayment...")
          return await this.processMTNPayment(request)
        case "airtel":
          console.log("Calling processAirtelPayment...")
          return await this.processAirtelPayment(request)
        case "card":
          console.log("Calling processCardPayment...")
          return await this.processCardPayment(request)
        default:
          console.error("Invalid payment method:", request.paymentMethod)
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

  getPaymentFees(method: PaymentMethod): { fixed: number; percentage: number } {
    return PAYMENT_FEES[method]
  }

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
        return /^\d{16}$/.test(account.accountNumber.replace(/\s/g, ""))
      default:
        return false
    }
  }

  formatCurrency(amount: number): string {
    return `UGX ${amount.toLocaleString()}`
  }

  generatePaymentReference(method: PaymentMethod): string {
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 1000)
    return `${method.toUpperCase()}_${timestamp}_${random}`
  }

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

  calculatePaymentFees(amount: number, method: any): number {
    const paymentMethod = typeof method === "string" ? method : method.id
    return calculatePaymentFees(amount, paymentMethod as PaymentMethod)
  }

  validatePhoneNumber(phoneNumber: string) {
    const cleanNumber = phoneNumber.replace(/\s+/g, "").replace(/^\+/, "");
    console.log("Validating phone number, cleaned to:", cleanNumber);

    const mtnPatternFull = /^256(76|77|78|79)[0-9]{7}$/;
    const mtnPatternLocal = /^0(76|77|78|79)[0-9]{7}$/;
    const airtelPatternFull = /^256(70|74|75)[0-9]{7}$/;
    const airtelPatternLocal = /^0(70|74|75)[0-9]{7}$/;

    console.log("MTN Full test:", mtnPatternFull.test(cleanNumber));
    console.log("MTN Local test:", mtnPatternLocal.test(cleanNumber));
    console.log("Airtel Full test:", airtelPatternFull.test(cleanNumber));
    console.log("Airtel Local test:", airtelPatternLocal.test(cleanNumber));

    if (mtnPatternFull.test(cleanNumber) || mtnPatternLocal.test(cleanNumber)) {
      console.log("Phone number validated as MTN");
      return { valid: true, message: "Valid MTN number" };
    }
    if (airtelPatternFull.test(cleanNumber) || airtelPatternLocal.test(cleanNumber)) {
      console.log("Phone number validated as Airtel");
      return { valid: true, message: "Valid Airtel number" };
    }

    // Fallback for 12-digit MTN numbers starting with 2567
    if (/^2567[0-9]{8}$/.test(cleanNumber)) {
      console.log("Fallback: Validated as 12-digit MTN number");
      return { valid: true, message: "Valid MTN number (fallback)" };
    }

    console.log("Phone number validation failed");
    return {
      valid: false,
      message: "Invalid phone number format. MTN: 25676/25677/25678/25679 or 076/077/078/079, Airtel: 25670/25674/25675 or 070/074/075 (XXXXXXXXX or 256XXXXXXXXX)",
    };
  }

  validateCreditCard(cardDetails: any) {
    if (!cardDetails.cardNumber || !cardDetails.expiryMonth || !cardDetails.expiryYear || !cardDetails.cvv) {
      return { valid: false, message: "All card fields are required" };
    }

    if (!/^\d{16}$/.test(cardDetails.cardNumber.replace(/\s/g, ""))) {
      return { valid: false, message: "Invalid card number" };
    }

    return { valid: true, message: "Valid card details" };
  }
}

export default PaymentService.getInstance()