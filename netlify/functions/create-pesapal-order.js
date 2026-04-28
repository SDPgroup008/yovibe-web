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
    const apiUrl = process.env.PESAPAL_API_URL || 'https://cybqa.pesapal.com/api';

    if (!consumerKey || !consumerSecret) {
      throw new Error('PesaPal credentials not configured');
    }

    if (!amount || !description || !buyerEmail || !callbackUrl) {
      throw new Error('Missing required fields: amount, description, buyerEmail, callbackUrl');
    }

    const orderId = `YV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Step 1: Get OAuth token
    const credentials = `${consumerKey}:${consumerSecret}`;
    const basicAuth = `Basic ${BUFFER_BROWSER.from(credentials).toString('base64')}`;

    const tokenResponse = await fetch(`${apiUrl}/PostOAuthJson`, {
      method: 'POST',
      headers: {
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

    // Step 2: Submit order with Bearer token
    const orderRequest = {
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
      command: 'RegisterIPN',
      description: description,
      reference_id: orderId,
      amount: amount,
      currency: 'UGX',
      callback_url: callbackUrl,
      redirect_mode: 'ParentWindow',
      billing_address: {
        email_address: buyerEmail,
        phone_number: buyerPhone || '',
      },
    };

    const response = await fetch(`${apiUrl}/PostPesapalDirectOrderV4`, {
      method: 'POST',
      headers: {
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

    if (data.iframe_url) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          iframeUrl: data.iframe_url,
          orderId: data.order_id || orderId,
          merchantReference: data.merchant_reference || orderId,
        }),
      };
    } else if (data.status === 'FAILED') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: data.error || 'Failed to register order with PesaPal',
        }),
      };
    } else {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          iframeUrl: data.iframe_url || `${process.env.PESAPAL_BASE_URL || 'https://cybqa.pesapal.com'}/iframe?merchant_reference=${orderId}`,
          orderId: data.order_id || orderId,
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
