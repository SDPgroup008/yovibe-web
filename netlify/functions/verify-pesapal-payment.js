const BUFFER_BROWSER = Buffer.from ? Buffer : { from: (string) => global.Buffer.from(string) };

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
    const apiUrl = process.env.PESAPAL_API_URL || 'https://pay.pesapal.com/api';
    const consumerKey = process.env.PESAPAL_CONSUMER_KEY;
    const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
      throw new Error('PesaPal credentials not configured');
    }

    let orderId;
    if (event.httpMethod === 'GET') {
      orderId = event.queryStringParameters?.orderId || event.queryStringParameters?.pesapal_merchant_reference;
    } else {
      const body = JSON.parse(event.body);
      orderId = body.orderId || body.pesapal_merchant_reference;
    }

    if (!orderId) {
      throw new Error('Missing orderId parameter');
    }

    // Step 1: Get OAuth token (v2)
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

    // Step 2: Query payment status using v2 endpoint
    // v2 uses query parameters: oauth_token and pesapal_merchant_reference
    const queryParams = new URLSearchParams({
      oauth_token: token,
      pesapal_merchant_reference: orderId,
    });

    const response = await fetch(`${apiUrl}/PesapalGetTransactionStatus?${queryParams}`, {
      method: 'GET',
      // No Authorization header needed; token in query
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PesaPal verification error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // v2 response format: pesapal_response_data = "PENDING|COMPLETED|FAILED|INVALID"
    // Often returned as { status: "COMPLETED", ... } or as raw string
    let status = 'pending';
    if (typeof data === 'string') {
      // Raw response like "COMPLETED" or "PENDING"
      status = data.toLowerCase();
    } else if (data.status) {
      status = data.status === 'COMPLETED' ? 'completed'
        : data.status === 'FAILED' ? 'failed'
        : data.status === 'INVALID' ? 'failed'
        : 'pending';
    } else if (data.pesapal_response_data) {
      status = data.pesapal_response_data.toLowerCase();
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status,
        transactionId: data.transaction_id || data.pesapal_transaction_tracking_id || orderId,
        amount: parseFloat(data.amount) || 0,
        paymentMethod: data.payment_method,
        rawStatus: data.status || data,
      }),
    };
  } catch (error) {
    console.error('Error verifying PesaPal payment:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message,
        status: 'pending',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
      }),
    };
  }
};
