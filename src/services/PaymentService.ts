import type { PaymentMethod, PaymentAccount } from "../models/Ticket";
import { calculatePaymentFees, calculateAppCommission, calculateSellerRevenue, PAYMENT_FEES } from "../models/Ticket";
import axios from "axios";

export interface PaymentRequest {
  amount: number;
  paymentMethod: PaymentMethod;
  paymentAccount: PaymentAccount;
  buyerInfo: {
    name: string;
    email: string;
    phone?: string;
  };
  eventInfo: {
    id: string;
    name: string;
    venueName: string;
  };
  ticketInfo: {
    type: string;
    quantity: number;
    pricePerTicket: number;
  };
}

export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  reference?: string;
  message: string;
  errorCode?: string;
  processingTime?: number;
}

export interface PaymentBreakdown {
  ticketPrice: number;
  quantity: number;
  subtotal: number;
  paymentFees: number;
  totalAmount: number;
  appCommission: number;
  sellerRevenue: number;
}

export interface DisbursementRequest {
  amount: number;
  recipientPhone: string;
  recipientName: string;
  reference: string;
  description: string;
}

export interface DisbursementResponse {
  success: boolean;
  transactionId?: string;
  reference?: string;
  message: string;
  errorCode?: string;
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
    apiKey: "9165d5d736b5409e8f8a43a7cf644e6b",
    baseUrl: "https://sandbox.momodeveloper.mtn.com/disbursement",
    environment: "sandbox",
  },
};

// Admin configuration for commission payments
const ADMIN_CONFIG = {
  phone: "256777123456",
  name: "YoVibe Admin",
};

class PaymentService {
  private static instance: PaymentService;
  private collectionToken: string | null = null;
  private disbursementToken: string | null = null;

  private constructor() {}

  static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  // Generate access token for a given API
  private async generateAccessToken(apiType: "collection" | "disbursement"): Promise<string> {
    const config = MTN_CONFIG[apiType];
    const auth = Buffer.from(`${config.apiUser}:${config.apiKey}`).toString("base64");

    try {
      const response = await axios.post(
        `${config.baseUrl}/v1_0/createaccesstoken`,
        {},
        {
          headers: {
            Authorization: `Basic ${auth}`,
            "X-Target-Environment": config.environment,
          },
        }
      );
      return response.data.access_token; // Adjust based on actual response field
    } catch (error) {
      console.error(`Failed to generate ${apiType} token:`, error);
      throw new Error(`Token generation failed for ${apiType}`);
    }
  }

  // Ensure tokens are valid and refreshed if needed
  private async getToken(apiType: "collection" | "disbursement"): Promise<string> {
    const tokenKey = `${apiType}Token`;
    const token = this[tokenKey as keyof PaymentService] as string | null;

    if (!token || this.isTokenExpired(token)) {
      this[tokenKey as keyof PaymentService] = await this.generateAccessToken(apiType);
      console.log(`${apiType} token refreshed`);
    }
    return this[tokenKey as keyof PaymentService] as string;
  }

  private isTokenExpired(token: string): boolean {
    // Simplified check; in production, decode JWT and check 'exp'
    const [, payload] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
    const expiry = new Date(decoded.expires).getTime();
    return expiry < Date.now();
  }

  // Calculate payment breakdown
  calculatePaymentBreakdown(ticketPrice: number, quantity: number, paymentMethod: PaymentMethod): PaymentBreakdown {
    const subtotal = ticketPrice * quantity;
    const paymentFees = calculatePaymentFees(subtotal, paymentMethod);
    const totalAmount = subtotal + paymentFees;
    const appCommission = calculateAppCommission(subtotal);
    const sellerRevenue = calculateSellerRevenue(ticketPrice, quantity);

    return { ticketPrice, quantity, subtotal, paymentFees, totalAmount, appCommission, sellerRevenue };
  }

