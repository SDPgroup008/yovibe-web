exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const consumerKey = process.env.PESAPAL_CONSUMER_KEY;
  const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;
  const apiUrl = process.env.PESAPAL_API_URL || 'https://pay.pesapal.com/api';

  // Step 1: Get OAuth token
  const tokenResponse = await fetch(`${apiUrl}/PostOAuthJson`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({ consumer_key: consumerKey, consumer_secret: consumerSecret }),
  });

  const tokenText = await tokenResponse.text();
  console.log('OAuth status:', tokenResponse.status);
  console.log('OAuth body:', tokenText);

  let token;
  try {
    const tokenData = JSON.parse(tokenText);
    token = tokenData.token;
  } catch (e) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        oauthStatus: tokenResponse.status,
        oauthBody: tokenText,
        error: 'Failed to parse OAuth response',
      }),
    };
  }

  if (!token) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        oauthStatus: tokenResponse.status,
        oauthBody: tokenText,
        error: 'No token in OAuth response',
      }),
    };
  }

  // Step 2: Get IPN List
  const ipnListUrl = `${apiUrl}/URLSetup/GetIpnList`;
  const ipnListResponse = await fetch(ipnListUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  const ipnListText = await ipnListResponse.text();
  console.log('GetIpnList status:', ipnListResponse.status);
  console.log('GetIpnList body:', ipnListText);

  let ipnList;
  try {
    ipnList = JSON.parse(ipnListText);
  } catch (e) {
    ipnList = ipnListText;
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      oauthStatus: tokenResponse.status,
      oauthBody: tokenResponse.ok ? { token, expiry: 'obfuscated' } : tokenText,
      ipnListStatus: ipnListResponse.status,
      ipnList: ipnList,
      apiUrl,
      message: 'If ipnList is empty, your IPN may not be registered via API. Use register-ipn function to register.',
    }),
  };
};
