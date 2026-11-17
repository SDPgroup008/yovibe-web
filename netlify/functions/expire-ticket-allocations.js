const { getAdminClient, json } = require('../shared/supabaseAdmin');
const { isScheduledWorkerEnabled, disabledResponse } = require('../shared/stagingScheduledWorkerGate');

exports.handler = async (event) => {
  if (event.httpMethod && !['GET', 'POST'].includes(event.httpMethod)) return json(405, { error: 'Method not allowed' });
  if (!isScheduledWorkerEnabled()) return disabledResponse('expire-ticket-allocations');
  try {
    const { data, error } = await getAdminClient().rpc('expire_ticket_allocations');
    if (error) throw error;
    return json(200, { ok: true, expired: Number(data || 0) });
  } catch (error) {
    console.error('[ExpireTicketAllocations]', error.message);
    return json(500, { error: error.message || 'Unable to expire allocations' });
  }
};
