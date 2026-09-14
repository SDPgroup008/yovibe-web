// Netlify Background Function: process one confirmed fulfillment without
// holding the buyer's HTTP request open.

const { getAdminClient } = require('../shared/supabaseAdmin');
const { processOne } = require('./process-stuck-fulfillments');
const { requiredEnv } = require('../shared/runtimeConfig');

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const expected = requiredEnv('FULFILLMENT_WORKER_SECRET');
  const supplied = event.headers?.['x-fulfillment-worker-secret'] || event.headers?.['X-Fulfillment-Worker-Secret'] || '';
  if (!expected || supplied !== expected) return json(401, { error: 'Unauthorized' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  if (!body.fulfillmentId) return json(400, { error: 'fulfillmentId is required' });

  try {
    const outcome = await processOne(getAdminClient(), { id: body.fulfillmentId });
    console.log(`[FulfillmentWorker] ${body.fulfillmentId}: ${outcome}`);
    return json(200, { ok: true, outcome });
  } catch (error) {
    console.error(`[FulfillmentWorker] ${body.fulfillmentId}:`, error.message);
    // Background functions are retried by the scheduled sweeper through the
    // persisted lease/retry fields; do not create a second ticket batch here.
    return json(500, { ok: false, error: error.message });
  }
};
