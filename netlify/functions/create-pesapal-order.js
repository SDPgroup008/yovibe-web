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
    // v2 API base (no /v3)
    const apiUrl = process.env.PESAPAL_API_URL || 'https://pay.pesapal.com/api';

    if (!consumerKey || !consumerSecret) {
      throw new Error('PesaPal credentials not configured');
    }

    if (!amount || !description || !buyerEmail || !callbackUrl) {
      throw new Error('Missing required fields: amount, description, buyerEmail, callbackUrl');
    }

    const orderId = `YV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Step 1: Get OAuth token (v2 endpoint) – send credentials in JSON body only (no Basic Auth header)
    const tokenResponse = await fetch(`${apiUrl}/PostOAuthJson`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      }),
    });

    const tokenText = await tokenResponse.text();
    console.log('PesaPal OAuth response status:', tokenResponse.status);
    console.log('PesaPal OAuth response body:', tokenText);

    if (!tokenResponse.ok) {
      throw new Error(`PesaPal OAuth error: ${tokenResponse.status} - ${tokenText}`);
    }

    let tokenData;
    try {
      tokenData = JSON.parse(tokenText);
    } catch (e) {
      throw new Error(`Invalid JSON from OAuth: ${tokenText.substring(0, 200)}`);
    }
    const token = tokenData.token;

    if (!token) {
      throw new Error('No token received from PesaPal');
    }

    // Step 2: Submit order (v2 endpoint) – v2 requires consumer keys in body
    const orderRequest = {
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
      command: 'RegisterIPN',
      amount: amount,
      currency: 'UGX',
      description: description.substring(0, 100),
      reference_id: orderId,
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

    const responseText = await response.text();
    console.log('PesaPal order response status:', response.status);
    console.log('PesaPal order response body:', responseText);

    if (!response.ok) {
      throw new Error(`PesaPal order error: ${response.status} - ${responseText}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error(`Invalid JSON response from PesaPal: ${responseText.substring(0, 200)}`);
    }

    // v2 response: { iframe_url, order_id, merchant_reference, status }
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
    } else if (data.status === 'FAILED' || data.status === 'Error') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: data.error || data.message || 'Failed to register order with PesaPal',
        }),
      };
    } else {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          iframeUrl: data.iframe_url || `${apiUrl}/iframe?merchant_reference=${orderId}`,
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
