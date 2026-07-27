const { getPesapalToken } = require('../shared/pesapalAuth');

const STATUS_CODES = { 0: 'invalid', 1: 'completed', 2: 'failed', 3: 'reversed' };

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const apiUrl = process.env.PESAPAL_API_URL || 'https://pay.pesapal.com/v3/api';

    let orderTrackingId;
    if (event.httpMethod === 'GET') {
      orderTrackingId = event.queryStringParameters?.orderTrackingId || event.queryStringParameters?.orderId;
    } else {
      const body = JSON.parse(event.body);
      orderTrackingId = body.orderTrackingId || body.orderId;
    }

    if (!orderTrackingId) {
      throw new Error('Missing orderTrackingId parameter — provide the PesaPal order_tracking_id from SubmitOrderRequest response');
    }

    console.log('[VerifyPayment] 🔍 Verifying payment status');
    console.log('[VerifyPayment]    OrderTrackingId:', orderTrackingId);

    // Step 1: Get shared auth token
    const token = await getPesapalToken();

    // Step 2: Query payment status via v3 GetTransactionStatus
    console.log('[VerifyPayment] 📤 Querying PesaPal v3 GetTransactionStatus...');
    const response = await fetch(
      `${apiUrl}/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PesaPal verification error: ${response.status} — ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    console.log('[VerifyPayment] ✅ Response received');
    console.log('[VerifyPayment]    payment_status_description:', data.payment_status_description);
    console.log('[VerifyPayment]    status_code:', data.status_code);
    console.log('[VerifyPayment]    confirmation_code:', data.confirmation_code);
    console.log('[VerifyPayment]    amount:', data.amount, data.currency);
    console.log('[VerifyPayment]    payment_method:', data.payment_method);

    // Map status_code per v3 spec: 0=INVALID, 1=COMPLETED, 2=FAILED, 3=REVERSED
    const statusCode = data.status_code != null ? Number(data.status_code) : -1;
    const status = STATUS_CODES[statusCode]
      || (data.payment_status_description ? data.payment_status_description.toLowerCase() : 'pending');

    // Also accept string-based status from API (some versions return "COMPLETED")
    const finalStatus = status === 'completed' || status === 'COMPLETED' ? 'completed'
      : status === 'failed' || status === 'FAILED' || status === 'INVALID' || status === 'REVERSED' ? 'failed'
      : 'pending';

    console.log('[VerifyPayment]    Mapped status:', finalStatus);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: finalStatus,
        transactionId: data.confirmation_code || data.merchant_reference || orderTrackingId,
        confirmationCode: data.confirmation_code || undefined,
        amount: parseFloat(data.amount) || 0,
        currency: data.currency || 'UGX',
        paymentMethod: data.payment_method || undefined,
        statusCode: data.status_code,
        rawStatus: data.payment_status_description || data.status,
      }),
    };
  } catch (error) {
    console.error('[VerifyPayment] ❌ Error:', error.message);
    return {
      statusCode: 200, // Return 200 so the frontend doesn't throw — marks as pending
      headers,
      body: JSON.stringify({
        error: error.message,
        status: 'pending',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
      }),
    };
  }
};
