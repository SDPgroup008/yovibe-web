// Per-event, admin-controlled sale-time payout eligibility.
//
// The browser never writes the policy table directly. This function verifies
// the signed-in caller and uses the service-role client only after that check.

const { requireUser, json } = require('../shared/supabaseAdmin');
const { getEventPayoutEligibility } = require('../shared/eventPayoutEligibility');

function isAdmin(profile) {
  return profile?.user_type === 'admin';
}

async function loadEvent(admin, eventId) {
  const id = String(eventId || '').trim();
  if (!id) throw Object.assign(new Error('eventId is required'), { statusCode: 400 });

  const { data: bySlug, error: slugError } = await admin
    .from('events')
    .select('slug, created_by, created_by_auth')
    .eq('slug', id)
    .maybeSingle();
  if (slugError) throw slugError;
  if (bySlug) return bySlug;

  const { data: byId, error: idError } = await admin
    .from('events')
    .select('slug, created_by, created_by_auth')
    .eq('id', id)
    .maybeSingle();
  if (idError) throw idError;
  if (!byId) throw Object.assign(new Error('Event not found'), { statusCode: 404 });
  return byId;
}

function ownsEvent(eventRow, authUser, profile) {
  const identities = [authUser?.id, profile?.id, profile?.uid]
    .filter(Boolean)
    .map(String);
  return identities.includes(String(eventRow.created_by || '')) ||
    identities.includes(String(eventRow.created_by_auth || ''));
}

function isMissingPolicyRpc(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42883' || code === 'PGRST202' || message.includes('set_event_sale_payout_eligibility');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: '',
    };
  }
  if (!['GET', 'POST'].includes(event.httpMethod)) return json(405, { error: 'Method not allowed' });

  try {
    const { admin, authUser, profile } = await requireUser(event);
    let body = {};
    if (event.httpMethod === 'POST') {
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return json(400, { error: 'Invalid JSON body' });
      }
    }
    const eventId = body.eventId || event.queryStringParameters?.eventId;
    const eventRow = await loadEvent(admin, eventId);
    const callerIsAdmin = isAdmin(profile);

    if (!callerIsAdmin && !ownsEvent(eventRow, authUser, profile)) {
      return json(403, { error: 'You do not own this event' });
    }

    if (event.httpMethod === 'GET') {
      const policy = await getEventPayoutEligibility(admin, eventRow.slug);
      return json(200, {
        eventId: eventRow.slug,
        salePayoutEnabled: policy.salePayoutEnabled,
        changedAt: policy.changedAt,
        canManage: callerIsAdmin,
      });
    }

    if (!callerIsAdmin) return json(403, { error: 'Admin access required' });
    if (typeof body.salePayoutEnabled !== 'boolean') {
      return json(422, { error: 'salePayoutEnabled must be a boolean' });
    }

    const { data: setting, error: updateError } = await admin.rpc('set_event_sale_payout_eligibility', {
      p_event_slug: eventRow.slug,
      p_enabled: body.salePayoutEnabled,
      p_changed_by: authUser.id,
    });
    if (updateError) {
      if (isMissingPolicyRpc(updateError)) {
        return json(503, { error: 'Payout eligibility migration has not been applied yet' });
      }
      throw updateError;
    }

    return json(200, {
      eventId: eventRow.slug,
      salePayoutEnabled: setting?.sale_payout_enabled === true,
      changedAt: setting?.changed_at || null,
      canManage: true,
    });
  } catch (error) {
    console.error('[EventPayoutEligibility] Error:', error.message);
    return json(error.statusCode || 500, { error: error.message || 'Unable to manage payout eligibility' });
  }
};

module.exports = {
  handler: exports.handler,
  isAdmin,
  ownsEvent,
};
