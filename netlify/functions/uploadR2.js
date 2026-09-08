const { requireUser } = require('../shared/supabaseAdmin');
const { uploadObject } = require('../shared/r2');
const { getSiteUrl } = require('../shared/runtimeConfig');

const MAX_BYTES = 10 * 1024 * 1024;
const PATH_SEGMENT_RE = /^[a-z0-9][a-z0-9-]*$/i;
const FILENAME_RE = /^[a-zA-Z0-9._-]{1,120}$/;
const PUBLIC_ROOTS = new Set(['events', 'venues', 'vibes', 'vibeimages', 'ticket-designs']);

function corsHeaders(event) {
  const configuredOrigin = new URL(getSiteUrl()).origin;
  const requestOrigin = event.headers?.origin || event.headers?.Origin || '';
  return {
    ...(requestOrigin === configuredOrigin ? { 'Access-Control-Allow-Origin': configuredOrigin } : {}),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };
}

function response(event, statusCode, body) {
  return { statusCode, headers: corsHeaders(event), body: JSON.stringify(body) };
}

function sniffImageMime(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  return null;
}

function validatePath(path) {
  if (typeof path !== 'string' || !path) return 'path is required';
  const segments = path.split('/').filter(Boolean);
  if (!segments.length || segments.length > 3) return 'path has an invalid number of segments';
  if (!PUBLIC_ROOTS.has(segments[0].toLowerCase())) return 'path is not a public asset category';
  if (segments.some((segment) => segment === '..' || !PATH_SEGMENT_RE.test(segment))) return 'path contains invalid characters';
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  if (event.httpMethod !== 'POST') return response(event, 405, { error: 'Method Not Allowed' });

  try {
    const { profile } = await requireUser(event);
    if (!profile || !['club_owner', 'admin'].includes(profile.user_type)) {
      return response(event, 403, { error: 'Organiser or admin access required' });
    }

    const input = JSON.parse(event.body || '{}');
    const { file, filename, contentType, path } = input;
    if (!file || !filename || !contentType || !path) {
      return response(event, 400, { error: 'Missing required fields: file, filename, contentType, path' });
    }
    const pathError = validatePath(path);
    if (pathError) return response(event, 400, { error: `Invalid path: ${pathError}` });
    if (typeof filename !== 'string' || !FILENAME_RE.test(filename) || filename.includes('..')) {
      return response(event, 400, { error: 'Invalid filename' });
    }
    if (!String(contentType).toLowerCase().startsWith('image/')) {
      return response(event, 415, { error: 'Only image uploads are supported' });
    }

    const base64 = typeof file === 'string' && file.startsWith('data:')
      ? file.replace(/^data:[\w/+.-]+;base64,/, '')
      : file;
    if (typeof base64 !== 'string') return response(event, 400, { error: 'Invalid file format' });
    const uploadBody = Buffer.from(base64, 'base64');
    if (!uploadBody.length || uploadBody.length > MAX_BYTES) {
      return response(event, uploadBody.length ? 413 : 400, { error: 'Invalid image size' });
    }
    const sniffed = sniffImageMime(uploadBody);
    if (!sniffed) return response(event, 415, { error: 'File content is not a supported image' });

    const key = `${path}/${filename}`;
    const url = await uploadObject('public', { key, body: uploadBody, contentType: sniffed });
    return response(event, 200, {
      success: true,
      url,
      key,
      path,
      filename,
      contentType: sniffed,
      size: uploadBody.length,
    });
  } catch (error) {
    console.error('[R2Upload] Error:', error.message);
    return response(event, error.statusCode || 500, { error: error.message || 'Upload failed' });
  }
};
