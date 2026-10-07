// Administrator-only, reversible soft deletion for users, venues, and events.
// Browser clients never write deletion flags directly: RLS can otherwise make
// an update affect zero rows without an actionable error.

const { requireUser, json } = require('../shared/supabaseAdmin');

const RESOURCES = new Set(['user', 'venue', 'event']);

function isAdmin(profile) {
  return String(profile?.user_type || '').toLowerCase() === 'admin';
}

function clientError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

async function softDeleteUser(admin, id, authUser, profile) {
  const { data: target, error: targetError } = await admin
    .from('users')
    .select('id, uid, user_type')
    .eq('id', id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!target) throw clientError('User not found or already deleted', 404);

  if (
    String(target.uid || '') === String(authUser.id) ||
    String(target.id) === String(profile?.id || '')
  ) {
    throw clientError('You cannot delete your own administrator account', 409);
  }

  if (isAdmin(target)) {
    const { count, error: countError } = await admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('is_deleted', false)
      .ilike('user_type', 'admin');
    if (countError) throw countError;
    if ((count || 0) <= 1) {
      throw clientError('At least one active administrator must remain', 409);
    }
  }

  const now = new Date().toISOString();
  const { data: deleted, error: deleteError } = await admin
    .from('users')
    .update({
      is_deleted: true,
      deleted_at: now,
      is_frozen: true,
      frozen_at: now,
    })
    .eq('id', id)
    .eq('is_deleted', false)
    .select('id')
    .maybeSingle();
  if (deleteError) throw deleteError;
  if (!deleted) throw clientError('User could not be deleted', 409);
}

async function softDeleteEvent(admin, id) {
  const now = new Date().toISOString();
  const { data: deleted, error } = await admin
    .from('events')
    .update({ is_deleted: true, deleted_at: now })
    .eq('slug', id)
    .eq('is_deleted', false)
    .select('slug')
    .maybeSingle();
  if (error) throw error;
  if (!deleted) throw clientError('Event not found or already deleted', 404);
}

async function softDeleteVenue(admin, id) {
  const now = new Date().toISOString();
  const { data: venue, error: venueError } = await admin
    .from('venues')
    .update({ is_deleted: true, deleted_at: now })
    .eq('slug', id)
    .eq('is_deleted', false)
    .select('slug')
    .maybeSingle();
  if (venueError) throw venueError;
  if (!venue) throw clientError('Venue not found or already deleted', 404);

  const { data: events, error: eventsError } = await admin
    .from('events')
    .update({ is_deleted: true, deleted_at: now })
    .eq('venue_slug', id)
    .eq('is_deleted', false)
    .select('slug');
  if (eventsError) {
    // Preserve the venue if its dependent-event operation failed. This is a
    // best-effort compensation because these are two service API calls.
    const { error: restoreError } = await admin
      .from('venues')
      .update({ is_deleted: false, deleted_at: null })
      .eq('slug', id)
      .eq('is_deleted', true);
    if (restoreError) console.error('[AdminSoftDelete] Venue restore failed:', restoreError.message);
    throw eventsError;
  }

  return Array.isArray(events) ? events.length : 0;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const { admin, authUser, profile } = await requireUser(event);
    if (!isAdmin(profile)) return json(403, { error: 'Admin access required' });

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }

    const resource = String(body.resource || '').trim().toLowerCase();
    const id = String(body.id || '').trim();
    if (!RESOURCES.has(resource) || !id) {
      return json(400, { error: 'A valid resource and id are required' });
    }

    let deletedEventCount = 0;
    if (resource === 'user') await softDeleteUser(admin, id, authUser, profile);
    if (resource === 'event') await softDeleteEvent(admin, id);
    if (resource === 'venue') deletedEventCount = await softDeleteVenue(admin, id);

    return json(200, { success: true, resource, id, deletedEventCount });
  } catch (error) {
    console.error('[AdminSoftDelete] Error:', error.message);
    return json(error.statusCode || 500, { error: error.message || 'Unable to delete this item' });
  }
};

module.exports = {
  handler: exports.handler,
  isAdmin,
  softDeleteUser,
  softDeleteEvent,
  softDeleteVenue,
};
