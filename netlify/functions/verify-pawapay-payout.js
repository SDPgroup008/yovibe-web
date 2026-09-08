const { requiredEnv, assertPawaPayUrl } = require('../shared/runtimeConfig')
const getPawaPayBaseUrl = () => assertPawaPayUrl(requiredEnv('PAWAPAY_API_URL'))

const getApiKey = () => {
  return requiredEnv('PAWAPAY_API_KEY')
}

exports.handler = async (event, context) => {
  /* console.log("========================================") */
  /* console.log("💰 PAWAPAY PAYOUT VERIFICATION (Netlify Functions)") */
  /* console.log("========================================") */
  /* console.log("📋 Event:", event.httpMethod) */

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    }
  }

  try {
    const { payoutId } = event.queryStringParameters || {}

    if (!payoutId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "payoutId is required" }),
      }
    }

    /* console.log("📥 Query parameters:") */
    /* console.log("   - Payout ID:", payoutId) */

    /* console.log("📤 Calling PawaPay API to check payout status...") */
    const apiKey = getApiKey()
    
    const response = await fetch(`${getPawaPayBaseUrl()}/payouts/${payoutId}`, {
      headers: {
        Authorization: "Bearer " + apiKey,
      },
    })

    if (response.status === 404) {
      /* console.log("⚠️ Payout not found") */
      return {
        statusCode: 200,
        body: JSON.stringify({ status: "NOT_FOUND" }),
      }
    }

    if (!response.ok) {
      /* console.log("⚠️ API error:", response.status) */
      return {
        statusCode: response.status,
        body: JSON.stringify({ status: "PENDING" }),
      }
    }

    const responseData = await response.json()
    /* console.log("📥 PawaPay response:", JSON.stringify(data, null, 2)) */

    if (responseData.status === 'NOT_FOUND') {
      return { statusCode: 200, body: JSON.stringify({ status: 'NOT_FOUND' }) }
    }

    const data = responseData.data || responseData

    const status = data.status === "COMPLETED" ? "completed"
      : data.status === "FAILED" ? "failed"
      : data.status === "ENQUEUED" ? "pending"
      : "pending"

    /* console.log("✅ Verification complete - Status:", status) */
    /* console.log("========================================") */

    return {
      statusCode: 200,
      body: JSON.stringify({
        status,
        payoutId: data.payoutId,
        amount: data.amount,
        currency: data.currency,
        failureMessage: data.failureReason?.failureMessage,
        failureCode: data.failureReason?.failureCode,
      }),
    }
  } catch (error) {
    console.error("❌ Error:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        status: "pending",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    }
  }
}
