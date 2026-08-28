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

// ─── Input validation (endpoint intentionally stays unauthenticated so guest
//     buyers can upload security photos, so we validate the content instead) ──
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const PATH_SEGMENT_RE = /^[a-z0-9][a-z0-9-]*$/i;
const FILENAME_RE = /^[a-zA-Z0-9._-]{1,120}$/;
const MAX_PATH_DEPTH = 3;

/**
 * Sniff the real image format from file bytes. Returns the MIME type or null
 * when the payload is not a supported image, so arbitrary/non-image uploads
 * (HTML, executables, archives) are rejected regardless of the declared type.
 */
function sniffImageMime(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  let head = '';
  for (let i = 0; i < Math.min(bytes.length, 256); i++) head += String.fromCharCode(bytes[i]);
  if (head.toLowerCase().includes('<svg')) return 'image/svg+xml';
  return null;
}

function validatePath(path) {
  if (typeof path !== 'string' || !path) return 'path is required';
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0 || segments.length > MAX_PATH_DEPTH) return 'path has an invalid number of segments';
  for (const segment of segments) {
    if (segment === '..' || !PATH_SEGMENT_RE.test(segment)) return 'path contains invalid characters';
  }
  return null;
}

function validateFilename(filename) {
  if (typeof filename !== 'string' || !filename) return 'filename is required';
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) return 'filename is invalid';
  if (!FILENAME_RE.test(filename)) return 'filename contains invalid characters';
  return null;
}

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

    // Validate path and filename structure before touching storage
    const pathError = validatePath(path);
    if (pathError) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `Invalid path: ${pathError}` }) };
    }
    const filenameError = validateFilename(filename);
    if (filenameError) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `Invalid filename: ${filenameError}` }) };
    }

    // Reject non-image content types
    if (!String(contentType || '').toLowerCase().startsWith('image/')) {
      return {
        statusCode: 415,
        headers,
        body: JSON.stringify({ error: 'Only image uploads are supported' }),
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

    // Size cap
    if (uploadBody.length > MAX_BYTES) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({ error: `File exceeds the ${Math.round(MAX_BYTES / 1024 / 1024)} MB upload limit` }),
      };
    }

    // Verify the bytes are actually a supported image (sniff magic bytes)
    const sniffed = sniffImageMime(uploadBody);
    if (!sniffed) {
      return {
        statusCode: 415,
        headers,
        body: JSON.stringify({ error: 'File content is not a supported image' }),
      };
    }

    // Upload to R2 with the real sniffed content type so decoders never get a
    // mislabeled object
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: uploadBody,
      ContentType: sniffed,
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
        contentType: sniffed,
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
