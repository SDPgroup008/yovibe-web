const { getPesapalToken, invalidatePesapalToken } = require('../shared/pesapalAuth');

// Production-only PesaPal endpoints. Sandbox (cybqa.pesapal.com) is intentionally
// NOT used as a default; live payouts must never silently fall back to a simulation.
const DEFAULT_API_URL = 'https://pay.pesapal.com/v3/api';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const {
      organizerId,
      amount,
      payoutMethod,
      recipientDetails,
    } = JSON.parse(event.body);

    const apiUrl = process.env.PESAPAL_API_URL || DEFAULT_API_URL;

    if (!organizerId || !amount || !payoutMethod || !recipientDetails?.name) {
      throw new Error('Missing required fields: organizerId, amount, payoutMethod, recipientDetails.name');
    }

    // Step 1: Get OAuth token via the shared cached module (same path as order creation)
    const token = await getPesapalToken();

    // Step 2: Submit disbursement
    const disbursementRequest = {
      oauth_token: token,
      pesapal_merchant_reference: `PAYOUT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      currency: 'UGX',
      amount: amount,
      description: `YoVibe Organizer Payout - ${organizerId}`,
      payment_method: payoutMethod === 'mobile_money' ? 'MOBILE' : 'BANK',
      recipient: {
        name: recipientDetails.name,
        phone_number: payoutMethod === 'mobile_money' ? recipientDetails.phoneNumber : undefined,
        account_number: payoutMethod === 'bank_transfer' ? recipientDetails.accountNumber : undefined,
        bank: payoutMethod === 'bank_transfer' ? recipientDetails.bankName : undefined,
      },
      callback_url: `${process.env.SITE_URL || 'https://yovibe.net'}/disbursementcallback`,
    };

    let response;
    try {
      response = await fetch(`${apiUrl}/Transactions/SubmitDisbursement`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(disbursementRequest),
      });
    } catch (fetchError) {
      console.error('[PesaPalPayout] Disbursement request failed:', fetchError.message);
      throw new Error(`PesaPal disbursement request failed: ${fetchError.message}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PesaPalPayout] Disbursement API error:', response.status, errorText);
      throw new Error(`PesaPal API error: ${response.status} — ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();

    if (data.status === 'SUCCESS' || data.status === 'PENDING') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          payoutId: data.pesapal_transaction_tracking_id || data.order_id,
          transactionReference: data.pesapal_merchant_reference,
          status: data.status,
        }),
      };
    } else if (data.error) {
      throw new Error(data.error);
    } else {
      throw new Error('Payout status unclear');
    }
  } catch (error) {
    console.error('[PesaPalPayout] Error:', error.message);
    // Never simulate a successful payout — return a real error so the caller
    // can mark tickets as payout-failed and retry deliberately.
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Payout failed',
      }),
    };
  }
};
