import supabase from "../config/supabase"

export type RefundReason = "event_cancelled" | "event_postponed" | "installments_incomplete" | "chargeback"

async function call(body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("Please sign in before requesting a refund")
  const response = await fetch("/.netlify/functions/refund-ticket", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || "Refund operation failed")
  return payload
}

export default {
  request(ticketId: string, reasonCode: RefundReason, installmentPlanId?: string, note?: string) {
    return call({ action: "request", ticketId, reasonCode, installmentPlanId, note })
  },
  list(filters?: { status?: string; search?: string; limit?: number; offset?: number }) {
    return call({ action: "list", ...filters })
  },
  approve(refundId: string, approvedAmount?: number, note?: string) {
    return call({ action: "approve", refundId, approvedAmount, note })
  },
  reject(refundId: string, note?: string) {
    return call({ action: "reject", refundId, note })
  },
  execute(refundId: string, approvedAmount?: number) {
    return call({ action: "execute", refundId, approvedAmount })
  },
  retry(refundId: string) {
    return call({ action: "retry", refundId })
  },
  chargeback(refundId: string, note?: string) {
    return call({ action: "chargeback", refundId, note })
  },
}
