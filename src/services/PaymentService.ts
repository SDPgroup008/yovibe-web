import type { PaymentIntent } from "../models/Ticket"

export class PaymentService {
  private static APP_COMMISSION_RATE = 0.05 // 5%

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

    return paymentIntent
  }

  static async processPayment(paymentIntentId: string): Promise<boolean> {
    // Simulate payment processing
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate 95% success rate
        const success = Math.random() > 0.05
        if (success) {
          resolve(true)
        } else {
          reject(new Error("Payment failed"))
        }
      }, 3000)
    })
  }

  static async refundPayment(paymentIntentId: string, amount: number): Promise<boolean> {
    // Simulate refund processing
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(true)
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
}

export default PaymentService
