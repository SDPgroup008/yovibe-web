const crypto = require('crypto');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function response(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function encodePath(value) {
  return value.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function presignPut({ endpoint, bucket, key, accessKeyId, secretAccessKey, contentType }) {
  const endpointUrl = new URL(endpoint);
  const host = endpointUrl.host;
  const path = `${endpointUrl.pathname.replace(/\/$/, '')}/${encodePath(bucket)}/${encodePath(key)}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const credentialScope = `${date}/auto/s3/aws4_request`;
  const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': '900',
    'X-Amz-SignedHeaders': 'content-type;host',
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((name) => `${encodeURIComponent(name)}=${encodeURIComponent(query[name])}`)
    .join('&');
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const canonicalRequest = [
    'PUT', path, canonicalQuery, canonicalHeaders, 'content-type;host', 'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256', amzDate, credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), 'auto'), 's3'), 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');
  const uploadUrl = `${endpointUrl.origin}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  return { uploadUrl, key };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method Not Allowed' });

  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return response(500, { error: 'R2 storage not configured' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return response(400, { error: 'Invalid JSON body' }); }
  const key = String(body.key || '');
  const contentType = String(body.contentType || '').toLowerCase();
  if (!/^buyer-photos\/[a-zA-Z0-9._-]{1,160}$/.test(key)) return response(400, { error: 'Invalid buyer photo key' });
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) return response(415, { error: 'Unsupported image type' });

  try {
    const signed = presignPut({
      endpoint: process.env.R2_ENDPOINT || 'https://fa2758d1964bd534d143d8716fd37928.r2.cloudflarestorage.com',
      bucket: process.env.R2_BUCKET_NAME || 'yovibe',
      key,
      accessKeyId,
      secretAccessKey,
      contentType,
    });
    const publicUrl = `${process.env.R2_PUBLIC_URL || 'https://pub-9790a44a83ab4a5e92acd4f1904afbbe.r2.dev'}/${key}`;
    return response(200, { success: true, ...signed, publicUrl });
  } catch (error) {
    console.error('[PresignBuyerPhoto] Error:', error.message);
    return response(500, { error: 'Unable to prepare photo upload' });
  }
};
