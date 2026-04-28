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
    const apiUrl = process.env.PESAPAL_API_URL || 'https://cybqa.pesapal.com/pesapalv3/api';
    const pesapalBaseUrl = process.env.PESAPAL_BASE_URL || 'https://cybqa.pesapal.com';

    if (!consumerKey || !consumerSecret) {
      throw new Error('PesaPal credentials not configured');
    }

    if (!amount || !description || !buyerEmail || !callbackUrl) {
      throw new Error('Missing required fields: amount, description, buyerEmail, callbackUrl');
    }

    const orderId = `YV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Get notification_id from environment (must be set after IPN registration)
    const notificationId = process.env.PESAPAL_NOTIFICATION_ID;

    if (!notificationId || notificationId === 'your_ipn_notification_id_here') {
      throw new Error('PesaPal notification_id not configured. Run the register-ipn function first to get an IPN ID, then set PESAPAL_NOTIFICATION_ID environment variable.');
    }

    // Step 1: Get OAuth token (v3 endpoint)
    const credentials = `${consumerKey}:${consumerSecret}`;
    const basicAuth = `Basic ${BUFFER_BROWSER.from(credentials).toString('base64')}`;

    const tokenResponse = await fetch(`${apiUrl}/Auth/RequestToken`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': basicAuth,
      },
      body: JSON.stringify({
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`PesaPal OAuth error: ${tokenResponse.status} - ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    const token = tokenData.token;

    if (!token) {
      throw new Error('No token received from PesaPal');
    }

    // Step 2: Prepare order request for v3 API
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

    // Step 3: Submit order
    const response = await fetch(`${apiUrl}/Transactions/SubmitOrderRequest`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(orderRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PesaPal order error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // v3 API response format: { status, message, order_tracking_id, redirect_url, ... }
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
          iframeUrl: `${pesapalBaseUrl}/iframe?merchant_reference=${orderId}`,
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
