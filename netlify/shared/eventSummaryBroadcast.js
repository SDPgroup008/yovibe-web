const fs = require('fs');

const KAMPALA_OFFSET_MS = 3 * 60 * 60 * 1000;
const MAX_PREVIEWS = 3;
const MAX_FCM_BYTES = 3900;
const PUBLIC_EVENTS_PATH = '/events';
// The notifications table has an existing CHECK constraint. Event-summary
// broadcasts are promotional content; summaryMode in data distinguishes
// today's and week's broadcasts without introducing a new database type.
const NOTIFICATION_TYPE = 'promotion';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function getPublicSiteUrl() {
  const value = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new Error('SITE_URL is not configured');
  return value.replace(/\/$/, '');
}

function localKampalaParts(now = new Date()) {
  const shifted = new Date(now.getTime() + KAMPALA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

function kampalaMidnightUtc(year, month, day) {
  return new Date(Date.UTC(year, month, day) - KAMPALA_OFFSET_MS);
}

function getSummaryWindow(mode, now = new Date()) {
  const local = localKampalaParts(now);
  const start = kampalaMidnightUtc(local.year, local.month, local.day);
  let end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  if (mode === 'week') {
    // Preserve the current product meaning: today through Sunday.
    const daysUntilMonday = (7 - local.weekday) || 7;
    end = new Date(start.getTime() + daysUntilMonday * 24 * 60 * 60 * 1000);
  }

  return { start: start.toISOString(), end: end.toISOString(), local };
}

function safePublicPosterUrl(value) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return undefined;
    for (const key of url.searchParams.keys()) {
      const normalized = key.toLowerCase();
      if (normalized.includes('signature') || normalized.includes('token') || normalized.includes('credential') || normalized.includes('expires')) {
        return undefined;
      }
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function trimName(value, max = 72) {
  const name = String(value || 'Event').replace(/\s+/g, ' ').trim();
  return name.length > max ? `${name.slice(0, max - 1).trim()}…` : name;
}

function buildSummaryText(mode, events) {
  const count = events.length;
  const period = mode === 'today' ? 'today' : 'this week';
  const title = mode === 'today' ? `Events happening today: ${count}` : `Events this week: ${count}`;
  if (!count) return {
    title,
    body: `No events scheduled ${period}. Tap to see more.`,
  };

  const names = events.slice(0, MAX_PREVIEWS).map((event) => trimName(event.name, 48));
  const suffix = count > MAX_PREVIEWS ? ` and ${count - MAX_PREVIEWS} more` : '';
  return {
    title,
    body: `${names.join(' • ')}${suffix}. See more events in YoVibe.`,
  };
}

async function buildSummaryPayload({ supabase, mode, now = new Date() }) {
  if (mode !== 'today' && mode !== 'week') throw new Error(`Unsupported summary mode: ${mode}`);
  const range = getSummaryWindow(mode, now);
  const { data, error } = await supabase
    .from('events')
    .select('slug,name,date,poster_image_url')
    .eq('is_deleted', false)
    .gte('date', range.start)
    .lt('date', range.end)
    .order('date', { ascending: true });

  if (error) throw error;

  const events = (data || []).map((event) => ({
    slug: String(event.slug || ''),
    name: trimName(event.name),
    posterUrl: safePublicPosterUrl(event.poster_image_url),
    date: event.date || null,
  })).filter((event) => event.slug);

  const previews = events.slice(0, MAX_PREVIEWS);
  const text = buildSummaryText(mode, events);
  return {
    mode,
    range,
    events,
    previews,
    title: text.title,
    body: text.body,
    imageUrl: previews[0]?.posterUrl,
    deepLink: `${getPublicSiteUrl()}${PUBLIC_EVENTS_PATH}`,
  };
}

function serializeEventPreviews(previews) {
  return JSON.stringify(previews.map((event) => ({
    slug: event.slug,
    name: event.name,
    posterUrl: event.posterUrl || null,
  })));
}

function buildFcmMessage(summary, notificationId, dedupeKey) {
  const data = {
    type: 'upcoming_summary',
    summaryMode: summary.mode,
    notificationId: String(notificationId || ''),
    dedupeKey,
    eventIds: JSON.stringify(summary.previews.map((event) => event.slug)),
    eventPreviews: serializeEventPreviews(summary.previews),
    totalEventCount: String(summary.events.length),
    ...(summary.imageUrl ? { imageUrl: summary.imageUrl } : {}),
    deepLink: summary.deepLink,
    url: summary.deepLink,
    rangeStart: summary.range.start,
    rangeEnd: summary.range.end,
  };

  const message = {
    message: {
      notification: {
        title: summary.title,
        body: summary.body,
        ...(summary.imageUrl ? { image: summary.imageUrl } : {}),
      },
      data,
      webpush: {
        headers: {
          TTL: '86400',
        },
        fcm_options: { link: summary.deepLink },
      },
    },
  };

  if (Buffer.byteLength(JSON.stringify(message), 'utf8') <= MAX_FCM_BYTES) return message;

  // Keep the complete previews in Supabase, but compact the push payload if URLs are long.
  data.eventPreviews = JSON.stringify(summary.previews.map((event) => ({
    slug: event.slug,
    name: trimName(event.name, 32),
  })));
  if (Buffer.byteLength(JSON.stringify(message), 'utf8') <= MAX_FCM_BYTES) return message;

  data.eventPreviews = '[]';
  data.eventIds = JSON.stringify(summary.previews.map((event) => event.slug));
  return message;
}

function buildMulticastMessage(summary, notificationId, dedupeKey) {
  const httpMessage = buildFcmMessage(summary, notificationId, dedupeKey).message;
  return {
    notification: httpMessage.notification,
    data: httpMessage.data,
    webpush: {
      headers: httpMessage.webpush.headers,
      fcmOptions: { link: summary.deepLink },
    },
  };
}

function loadServiceAccount() {
  const configuredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (configuredPath && fs.existsSync(configuredPath)) {
    try {
      return JSON.parse(fs.readFileSync(configuredPath, 'utf8'));
    } catch {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not valid JSON');
    }
  }

  const raw = requiredEnv('FIREBASE_SERVICE_ACCOUNT');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
  }
}

let firebaseMessaging;

function getFirebaseMessaging() {
  if (firebaseMessaging) return firebaseMessaging;
  const { cert, getApps, initializeApp } = require('firebase-admin/app');
  const { getMessaging } = require('firebase-admin/messaging');
  const app = getApps()[0] || initializeApp({
    credential: cert(loadServiceAccount()),
    projectId: requiredEnv('FIREBASE_PROJECT_ID'),
  });
  firebaseMessaging = getMessaging(app);
  return firebaseMessaging;
}

async function listActiveTokens(supabase) {
  const tokens = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('notification_tokens')
      .select('token')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data || []).map((row) => row.token).filter(Boolean);
    tokens.push(...page);
    if (page.length < pageSize) break;
  }
  return [...new Set(tokens)];
}

