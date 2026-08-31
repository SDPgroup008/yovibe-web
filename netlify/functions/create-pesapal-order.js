const { getPesapalToken, invalidatePesapalToken } = require('../shared/pesapalAuth');

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
    const { amount, description, buyerEmail, buyerPhone, callbackUrl, buyerName, buyerFirstName, buyerLastName } = JSON.parse(event.body);
    const apiUrl = process.env.PESAPAL_API_URL || 'https://pay.pesapal.com/v3/api';
    const baseUrl = process.env.PESAPAL_BASE_URL || 'https://pay.pesapal.com';

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error('Invalid amount');
    }

    if (!description || !buyerEmail || !callbackUrl) {
      throw new Error('Missing required fields: description, buyerEmail, callbackUrl');
    }

    // Generate unique order ID (max 50 chars)
    const random = Math.random().toString(36).substring(2, 11);
    const orderId = `YV-${Date.now()}-${random}`.substring(0, 50);

    const notificationId = process.env.PESAPAL_NOTIFICATION_ID;
    if (!notificationId) {
      throw new Error('PesaPal notification_id not configured. Set PESAPAL_NOTIFICATION_ID environment variable.');
    }

    // Step 1: Get OAuth token via shared module
    const token = await getPesapalToken();

    // Step 2: Build order request
    const [firstName, ...lastNameParts] = (buyerFirstName || buyerName || '').split(' ');
    const lastName = buyerLastName || lastNameParts.join(' ') || '';

    const orderRequest = {
      id: orderId,
      currency: 'UGX',
      amount: parsedAmount,
      description: String(description).substring(0, 100),
      callback_url: callbackUrl,
      notification_id: notificationId,
      redirect_mode: 'PARENT_WINDOW',
      cancellation_url: callbackUrl,
      billing_address: {
        email_address: buyerEmail,
        phone_number: buyerPhone || '',
        first_name: firstName || '',
        last_name: lastName || '',
        country_code: 'UG',
      },
    };

    // Step 3: Submit order with one retry on 401
    let lastError;
    for (let attempt = 0; attempt <= 1; attempt++) {
      const currentToken = attempt === 0 ? token : await getPesapalToken();

      /* console.log(`[PesaPalOrder] 📤 Submitting order (attempt ${attempt + 1})...`); */
      const response = await fetch(`${apiUrl}/Transactions/SubmitOrderRequest`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`,
        },
        body: JSON.stringify(orderRequest),
      });

      if (response.status === 401 && attempt === 0) {
        /* console.log('[PesaPalOrder] 🔑 Token expired, refreshing and retrying...'); */
        invalidatePesapalToken();
        continue;
      }

      const responseText = await response.text();
      /* console.log('[PesaPalOrder]    HTTP status:', response.status); */

      if (!response.ok) {
        lastError = new Error(`PesaPal order error: ${response.status} — ${responseText.substring(0, 200)}`);
        continue;
      }

      const data = JSON.parse(responseText);

      if (data.redirect_url) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            iframeUrl: data.redirect_url,
            orderId: data.merchant_reference || orderId,
            trackingId: data.order_tracking_id,
            merchantReference: data.merchant_reference || orderId,
          }),
        };
      }

      lastError = new Error(data.message || data.error || 'Failed to register order with PesaPal');
    }

    throw lastError || new Error('PesaPal order submission failed after retry');
  } catch (error) {
    console.error('[PesaPalOrder] ❌ Error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
      }),
    };
  }
};
