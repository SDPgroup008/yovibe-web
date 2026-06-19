const PAWAPAY_BASE_URL = "https://api.pawapay.io/v2"

const getApiKey = () => {
  const key = process.env.PAWAPAY_API_KEY || 
    "eyJraWQiOiIxIiwiYWxnIjoiRVMyNTYifQ.eyJ0dCI6IkFBVCIsInN1YiI6IjMyMzAiLCJtYXYiOiIxIiwiZXhwIjoyMDk2ODk4NzE5LCJpYXQiOjE3ODEyNzk1MTksInBtIjoiREFGLFBBRiIsImp0aSI6IjU5MDE0Njc2LWEyNTgtNDVhOS05NjI4LTQ4MWQ5YTdjMmUzMiJ9.pxopQYuQqM-QztluHaE9RAq9fgIZCRVdYQ7-XMuzL21UV7qf7M9R2DQ9qeyiXxAJt30gXQ3i3BOm_YdKIVSGYg"
  return key
}

const generateUUID = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 8
    return v.toString(16)
  })
}

exports.handler = async (event, context) => {
  console.log("========================================")
  console.log("💰 PAWAPAY PAYOUT INITIATION (Netlify Functions)")
  console.log("========================================")
  console.log("📋 Event:", event.httpMethod)
  console.log("🔑 API Key from env:", process.env.PAWAPAY_API_KEY ? "SET" : "NOT SET")

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { amount, currency, phoneNumber, provider } = body

    console.log("📥 Request body:")
    console.log("   - Amount:", amount, currency)
    console.log("   - Phone:", phoneNumber)
    console.log("   - Provider:", provider)

    if (!amount || !phoneNumber || !provider) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: "Missing required fields: amount, phoneNumber, provider",
        }),
      }
    }

    const payoutId = generateUUID()
    const apiKey = getApiKey()

    // Format phone number: remove leading 0 and add country code
    let formattedPhone = phoneNumber
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "256" + formattedPhone.substring(1)
    } else if (formattedPhone.startsWith("+")) {
      formattedPhone = formattedPhone.substring(1)
    }

    const payload = {
      payoutId,
      amount: amount.toString(),
      currency: currency || "UGX",
      recipient: {
        type: "MMO",
        accountDetails: {
          phoneNumber: formattedPhone,
          provider,
        },
      },
    }

    console.log("📤 Calling PawaPay Payout API...")
    console.log("📤 Payload:", JSON.stringify(payload, null, 2))
    console.log("   - Using API key (first 20 chars):", apiKey.substring(0, 20) + "...")

    const response = await fetch(`${PAWAPAY_BASE_URL}/payouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()
    console.log("📥 PawaPay response:", JSON.stringify(data, null, 2))
    console.log("📥 Response status:", response.status)

    // PawaPay returns payoutId in the root (not nested)
    if (!response.ok || data.status === "REJECTED") {
      return {
        statusCode: response.status,
        body: JSON.stringify({
          success: false,
          error: data.failureReason?.failureMessage || data.message || "Failed to initiate payout",
          status: data.status,
        }),
      }
    }

    console.log("✅ Payout initiated successfully")
    console.log("   - Payout ID:", data.payoutId || payoutId)
    console.log("========================================")

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        payoutId: data.payoutId || payoutId,
        status: data.status || "ENQUEUED",
      }),
    }
  } catch (error) {
    console.error("❌ Error:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    }
  }
}