function isStaleTokenError(error) {
  return error?.code === 'messaging/registration-token-not-registered'
    || error?.code === 'messaging/invalid-registration-token';
}

async function markStaleTokensInactive(supabase, tokens) {
  if (!tokens.length) return 0;
  const { error } = await supabase
    .from('notification_tokens')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .in('token', tokens);
  if (error) throw error;
  return tokens.length;
}

async function sendToActiveTokens({ supabase, message }) {
  const tokens = await listActiveTokens(supabase);
  if (!tokens.length) {
    return { targeted: 0, successful: 0, failed: 0, stale: 0 };
  }

  const messaging = getFirebaseMessaging();
  const stats = { targeted: tokens.length, successful: 0, failed: 0, stale: 0 };
  const batchSize = 500;

  for (let offset = 0; offset < tokens.length; offset += batchSize) {
    const batch = tokens.slice(offset, offset + batchSize);
    const response = await messaging.sendEachForMulticast({ ...message, tokens: batch });
    const staleTokens = [];
    response.responses.forEach((result, index) => {
      if (result.success) {
        stats.successful += 1;
      } else {
        stats.failed += 1;
        if (isStaleTokenError(result.error)) staleTokens.push(batch[index]);
      }
    });
    stats.stale += await markStaleTokensInactive(supabase, staleTokens);
  }

  return stats;
}

