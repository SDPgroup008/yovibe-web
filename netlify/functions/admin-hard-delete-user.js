// Administrator-only permanent account deletion. It fails closed rather than
// cascading business, financial, ownership, or FK-dependent records.

const crypto = require('crypto');
const { requireUser, json } = require('../shared/supabaseAdmin');

const PAGE_SIZE = 1000;
const REVOCATION_TTL_HOURS = Math.max(
  1,
  Math.min(24 * 30, Number.parseInt(process.env.ACCOUNT_REVOCATION_TTL_HOURS || '48', 10) || 48),
);

function clientError(message, statusCode = 400, extra = {}) {
  return Object.assign(new Error(message), { statusCode, ...extra });
}

function isAdmin(profile) {
  return String(profile?.user_type || '').toLowerCase() === 'admin';
}

function hasDeleteConfirmation(value) {
  return String(value || '').trim() === 'DELETE';
}

function isMissingRelation(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' || (message.includes('relation') && message.includes('does not exist'));
}

function isAuthUserMissing(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || '').toLowerCase();
  return status === 404 || message.includes('user not found') || message.includes('not found');
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

async function idsForQuery(admin, table, applyFilter) {
  const ids = new Set();
  let offset = 0;
  while (true) {
    let query = admin.from(table).select('id').range(offset, offset + PAGE_SIZE - 1);
    query = applyFilter(query);
    const { data, error } = await query;
    if (error) throw error;
    for (const row of data || []) ids.add(String(row.id));
    if (!data || data.length < PAGE_SIZE) break;
    offset += data.length;
  }
  return ids;
}

async function countMatches(admin, table, filters) {
  const ids = new Set();
  for (const filter of filters) {
    const matches = await idsForQuery(admin, table, filter);
    for (const id of matches) ids.add(id);
  }
  return ids.size;
}

function addBlock(blockers, key, label, count) {
  if (count > 0) blockers.push({ key, label, count });
}

async function loadTarget(admin, userId) {
  const { data, error } = await admin
    .from('users')
    .select('id,uid,email,user_type,is_deleted')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw clientError('User not found', 404);
  if (data.is_deleted === true) throw clientError('Deleted users cannot be permanently deleted from this screen', 409);
  if (!data.uid) throw clientError('This user has no linked authentication account', 409);
  return data;
}

async function authAccountExists(admin, authUserId) {
  const { data, error } = await admin.auth.admin.getUserById(authUserId);
  if (error && !isAuthUserMissing(error)) throw error;
  return Boolean(data?.user);
}

