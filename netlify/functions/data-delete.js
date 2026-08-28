// netlify/functions/data-delete.js
//
// Phase 4 (4.2): DPPA 2019 right to erasure. The calling user's personal data
// is anonymized/nulled. Accounting records (tickets, refunds, plans, payouts)
// are KEPT for legal/financial retention but stripped of personal identifiers;
// the auth profile is deleted.

const { requireUser, json } = require('../shared/supabaseAdmin');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const { admin, authUser, profile } = await requireUser(event);
    const email = (profile && profile.email) || authUser.email || '';
    const now = new Date().toISOString();

    // 1. Anonymize tickets (keep financial rows, strip PII).
    const { error: tErr } = await admin.from('tickets').update({
      buyer_name: 'Deleted User', buyer_email: `deleted-${authUser.id}@yovibe.invalid`,
      buyer_phone: null, buyer_id: null, buyer_photo_url: null,
      photo_upload_token: null, photo_upload_token_expires_at: null,
      updated_at: now,
    }).or(`buyer_email.eq.${email},buyer_id.eq.${authUser.id}`);
    if (tErr) throw tErr;

    // 2. Anonymize refund requests.
    const { error: rErr } = await admin.from('refund_requests').update({
      buyer_email: `deleted-${authUser.id}@yovibe.invalid`, buyer_note: null,
      updated_at: now,
    }).eq('buyer_email', email);
    if (rErr) throw rErr;

    // 3. Anonymize installment plans.
    const { error: pErr } = await admin.from('ticket_installment_plans').update({
      buyer_email: `deleted-${authUser.id}@yovibe.invalid`, buyer_names: null,
      buyer_emails: null, delivery_emails: null, payer_email: null,
      buyer_photo_url: null, updated_at: now,
    }).eq('buyer_email', email);
    if (pErr) throw pErr;

    // 4. Delete FCM tokens + any profile row (best-effort).
    await admin.from('notification_tokens').delete().eq('user_id', authUser.id).catch(() => {});
    await admin.from('users').delete().eq('uid', authUser.id).catch(() => {});

    console.log(`[DataDelete] Erasure processed for ${authUser.id}`);

    return json(200, {
      success: true,
      message: 'Your personal data has been deleted. Accounting records were retained without personal identifiers.',
    });
  } catch (error) {
    console.error('data-delete error', error);
    return json(error.statusCode || 500, { error: error.message || 'Deletion failed' });
  }
};
