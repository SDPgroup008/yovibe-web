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

    const paymentResponse = await this.initiateMtnPayment(requestToPayPayload);
    if (paymentResponse.success) {
      await this.processCommissionPayment(request, referenceId);
    }
    return paymentResponse;
  }

  private async processCommissionPayment(request: PaymentRequest, originalReference: string): Promise<void> {
    const breakdown = this.calculatePaymentBreakdown(
      request.ticketInfo.pricePerTicket,
      request.ticketInfo.quantity,
      request.paymentMethod
    );
    const adminAmount = breakdown.appCommission; // Assuming 5% as app commission

    if (adminAmount > 0) {
      const commissionRequest: DisbursementRequest = {
        amount: adminAmount,
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

    // Placeholder for event owner payment (triggered by verification)
    const organizerAmount = breakdown.sellerRevenue - adminAmount;
    if (organizerAmount > 0) {
      console.log(`Deferred payment of UGX ${organizerAmount} to event owner pending verification`);
      // This will be triggered by a verification method (e.g., scanQRCode)
      // await this.payEventOwner(request.buyerInfo.phone || "", request.buyerInfo.name, organizerAmount, request.eventInfo.name, originalReference);
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
    ticketReference: string
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

  // Placeholder methods (unchanged)
  async processAirtelPayment(request: PaymentRequest): Promise<PaymentResponse> { /* ... */ }
  async processCardPayment(request: PaymentRequest): Promise<PaymentResponse> { /* ... */ }
  async processPayment(request: PaymentRequest): Promise<PaymentResponse> { /* ... */ }
  getPaymentMethodName(method: PaymentMethod): string { /* ... */ }
  getPaymentFees(method: PaymentMethod): { fixed: number; percentage: number } { /* ... */ }
  validatePaymentAccount(account: PaymentAccount): boolean { /* ... */ }
  formatCurrency(amount: number): string { /* ... */ }
  generatePaymentReference(method: PaymentMethod): string { /* ... */ }
  getAvailablePaymentMethods() { /* ... */ }
  calculatePaymentFees(amount: number, method: any): number { /* ... */ }
  validatePhoneNumber(phoneNumber: string) { /* ... */ }
  validateCreditCard(cardDetails: any) { /* ... */ }
}

export default PaymentService.getInstance();