async function buildBlockers(admin, target) {
  const profileIds = uniqueValues([target.id]);
  const authIds = uniqueValues([target.uid]);
  const accountIds = uniqueValues([target.id, target.uid]);
  const email = String(target.email || '').trim();
  const blockers = [];

  addBlock(blockers, 'events', 'Events created by this user', await countMatches(admin, 'events', [
    (query) => query.in('created_by', profileIds),
    (query) => query.in('created_by_auth', authIds),
  ]));
  addBlock(blockers, 'venues', 'Venues owned by this user', await countMatches(admin, 'venues', [
    (query) => query.in('owner_id', profileIds),
  ]));
  addBlock(blockers, 'venue_gallery', 'Venue gallery images created by this user', await countMatches(admin, 'venue_gallery', [
    (query) => query.in('created_by', profileIds),
  ]));
  addBlock(blockers, 'staff_tokens', 'Active or historical staff tokens created by this user', await countMatches(admin, 'event_staff_tokens', [
    (query) => query.in('created_by', authIds),
  ]));
  addBlock(blockers, 'payout_eligibility_settings', 'Payout eligibility settings changed by this user', await countMatches(admin, 'event_payout_eligibility_settings', [
    (query) => query.in('changed_by', authIds),
  ]));
  addBlock(blockers, 'payout_eligibility_audit', 'Payout eligibility audit records created by this user', await countMatches(admin, 'event_payout_eligibility_audit', [
    (query) => query.in('changed_by', authIds),
  ]));
  addBlock(blockers, 'tickets', 'Ticket purchase records', await countMatches(admin, 'tickets', [
    (query) => query.in('buyer_id', accountIds),
    ...(email ? [(query) => query.eq('buyer_email', email)] : []),
  ]));
  addBlock(blockers, 'payouts', 'Payout or organiser wallet records', await countMatches(admin, 'payouts', [
    (query) => query.in('organizer_id', accountIds),
  ]) + await countMatches(admin, 'organizer_wallets', [
    (query) => query.in('organizer_id', accountIds),
  ]));
  addBlock(blockers, 'refunds', 'Refund records', await countMatches(admin, 'refund_requests', [
    (query) => query.in('buyer_id', accountIds),
    ...(email ? [(query) => query.eq('buyer_email', email)] : []),
  ]));
  addBlock(blockers, 'installments', 'Installment plan records', await countMatches(admin, 'ticket_installment_plans', [
    (query) => query.in('buyer_id', accountIds),
    ...(email ? [(query) => query.eq('buyer_email', email)] : []),
  ]));
  addBlock(blockers, 'fulfillments', 'Pending ticket fulfilment records', await countMatches(admin, 'pending_ticket_fulfillments', [
    (query) => query.in('buyer_id', profileIds),
    ...(email ? [(query) => query.eq('buyer_email', email)] : []),
  ]));
  addBlock(blockers, 'ownership_requests', 'Venue ownership requests', await countMatches(admin, 'venue_ownership_requests', [
    (query) => query.in('user_id', profileIds),
    (query) => query.in('reviewed_by', profileIds),
  ]));
  addBlock(blockers, 'vibe_images', 'Uploaded vibe images', await countMatches(admin, 'vibe_images', [
    (query) => query.in('uploaded_by', profileIds),
  ]));
  addBlock(blockers, 'admin_records', 'Administrator records', await countMatches(admin, 'admins', [
    (query) => query.in('user_id', profileIds),
  ]));
  return blockers;
}

async function preflight(admin, authUser, profile, userId) {
  const target = await loadTarget(admin, userId);
  if (isAdmin(target)) throw clientError('Administrator accounts cannot be permanently deleted here', 403);
  if (String(target.id) === String(profile?.id || '') || String(target.uid) === String(authUser.id)) {
    throw clientError('You cannot permanently delete your own account', 409);
  }
  const [blockers, authExists] = await Promise.all([
    buildBlockers(admin, target),
    authAccountExists(admin, target.uid),
  ]);
  return { target, authExists, blockers, canHardDelete: blockers.length === 0 };
}

async function ensureRevocationSupport(admin, targetAuthId, revokedBy) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REVOCATION_TTL_HOURS * 60 * 60 * 1000).toISOString();
  await admin.from('account_access_revocations').delete().lt('expires_at', now.toISOString());
  const { error } = await admin.from('account_access_revocations').upsert({
    auth_user_id: targetAuthId,
    revoked_at: now.toISOString(),
    expires_at: expiresAt,
    revoked_by: revokedBy,
  }, { onConflict: 'auth_user_id' });
  if (error && isMissingRelation(error)) throw clientError('Hard-delete migration has not been applied yet', 503);
  if (error) throw error;
}

