const crypto = require('crypto')
const { requiredEnv, assertPawaPayUrl } = require('../shared/runtimeConfig')

const getPawaPayBaseUrl = () => assertPawaPayUrl(requiredEnv('PAWAPAY_API_URL'))

const getApiKey = () => {
  return requiredEnv('PAWAPAY_API_KEY')
}

const UGANDA_PROVIDERS = new Set(['MTN_MOMO_UGA', 'AIRTEL_OAPI_UGA'])

function normalizeUgandanPhone(value) {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('0')) digits = `256${digits.slice(1)}`
  else if (/^[7]\d{8}$/.test(digits)) digits = `256${digits}`
  return /^256\d{9}$/.test(digits) ? digits : null
}

function failureDetails(data) {
  const reason = data?.failureReason || data?.rejectionReason || {}
  return {
    code: reason.failureCode || reason.rejectionCode || data?.code || null,
    message: reason.failureMessage || reason.rejectionMessage || data?.message || data?.error || 'Failed to initiate deposit',
  }
}

async function predictProvider(baseUrl, apiKey, phoneNumber) {
  const response = await fetch(`${baseUrl}/predict-provider`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ phoneNumber }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.phoneNumber || !data.provider) {
    const failure = failureDetails(data)
    const error = new Error(failure.message || 'Unable to validate the mobile-money number')
    error.statusCode = response.ok ? 422 : response.status
    error.failureCode = failure.code
    throw error
  }
  if (!['UG', 'UGA'].includes(String(data.country || '').toUpperCase()) || !UGANDA_PROVIDERS.has(data.provider)) {
    const error = new Error('The mobile-money number is not supported for Uganda')
    error.statusCode = 422
    throw error
  }
  return data
}

exports.handler = async (event, context) => {
  /* console.log("========================================") */
  /* console.log("💳 PAWAPAY DEPOSIT INITIATION (Netlify Functions)") */
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
    const body = JSON.parse(event.body || "{}")
    const { amount, currency, phoneNumber, provider, buyerEmail, buyerName } = body

    /* console.log("📥 Request body:") */
    /* console.log("   - Amount:", amount, currency) */
    /* console.log("   - Phone:", phoneNumber) */
    /* console.log("   - Provider:", provider) */
    /* console.log("   - Buyer:", buyerName, buyerEmail) */

    const numericAmount = Number(amount)
    const normalizedCurrency = String(currency || 'UGX').toUpperCase()
    const formattedPhone = normalizeUgandanPhone(phoneNumber)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !Number.isInteger(numericAmount)) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Amount must be a positive whole number for UGX' }) }
    }
    if (normalizedCurrency !== 'UGX') {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Only UGX mobile-money deposits are supported' }) }
    }
    if (!formattedPhone) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Enter a valid Ugandan mobile-money number' }) }
    }
    if (!UGANDA_PROVIDERS.has(provider)) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Unsupported Ugandan mobile-money provider' }) }
    }

    const depositId = crypto.randomUUID()
    const apiKey = getApiKey()
    const baseUrl = getPawaPayBaseUrl()
    const prediction = await predictProvider(baseUrl, apiKey, formattedPhone)

    const payload = {
      depositId,
      amount: String(numericAmount),
      currency: normalizedCurrency,
      payer: {
        type: "MMO",
        accountDetails: {
          phoneNumber: prediction.phoneNumber,
          provider: prediction.provider,
        },
      },
    }

    /* console.log("📤 Calling PawaPay API...") */
    /* console.log("   - Using API key (first 20 chars):", apiKey.substring(0, 20) + "...") */
    
    const response = await fetch(`${baseUrl}/deposits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json().catch(() => ({}))
    /* console.log("📥 PawaPay response:", JSON.stringify(data, null, 2)) */

    if (data.status === "REJECTED" || !response.ok) {
      const failure = failureDetails(data)
      return {
        statusCode: response.ok ? 422 : response.status,
        body: JSON.stringify({
          success: false,
          error: failure.message,
          failureCode: failure.code,
        }),
      }
    }

    /* console.log("✅ Deposit initiated successfully") */
    /* console.log("   - Deposit ID:", data.depositId) */
    /* console.log("========================================") */

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        depositId: data.depositId || depositId,
        status: data.status,
        nextStep: data.nextStep,
      }),
    }
  } catch (error) {
    console.error("❌ Error:", error)
    return {
      statusCode: error.statusCode || 500,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        failureCode: error.failureCode || null,
      }),
    }
  }
}

module.exports = { handler: exports.handler, normalizeUgandanPhone, failureDetails, predictProvider }
