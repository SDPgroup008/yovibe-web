const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

// Initialize R2 client
const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || 'https://fa2758d1964bd534d143d8716fd37928.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME || 'yovibe';
const PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-9790a44a83ab4a5e92acd4f1904afbbe.r2.dev';

exports.handler = async (event) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { 
      file,           // base64 data URL or Buffer
      filename,       // e.g., "image.jpg"
      contentType,    // e.g., "image/jpeg"
      path,           // e.g., "venues/abc123"
      type = 'media'  // media type for logging
    } = body;

    if (!file || !filename || !contentType || !path) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Missing required fields: file, filename, contentType, path' 
        }),
      };
    }

    // Construct R2 key
    const key = `${path}/${filename}`;

    // Prepare file body
    let uploadBody;
    if (typeof file === 'string' && file.startsWith('data:')) {
      // Handle base64 data URL
      const base64Data = file.replace(/^data:[\w\/\-]+;base64,/, '');
      uploadBody = Buffer.from(base64Data, 'base64');
    } else if (Buffer.isBuffer(file)) {
      uploadBody = file;
    } else if (typeof file === 'string') {
      uploadBody = Buffer.from(file, 'base64');
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid file format' }),
      };
    }

    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: uploadBody,
      ContentType: contentType,
      ACL: 'public-read',
    });

    await r2.send(command);

    // Construct public URL
    const publicUrl = `${PUBLIC_URL}/${key}`;

    console.log(`[R2 Upload] ${type} uploaded: ${key} -> ${publicUrl}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        url: publicUrl,
        key,
        path,
        filename,
        size: uploadBody.length,
      }),
    };
  } catch (error) {
    console.error('[R2 Upload Error]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      }),
    };
  }
};
