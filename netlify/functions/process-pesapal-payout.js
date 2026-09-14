const { getPesapalToken, invalidatePesapalToken } = require('../shared/pesapalAuth');
const { requireUser, json } = require('../shared/supabaseAdmin');
const { requiredEnv, assertPesapalUrl, getSiteUrl } = require('../shared/runtimeConfig');

async function submitPesaPalPayout({ organizerId, amount, payoutMethod, recipientDetails, merchantReference: requestedReference }) {
  if (process.env.PESAPAL_DISBURSEMENT_API_ENABLED !== 'true') {
    const error = new Error('Automated PesaPal disbursements are disabled; use the admin-reviewed payout workflow');
    error.statusCode = 501;
    throw error;
  }
  const apiUrl = assertPesapalUrl(requiredEnv('PESAPAL_API_URL'));
  if (!organizerId || !amount || !payoutMethod || !recipientDetails?.name) {
    const error = new Error('Missing required fields: organizerId, amount, payoutMethod, recipientDetails.name');
    error.statusCode = 400;
    throw error;
  }

  const token = await getPesapalToken();
  const merchantReference = requestedReference || `PAYOUT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const disbursementRequest = {
    oauth_token: token,
    pesapal_merchant_reference: merchantReference,
    currency: 'UGX',
    amount,
    description: `YoVibe Organizer Payout - ${organizerId}`,
    payment_method: payoutMethod === 'mobile_money' ? 'MOBILE' : 'BANK',
    recipient: {
      name: recipientDetails.name,
      phone_number: payoutMethod === 'mobile_money' ? recipientDetails.phoneNumber : undefined,
      account_number: payoutMethod === 'bank_transfer' ? recipientDetails.accountNumber : undefined,
      bank: payoutMethod === 'bank_transfer' ? recipientDetails.bankName : undefined,
    },
    callback_url: `${getSiteUrl()}/.netlify/functions/pesapal-payout-callback`,
  };

  const response = await fetch(`${apiUrl}/Transactions/SubmitDisbursement`, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(disbursementRequest),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PesaPal API error: ${response.status} - ${errorText.substring(0, 200)}`);
  }
  const data = await response.json();
  if (data.status !== 'SUCCESS' && data.status !== 'PENDING') throw new Error(data.error || 'Payout status unclear');
  return {
    payoutId: data.pesapal_transaction_tracking_id || data.order_id,
    transactionReference: data.pesapal_merchant_reference || merchantReference,
    status: data.status,
  };
}

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
    const { profile } = await requireUser(event);
    if (!profile || profile.user_type !== 'admin') return json(403, { success: false, error: 'Admin access required' });
    const {
      organizerId,
      amount,
      payoutMethod,
      recipientDetails,
    } = JSON.parse(event.body);

    const data = await submitPesaPalPayout({ organizerId, amount, payoutMethod, recipientDetails });
    if (data.status === 'SUCCESS' || data.status === 'PENDING') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          payoutId: data.payoutId,
          transactionReference: data.transactionReference,
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

module.exports = { handler: exports.handler, submitPesaPalPayout };
