import type { PaymentIntent } from "../models/Ticket"
import PesaPalService from "./PesaPalService"
import PawaPayService from "./PawaPayService"

export interface PaymentMethod {
  method: "mobile_money" | "credit_card" | "bank_transfer"
  provider?: string
  number?: string
  name?: string
}

export class PaymentService {
  static async createPaymentIntent(
    amount: number,
    eventId: string,
    buyerId: string,
    paymentMethod?: PaymentMethod
  ): Promise<PaymentIntent> {
    const { appCommission, venueRevenue } = PawaPayService.calculateRevenueSplit(amount)

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

    return paymentIntent
  }

  static async processPayment(
    paymentIntentId: string,
    paymentMethod: PaymentMethod,
    amount: number
  ): Promise<boolean> {
    if (paymentMethod.method === "mobile_money") {
      return PawaPayService.initiateMobileMoneyPayment(
        paymentIntentId,
        paymentMethod,
        amount
      )
    }
    return PesaPalService.processPayment(paymentIntentId)
  }

  static async refundPayment(paymentIntentId: string, amount: number): Promise<boolean> {
    return PesaPalService.refundPayment(paymentIntentId, amount)
  }

  static calculateRevenueSplit(totalAmount: number) {
    return PawaPayService.calculateRevenueSplit(totalAmount)
  }

  static getSupportedProviders(countryCode: string): string[] {
    return PawaPayService.getProvidersForCountry(countryCode)
  }
}

export default PaymentService