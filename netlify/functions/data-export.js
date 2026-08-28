// netlify/functions/data-export.js
//
// Phase 4 (4.2): DPPA 2019 right of access/portability — returns the calling
// user's personal data (profile, tickets, refunds, installment plans) as JSON.

const { requireUser, json } = require('../shared/supabaseAdmin');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const { admin, authUser, profile } = await requireUser(event);

    const email = (profile && profile.email) || authUser.email || '';
    const profileRow = profile || {};

    const { data: tickets } = await admin.from('tickets').select('*')
      .or(`buyer_email.eq.${email}`)
      .order('created_at', { ascending: false }).limit(500);

    const { data: refunds } = await admin.from('refund_requests').select('*')
      .eq('buyer_email', email).order('created_at', { ascending: false }).limit(200);

    const { data: plans } = await admin.from('ticket_installment_plans').select('*')
      .eq('buyer_email', email).order('created_at', { ascending: false }).limit(100);

    const { data: tokens } = await admin.from('notification_tokens').select('*')
      .eq('user_id', authUser.id).limit(100);

    return json(200, {
      success: true,
      exported_at: new Date().toISOString(),
      user: { id: authUser.id, email, user_type: profileRow.user_type || null },
      profile: profileRow,
      tickets: (tickets || []).map((t) => ({
        id: t.id, event_slug: t.event_slug, event_name: t.event_name, ticket_ref: t.ticket_ref,
        entry_fee_type: t.entry_fee_type, total_amount: t.total_amount, status: t.status,
        purchase_date: t.purchase_date, buyer_name: t.buyer_name, buyer_email: t.buyer_email,
        buyer_phone: t.buyer_phone, seat_number: t.seat_number, table_number: t.table_number,
      })),
      refunds: (refunds || []),
      installment_plans: (plans || []),
      notification_tokens: (tokens || []),
    });
  } catch (error) {
    console.error('data-export error', error);
    return json(error.statusCode || 500, { error: error.message || 'Export failed' });
  }
};
