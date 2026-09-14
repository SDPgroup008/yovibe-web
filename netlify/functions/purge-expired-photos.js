// netlify/functions/purge-expired-photos.js
//
// Phase 4 (4.3): scheduled daily cleanup of buyer security photos and QR
// images in R2. Deletes assets for:
//   - refunded / cancelled tickets (immediately — no longer valid),
//   - active/used tickets whose event_start_time is older than the retention
//     window (default 30 days; set PURGE_RETENTION_DAYS to override).
//
// Schedule: daily at 04:00 (see netlify.toml).

const { getAdminClient } = require('../shared/supabaseAdmin');
const { deleteObject, listObjects, privateKeyFromReference } = require('../shared/r2');

const RETENTION_DAYS = Number(process.env.PURGE_RETENTION_DAYS || 30);

async function deleteKeys(keys) {
  if (!keys.length) return 0;
  const results = await Promise.allSettled(keys.map((key) => deleteObject('private', key)));
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
      for (const prefix of ['buyer-photos/', 'qr-codes/']) {
        const listed = await listObjects('private', { Prefix: prefix, MaxKeys: 5000 });
        for (const obj of listed.Contents || []) {
          if (obj.LastModified && obj.LastModified < new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)) {
            keysToDelete.add(obj.Key);
          }
        }
      }
    }

    const deleted = await deleteKeys([...keysToDelete]);
    /* console.log(`[PurgePhotos] Retention=${RETENTION_DAYS}d, candidates=${keysToDelete.size}, deleted=${deleted}`); */
    return json(200, { ok: true, candidates: keysToDelete.size, deleted });
  } catch (error) {
    console.error('[PurgePhotos] Error:', error.message);
    return json(500, { ok: false, error: error.message });
  }
};

function addAssetKeys(set, ticket) {
  const photo = privateKeyFromReference(ticket.buyer_photo_url);
  const qr = privateKeyFromReference(ticket.qr_code_data_url);
  if (photo) set.add(photo);
  if (qr) set.add(qr);
}

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
