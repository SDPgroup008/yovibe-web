const { requireUser, json } = require('../shared/supabaseAdmin');

const KAMPALA_OFFSET_MS = 3 * 60 * 60 * 1000;
const PERIODS = new Set(['day', 'week', 'month', 'year', 'decade']);

function kampalaParts(value = new Date()) {
  const date = new Date(new Date(value).getTime() + KAMPALA_OFFSET_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate(), hour: date.getUTCHours(), weekday: date.getUTCDay() };
}
function kampalaStart(year, month, day, hour = 0) {
  return new Date(Date.UTC(year, month, day, hour) - KAMPALA_OFFSET_MS);
}
function rangeFor(period, now = new Date()) {
  const p = kampalaParts(now);
  if (period === 'day') { const start = kampalaStart(p.year, p.month, p.day); return { start, end: new Date(start.getTime() + 86400000) }; }
  if (period === 'week') { const start = kampalaStart(p.year, p.month, p.day - p.weekday); return { start, end: new Date(start.getTime() + 7 * 86400000) }; }
  if (period === 'month') { const start = kampalaStart(p.year, p.month, 1); return { start, end: kampalaStart(p.year, p.month + 1, 1) }; }
  if (period === 'year') return { start: kampalaStart(p.year, 0, 1), end: kampalaStart(p.year + 1, 0, 1) };
  const decade = Math.floor(p.year / 10) * 10;
  return { start: kampalaStart(decade, 0, 1), end: kampalaStart(decade + 10, 0, 1) };
}
function bucketDefinitions(period, range) {
  const start = kampalaParts(range.start);
  if (period === 'day') return Array.from({ length: 24 }, (_, hour) => ({ key: String(hour).padStart(2, '0') + ':00', hour }));
  if (period === 'week') return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((key, day) => ({ key, day }));
  if (period === 'month') {
    const days = new Date(start.year, start.month + 1, 0).getDate();
    return Array.from({ length: Math.ceil((days + start.weekday) / 7) }, (_, week) => ({ key: `Week ${week + 1}`, week }));
  }
  if (period === 'year') return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((key, month) => ({ key, month }));
  return Array.from({ length: 10 }, (_, offset) => ({ key: String(start.year + offset), year: start.year + offset }));
}
function bucketIndex(period, value, range) {
  const p = kampalaParts(value); const start = kampalaParts(range.start);
  if (period === 'day') return p.hour;
  if (period === 'week') return p.weekday;
  if (period === 'month') return Math.floor((p.day + start.weekday - 1) / 7);
  if (period === 'year') return p.month;
  return p.year - start.year;
}
async function paged(admin, table, columns, filters = []) {
  const rows = []; let from = 0;
  while (true) {
    let query = admin.from(table).select(columns).range(from, from + 999);
    for (const filter of filters) query = filter(query);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
    from += 1000;
  }
}
async function visitorProfiles(admin, keys) {
  const rows = [];
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  for (let offset = 0; offset < uniqueKeys.length; offset += 500) {
    const { data, error } = await admin
      .from('analytics_visitor_profiles')
      .select('canonical_visitor_key,first_seen_at')
      .in('canonical_visitor_key', uniqueKeys.slice(offset, offset + 500));
    if (error) throw error;
    rows.push(...(data || []));
  }
  return new Map(rows.map((row) => [row.canonical_visitor_key, row.first_seen_at]));
}
function aggregate(period, sessions, firstSeen, range) {
  const definitions = bucketDefinitions(period, range);
  const buckets = definitions.map((definition) => ({ ...definition, sessions: 0, newVisitors: 0, returningVisitors: 0, uniqueVisitors: 0 }));
  const inBucket = buckets.map(() => new Set());
  const newInBucket = buckets.map(() => new Set());
  const returnInBucket = buckets.map(() => new Set());
  const rangeVisitors = new Set(); const newRange = new Set(); const returningRange = new Set(); let unidentifiedSessions = 0;
  for (const row of sessions) {
    const index = bucketIndex(period, row.start_time, range);
    if (index < 0 || index >= buckets.length) continue;
    buckets[index].sessions += 1;
    const key = row.canonical_visitor_key;
    const first = key ? firstSeen.get(key) : null;
    if (!key || !first) { unidentifiedSessions += 1; continue; }
    inBucket[index].add(key); rangeVisitors.add(key);
    if (new Date(first) >= range.start && new Date(first) < range.end) newRange.add(key); else if (new Date(first) < range.start) returningRange.add(key);
    const bucketRangeStart = new Date(Math.max(bucketStart(period, index, range).getTime(), range.start.getTime()));
    if (new Date(first) >= bucketRangeStart && new Date(first) < bucketEnd(period, index, range)) newInBucket[index].add(key);
    else if (new Date(first) < bucketRangeStart) returnInBucket[index].add(key);
  }
  buckets.forEach((bucket, index) => { bucket.uniqueVisitors = inBucket[index].size; bucket.newVisitors = newInBucket[index].size; bucket.returningVisitors = returnInBucket[index].size; });
  return { buckets, totals: { sessions: sessions.length, uniqueVisitors: rangeVisitors.size, newVisitors: newRange.size, returningVisitors: returningRange.size, unidentifiedSessions } };
}
function bucketStart(period, index, range) {
  const p = kampalaParts(range.start);
  if (period === 'day') return kampalaStart(p.year, p.month, p.day, index);
  if (period === 'week') return new Date(range.start.getTime() + index * 86400000);
  if (period === 'month') return kampalaStart(p.year, p.month, 1 - p.weekday + index * 7);
  if (period === 'year') return kampalaStart(p.year, index, 1);
  return kampalaStart(p.year + index, 0, 1);
}
function bucketEnd(period, index, range) {
  const start = bucketStart(period, index, range);
  if (period === 'day') return new Date(start.getTime() + 3600000);
  if (period === 'week') return new Date(start.getTime() + 86400000);
  if (period === 'month') return new Date(start.getTime() + 7 * 86400000);
  if (period === 'year') return kampalaStart(kampalaParts(range.start).year, index + 1, 1);
  return kampalaStart(kampalaParts(range.start).year + index + 1, 0, 1);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { admin, profile } = await requireUser(event);
    if (profile?.user_type !== 'admin') return json(403, { error: 'Admin access required' });
    const body = JSON.parse(event.body || '{}');
    const action = body.action || 'period';
    if (action === 'frequent' || action === 'guests') {
      const range = action === 'frequent' ? rangeFor('day') : null;
      const rows = await paged(admin, 'analytics_sessions', 'canonical_visitor_key,user_id,is_authenticated,start_time', [
        ...(range ? [(query) => query.gte('start_time', range.start.toISOString()), (query) => query.lt('start_time', range.end.toISOString())] : []),
        ...(action === 'guests' ? [(query) => query.like('canonical_visitor_key', 'guest:%')] : []),
        (query) => query.order('start_time', { ascending: false }),
      ]);
      const grouped = new Map();
      for (const row of rows) {
        const key = row.canonical_visitor_key;
        if (!key) continue;
        const current = grouped.get(key) || { uniqueVisitorId: key, userId: row.user_id || null, isAuthenticated: Boolean(row.is_authenticated), visitCount: 0, lastVisit: row.start_time };
        current.visitCount += 1;
        if (row.start_time > current.lastVisit) current.lastVisit = row.start_time;
        grouped.set(key, current);
      }
      const visitors = [...grouped.values()].sort((a, b) => b.visitCount - a.visitCount).slice(0, action === 'frequent' ? 20 : 500);
      return json(200, { visitors });
    }
    const period = body.period;
    if (!PERIODS.has(period)) return json(400, { error: 'A valid period is required' });
    const range = rangeFor(period);
    const sessions = await paged(admin, 'analytics_sessions', 'start_time,canonical_visitor_key', [
      (query) => query.gte('start_time', range.start.toISOString()),
      (query) => query.lt('start_time', range.end.toISOString()),
      (query) => query.order('start_time', { ascending: true }),
    ]);
    const data = aggregate(period, sessions, await visitorProfiles(admin, sessions.map((session) => session.canonical_visitor_key)), range);
    return json(200, { timezone: 'Africa/Kampala', period, range: { start: range.start.toISOString(), end: range.end.toISOString() }, ...data });
  } catch (error) {
    console.error('analytics-admin failed', error?.message || error);
    return json(error?.statusCode || 500, { error: 'Visitor analytics could not be loaded' });
  }
};
