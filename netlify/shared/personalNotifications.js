const fs = require('fs');

const NOTIFICATION_TYPES = Object.freeze({
  TICKET: 'ticket_update',
  PAYOUT: 'payout_update',
});

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function publicDeepLink(path) {
  if (!path || /^https?:\/\//i.test(String(path))) return path;
  const base = String(process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  return base ? `${base}${String(path).startsWith('/') ? path : `/${path}`}` : path;
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
  try {
    return JSON.parse(requiredEnv('FIREBASE_SERVICE_ACCOUNT'));
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

function isStaleTokenError(error) {
  return error?.code === 'messaging/registration-token-not-registered'
    || error?.code === 'messaging/invalid-registration-token';
}

async function deactivateTokens(supabase, tokens) {
  if (!tokens.length) return 0;
  const { error } = await supabase
    .from('notification_tokens')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .in('token', tokens);
  if (error) throw error;
  return tokens.length;
}

async function sendToTokens(supabase, tokens, message) {
  const uniqueTokens = [...new Set((tokens || []).filter(Boolean))];
  if (!uniqueTokens.length) return { targeted: 0, successful: 0, failed: 0, stale: 0 };
  const messaging = getFirebaseMessaging();
  const stats = { targeted: uniqueTokens.length, successful: 0, failed: 0, stale: 0 };
  for (let offset = 0; offset < uniqueTokens.length; offset += 500) {
    const batch = uniqueTokens.slice(offset, offset + 500);
    const response = await messaging.sendEachForMulticast({ ...message, tokens: batch });
    const stale = [];
    response.responses.forEach((result, index) => {
      if (result.success) stats.successful += 1;
      else {
        stats.failed += 1;
        if (isStaleTokenError(result.error)) stale.push(batch[index]);
      }
    });
    stats.stale += await deactivateTokens(supabase, stale);
  }
  return stats;
}

async function sendToActiveTokens({ supabase, message }) {
  const tokens = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('notification_tokens')
      .select('token')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    tokens.push(...(data || []).map((row) => row.token).filter(Boolean));
    if ((data || []).length < 1000) break;
  }
  return sendToTokens(supabase, tokens, message);
}

async function resolveOrganizerAuthIds(supabase, eventRow) {
  const ids = new Set();
  if (eventRow?.created_by_auth) ids.add(String(eventRow.created_by_auth));
  if (eventRow?.created_by) {
    const { data } = await supabase.from('users').select('uid').eq('id', eventRow.created_by).maybeSingle();
    if (data?.uid) ids.add(String(data.uid));
  }
  return [...ids];
}

async function listAdminAuthIds(supabase) {
  const { data, error } = await supabase
    .from('users')
    .select('uid')
    .eq('user_type', 'admin')
    .not('uid', 'is', null);
  if (error) throw error;
  return [...new Set((data || []).map((row) => String(row.uid)).filter(Boolean))];
}

async function getActiveTokensForUsers(supabase, userIds) {
  if (!userIds.length) return [];
  const { data, error } = await supabase
    .from('notification_tokens')
    .select('token')
    .eq('is_active', true)
    .in('user_id', userIds);
  if (error) throw error;
  return (data || []).map((row) => row.token).filter(Boolean);
}

function pushMessage({ title, body, data, deepLink }) {
  const stringData = Object.fromEntries(Object.entries(data || {}).map(([key, value]) => [key, String(value ?? '')]));
  const absoluteDeepLink = publicDeepLink(deepLink);
  return {
    notification: { title, body },
    data: stringData,
    webpush: {
      notification: { title, body },
      fcmOptions: absoluteDeepLink ? { link: absoluteDeepLink } : undefined,
    },
  };
}

async function insertPersonalNotification(supabase, recipientId, payload) {
  const key = payload.data?.notificationKey;
  if (key) {
    const { data: existing, error } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', recipientId)
      .eq('type', payload.type)
      .contains('data', { notificationKey: key })
      .limit(1);
    if (error) throw error;
    if (existing?.length) return { id: existing[0].id, inserted: false };
  }
  const { data, error } = await supabase.from('notifications').insert({
    user_id: recipientId,
    title: payload.title,
    body: payload.body,
    type: payload.type,
    data: payload.data || {},
    image_url: payload.imageUrl || null,
    deep_link: payload.deepLink || null,
    is_read: false,
    created_at: new Date().toISOString(),
  }).select('id').single();
  if (error) throw error;
  return { id: data?.id, inserted: true };
}

async function sendPersonalNotifications({ supabase, recipientIds, payload }) {
  const ids = [...new Set((recipientIds || []).map(String).filter(Boolean))];
  if (!ids.length) return { recipients: 0, inserted: 0, delivery: { targeted: 0, successful: 0, failed: 0, stale: 0 } };
  let inserted = 0;
  for (const recipientId of ids) {
    const result = await insertPersonalNotification(supabase, recipientId, payload);
    if (result.inserted) inserted += 1;
  }
  const tokens = await getActiveTokensForUsers(supabase, ids);
  const delivery = await sendToTokens(supabase, tokens, pushMessage(payload));
  console.info('[NotificationDelivery]', { type: payload.type, kind: payload.data?.kind, recipients: ids.length, inserted, ...delivery });
  return { recipients: ids.length, inserted, delivery };
}

async function notifyEventOrganizersAndAdmins({ supabase, eventRow, payload }) {
  const [organizers, admins] = await Promise.all([
    resolveOrganizerAuthIds(supabase, eventRow),
    listAdminAuthIds(supabase),
  ]);
  return sendPersonalNotifications({ supabase, recipientIds: [...new Set([...organizers, ...admins])], payload });
}

async function loadEventForPayout(supabase, payout) {
  if (!payout?.event_id) return null;
  const { data } = await supabase.from('events').select('*').eq('slug', payout.event_id).maybeSingle();
  return data || null;
}

async function notifyPayoutTerminal({ supabase, payout, status, eventRow }) {
  const event = eventRow || await loadEventForPayout(supabase, payout);
  const eventName = event?.name || 'your event';
  const failed = status === 'failed' || status === 'rejected';
  const deepLink = event?.slug ? `/profile/organiser/${event.slug}` : '/profile/admin/dashboard';
  const payload = {
    title: failed ? '⚠️ Payout Failed' : '✅ Payout Completed',
    body: failed
      ? `Your payout for ${eventName} could not be completed. Check the payout details.`
      : `Your payout for ${eventName} has been completed.`,
    type: NOTIFICATION_TYPES.PAYOUT,
    deepLink,
    data: {
      kind: failed ? 'payout_failed' : 'payout_completed',
      notificationKey: `payout:${payout.id}:${status}`,
      payoutId: payout.id,
      eventSlug: event?.slug || payout.event_id || '',
      status,
      amount: payout.amount || 0,
    },
  };
  const [eventOrganizers, payoutOrganizer, admins] = await Promise.all([
    resolveOrganizerAuthIds(supabase, event || {}),
    payout?.organizer_id
      ? supabase.from('users').select('uid').eq('id', payout.organizer_id).maybeSingle().then(({ data }) => data?.uid ? [String(data.uid)] : [])
      : [],
    listAdminAuthIds(supabase),
  ]);
  return sendPersonalNotifications({
    supabase,
    recipientIds: [...new Set([...eventOrganizers, ...payoutOrganizer, ...admins])],
    payload,
  });
}

module.exports = {
  NOTIFICATION_TYPES,
  sendToActiveTokens,
  sendPersonalNotifications,
  notifyEventOrganizersAndAdmins,
  notifyPayoutTerminal,
  resolveOrganizerAuthIds,
  listAdminAuthIds,
};
