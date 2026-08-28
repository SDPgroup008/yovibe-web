import supabase from "../config/supabase"

// Server-side admin actions on payout requests. All mutations run through the
// `admin-payout-action` Netlify function, which uses the service-role key to
// bypass RLS on the `payouts` table (client-side updates are silently blocked).
async function call(body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("Please sign in before managing payouts")
  const response = await fetch("/.netlify/functions/admin-payout-action", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || "Payout operation failed")
  return payload
}

export default {
  approve(payoutId: string, approvedAmount?: number) {
    return call({ action: "approve", payoutId, approvedAmount })
  },
  reject(payoutId: string, reason: string) {
    return call({ action: "reject", payoutId, reason })
  },
  complete(payoutId: string, transactionReference: string, notes?: string) {
    return call({ action: "complete", payoutId, transactionReference, notes })
  },
}
