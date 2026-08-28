const PAWAPAY_BASE_URL = process.env.PAWAPAY_API_URL || "https://api.pawapay.io/v2"

const getApiKey = () => {
  const key = process.env.PAWAPAY_API_KEY
  if (!key) throw new Error("PAWAPAY_API_KEY is not configured")
  return key
}

const { getAdminClient } = require('../shared/supabaseAdmin')
const { markTicketsByPayment } = require('../shared/ticketFulfillment')

exports.handler = async (event, context) => {
  console.log("========================================")
  console.log("🔍 PAWAPAY PAYMENT VERIFICATION (Netlify Functions)")
  console.log("========================================")
  console.log("📋 Event:", event.httpMethod)
  console.log("🔑 API Key from env:", process.env.PAWAPAY_API_KEY ? "SET" : "NOT SET")

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
    const apiKey = getApiKey()
    
    const response = await fetch(`${PAWAPAY_BASE_URL}/deposits/${depositId}`, {
      headers: {
        Authorization: "Bearer " + apiKey,
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

    const responseData = await response.json()
    console.log("📥 PawaPay response:", JSON.stringify(responseData, null, 2))

    // PawaPay wraps deposit data in a "data" property
    const depositData = responseData.data

    const status = depositData?.status === "COMPLETED" ? "completed"
      : depositData?.status === "FAILED" ? "failed"
      : "pending"

    // Phase 1 (P1.5): failed deposits must never leave live tickets behind.
    if (status === "failed") {
      try {
        const admin = getAdminClient()
        const result = await markTicketsByPayment(admin, {
          depositId,
          status: "cancelled",
          refundStatus: null,
        })
        console.log("📋 Failed-deposit reconciliation:", result)
      } catch (reconErr) {
        console.warn("Failed-deposit reconciliation error:", reconErr.message)
      }
    }

    console.log("✅ Verification complete - Status:", status)
    console.log("========================================")

    return {
      statusCode: 200,
      body: JSON.stringify({
        status,
        depositId: depositData?.depositId,
        amount: depositData?.amount,
        currency: depositData?.currency,
        provider: depositData?.payer?.accountDetails?.provider,
        phoneNumber: depositData?.payer?.accountDetails?.phoneNumber,
        providerTransactionId: depositData?.providerTransactionId,
        failureMessage: depositData?.failureReason?.failureMessage,
        failureCode: depositData?.failureReason?.failureCode,
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