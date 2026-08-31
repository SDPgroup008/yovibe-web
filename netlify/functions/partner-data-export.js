// netlify/functions/partner-data-export.js
//
// Phase 4 (4.1): auditable export of purchaser personal data for one event,
// for sharing with the event's Organizer / authorised sales partners (HMA /
// NWA per the agreement, Cl. 14.2). Admin only, restricted to the data needed
// for event administration: name, email, phone, ticket refs, security photo.
//
// POST { eventId } → CSV string + row count.

const { requireUser, json } = require('../shared/supabaseAdmin');

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const { admin, profile } = await requireUser(event);
    if (!profile || profile.user_type !== 'admin') return json(403, { error: 'Admin access required' });

    const { eventId } = JSON.parse(event.body || '{}');
    if (!eventId) return json(400, { error: 'eventId is required' });

    const { data: tickets, error } = await admin
      .from('tickets')
      .select('id, ticket_ref, buyer_name, buyer_email, buyer_phone, entry_fee_type, status, buyer_photo_url, created_at')
      .eq('event_slug', eventId);
    if (error) throw error;

    const header = ['buyer_name', 'buyer_email', 'buyer_phone', 'ticket_ref', 'entry_fee_type', 'status', 'security_photo_url', 'purchase_date'];
    const rows = (tickets || []).map((t) => [
      t.buyer_name, t.buyer_email, t.buyer_phone, t.ticket_ref, t.entry_fee_type, t.status, t.buyer_photo_url,
      t.created_at ? new Date(t.created_at).toISOString().split('T')[0] : '',
    ].map(csvEscape).join(','));

    const csv = [header.join(','), ...rows].join('\n');
    /* console.log(`[PartnerExport] ${(tickets || []).length} purchaser rows exported for ${eventId} by ${profile.email}`); */

    return json(200, { success: true, eventId, count: (tickets || []).length, csv });
  } catch (error) {
    console.error('partner-data-export error', error);
    return json(error.statusCode || 500, { error: error.message || 'Export failed' });
  }
};