  // Generate unique reference ID
  private generateReferenceId(): string {
    return `yovibe_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  // Validate MTN phone number format
  private validateMTNPhoneNumber(phoneNumber: string): boolean {
    const mtnPattern = /^256(76|77|78|79)[0-9]{7}$|^0(76|77|78|79)[0-9]{7}$/;
    return mtnPattern.test(phoneNumber.replace(/\s+/g, ""));
  }

  // Validate Airtel phone number format
  private validateAirtelPhoneNumber(phoneNumber: string): boolean {
    const airtelPattern = /^256(70|74|75)[0-9]{7}$|^0(70|74|75)[0-9]{7}$/;
    return airtelPattern.test(phoneNumber.replace(/\s+/g, ""));
  }

  // MTN Mobile Money payment initialization
  async initiateMtnPayment(request: {
    amount: number;
    currency: string;
    externalId: string;
    payer: { partyIdType: string; partyId: string };
    payerMessage: string;
    payeeNote: string;
  }): Promise<PaymentResponse> {
    const token = await this.getToken("collection");
    const referenceId = request.externalId || this.generateReferenceId();
    const phoneNumber = request.payer.partyId;

    if (!this.validateMTNPhoneNumber(phoneNumber)) {
      return {
        success: false,
        message: "Invalid MTN phone number format",
        errorCode: "INVALID_PHONE_NUMBER",
      };
    }

    try {
      const response = await axios.post(
        `${MTN_CONFIG.collection.baseUrl}/v1_0/requesttopay`,
        { ...request, amount: request.amount.toString() },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Reference-Id": referenceId,
            "X-Target-Environment": MTN_CONFIG.collection.environment,
            "Ocp-Apim-Subscription-Key": MTN_CONFIG.collection.apiKey,
          },
        }
      );

      if (response.status !== 202) {
        return {
          success: false,
          message: "Failed to initiate MTN payment",
          errorCode: "REQUEST_TO_PAY_FAILED",
        };
      }

      let attempts = 0;
      const maxAttempts = 30;
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        attempts++;

        const statusResponse = await axios.get(
          `${MTN_CONFIG.collection.baseUrl}/v1_0/requesttopay/${referenceId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "X-Target-Environment": MTN_CONFIG.collection.environment,
              "Ocp-Apim-Subscription-Key": MTN_CONFIG.collection.apiKey,
            },
          }
        );

        if (statusResponse.data.status === "SUCCESSFUL") {
          return {
            success: true,
            transactionId: statusResponse.data.financialTransactionId || referenceId,
            reference: referenceId,
            message: `Payment successful. Transaction ID: ${statusResponse.data.financialTransactionId || referenceId}`,
            processingTime: attempts * 2000,
          };
        } else if (statusResponse.data.status === "FAILED") {
          return {
            success: false,
            message: statusResponse.data.reason || "Payment failed",
            errorCode: "PAYMENT_FAILED",
            processingTime: attempts * 2000,
          };
        }
      }

      return {
        success: false,
        message: "Payment timeout",
        errorCode: "PAYMENT_TIMEOUT",
      };
    } catch (error) {
      console.error("MTN Payment error:", error);
      return {
        success: false,
        message: "Technical error during payment",
        errorCode: "TECHNICAL_ERROR",
      };
    }
  }

  // MTN Mobile Money payment processing
  async processMTNPayment(request: PaymentRequest): Promise<PaymentResponse> {
    const token = await this.getToken("collection");
    const referenceId = this.generateReferenceId();
    const phoneNumber = request.paymentAccount.accountNumber;

    if (!this.validateMTNPhoneNumber(phoneNumber)) {
      return {
        success: false,
        message: "Invalid MTN phone number format",
        errorCode: "INVALID_PHONE_NUMBER",
      };
    }

    const requestToPayPayload = {
      amount: request.amount.toString(),
      currency: "UGX",
      externalId: referenceId,
      payer: { partyIdType: "MSISDN", partyId: phoneNumber },
      payerMessage: `Payment for ${request.eventInfo.name} tickets`,
      payeeNote: `YoVibe ticket purchase - ${request.ticketInfo.type} x${request.ticketInfo.quantity}`,
    };

    try {
      const response = await axios.post(
        `${MTN_CONFIG.collection.baseUrl}/v1_0/requesttopay`,
        requestToPayPayload,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Reference-Id": referenceId,
            "X-Target-Environment": MTN_CONFIG.collection.environment,
            "Ocp-Apim-Subscription-Key": MTN_CONFIG.collection.apiKey,
          },
        }
      );

      if (response.status !== 202) {
        return {
          success: false,
          message: "Failed to initiate MTN payment",
          errorCode: "REQUEST_TO_PAY_FAILED",
        };
      }

      let attempts = 0;
      const maxAttempts = 30;
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        attempts++;

        const statusResponse = await axios.get(
          `${MTN_CONFIG.collection.baseUrl}/v1_0/requesttopay/${referenceId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "X-Target-Environment": MTN_CONFIG.collection.environment,
              "Ocp-Apim-Subscription-Key": MTN_CONFIG.collection.apiKey,
            },
          }
        );

        if (statusResponse.data.status === "SUCCESSFUL") {
          await this.processCommissionPayment(request, referenceId);
          return {
            success: true,
            transactionId: statusResponse.data.financialTransactionId || referenceId,
            reference: referenceId,
            message: `Payment successful via MTN Mobile Money. Transaction ID: ${statusResponse.data.financialTransactionId || referenceId}`,
            processingTime: attempts * 2000,
          };
        } else if (statusResponse.data.status === "FAILED") {
          return {
            success: false,
            message: statusResponse.data.reason || "MTN Mobile Money payment failed",
            errorCode: "PAYMENT_FAILED",
            processingTime: attempts * 2000,
          };
        }
      }

      return {
        success: false,
        message: "Payment timeout",
        errorCode: "PAYMENT_TIMEOUT",
      };
    } catch (error) {
      console.error("MTN Payment processing error:", error);
      return {
        success: false,
        message: "MTN Mobile Money payment failed due to technical error",
        errorCode: "TECHNICAL_ERROR",
      };
    }
  }

  private async processCommissionPayment(request: PaymentRequest, originalReference: string): Promise<void> {
    const breakdown = this.calculatePaymentBreakdown(
      request.ticketInfo.pricePerTicket,
      request.ticketInfo.quantity,
      request.paymentMethod,
    );

    if (breakdown.appCommission > 0) {
      const commissionRequest: DisbursementRequest = {
        amount: breakdown.appCommission,
        recipientPhone: ADMIN_CONFIG.phone,
        recipientName: ADMIN_CONFIG.name,
        reference: `commission_${originalReference}`,
        description: `Commission from ${request.eventInfo.name} ticket sale`,
      };

      const commissionResult = await this.processMTNDisbursement(commissionRequest);
      if (!commissionResult.success) {
        console.error("Commission payment failed:", commissionResult.message);
      }
    }
  }

  async processMTNDisbursement(request: DisbursementRequest): Promise<DisbursementResponse> {
    const token = await this.getToken("disbursement");
    const referenceId = this.generateReferenceId();

    if (!this.validateMTNPhoneNumber(request.recipientPhone)) {
      return {
        success: false,
        message: "Invalid MTN phone number format for disbursement",
        errorCode: "INVALID_PHONE_NUMBER",
      };
    }

    const depositPayload = {
      amount: request.amount.toString(),
      currency: "UGX",
      externalId: referenceId,
      payee: {
        partyIdType: "MSISDN",
        partyId: request.recipientPhone,
      },
      payerMessage: request.description,
      payeeNote: `YoVibe payment: ${request.description}`,
    };

    try {
      const response = await axios.post(
        `${MTN_CONFIG.disbursement.baseUrl}/v1_0/deposit`,
        depositPayload,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Reference-Id": referenceId,
            "X-Target-Environment": MTN_CONFIG.disbursement.environment,
            "Ocp-Apim-Subscription-Key": MTN_CONFIG.disbursement.apiKey,
          },
        }
      );

      if (response.status !== 202) {
        return {
          success: false,
          message: "Failed to initiate MTN disbursement",
          errorCode: "DEPOSIT_FAILED",
        };
      }

      let attempts = 0;
      const maxAttempts = 30;
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        attempts++;

        const statusResponse = await axios.get(
          `${MTN_CONFIG.disbursement.baseUrl}/v1_0/deposit/${referenceId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "X-Target-Environment": MTN_CONFIG.disbursement.environment,
              "Ocp-Apim-Subscription-Key": MTN_CONFIG.disbursement.apiKey,
            },
          }
        );

        if (statusResponse.data.status === "SUCCESSFUL") {
          return {
            success: true,
            transactionId: statusResponse.data.financialTransactionId || referenceId,
            reference: referenceId,
            message: `Transfer successful to ${request.recipientPhone}. Amount: UGX ${request.amount}`,
          };
        } else if (statusResponse.data.status === "FAILED") {
          return {
            success: false,
            message: statusResponse.data.reason || "MTN disbursement failed",
            errorCode: "DEPOSIT_FAILED",
          };
        }
      }

      return {
        success: false,
        message: "Disbursement timeout",
        errorCode: "DEPOSIT_TIMEOUT",
      };
    } catch (error) {
      console.error("MTN Disbursement error:", error);
      return {
        success: false,
        message: "Technical error during disbursement",
        errorCode: "TECHNICAL_ERROR",
      };
    }
  }

  async payEventOwner(
    eventOwnerPhone: string,
    eventOwnerName: string,
    amount: number,
    eventName: string,
    ticketReference: string,
  ): Promise<DisbursementResponse> {
    const disbursementRequest: DisbursementRequest = {
      amount,
      recipientPhone: eventOwnerPhone,
      recipientName: eventOwnerName,
      reference: `payout_${ticketReference}`,
      description: `Revenue from ${eventName} ticket verification`,
    };

    return await this.processMTNDisbursement(disbursementRequest);
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

export default PaymentService.getInstance();