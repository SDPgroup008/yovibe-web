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
    const consumerKey = process.env.PESAPAL_CONSUMER_KEY;
    const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;
    const apiUrl = process.env.PESAPAL_API_URL || 'https://pay.pesapal.com/v3/api';
    const siteUrl = process.env.SITE_URL || 'https://yovibe.net';

    if (!consumerKey || !consumerSecret) {
      throw new Error('PesaPal credentials not configured');
    }

    const ipnUrl = `${siteUrl}/.netlify/functions/pesapal-ipn`;

    console.log('RegisterIPN: Starting');
    console.log('  apiUrl:', apiUrl);
    console.log('  ipnUrl:', ipnUrl);
    console.log('  siteUrl:', siteUrl);

    // Step 1: Get OAuth token (v3) - credentials in body, NO Authorization header
    const tokenResponse = await fetch(`${apiUrl}/Auth/RequestToken`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        // NO Authorization header - credentials go in body
      },
      body: JSON.stringify({
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      }),
    });

    const tokenText = await tokenResponse.text();
    console.log('OAuth response status:', tokenResponse.status);
    console.log('OAuth response body (truncated):', tokenText.substring(0, 200));

    if (!tokenResponse.ok) {
      throw new Error(`PesaPal OAuth error: ${tokenResponse.status} - ${tokenText.substring(0, 200)}`);
    }

    const tokenData = JSON.parse(tokenText);
    const token = tokenData.token;

    if (!token) {
      throw new Error('No token received from PesaPal');
    }

    // Step 2: Register IPN URL
    const ipnRequest = {
      url: ipnUrl,
      ipn_notification_type: 'GET',
    };

    console.log('RegisterIPN request payload:', JSON.stringify(ipnRequest));

    const response = await fetch(`${apiUrl}/URLSetup/RegisterIPN`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(ipnRequest),
    });

    const responseText = await response.text();
    console.log('RegisterIPN response status:', response.status);
    console.log('RegisterIPN response body:', responseText);

    if (!response.ok) {
      throw new Error(`PesaPal IPN registration error: ${response.status} - ${responseText.substring(0, 200)}`);
    }

    const data = JSON.parse(responseText);
    const ipnId = data.ipn_id;

    if (!ipnId) {
      throw new Error('No IPN ID received from PesaPal');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        ipnId: ipnId,
        url: data.url,
        ipn_status: data.ipn_status_description,
        message: 'IPN URL registered successfully. Add this ID to your Netlify environment variables as PESAPAL_NOTIFICATION_ID.',
      }),
    };
  } catch (error) {
    console.error('Error registering IPN:', error);
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
