import type { PaymentIntent } from "../models/Ticket"
import PesaPalService from "./PesaPalService"

export class PaymentService {
  static async createPaymentIntent(amount: number, eventId: string, buyerId: string): Promise<PaymentIntent> {
    const { appCommission, venueRevenue } = PesaPalService.calculateRevenueSplit(amount)

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

  static async processPayment(paymentIntentId: string): Promise<boolean> {
    return PesaPalService.processPayment(paymentIntentId)
  }

  static async refundPayment(paymentIntentId: string, amount: number): Promise<boolean> {
    return PesaPalService.refundPayment(paymentIntentId, amount)
  }

  static calculateRevenueSplit(totalAmount: number) {
    return PesaPalService.calculateRevenueSplit(totalAmount)
  }
}

export default PaymentService
