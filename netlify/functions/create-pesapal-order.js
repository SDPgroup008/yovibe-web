const BUFFER_BROWSER = Buffer.from ? Buffer : { from: (string) => global.Buffer.from(string) };

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
    const { amount, description, buyerEmail, buyerPhone, callbackUrl } = JSON.parse(event.body);
    const consumerKey = process.env.PESAPAL_CONSUMER_KEY;
    const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;
    const apiUrl = process.env.PESAPAL_API_URL || 'https://pay.pesapal.com/v3/api';
    const baseUrl = process.env.PESAPAL_BASE_URL || 'https://pay.pesapal.com';

    if (!consumerKey || !consumerSecret) {
      throw new Error('PesaPal credentials not configured');
    }

    if (!amount || !description || !buyerEmail || !callbackUrl) {
      throw new Error('Missing required fields: amount, description, buyerEmail, callbackUrl');
    }

    const orderId = `YV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Get notification_id from environment
    const notificationId = process.env.PESAPAL_NOTIFICATION_ID;

    if (!notificationId) {
      throw new Error('PesaPal notification_id not configured. Set PESAPAL_NOTIFICATION_ID environment variable.');
    }

    // Step 1: Get OAuth token (v3) - credentials in body, NO Authorization header
    const tokenResponse = await fetch(`${apiUrl}/Auth/RequestToken`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      }),
    });

    const tokenText = await tokenResponse.text();
    console.log('OAuth status:', tokenResponse.status);
    console.log('OAuth body (truncated):', tokenText.substring(0, 200));

    if (!tokenResponse.ok) {
      throw new Error(`PesaPal OAuth error: ${tokenResponse.status} - ${tokenText.substring(0, 200)}`);
    }

    if (!tokenText || tokenText.trim().length === 0) {
      throw new Error('PesaPal OAuth returned empty body. Check credentials and endpoint URL.');
    }

    const tokenData = JSON.parse(tokenText);
    const token = tokenData.token;

    if (!token) {
      throw new Error('No token received from PesaPal');
    }

    // Step 2: Submit order (v3)
    const orderRequest = {
      id: orderId,
      amount: amount,
      currency: 'UGX',
      description: description.substring(0, 100),
      callback_url: callbackUrl,
      notification_id: notificationId,
      buyer: {
        email_address: buyerEmail,
        phone_number: buyerPhone || '',
      },
    };

    const response = await fetch(`${apiUrl}/Transactions/SubmitOrderRequest`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(orderRequest),
    });

    const responseText = await response.text();
    console.log('Order response status:', response.status);
    console.log('Order response body:', responseText);

    if (!response.ok) {
      throw new Error(`PesaPal order error: ${response.status} - ${responseText.substring(0, 200)}`);
    }

    const data = JSON.parse(responseText);

    if (data.redirect_url) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          iframeUrl: data.redirect_url,
          orderId: data.order_tracking_id || orderId,
          merchantReference: data.merchant_reference || orderId,
        }),
      };
    } else if (data.status === 'FAILED' || data.status === 'Error') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: data.message || data.error || 'Failed to register order with PesaPal',
        }),
      };
    } else {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          iframeUrl: `${baseUrl}/iframe?merchant_reference=${orderId}`,
          orderId: data.order_tracking_id || orderId,
          merchantReference: data.merchant_reference || orderId,
        }),
      };
    }
  } catch (error) {
    console.error('Error creating PesaPal order:', error);
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