async function findExistingBroadcast(supabase, dedupeKey) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id,data')
    .is('user_id', null)
    .eq('type', NOTIFICATION_TYPE)
    .contains('data', { dedupeKey })
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function updateNotificationData(supabase, notificationId, data) {
  const { error } = await supabase
    .from('notifications')
    .update({ data })
    .eq('id', notificationId);
  if (error) throw error;
}

async function sendEventSummaryBroadcast({ supabase, mode, now = new Date(), slot }) {
  const summary = await buildSummaryPayload({ supabase, mode, now });
  const local = summary.range.local;
  const fallbackSlot = mode === 'today'
    ? ((new Date(now.getTime() + KAMPALA_OFFSET_MS)).getUTCHours() < 13 ? '09' : '18')
    : ((new Date(now.getTime() + KAMPALA_OFFSET_MS)).getUTCHours() < 16 ? '11' : '20');
  const dedupeKey = `${mode}:${String(local.year).padStart(4, '0')}-${String(local.month + 1).padStart(2, '0')}-${String(local.day).padStart(2, '0')}:${slot || fallbackSlot}`;
  const existing = await findExistingBroadcast(supabase, dedupeKey);
  if (existing?.data?.deliveryStatus === 'sent') {
    return { skipped: true, reason: 'already_sent', notificationId: existing.id, dedupeKey, count: summary.events.length };
  }

  let notificationId = existing?.id;
  let notificationData = existing?.data || {
    dedupeKey,
    summaryMode: mode,
    eventPreviews: summary.previews,
    eventIds: summary.previews.map((event) => event.slug),
    totalEventCount: summary.events.length,
    deliveryStatus: 'pending',
  };
  notificationData = {
    ...notificationData,
    dedupeKey,
    summaryMode: mode,
    eventPreviews: summary.previews,
    eventIds: summary.previews.map((event) => event.slug),
    totalEventCount: summary.events.length,
    deliveryStatus: 'pending',
  };

  if (!notificationId) {
    const { data, error } = await supabase.from('notifications').insert({
      user_id: null,
      title: summary.title,
      body: summary.body,
      type: NOTIFICATION_TYPE,
      data: notificationData,
      image_url: summary.imageUrl || null,
      deep_link: summary.deepLink,
      is_read: false,
      created_at: new Date().toISOString(),
    }).select('id').single();
    if (error) throw error;
    notificationId = data.id;
  }

  await updateNotificationData(supabase, notificationId, notificationData);

  const message = buildMulticastMessage(summary, notificationId, dedupeKey);
  try {
    const delivery = await sendToActiveTokens({ supabase, message });
    notificationData = {
      ...notificationData,
      deliveryStatus: delivery.successful > 0 ? 'sent' : 'no_active_tokens',
      delivery,
      sentAt: new Date().toISOString(),
      eventPreviews: summary.previews,
      eventIds: summary.previews.map((event) => event.slug),
      totalEventCount: summary.events.length,
    };
    await updateNotificationData(supabase, notificationId, notificationData);
    return { skipped: false, sent: delivery.successful > 0, notificationId, dedupeKey, count: summary.events.length, delivery };
  } catch (error) {
    notificationData = {
      ...notificationData,
      deliveryStatus: 'failed',
      lastError: error.message,
      failedAt: new Date().toISOString(),
    };
    await updateNotificationData(supabase, notificationId, notificationData);
    throw error;
  }
}

module.exports = {
  buildSummaryPayload,
  buildFcmMessage,
  buildMulticastMessage,
  getSummaryWindow,
  sendToActiveTokens,
  sendEventSummaryBroadcast,
};
