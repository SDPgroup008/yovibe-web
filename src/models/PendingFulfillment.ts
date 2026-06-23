export interface PendingFulfillment {
  id: string
  paymentId: string
  pawapayDepositId?: string
  buyerEmail: string
  buyerName?: string
  buyerId?: string
  eventId: string
  eventName?: string
  quantity: number
  amount: number
  status: "payment_confirmed" | "fulfilling" | "fulfilled" | "failed"
  ticketIds?: string[]
  lastError?: string
  attemptCount: number
  createdAt: Date
  updatedAt: Date
}

export type FulfillmentStatus = PendingFulfillment["status"]

export interface CreateFulfillmentInput {
  paymentId: string
  pawapayDepositId?: string
  buyerEmail: string
  buyerName?: string
  buyerId?: string
  eventId: string
  eventName?: string
  quantity?: number
  amount: number
}