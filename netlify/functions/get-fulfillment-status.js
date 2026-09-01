// Guest-safe fulfillment status endpoint. The opaque UUID is the only lookup
// credential; sensitive queue payloads are never returned.

const { getAdminClient } = require('../shared/supabaseAdmin');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

function reply(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return reply(405, { success: false, error: 'Method Not Allowed' });

  const fulfillmentId = event.queryStringParameters?.fulfillmentId;
  if (!fulfillmentId) return reply(400, { success: false, error: 'fulfillmentId is required' });

  try {
    const admin = getAdminClient();
    const { data: fulfillment, error } = await admin
      .from('pending_ticket_fulfillments')
      .select('id, status, ticket_ids, last_error')
      .eq('id', fulfillmentId)
      .maybeSingle();
    if (error) throw error;
    if (!fulfillment) return reply(404, { success: false, error: 'Fulfillment not found' });

    const ticketIds = fulfillment.ticket_ids || [];
    if (fulfillment.status === 'fulfilled' && ticketIds.length > 0) {
      const { data: tickets, error: ticketError } = await admin
        .from('tickets')
        .select('id, ticket_ref, qr_code_data_url')
        .in('id', ticketIds);
      if (ticketError) throw ticketError;
      return reply(200, {
        success: true,
        status: 'fulfilled',
        fulfillmentId: fulfillment.id,
        ticketIds,
        tickets: (tickets || []).map((ticket) => ({
          id: ticket.id,
          ticketRef: ticket.ticket_ref,
          qrCodeDataUrl: ticket.qr_code_data_url,
        })),
      });
    }

    return reply(200, {
      success: false,
      status: fulfillment.status === 'failed' ? 'failed' : 'in_progress',
      fulfillmentId: fulfillment.id,
      error: fulfillment.status === 'failed' ? fulfillment.last_error : undefined,
    });
  } catch (error) {
    console.error('[FulfillmentStatus] Error:', error.message);
    return reply(500, { success: false, error: 'Unable to read fulfillment status' });
  }
};
