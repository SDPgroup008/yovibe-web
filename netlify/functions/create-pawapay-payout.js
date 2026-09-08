const { requireUser, json } = require('../shared/supabaseAdmin')
const { requiredEnv, assertPawaPayUrl } = require('../shared/runtimeConfig')
const { otpMatches } = require('../shared/payoutOtp')
const getPawaPayBaseUrl = () => assertPawaPayUrl(requiredEnv('PAWAPAY_API_URL'))

const getApiKey = () => {
  return requiredEnv('PAWAPAY_API_KEY')
}

const generateUUID = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 8
    return v.toString(16)
  })
}

async function submitPawaPayPayout({ amount, currency, phoneNumber, provider, payoutId: requestedPayoutId }) {
  if (!amount || !phoneNumber || !provider) {
    const error = new Error("Missing required fields: amount, phoneNumber, provider")
    error.statusCode = 400
    throw error
  }

  const payoutId = requestedPayoutId || generateUUID()
  const apiKey = getApiKey()
  let formattedPhone = phoneNumber
  if (formattedPhone.startsWith("0")) formattedPhone = "256" + formattedPhone.substring(1)
  else if (formattedPhone.startsWith("+")) formattedPhone = formattedPhone.substring(1)

  const response = await fetch(`${getPawaPayBaseUrl()}/payouts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
    body: JSON.stringify({
      payoutId,
      amount: amount.toString(),
      currency: currency || "UGX",
      recipient: { type: "MMO", accountDetails: { phoneNumber: formattedPhone, provider } },
    }),
  })
  const data = await response.json()
  if (!response.ok || data.status === "REJECTED") {
    const error = new Error(data.failureReason?.failureMessage || data.message || "Failed to initiate payout")
    error.statusCode = response.status || 502
    throw error
  }
  return { payoutId: data.payoutId || payoutId, status: data.status || "ENQUEUED" }
}

exports.handler = async (event, context) => {
  /* console.log("========================================") */
  /* console.log("💰 PAWAPAY PAYOUT INITIATION (Netlify Functions)") */
  /* console.log("========================================") */
  /* console.log("📋 Event:", event.httpMethod) */
  /* console.log("🔑 API Key from env:", process.env.PAWAPAY_API_KEY ? "SET" : "NOT SET") */

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    }
  }

  try {
    const { admin, authUser, profile } = await requireUser(event)
    if (!profile || profile.user_type !== "admin") return json(403, { success: false, error: "Admin access required" })
    const body = JSON.parse(event.body || "{}")
    const { amount, currency, phoneNumber, provider, payoutId, otpCode } = body
    if (!otpCode) return json(400, { success: false, error: 'OTP code is required' })
    const { data: otpRow, error: otpError } = await admin.from('payout_otps').select('*')
      .eq('user_id', authUser.id).eq('used', false).gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false }).limit(1).maybeSingle()
    if (otpError) throw otpError
    if (!otpRow || !otpMatches(authUser.id, otpCode, otpRow.otp)) {
      return json(401, { success: false, error: 'Invalid or expired OTP code' })
    }
    const { data: consumed, error: consumeError } = await admin.from('payout_otps').update({ used: true })
      .eq('id', otpRow.id).eq('used', false).select('id')
    if (consumeError) throw consumeError
    if (!consumed || consumed.length !== 1) return json(409, { success: false, error: 'OTP code has already been used' })

    /* console.log("📥 Request body:") */
    /* console.log("   - Amount:", amount, currency) */
    /* console.log("   - Phone:", phoneNumber) */
    /* console.log("   - Provider:", provider) */

    const data = await submitPawaPayPayout({ amount, currency, phoneNumber, provider, payoutId })

    /* console.log("✅ Payout initiated successfully") */
    /* console.log("   - Payout ID:", data.payoutId || payoutId) */
    /* console.log("========================================") */

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        payoutId: data.payoutId,
        status: data.status,
      }),
    }
  } catch (error) {
    console.error("❌ Error:", error)
    return {
      statusCode: error.statusCode || 500,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    }
  }
}

module.exports = { handler: exports.handler, submitPawaPayPayout }
