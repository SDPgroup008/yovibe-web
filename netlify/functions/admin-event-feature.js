// Administrator-only feature control. This avoids relying on browser RLS for
// a cross-organiser moderation action.

const { requireUser, json } = require('../shared/supabaseAdmin');

function isAdmin(profile) {
  return String(profile?.user_type || '').toLowerCase() === 'admin';
}

function clientError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

async function loadActiveEvent(admin, eventSlug) {
  const { data, error } = await admin
    .from('events')
    .select('slug, is_featured')
    .eq('slug', eventSlug)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw clientError('Event not found or has been deleted', 404);
  return data;
}

async function setFeatured(admin, eventSlug, isFeatured) {
  await loadActiveEvent(admin, eventSlug);
  const { data, error } = await admin
    .from('events')
    .update({ is_featured: isFeatured })
    .eq('slug', eventSlug)
    .eq('is_deleted', false)
    .select('slug, is_featured')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw clientError('Event was changed before it could be updated', 409);
  return data;
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
    const { admin, profile } = await requireUser(event);
    if (!isAdmin(profile)) return json(403, { error: 'Admin access required' });

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }

    const eventSlug = String(body.eventSlug || '').trim();
    if (!eventSlug || typeof body.isFeatured !== 'boolean') {
      return json(400, { error: 'A valid event slug and featured state are required' });
    }

    const updated = await setFeatured(admin, eventSlug, body.isFeatured);
    return json(200, {
      success: true,
      eventSlug: updated.slug,
      isFeatured: Boolean(updated.is_featured),
    });
  } catch (error) {
    console.error('[AdminEventFeature] Error:', error.message);
    return json(error.statusCode || 500, { error: error.message || 'Unable to update event feature status' });
  }
};

module.exports = { handler: exports.handler, isAdmin, loadActiveEvent, setFeatured };
