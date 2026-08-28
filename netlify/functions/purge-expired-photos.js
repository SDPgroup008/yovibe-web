// netlify/functions/purge-expired-photos.js
//
// Phase 4 (4.3): scheduled daily cleanup of buyer security photos and QR
// images in R2. Deletes assets for:
//   - refunded / cancelled tickets (immediately — no longer valid),
//   - active/used tickets whose event_start_time is older than the retention
//     window (default 30 days; set PURGE_RETENTION_DAYS to override).
//
// Schedule: daily at 04:00 (see netlify.toml).

const { S3Client, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getAdminClient } = require('../shared/supabaseAdmin');

const RETENTION_DAYS = Number(process.env.PURGE_RETENTION_DAYS || 30);

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT || 'https://fa2758d1964bd534d143d8716fd37928.r2.cloudflarestorage.com',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
    forcePathStyle: true,
  });
}

async function deleteKeys(keys) {
  if (!keys.length) return 0;
  const s3 = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME || 'yovibe';
  const results = await Promise.allSettled(
    keys.map((key) => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })))
  );
  return results.filter((r) => r.status === 'fulfilled').length;
}

exports.handler = async (event) => {
  const admin = getAdminClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const keysToDelete = new Set();

  try {
    // 1. Refunded/cancelled tickets — photos + QR go immediately.
    const { data: struck } = await admin
      .from('tickets')
      .select('id, buyer_photo_url, qr_code_data_url, status')
      .in('status', ['refunded', 'cancelled'])
      .limit(5000);
    for (const t of struck || []) {
      addAssetKeys(keysToDelete, t);
    }

    // 2. Old active/used tickets past retention.
    const { data: oldTickets } = await admin
      .from('tickets')
      .select('id, buyer_photo_url, qr_code_data_url, status')
      .in('status', ['active', 'used'])
      .lt('event_start_time', cutoff)
      .limit(5000);
    for (const t of oldTickets || []) {
      addAssetKeys(keysToDelete, t);
    }

    // 3. Also sweep orphaned buyer-photos/qr-codes objects older than retention
    //    (best-effort, capped).
    if (keysToDelete.size < 8000) {
      const s3 = getR2Client();
      const bucket = process.env.R2_BUCKET_NAME || 'yovibe';
      for (const prefix of ['buyer-photos/', 'qr-codes/']) {
        const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 5000 }));
        for (const obj of listed.Contents || []) {
          if (obj.LastModified && obj.LastModified < new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)) {
            keysToDelete.add(obj.Key);
          }
        }
      }
    }

    const deleted = await deleteKeys([...keysToDelete]);
    console.log(`[PurgePhotos] Retention=${RETENTION_DAYS}d, candidates=${keysToDelete.size}, deleted=${deleted}`);
    return json(200, { ok: true, candidates: keysToDelete.size, deleted });
  } catch (error) {
    console.error('[PurgePhotos] Error:', error.message);
    return json(500, { ok: false, error: error.message });
  }
};

function addAssetKeys(set, ticket) {
  const photo = ticket.buyer_photo_url && String(ticket.buyer_photo_url).includes('/buyer-photos/')
    ? decodePath(ticket.buyer_photo_url) : null;
  const qr = ticket.qr_code_data_url && String(ticket.qr_code_data_url).includes('/qr-codes/')
    ? decodePath(ticket.qr_code_data_url) : null;
  if (photo) set.add(photo);
  if (qr) set.add(qr);
}

function decodePath(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.slice(1));
  } catch {
    return null;
  }
}

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
