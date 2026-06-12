const PAWAPAY_BASE_URL = "https://api.sandbox.pawapay.io/v2"

const getApiKey = () => {
  const key = process.env.PAWAPAY_API_KEY || 
    "eyJraWQiOiIxIiwiYWxnIjoiRVMyNTYifQ.eyJ0dCI6IkFBVCIsInN1YiI6IjIyNzE3IiwibWF2IjoiMSIsImV4cCI6MjA5Njg4NzIzMiwiaWF0IjoxNzgxMjY4MDMyLCJwbSI6IkRBRixQQUYiLCJqdGkiOiJhMjcwOWM4Ni1jYjNlLTQ5YzItYjE5Yy01NDdlYWQ0MDM2OWQifQ.iXvNRA3LgmH4MINokDWT9mLKZcFv981-mqjKsn3TaqPPHoUMWa2-72WNvVxh9XGWsiKDkQ90iakSUFbTGBnQ7w"
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
  console.log("💳 PAWAPAY DEPOSIT INITIATION (Netlify Functions)")
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
    const { amount, currency, phoneNumber, provider, buyerEmail, buyerName } = body

    console.log("📥 Request body:")
    console.log("   - Amount:", amount, currency)
    console.log("   - Phone:", phoneNumber)
    console.log("   - Provider:", provider)
    console.log("   - Buyer:", buyerName, buyerEmail)

    const depositId = generateUUID()
    const apiKey = getApiKey()

    const payload = {
      depositId,
      amount: amount.toString(),
      currency: currency || "UGX",
      payer: {
        type: "MMO",
        accountDetails: {
          phoneNumber,
          provider,
        },
      },
    }

    console.log("📤 Calling PawaPay API...")
    console.log("   - Using API key (first 20 chars):", apiKey.substring(0, 20) + "...")
    
    const response = await fetch(`${PAWAPAY_BASE_URL}/deposits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()
    console.log("📥 PawaPay response:", JSON.stringify(data, null, 2))

    if (data.status === "REJECTED" || !response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({
          success: false,
          error: data.failureReason?.failureMessage || "Failed to initiate deposit",
        }),
      }
    }

    console.log("✅ Deposit initiated successfully")
    console.log("   - Deposit ID:", data.depositId)
    console.log("========================================")

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        depositId: data.depositId,
        status: data.status,
        nextStep: data.nextStep,
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