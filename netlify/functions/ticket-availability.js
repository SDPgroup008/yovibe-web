const { getAdminClient, json } = require('../shared/supabaseAdmin');

const TICKET_STATUSES = ['active', 'used', 'pending'];
const safeText = (value, maxLength = 160) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= maxLength ? text : '';
};
const integer = (value) => {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Public, deliberately minimal inventory endpoint. It exists so checkout can
 * show taken seats/tables without ever giving browsers read access to tickets.
 */
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const eventSlug = safeText(body.eventSlug);
    const feeType = safeText(body.feeType);
    if (!eventSlug || !feeType) return json(400, { error: 'Event and entry fee are required' });

    const admin = getAdminClient();
    const { data: eventRow, error: eventError } = await admin
      .from('events')
      .select('slug, is_deleted')
      .eq('slug', eventSlug)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!eventRow || eventRow.is_deleted === true) return json(404, { error: 'Event not found' });

    const { data: rows, error: ticketError } = await admin
      .from('tickets')
      .select('seat_number, table_number')
      .eq('event_slug', eventSlug)
      .eq('entry_fee_type', feeType)
      .in('status', TICKET_STATUSES);
    if (ticketError) throw ticketError;

    const occupiedSeats = [...new Set((rows || [])
      .map((row) => integer(row.seat_number))
      .filter((value) => value !== null))];
    const occupiedTables = [...new Set((rows || [])
      .map((row) => integer(row.table_number))
      .filter((value) => value !== null))];

    return json(200, { occupiedSeats, occupiedTables });
  } catch (error) {
    console.error('[TicketAvailability] Error:', error.message);
    return json(500, { error: 'Unable to load ticket availability' });
  }
};
