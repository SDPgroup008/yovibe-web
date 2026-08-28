const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Check if R2 credentials are configured
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

if (!accessKeyId || !secretAccessKey ||
    accessKeyId === 'your_r2_access_key_here' ||
    secretAccessKey === 'your_r2_secret_key_here') {
  console.error('[R2 Function] R2 credentials not properly configured');
}

// Initialize R2 client only if credentials are available
let r2 = null;
if (accessKeyId && secretAccessKey &&
    accessKeyId !== 'your_r2_access_key_here' &&
    secretAccessKey !== 'your_r2_secret_key_here') {
  r2 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT || 'https://fa2758d1964bd534d143d8716fd37928.r2.cloudflarestorage.com',
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    },
  });
}

const BUCKET = process.env.R2_BUCKET_NAME || 'yovibe';
const PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-9790a44a83ab4a5e92acd4f1904afbbe.r2.dev';

// Detect the actual image format from the file bytes. Callers can mislabel an
// image (e.g. JPEG bytes sent as image/png or with a .png filename); storing it
// with the wrong Content-Type/extension breaks every downstream decoder, so
// correct the label from the magic bytes before the object is persisted.
function sniffImageMime(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  if (bytes.length > 0 && bytes.subarray(0, 256).toString('latin1').toLowerCase().includes('<svg')) return 'image/svg+xml';
  return null;
}

const IMAGE_EXTENSION = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

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

  // Check if R2 is configured
  if (!r2) {
    console.error('[R2 Function] R2 client not initialized - credentials not configured');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'R2 storage not configured. Please set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY environment variables.'
      }),
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
    let finalContentType = contentType;
    let finalFilename = filename;
    const sniffed = sniffImageMime(uploadBody);
    if (sniffed) {
      // Trust the real bytes over whatever the caller declared so the stored
      // object's Content-Type and extension always match its format.
      finalContentType = sniffed;
      const ext = IMAGE_EXTENSION[sniffed];
      if (ext && !filename.toLowerCase().endsWith('.' + ext)) {
        finalFilename = filename.replace(/\.[a-z0-9]{1,5}$/i, '') + '.' + ext;
      }
    }
    const key = `${path}/${finalFilename}`;

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
      ContentType: finalContentType,
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
        filename: finalFilename,
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
