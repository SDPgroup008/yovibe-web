import type { PaymentMethod, PaymentAccount } from "../models/Ticket"

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
    api
