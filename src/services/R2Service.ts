// Web-compatible R2 upload service
// In browser: calls Netlify function
// In Node.js: uses AWS SDK directly

const isServerSide = typeof window === 'undefined';

let r2Client: any = null;
if (isServerSide) {
  // Only import AWS SDK on server side
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT || 'https://fa2758d1964bd534d143d8716fd37928.r2.cloudflarestorage.com',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
    forcePathStyle: true,
  });
}

const BUCKET = process.env.R2_BUCKET_NAME || process.env.NEXT_PUBLIC_R2_BUCKET_NAME || 'yovibe';
const PUBLIC_URL = process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://pub-9790a44a83ab4a5e92acd4f1904afbbe.r2.dev';

export interface UploadOptions {
  contentType: string;
  path: string;
  filename: string;
  body: Buffer | Blob | string;
}

/**
 * Upload file to R2 and return public URL
 * Works in both browser and Node.js environments
 */
export async function uploadToR2(options: UploadOptions): Promise<{ url: string; key: string }> {
  try {
    const { contentType, path, filename, body } = options;
    const key = `${path}/${filename}`;

    if (isServerSide) {
      // Server-side: use AWS SDK directly
      return await uploadToR2Server(key, body, contentType);
    } else {
      // Browser-side: call Netlify function
      return await uploadToR2Browser(key, body, contentType, path, filename);
    }
  } catch (error) {
    console.error('[R2Service] Upload error:', error);
    throw error;
  }
}

/**
 * Server-side upload to R2 using AWS SDK
 */
async function uploadToR2Server(
  key: string,
  body: Buffer | Blob | string,
  contentType: string
): Promise<{ url: string; key: string }> {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  
  let uploadBody: Buffer | Uint8Array | string;
  if (typeof body === 'string') {
    // Handle data URLs
    if (body.startsWith('data:')) {
      const base64Data = body.replace(/^data:[\w\/\-]+;base64,/, '');
      uploadBody = Buffer.from(base64Data, 'base64');
    } else {
      uploadBody = body;
    }
  } else if (body instanceof Blob) {
    const arrayBuffer = await body.arrayBuffer();
    uploadBody = Buffer.from(arrayBuffer);
  } else {
    uploadBody = body;
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: uploadBody,
    ContentType: contentType,
    ACL: 'public-read',
  });

  await r2Client.send(command);
  const url = `${PUBLIC_URL}/${key}`;

  return { url, key };
}

/**
 * Browser-side upload to R2 via Netlify function
 */
async function uploadToR2Browser(
  key: string,
  body: Buffer | Blob | string,
  contentType: string,
  path: string,
  filename: string
): Promise<{ url: string; key: string }> {
  let fileData: string | Buffer;

  if (typeof body === 'string') {
    fileData = body; // data URL or base64
  } else if (body instanceof Blob) {
    fileData = await body.text();
  } else if (Buffer.isBuffer(body)) {
    fileData = body.toString('base64');
  } else {
    fileData = body as string;
  }

  const response = await fetch('/.netlify/functions/uploadR2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file: fileData,
      filename,
      contentType,
      path,
      type: 'media',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText }));

    // Provide helpful error message for configuration issues
    if (errorData.error?.includes('R2 storage not configured')) {
      throw new Error(
        'R2 storage is not configured. Please set up Cloudflare R2 credentials in your Netlify environment variables:\n' +
        '- R2_ACCESS_KEY_ID\n' +
        '- R2_SECRET_ACCESS_KEY\n' +
        '- R2_ACCOUNT_ID\n' +
        '- R2_BUCKET_NAME\n' +
        '- R2_ENDPOINT\n' +
        '- R2_PUBLIC_URL\n\n' +
        'See: https://developers.cloudflare.com/r2/api/s3/tokens/'
      );
    }

    throw new Error(`Upload failed: ${errorData.error || response.statusText}`);
  }

  const result = await response.json();
  return { url: result.url, key };
}

/**
 * Delete file from R2
 */
export async function deleteFromR2(key: string): Promise<void> {
  if (!isServerSide) {
    throw new Error('R2 delete operation only available on server side');
  }

  try {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const command = new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });
    await r2Client.send(command);
  } catch (error) {
    console.error('[R2Service] Delete error:', error);
    throw error;
  }
}

/**
 * Get public URL for R2 key
 */
export function getR2PublicUrl(key: string): string {
  return `${PUBLIC_URL}/${key}`;
}

/**
 * Upload QR code data URL to R2
 */
export async function uploadQRCode(
  qrCodeDataUrl: string,
  ticketId: string
): Promise<{ url: string; key: string }> {
  try {
    return await uploadToR2({
      path: 'qr-codes',
      filename: `${ticketId}.png`,
      contentType: 'image/png',
      body: qrCodeDataUrl,
    });
  } catch (error) {
    console.error('[R2Service] QR Code upload error:', error);
    throw error;
  }
}

/**
 * Upload buyer photo to R2
 */
export async function uploadBuyerPhoto(
  photoUri: string,
  ticketId: string
): Promise<{ url: string; key: string }> {
  try {
    return await uploadToR2({
      path: 'buyer-photos',
      filename: `${ticketId}.jpg`,
      contentType: 'image/jpeg',
      body: photoUri,
    });
  } catch (error) {
    console.error('[R2Service] Buyer photo upload error:', error);
    throw error;
  }
}

/**
 * Batch upload multiple files to R2
 */
export async function uploadBatch(
  files: Array<{
    body: Buffer | Blob | string;
    contentType: string;
    path: string;
    filename: string;
  }>
): Promise<Array<{ url: string; key: string; success: boolean }>> {
  const results = await Promise.allSettled(
    files.map(file => uploadToR2(file))
  );
  
  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return { ...result.value, success: true };
    } else {
      console.error(`[R2Service] Batch upload failed for ${files[index].filename}:`, result.reason);
      return { url: '', key: files[index].filename, success: false };
    }
  });
}
