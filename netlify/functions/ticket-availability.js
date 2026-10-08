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
    const requestedFeeTypes = Array.isArray(body.feeTypes)
      ? [...new Set(body.feeTypes.map((value) => safeText(value)).filter(Boolean))].slice(0, 40)
      : [];
    if (!eventSlug || (!feeType && requestedFeeTypes.length === 0)) return json(400, { error: 'Event and entry fee are required' });

    const admin = getAdminClient();
    const { data: eventRow, error: eventError } = await admin
      .from('events')
      .select('slug, is_deleted, entry_fees')
      .eq('slug', eventSlug)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!eventRow || eventRow.is_deleted === true) return json(404, { error: 'Event not found' });

    if (requestedFeeTypes.length > 0) {
      const publicFeeNames = new Set(
        Array.isArray(eventRow.entry_fees)
          ? eventRow.entry_fees.map((fee) => safeText(fee && fee.name)).filter(Boolean)
          : []
      );
      const validFeeTypes = requestedFeeTypes.filter((name) => publicFeeNames.has(name));
      if (validFeeTypes.length !== requestedFeeTypes.length) return json(400, { error: 'Invalid entry fee requested' });

      const { data: countRows, error: countError } = await admin
        .from('tickets')
        .select('entry_fee_type')
        .eq('event_slug', eventSlug)
        .in('entry_fee_type', validFeeTypes)
        .in('status', TICKET_STATUSES);
      if (countError) throw countError;

      const soldCounts = Object.fromEntries(validFeeTypes.map((name) => [name, 0]));
      for (const row of countRows || []) {
        if (Object.prototype.hasOwnProperty.call(soldCounts, row.entry_fee_type)) soldCounts[row.entry_fee_type] += 1;
      }
      return json(200, { soldCounts });
    }

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

    // A quantity is public inventory information, not ticket data. Returning
    // it lets checkout enforce a visible capacity limit without querying
    // tickets from the browser.
    return json(200, { occupiedSeats, occupiedTables, soldCount: (rows || []).length });
  } catch (error) {
    console.error('[TicketAvailability] Error:', error.message);
    return json(500, { error: 'Unable to load ticket availability' });
  }
};
