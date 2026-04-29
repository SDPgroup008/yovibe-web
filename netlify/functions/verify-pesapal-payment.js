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
    const apiUrl = process.env.PESAPAL_API_URL || 'https://pay.pesapal.com/v3/api';
    const consumerKey = process.env.PESAPAL_CONSUMER_KEY;
    const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
      throw new Error('PesaPal credentials not configured');
    }

    let orderId;
    if (event.httpMethod === 'GET') {
      orderId = event.queryStringParameters?.orderId || event.queryStringParameters?.orderTrackingId;
    } else {
      const body = JSON.parse(event.body);
      orderId = body.orderId || body.orderTrackingId;
    }

    if (!orderId) {
      throw new Error('Missing orderId parameter');
    }

    // Step 1: Get OAuth token (v3)
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

    // Step 2: Query payment status using v3 endpoint
    const queryParams = new URLSearchParams({
      orderTrackingId: orderId,
    });

    const response = await fetch(`${apiUrl}/Transactions/GetTransactionStatus?${queryParams}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PesaPal verification error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    const status = data.status === 'COMPLETED' ? 'completed'
      : data.status === 'FAILED' ? 'failed'
      : 'pending';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status,
        transactionId: data.order_tracking_id || data.transaction_id,
        amount: parseFloat(data.amount) || 0,
        paymentMethod: data.payment_method,
        rawStatus: data.status,
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
