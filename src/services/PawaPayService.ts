import type { PaymentIntent } from "../models/Ticket"

const PAWAPAY_PROVIDERS: Record<string, string[]> = {
  UG: ["MTN_MOMO_UGA", "AIRTEL_OAPI_UGA"],
  RW: ["MTN_MOMO_RWA", "AIRTEL_RWA"],
  KE: ["MPESA_KE"],
  GH: ["MTN_MOMO_GH", "AIRTEL_GH"],
  TZ: ["MTN_MOMO_TZ", "AIRTEL_TZ"],
}

export class PawaPayService {
  private static APP_COMMISSION_RATE = 0.08

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

  static getProvidersForCountry(countryCode: string): string[] {
    return PAWAPAY_PROVIDERS[countryCode as keyof typeof PAWAPAY_PROVIDERS] || []
  }

  static async initiateDeposit(
    amount: number,
    currency: string,
    phoneNumber: string,
    provider: string
  ): Promise<{
    success: boolean
    depositId?: string
    status?: string
    nextStep?: string
    error?: string
  }> {
    try {
      const response = await fetch("/.netlify/functions/create-pawapay-deposit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
          currency,
          phoneNumber,
          provider,
        }),
      })

      const data = await response.json()
      console.log("PawaPay deposit response:", data)

      if (!data.success && data.error) {
        return {
          success: false,
          error: data.error,
        }
      }

      return {
        success: true,
        depositId: data.depositId,
        status: data.status,
        nextStep: data.nextStep,
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Network error",
      }
    }
  }

  static async checkDepositStatus(depositId: string): Promise<{
    status: "COMPLETED" | "FAILED" | "PENDING" | "NOT_FOUND"
    amount?: number
    currency?: string
    provider?: string
    phoneNumber?: string
  }> {
    try {
      const response = await fetch(`/.netlify/functions/verify-pawapay-payment?depositId=${encodeURIComponent(depositId)}`)
      const data = await response.json()

      if (!response.ok) {
        return { status: "PENDING" }
      }

      return {
        status: data.status as "COMPLETED" | "FAILED" | "PENDING",
        amount: data.amount ? parseFloat(data.amount) : undefined,
        currency: data.currency,
        provider: data.provider,
        phoneNumber: data.phoneNumber,
      }
    } catch {
      return { status: "PENDING" }
    }
  }

  static async predictProvider(phoneNumber: string): Promise<{
    success: boolean
    country?: string
    provider?: string
    sanitizedPhoneNumber?: string
    error?: string
  }> {
    try {
      const response = await fetch(`${PAWAPAY_BASE_URL}/toolkit/predict-provider`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phoneNumber }),
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          success: false,
          error: data.message || "Failed to predict provider",
        }
      }

      return {
        success: true,
        country: data.country,
        provider: data.provider,
        sanitizedPhoneNumber: data.phoneNumber,
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Network error",
      }
    }
  }

  static async getActiveConfiguration(country: string): Promise<{
    success: boolean
    providers?: any[]
    error?: string
  }> {
    try {
      const response = await fetch(
        `${PAWAPAY_BASE_URL}/toolkit/active-conf?country=${country}&operationType=DEPOSIT`
      )

      if (!response.ok) {
        return {
          success: false,
          error: "Failed to fetch configuration",
        }
      }

      const data = await response.json()

      return {
        success: true,
        providers: data.countries?.[0]?.providers || [],
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Network error",
      }
    }
  }

  static async initiatePayout(
    amount: number,
    currency: string,
    phoneNumber: string,
    provider: string
  ): Promise<{
    success: boolean
    payoutId?: string
    status?: string
    error?: string
  }> {
    const payoutId = "payout_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)

    const payload = {
      payoutId,
      amount: amount.toString(),
      currency,
      recipient: {
        type: "MMO",
        accountDetails: {
          phoneNumber,
          provider,
        },
      },
    }

    try {
      const response = await fetch(`${PAWAPAY_BASE_URL}/payouts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          success: false,
          error: data.failureReason?.failureMessage || "Failed to initiate payout",
        }
      }

      return {
        success: true,
        payoutId: data.payoutId,
        status: data.status,
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Network error",
      }
    }
  }

  static async checkPayoutStatus(payoutId: string): Promise<{
    status: "COMPLETED" | "FAILED" | "PENDING" | "ENQUEUED" | "NOT_FOUND"
    amount?: number
    currency?: string
    error?: string
  }> {
    try {
      const response = await fetch(`${PAWAPAY_BASE_URL}/payouts/${payoutId}`)

      if (!response.ok) {
        if (response.status === 404) {
          return { status: "NOT_FOUND" }
        }
        return { status: "PENDING" }
      }

      const data = await response.json()

      return {
        status: data.status as "COMPLETED" | "FAILED" | "PENDING" | "ENQUEUED",
        amount: parseFloat(data.amount),
        currency: data.currency,
      }
    } catch {
      return { status: "PENDING" }
    }
  }

  static createPaymentIntent(
    amount: number,
    eventId: string,
    buyerId: string
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

  static async initiateMobileMoneyPayment(
    paymentIntentId: string,
    paymentMethod: { method: string; provider?: string; number?: string },
    amount: number
  ): Promise<boolean> {
    if (!paymentMethod.provider || !paymentMethod.number) {
      throw new Error("Provider and phone number required for mobile money")
    }

    const result = await this.initiateDeposit(
      amount,
      "UGX",
      paymentMethod.number,
      paymentMethod.provider
    )

    return result.success
  }
}

export default PawaPayService