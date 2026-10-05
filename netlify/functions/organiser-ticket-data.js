const { getAdminClient, requireUser, json } = require('../shared/supabaseAdmin');

async function authorizeEventOwner(event, admin, eventId) {
  const { authUser, profile } = await requireUser(event);
  if (profile?.user_type === 'admin') return;
  const { data: eventRow, error } = await admin.from('events')
    .select('created_by, created_by_auth').eq('slug', eventId).maybeSingle();
  if (error) throw error;
  if (!eventRow) throw Object.assign(new Error('Event not found'), { statusCode: 404 });
  const identities = [authUser.id, profile?.id, profile?.uid].filter(Boolean).map(String);
  if (!identities.includes(String(eventRow.created_by || '')) && !identities.includes(String(eventRow.created_by_auth || ''))) {
    throw Object.assign(new Error('You do not own this event'), { statusCode: 403 });
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
    const action = body.action;
    if (!eventId || !['tickets', 'scan-logs'].includes(action)) return json(400, { error: 'Invalid request' });

    const admin = getAdminClient();
    await authorizeEventOwner(event, admin, eventId);

    if (action === 'tickets') {
      const { data, error } = await admin.from('tickets')
        .select('id,event_id,event_name,entry_fee_type,total_amount,venue_revenue,app_commission,gateway_fee,is_late_purchase,is_scanned,status,payout_eligible,payout_status,purchase_date,payment_method,payment_status,created_at,refund_status')
        .eq('event_slug', eventId)
        .order('purchase_date', { ascending: false })
        .limit(500);
      if (error) throw error;
      return json(200, { tickets: data || [] });
    }

    const { data: validations, error: validationError } = await admin.from('ticket_validations')
      .select('ticketId,validatedAt,status,reason').eq('event_slug', eventId)
      .order('validatedAt', { ascending: false, nullsFirst: false }).limit(10);
    if (validationError) throw validationError;
    const ids = [...new Set((validations || []).map((row) => row.ticketId).filter(Boolean))];
    const { data: tickets, error: ticketError } = ids.length
      ? await admin.from('tickets').select('id,ticket_ref,entry_fee_type,seat_number,table_number,buyer_name').in('id', ids)
      : { data: [], error: null };
    if (ticketError) throw ticketError;
    const byId = new Map((tickets || []).map((ticket) => [ticket.id, ticket]));
    const logs = (validations || []).map((row) => {
      const ticket = byId.get(row.ticketId) || {};
      return {
        time: row.validatedAt ? new Date(row.validatedAt).toLocaleTimeString() : '',
        name: ticket.buyer_name || '—',
        ticketRef: ticket.ticket_ref || String(row.ticketId || '').substring(0, 8) || '—',
        feeType: ticket.entry_fee_type || '—',
        seatNumber: ticket.seat_number != null ? String(ticket.seat_number) : '—',
        tableNumber: ticket.table_number != null ? String(ticket.table_number) : '—',
        status: row.status === 'granted' ? 'Valid' : 'Invalid',
        reason: row.reason || (row.status === 'granted' ? '' : 'Validation failed'),
      };
    });
    return json(200, { logs });
  } catch (error) {
    console.error('[OrganiserTicketData] Error:', error.message);
    return json(error.statusCode || 500, { error: error.message || 'Unable to load organiser ticket data' });
  }
};
