const PAWAPAY_BASE_URL = "https://api.pawapay.io/v2"

const getApiKey = () => {
  const key = process.env.PAWAPAY_API_KEY || 
    "eyJraWQiOiIxIiwiYWxnIjoiRVMyNTYifQ.eyJ0dCI6IkFBVCIsInN1YiI6IjMyMzAiLCJtYXYiOiIxIiwiZXhwIjoyMDk2ODg3NzE5LCJpYXQiOjE3ODEyNzk1MTksInBtIjoiREFGLFBBRiIsImp0aSI6IjU5MDE0Njc2LWEyNTgtNDVhOS05NjI4LTQ4MWQ5YTdjMmUzMiJ9.pxopQYuQqM-QztluHaE9RAq9fgIZCRVdYQ7-XMuzL21UV7qf7M9R2DQ9qeyiXxAJt30gXQ3i3BOm_YdKIVSGYg"
  return key
}

exports.handler = async (event, context) => {
  console.log("========================================")
  console.log("💰 PAWAPAY PAYOUT VERIFICATION (Netlify Functions)")
  console.log("========================================")
  console.log("📋 Event:", event.httpMethod)

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

    console.log("📥 Query parameters:")
    console.log("   - Payout ID:", payoutId)

    console.log("📤 Calling PawaPay API to check payout status...")
    const apiKey = getApiKey()
    
    const response = await fetch(`${PAWAPAY_BASE_URL}/payouts/${payoutId}`, {
      headers: {
        Authorization: "Bearer " + apiKey,
      },
    })

    if (response.status === 404) {
      console.log("⚠️ Payout not found")
      return {
        statusCode: 200,
        body: JSON.stringify({ status: "NOT_FOUND" }),
      }
    }

    if (!response.ok) {
      console.log("⚠️ API error:", response.status)
      return {
        statusCode: response.status,
        body: JSON.stringify({ status: "PENDING" }),
      }
    }

    const data = await response.json()
    console.log("📥 PawaPay response:", JSON.stringify(data, null, 2))

    const status = data.status === "COMPLETED" ? "completed"
      : data.status === "FAILED" ? "failed"
      : data.status === "ENQUEUED" ? "pending"
      : "pending"

    console.log("✅ Verification complete - Status:", status)
    console.log("========================================")

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