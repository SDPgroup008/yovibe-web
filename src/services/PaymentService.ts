import type { PaymentIntent } from "../models/Ticket"

// Payment Service for processing ticket payments
class PaymentService {
  private static instance: PaymentService

  public static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService()
    }
    return PaymentService.instance
  }

  // Create payment intent
  async createPaymentIntent(amount: number, currency = "UGX", ticketId: string): Promise<PaymentIntent> {
    try {
      const paymentIntent: PaymentIntent = {
        id: `pi_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        ticketId,
        amount,
        currency,
        status: "pending",
        paymentMethod: "mobile_money", // Default payment method
        createdAt: new Date(),
      }

      // In production, integrate with actual payment provider
      // (Stripe, PayPal, Mobile Money APIs, etc.)

      return paymentIntent
    } catch (error) {
      console.error("Error creating payment intent:", error)
      throw new Error("Failed to create payment intent")
    }
  }

  // Process payment
  async processPayment(paymentIntentId: string): Promise<PaymentIntent> {
    try {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          // Simulate payment processing
          const success = Math.random() > 0.05 // 95% success rate for demo

          if (success) {
            const completedPayment: PaymentIntent = {
              id: paymentIntentId,
              ticketId: "", // Will be filled by caller
              amount: 0, // Will be filled by caller
              currency: "UGX",
              status: "succeeded",
              paymentMethod: "mobile_money",
              createdAt: new Date(),
              completedAt: new Date(),
            }
            resolve(completedPayment)
          } else {
            const failedPayment: PaymentIntent = {
              id: paymentIntentId,
              ticketId: "",
              amount: 0,
              currency: "UGX",
              status: "failed",
              paymentMethod: "mobile_money",
              createdAt: new Date(),
              failureReason: "Insufficient funds",
            }
            reject(failedPayment)
          }
        }, 3000) // Simulate processing time
      })
    } catch (error) {
      console.error("Error processing payment:", error)
      throw new Error("Payment processing failed")
    }
  }

  // Calculate commission and revenue split
  calculateRevenueSplit(totalAmount: number, appCommissionRate = 0.05) {
    const appCommission = Math.round(totalAmount * appCommissionRate)
    const venueRevenue = totalAmount - appCommission

    return {
      totalAmount,
      appCommission,
      venueRevenue,
      appCommissionRate,
    }
  }

  // Refund payment (for cancellations)
  async refundPayment(paymentIntentId: string): Promise<boolean> {
    try {
      return new Promise((resolve) => {
        setTimeout(() => {
          // Simulate refund processing
          const success = Math.random() > 0.1 // 90% success rate
          resolve(success)
        }, 2000)
      })
    } catch (error) {
      console.error("Error processing refund:", error)
      return false
    }
  }

  // Get payment status
  async getPaymentStatus(paymentIntentId: string): Promise<string> {
    try {
      // In production, query actual payment provider
      return "succeeded" // Mock status
    } catch (error) {
      console.error("Error getting payment status:", error)
      return "unknown"
    }
  }
}

export default PaymentService.getInstance()
