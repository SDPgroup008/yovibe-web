const { requireUser, json } = require('../shared/supabaseAdmin');

const PAGE_SIZE = 1000;
const DAY_MS = 86400000;
const KAMPALA_OFFSET_MS = 3 * 60 * 60 * 1000;

function kampalaDate(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp + KAMPALA_OFFSET_MS).toISOString().slice(0, 10) : null;
}

async function readAll(admin, table, columns, configure = (query) => query) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const query = configure(admin.from(table).select(columns)).order('id', { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

function dailyBuckets(days, now) {
  const today = Math.floor((now.getTime() + KAMPALA_OFFSET_MS) / DAY_MS) * DAY_MS;
  return Array.from({ length: days }, (_, index) => ({
    date: new Date(today - (days - 1 - index) * DAY_MS).toISOString().slice(0, 10),
    count: 0,
  }));
}

async function getTokenAnalytics(admin, now = new Date()) {
  const rows = await readAll(admin, 'notification_tokens', 'id,is_active,is_authenticated,subscribed_at');
  const daily = dailyBuckets(7, now);
  const buckets = new Map(daily.map((day) => [day.date, day]));
  for (const row of rows) {
    const bucket = buckets.get(kampalaDate(row.subscribed_at));
    if (bucket) bucket.count += 1;
  }
  return {
    total: rows.length,
    active: rows.filter((row) => row.is_active === true).length,
    inactive: rows.filter((row) => row.is_active === false).length,
    unknownStatus: rows.filter((row) => row.is_active == null).length,
    authenticated: rows.filter((row) => row.is_authenticated === true).length,
    guest: rows.filter((row) => row.is_authenticated === false).length,
    unknownAuth: rows.filter((row) => row.is_authenticated == null).length,
    missingSubscriptionDates: rows.filter((row) => !row.subscribed_at).length,
    daily,
  };
}

async function getBroadcastAnalytics(admin, now = new Date()) {
  const daily = dailyBuckets(7, now);
  const firstDay = new Date(Date.parse(`${daily[0].date}T00:00:00.000Z`) - KAMPALA_OFFSET_MS).toISOString();
  const end = new Date(Date.parse(firstDay) + 7 * DAY_MS).toISOString();
  const rows = await readAll(admin, 'notifications', 'id,created_at,data',
    (query) => query.is('user_id', null).gte('created_at', firstDay).lt('created_at', end));
  const buckets = new Map(daily.map((day) => [day.date, day]));
  const summary = { broadcasts: 0, withDeliveryData: 0, targeted: 0, accepted: 0, failed: 0, invalid: 0, recordedOpens: null };
  const broadcastIds = new Set();
  for (const row of rows) {
    if (!['today', 'week'].includes(row.data?.summaryMode)) continue;
    summary.broadcasts += 1;
    broadcastIds.add(row.id);
    const delivery = row.data?.delivery;
    if (!delivery || !['targeted', 'successful', 'failed', 'stale'].every((key) => Number.isInteger(delivery[key]) && delivery[key] >= 0)) continue;
    summary.withDeliveryData += 1;
    summary.targeted += delivery.targeted;
    summary.accepted += delivery.successful;
    summary.failed += delivery.failed;
    summary.invalid += delivery.stale;
    const bucket = buckets.get(kampalaDate(row.created_at));
    if (bucket) bucket.count += delivery.successful;
  }
  let opens = 0;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin.from('notification_installation_opens')
      .select('notification_id,installation_id').gte('opened_at', firstDay)
      .order('notification_id', { ascending: true }).order('installation_id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error && ['42P01', 'PGRST205'].includes(error.code)) break;
    if (error) throw error;
    opens += (data || []).filter((row) => broadcastIds.has(row.notification_id)).length;
    if (!data || data.length < PAGE_SIZE) { summary.recordedOpens = opens; break; }
  }
  return { ...summary, daily };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { admin, profile } = await requireUser(event);
    if (String(profile?.user_type || '').toLowerCase() !== 'admin') return json(403, { error: 'Admin access required' });
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid request body' }); }
    if (!['tokens', 'notifications'].includes(body.tab)) return json(400, { error: 'Invalid analytics tab' });
    const data = body.tab === 'tokens' ? await getTokenAnalytics(admin) : await getBroadcastAnalytics(admin);
    return json(200, { timezone: 'Africa/Kampala', tab: body.tab, data });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('[AdminNotificationAnalytics] query failed:', error.code || 'unknown');
    return json(status, { error: status >= 500 ? 'Unable to load notification analytics' : error.message });
  }
};

module.exports = { handler: exports.handler, kampalaDate, getTokenAnalytics, getBroadcastAnalytics };
