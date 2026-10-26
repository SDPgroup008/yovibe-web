const crypto = require('crypto');
const { requireUser } = require('../shared/supabaseAdmin');
const { presignR2, publicUrlForKey } = require('../shared/r2');
const { getSiteUrl } = require('../shared/runtimeConfig');

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

function headers(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const allowedOrigin = new URL(getSiteUrl()).origin;
  return {
    ...(origin === allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };
}

function reply(event, statusCode, body) {
  return { statusCode, headers: headers(event), body: JSON.stringify(body) };
}

function extensionFor(contentType) {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm' })[contentType];
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers(event), body: '' };
  if (event.httpMethod !== 'POST') return reply(event, 405, { error: 'Method Not Allowed' });
  try {
    const { admin, profile } = await requireUser(event);
    const { venueSlug, contentType, size, durationSeconds } = JSON.parse(event.body || '{}');
    const mediaType = IMAGE_TYPES.has(contentType) ? 'image' : VIDEO_TYPES.has(contentType) ? 'video' : null;
    if (!venueSlug || !mediaType || !Number.isFinite(Number(size))) return reply(event, 400, { error: 'Invalid media upload request' });
    const bytes = Number(size);
    const maxBytes = mediaType === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (bytes <= 0 || bytes > maxBytes) return reply(event, 413, { error: `The ${mediaType} exceeds the allowed size` });
    if (mediaType === 'video' && (!Number.isFinite(Number(durationSeconds)) || Number(durationSeconds) <= 0 || Number(durationSeconds) > 60)) {
      return reply(event, 422, { error: 'Videos must be no longer than 60 seconds' });
    }

    const { data: venue, error: venueError } = await admin.from('venues')
      .select('slug,owner_id,is_deleted').eq('slug', venueSlug).maybeSingle();
    if (venueError) throw venueError;
    if (!venue || venue.is_deleted) return reply(event, 404, { error: 'Venue not found' });
    if (profile?.user_type !== 'admin' && venue.owner_id !== profile?.id) return reply(event, 403, { error: 'You can only publish updates for venues you own' });

    const { count, error: countError } = await admin.from('vibe_updates')
      .select('*', { count: 'exact', head: true }).eq('venue_slug', venueSlug).is('deleted_at', null).gt('expires_at', new Date().toISOString());
    if (countError) throw countError;
    if ((count || 0) >= 7) return reply(event, 409, { error: 'This venue already has seven active Vibe Updates' });

    const extension = extensionFor(contentType);
    const key = `vibe-updates/${venueSlug}/${crypto.randomUUID()}.${extension}`;
    return reply(event, 200, {
      uploadUrl: presignR2({ kind: 'public', method: 'PUT', key, contentType, expiresSeconds: 300 }),
      mediaUrl: publicUrlForKey(key), key, contentType, mediaType,
    });
  } catch (error) {
    console.error('[VibeUpdateUpload] Error:', error.message);
    return reply(event, error.statusCode || 500, { error: error.message || 'Unable to prepare media upload' });
  }
};