async function anonymizeAnalytics(admin, profileId) {
  const previousKey = `account:${profileId}`;
  const replacementVisitorId = `erased-${crypto.randomUUID()}`;
  const replacementKey = `guest:${replacementVisitorId}`;
  const { data: visitor, error: visitorError } = await admin
    .from('analytics_visitor_profiles')
    .select('canonical_visitor_key')
    .eq('canonical_visitor_key', previousKey)
    .maybeSingle();
  if (visitorError) throw visitorError;
  if (visitor) {
    const { error: rekeyError } = await admin
      .from('analytics_visitor_profiles')
      .update({ canonical_visitor_key: replacementKey, updated_at: new Date().toISOString() })
      .eq('canonical_visitor_key', previousKey);
    if (rekeyError) throw rekeyError;
  }
  const replacement = {
    user_id: null,
    unique_visitor_id: replacementVisitorId,
    canonical_visitor_key: replacementKey,
    is_authenticated: false,
    user_agent: null,
  };
  const { error: keyedSessionError } = await admin
    .from('analytics_sessions')
    .update(replacement)
    .eq('canonical_visitor_key', previousKey);
  if (keyedSessionError) throw keyedSessionError;
  const { error: legacySessionError } = await admin
    .from('analytics_sessions')
    .update(replacement)
    .eq('user_id', profileId);
  if (legacySessionError) throw legacySessionError;
}

async function deleteSupportingRows(admin, target) {
  const allIds = uniqueValues([target.id, target.uid]);
  const requiredCleanup = [
    admin.from('notification_tokens').delete().in('user_id', allIds),
    admin.from('notifications').delete().in('user_id', allIds),
    admin.from('payout_otps').delete().eq('user_id', target.uid),
  ];
  const results = await Promise.all(requiredCleanup);
  for (const result of results) if (result.error) throw result.error;

  // Notification state is an optional enhancement table. Older projects can
  // safely continue hard deletion without it because user-specific notification
  // rows and FCM tokens are still removed above.
  const { error: stateError } = await admin
    .from('notification_user_states')
    .delete()
    .in('user_id', allIds);
  if (stateError && !isMissingRelation(stateError)) throw stateError;

  await anonymizeAnalytics(admin, target.id);
}

async function deleteAuthAccount(admin, target) {
  const { error } = await admin.auth.admin.deleteUser(target.uid, false);
  if (error && !isAuthUserMissing(error)) throw error;
}

async function deletePublicProfile(admin, target) {
  const { data, error } = await admin
    .from('users')
    .delete()
    .eq('id', target.id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw clientError('Authentication was removed but public-profile cleanup is pending. Retry the action.', 409, { cleanupPending: true });
  }
}

function preflightResponse(result) {
  return {
    canHardDelete: result.canHardDelete,
    authAlreadyDeleted: !result.authExists,
    blockers: result.blockers,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }, body: '' };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { admin, authUser, profile } = await requireUser(event);
    if (!isAdmin(profile)) return json(403, { error: 'Admin access required' });
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }
    const action = String(body.action || 'preflight').trim();
    const userId = String(body.userId || '').trim();
    if (!['preflight', 'delete'].includes(action) || !userId) {
      return json(400, { error: 'A valid action and userId are required' });
    }
    const result = await preflight(admin, authUser, profile, userId);
    if (action === 'preflight') return json(200, preflightResponse(result));
    if (!hasDeleteConfirmation(body.confirmationPhrase)) {
      return json(422, { error: 'Type DELETE to confirm permanent deletion' });
    }
    if (!result.canHardDelete) {
      return json(409, { error: 'This user has records that prevent permanent deletion', ...preflightResponse(result) });
    }
    await ensureRevocationSupport(admin, result.target.uid, authUser.id);
    await deleteSupportingRows(admin, result.target);
    await deleteAuthAccount(admin, result.target);
    try {
      await deletePublicProfile(admin, result.target);
    } catch (error) {
      if (error.cleanupPending) return json(409, { error: error.message, cleanupPending: true });
      throw error;
    }
    return json(200, { success: true, userId: result.target.id });
  } catch (error) {
    console.error('[AdminHardDeleteUser] Error:', error.message);
    return json(error.statusCode || 500, { error: error.message || 'Unable to permanently delete this user' });
  }
};

module.exports = {
  handler: exports.handler,
  isAdmin,
  hasDeleteConfirmation,
  isMissingRelation,
  isAuthUserMissing,
  preflightResponse,
};
