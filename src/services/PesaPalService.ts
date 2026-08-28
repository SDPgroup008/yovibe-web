import type { PaymentIntent } from "../models/Ticket"

// PesaPal Configuration
// NOTE: Actual API calls go through Netlify Functions which read credentials from environment variables.
// The values below serve as documentation defaults. Override via environment variables deployed to Netlify:
//   PESAPAL_CONSUMER_KEY  — Live consumer key from PesaPal
//   PESAPAL_CONSUMER_SECRET — Live consumer secret from PesaPal
//   PESAPAL_API_URL    — e.g. https://pay.pesapal.com/v3/api (default: production)
//   PESAPAL_BASE_URL   — e.g. https://pay.pesapal.com (default: production)
//   PESAPAL_NOTIFICATION_ID — Notification ID from PesaPal dashboard
const PESAPAL_CONFIG = {
  baseUrl: "https://pay.pesapal.com",
  apiUrl: "https://pay.pesapal.com/v3/api",
  sandbox: false,
}

// Generate unique order ID
const generateOrderId = (): string => {
  return `YV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export class PesaPalService {
  private static APP_COMMISSION_RATE = 0.15 // 15%
  private static LATE_FEE_PERCENTAGE = 0 // 0% default (configurable per event)



  /**
   * Calculate ticket price with optional late fee
   */
  static calculateTicketPrice(
    basePrice: number,
    quantity: number,
    eventStartTime: Date,
    lateFeePercent?: number,
  ): {
    subtotal: number
    lateFee: number
    total: number
    isLatePurchase: boolean
  } {
    const now = new Date()
    const sevenAm = new Date(eventStartTime)
    sevenAm.setHours(7, 0, 0, 0)

    const subtotal = basePrice * quantity
    let lateFee = 0

    if (now >= sevenAm) {
      const pct = lateFeePercent ?? this.LATE_FEE_PERCENTAGE
      lateFee = Math.round(subtotal * pct / 100)
    }

    return {
      subtotal,
      lateFee,
      total: subtotal + lateFee,
      isLatePurchase: lateFee > 0,
    }
  }

  /**
   * Calculate revenue split between app and venue
   */
  static calculateRevenueSplit(totalAmount: number): {
    appCommission: number
    venueRevenue: number
    commissionRate: number
  } {
    const appCommission = Math.round(totalAmount * this.APP_COMMISSION_RATE)
    const venueRevenue = totalAmount - appCommission

    return {
      appCommission,
      venueRevenue,
      commissionRate: this.APP_COMMISSION_RATE,
    }
  }

  /**
   * Initialize PesaPal checkout
   * Submits order and returns iframe URL for payment (via Netlify Functions)
   */
  static async initializeCheckout(
    amount: number,
    description: string,
    callbackUrl: string,
    buyerEmail: string,
    buyerPhone?: string,
    buyerName?: string,
    buyerFirstName?: string,
    buyerLastName?: string,
  ): Promise<{ iframeUrl: string; orderId: string; merchantReference: string; trackingId?: string }> {
    console.log("========================================")
    console.log("💳 PESAPAL CHECKOUT INITIALIZATION (Netlify Functions)")
    console.log("========================================")
    console.log("📋 PesaPalService.initializeCheckout: Starting checkout")
    console.log("   - Amount:", amount, "UGX")
    console.log("   - Description:", description)
    console.log("   - Buyer Email:", buyerEmail)
    console.log("   - Buyer Phone:", buyerPhone || "Not provided")
    console.log("   - Buyer Name:", buyerName || "Not provided")

    const orderId = generateOrderId()
    const merchantReference = orderId

    try {
      console.log("📤 Submitting order via Netlify Function...")
      console.log("   - Function URL:", '/.netlify/functions/create-pesapal-order')

      const response = await fetch('/.netlify/functions/create-pesapal-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          description,
          buyerEmail,
          buyerPhone,
          callbackUrl,
          buyerName,
          buyerFirstName,
          buyerLastName,
        }),
      })

      const data = await response.json()

      console.log("📥 Netlify Function response:")
      console.log("   - Status Code:", response.status)
      console.log("   - Response:", data)

      if (!response.ok) {
        throw new Error(data.error || `Failed to create order: ${response.status}`)
      }

      if (data.iframeUrl) {
        console.log("✅ Checkout initialized successfully via Netlify Functions")
        console.log("   - Tracking ID:", data.trackingId || "Not provided")
        console.log("========================================")
        return {
          iframeUrl: data.iframeUrl,
          orderId: data.orderId,
          merchantReference: data.merchantReference,
          trackingId: data.trackingId,
        }
      } else {
        console.log("⚠️ No iframe URL in response, using fallback")
        throw new Error("No iframe URL received")
      }
    } catch (error: any) {
      console.error("❌ Error initializing checkout:", error)
      console.error("   - Error name:", error.name)
      console.error("   - Error message:", error.message)
      console.log("⚠️ Using fallback mock iframe URL for testing")
      throw error
    }
  }

  /**
   * Verify payment status with PesaPal (via Netlify Functions)
   */
  static async verifyPayment(orderId: string, trackingId?: string): Promise<{
    status: "completed" | "failed" | "pending"
    transactionId?: string
    amount?: number
    confirmationCode?: string
  }> {
    console.log("========================================")
    console.log("🔍 PESAPAL PAYMENT VERIFICATION (Netlify Functions)")
    console.log("========================================")
    console.log("📋 PesaPalService.verifyPayment: Checking payment status")
    console.log("   - Merchant Reference:", orderId)
    console.log("   - Order Tracking ID:", trackingId || "Not provided")

    try {
      // Pass BOTH the order tracking id (authoritative for status) and the
      // merchant reference (our order id) so the verify function can also run
      // reversal/cancellation reconciliation against our tickets.
      const params = new URLSearchParams()
      if (trackingId) params.set("orderTrackingId", trackingId)
      if (orderId) params.set("merchantReference", orderId)
      const query = params.toString()
      console.log("📤 Querying Netlify Function for payment status...")

      const response = await fetch(`/.netlify/functions/verify-pesapal-payment?${query}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Failed to verify payment: ${response.status}`)
      }

      console.log("📥 Netlify Function verification response:")
      console.log("   - Status:", data.status)
      console.log("   - Payment Method:", data.paymentMethod)
      console.log("   - Transaction ID:", data.transactionId)
      console.log("   - Amount:", data.amount)

      const status = data.status === "completed" ? "completed" 
        : data.status === "failed" ? "failed" 
        : "pending"

      if (status === "completed") {
        console.log("✅ Payment verified successfully!")
      } else if (status === "failed") {
        console.log("❌ Payment verification failed")
      } else {
        console.log("⏳ Payment still pending")
      }

      console.log("========================================")

      return {
        status,
        transactionId: data.transactionId,
        amount: data.amount,
        confirmationCode: data.confirmationCode,
      }
    } catch (error) {
      console.error("❌ Error verifying payment:", error)
      // For testing purposes, return completed if API fails
      return { status: "pending" }
    }
  }

  /**
   * Create payment intent for internal tracking
   */
  static createPaymentIntent(
    amount: number,
    eventId: string,
    buyerId: string,
    eventStartTime?: Date
  ): PaymentIntent {
    const { appCommission, venueRevenue } = this.calculateRevenueSplit(amount)

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

  /**
   * Process payment - verifies the payment status server-side via the
   * verify-pesapal-payment function. Tickets are created only by the server
   * (fulfill-purchase), never on a client-side "simulated success".
   */
  static async processPayment(paymentIntentId: string): Promise<boolean> {
    const verification = await this.verifyPayment(paymentIntentId)
    if (verification.status === "failed") throw new Error("Payment failed")
    return verification.status === "completed"
  }

  /**
   * Submit order to PesaPal and get payment URL
   */
  static async submitOrder(
    amount: number,
    description: string,
    buyerEmail: string,
    buyerPhone: string,
    callbackUrl: string,
    buyerName?: string,
    buyerFirstName?: string,
    buyerLastName?: string,
  ): Promise<{ success: boolean; paymentUrl?: string; orderId?: string; trackingId?: string; error?: string }> {
    console.log("========================================")
    console.log("📝 PESAPAL ORDER SUBMISSION")
    console.log("========================================")
    console.log("📋 Submitting order to PesaPal")
    console.log("   - Amount:", amount)
    console.log("   - Description:", description)
    console.log("   - Email:", buyerEmail)
    console.log("   - Phone:", buyerPhone || "Not provided")
    console.log("   - Name:", buyerName || "Not provided")

    try {
      const checkout = await this.initializeCheckout(
        amount,
        description,
        callbackUrl,
        buyerEmail,
        buyerPhone,
        buyerName,
        buyerFirstName,
        buyerLastName,
      )

      console.log("✅ Order submitted successfully!")
      console.log("   - Payment URL:", checkout.iframeUrl.substring(0, 50) + "...")
      console.log("   - Order ID:", checkout.orderId)
      console.log("========================================")

      return {
        success: true,
        paymentUrl: checkout.iframeUrl,
        orderId: checkout.orderId,
        trackingId: checkout.trackingId,
      }
    } catch (error) {
      console.error("❌ Error submitting order:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Process payout to organizer (money withdraw)
   * Uses PesaPal's API via Netlify Functions
   */
  static async processPayout(
    organizerId: string,
    amount: number,
    payoutMethod: "mobile_money" | "bank_transfer",
    recipientDetails: {
      name: string
      accountNumber?: string
      phoneNumber?: string
      bankName?: string
    }
  ): Promise<{ success: boolean; payoutId?: string; transactionReference?: string; error?: string }> {
    console.log("========================================")
    console.log("💰 PESAPAL PAYOUT FLOW STARTED (Netlify Functions)")
    console.log("========================================")
    console.log("📋 PesaPalService.processPayout: Processing payout")
    console.log("   - Organizer ID:", organizerId)
    console.log("   - Amount:", amount, "UGX")
    console.log("   - Method:", payoutMethod)
    console.log("   - Recipient Name:", recipientDetails.name)
    
    if (payoutMethod === "mobile_money") {
      console.log("   - Phone Number:", recipientDetails.phoneNumber)
    } else {
      console.log("   - Bank Name:", recipientDetails.bankName)
      console.log("   - Account Number:", recipientDetails.accountNumber)
    }

    try {
      console.log("📤 Submitting payout request via Netlify Function...")

      const response = await fetch('/.netlify/functions/process-pesapal-payout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizerId,
          amount,
          payoutMethod,
          recipientDetails,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Failed to process payout: ${response.status}`)
      }

      console.log("📥 Netlify Function payout response:")
      console.log("   - Payout ID:", data.payoutId)
      console.log("   - Transaction Ref:", data.transactionReference)
      console.log("   - Status:", data.status)

      if (data.success) {
        console.log("✅ PesaPalService.processPayout: Payout processed successfully!")
        console.log("========================================")
        console.log("💰 PESAPAL PAYOUT COMPLETED")
        console.log("========================================")
        console.log("📋 Payout Details:")
        console.log("   - Payout ID:", data.payoutId)
        console.log("   - Amount:", amount, "UGX")
        console.log("   - Method:", payoutMethod)
        console.log("   - Recipient:", recipientDetails.name)
        console.log("   - Transaction Ref:", data.transactionReference)
        console.log("   - Status:", data.status)
        console.log("========================================")
        
        return {
          success: true,
          payoutId: data.payoutId,
          transactionReference: data.transactionReference,
        }
      } else {
        throw new Error(data.error || 'Payout failed')
      }
    } catch (error: any) {
      console.error("❌ Error processing PesaPal payout:", error.message)
      return { success: false, error: error?.message || "Payout failed" }
    }
  }

  /**
   * Verify payout status
   */
  static async verifyPayoutStatus(payoutId: string): Promise<{
    status: "pending" | "processing" | "completed" | "failed"
    transactionReference?: string
    error?: string
  }> {
    console.log("📋 PesaPalService.verifyPayoutStatus: Checking payout status")
    console.log("   - Payout ID:", payoutId)

    // Payout status is verified by polling verify-pawapay-payout / the payout
    // callback; a client-side simulated status would be meaningless here.
    return { status: "pending", error: "Payout status verification is not available" }
  }

  /**
   * Request refund for a payment
   */
  static async refundPayment(paymentIntentId: string, amount: number): Promise<boolean> {
    throw new Error("Refunds must be requested and executed through the manual admin refund workflow")
  }
}

export default PesaPalService
