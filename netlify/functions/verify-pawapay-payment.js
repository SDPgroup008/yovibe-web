const PAWAPAY_BASE_URL = "https://api.sandbox.pawapay.io/v2"
const PAWAPAY_API_KEY = process.env.PAWAPAY_API_KEY || "eyJraWQiOiIxIiwiYWxnIjoiRVMyNTYifQ.eyJ0dCI6IkFBVCIsInN1YiI6IjIyNzE3IiwibWF2IjoiMSIsImV4cCI6MjA5NjgwNDMyNSwiaWF0IjoxNzgxMTg1MTI1LCJwbSI6IkRBRixQQUYiLCJqdGkiOiJmNDg4YzgwMS0zNDA4LTQ4YWMtODM2OC0xN2I0MjI2ODYyZWMifQ.LaGjWAR8HxFnI_CnFqGzO45_aePX-O665otGNnTY6OkRm_2AoSS5WEQBJJKjL-w772AYaSlhDj-fSm-w0Ei54A"

exports.handler = async (event, context) => {
  console.log("========================================")
  console.log("🔍 PAWAPAY PAYMENT VERIFICATION (Netlify Functions)")
  console.log("========================================")
  console.log("📋 Event:", event.httpMethod)

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    }
  }

  try {
    const { depositId } = event.queryStringParameters || {}

    if (!depositId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "depositId is required" }),
      }
    }

    console.log("📥 Query parameters:")
    console.log("   - Deposit ID:", depositId)

    console.log("📤 Calling PawaPay API to check deposit status...")
    const response = await fetch(`${PAWAPAY_BASE_URL}/deposits/${depositId}`, {
      headers: {
        Authorization: PAWAPAY_API_KEY.startsWith("ey")
          ? PAWAPAY_API_KEY
          : `Bearer ${PAWAPAY_API_KEY}`,
      },
    })

    if (response.status === 404) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          status: "NOT_FOUND",
        }),
      }
    }

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({
          status: "PENDING",
        }),
      }
    }

    const data = await response.json()
    console.log("📥 PawaPay response:", JSON.stringify(data, null, 2))

    const status = data.status === "COMPLETED" ? "completed"
      : data.status === "FAILED" ? "failed"
      : "pending"

    console.log("✅ Verification complete - Status:", status)
    console.log("========================================")

    return {
      statusCode: 200,
      body: JSON.stringify({
        status,
        depositId: data.depositId,
        amount: data.amount,
        currency: data.currency,
        provider: data.payer?.accountDetails?.provider,
        phoneNumber: data.payer?.accountDetails?.phoneNumber,
        providerTransactionId: data.providerTransactionId,
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