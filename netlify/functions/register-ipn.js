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
    const apiUrl = process.env.PESAPAL_API_URL || 'https://cybqa.pesapal.com/pesapalv3/api';
    // Your site's base URL where Netlify Functions are hosted
    const siteUrl = process.env.SITE_URL || 'http://localhost:8888';

    if (!consumerKey || !consumerSecret) {
      throw new Error('PesaPal credentials not configured');
    }

    // The IPN URL that PesaPal will call with payment notifications
    // This should point to your IPN Netlify Function
    const ipnUrl = `${siteUrl}/.netlify/functions/pesapal-ipn`;

    // Step 1: Get OAuth token
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

    // Step 2: Register IPN URL
    const ipnRequest = {
      url: ipnUrl,
      ipn_notification_type: 'GET', // or 'POST' - GET simpler for testing
    };

    const response = await fetch(`${apiUrl}/URLSetup/RegisterIPN`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(ipnRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PesaPal IPN registration error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

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
