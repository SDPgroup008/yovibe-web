// Scheduled email worker. Ticket creation never waits for this function.

const { getAdminClient } = require('../shared/supabaseAdmin');
const { sendTicketEmail } = require('../shared/ticketFulfillment');

const BATCH_SIZE = 10;
const LEASE_SECONDS = 300;

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event?.httpMethod && event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });

  const admin = getAdminClient();
  const now = new Date().toISOString();

  try {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count: fallbackCount } = await admin
      .from('ticket_email_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('provider', 'resend-fallback')
      .gte('updated_at', startOfDay.toISOString());
    const fallbackAllowed = (fallbackCount || 0) < 80;

    const [readyResult, expiredResult] = await Promise.all([
      admin
        .from('ticket_email_jobs')
        .select('*')
        .in('status', ['pending', 'failed'])
        .lte('next_retry_at', now)
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE),
      admin
        .from('ticket_email_jobs')
        .select('*')
        .eq('status', 'sending')
        .lte('lease_expires_at', now)
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE),
    ]);
    if (readyResult.error) throw readyResult.error;
    if (expiredResult.error) throw expiredResult.error;
    const candidates = [...(readyResult.data || []), ...(expiredResult.data || [])]
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .slice(0, BATCH_SIZE);

    let sent = 0;
    let failed = 0;
    let locked = 0;

    for (const candidate of candidates || []) {
      let claimQuery = admin
        .from('ticket_email_jobs')
        .update({
          status: 'sending',
          processing_started_at: now,
          lease_expires_at: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString(),
          attempt_count: (candidate.attempt_count || 0) + 1,
          updated_at: now,
        })
        .eq('id', candidate.id);
      if (candidate.status === 'sending') {
        claimQuery = claimQuery.eq('status', 'sending').lte('lease_expires_at', now);
      } else {
        claimQuery = claimQuery.in('status', ['pending', 'failed']);
      }
      const { data: job, error: claimError } = await claimQuery.select('*').maybeSingle();

      if (claimError) throw claimError;
      if (!job) {
        locked++;
        continue;
      }

      try {
        const result = await sendTicketEmail({ ...job.payload, allowResendFallback: fallbackAllowed });
        const provider = result?.provider || 'zeptomail';
        const providerMessageId = result?.id || null;
        const { error: sentError } = await admin
          .from('ticket_email_jobs')
          .update({
            status: 'sent',
            provider,
            provider_message_id: providerMessageId,
            sent_at: new Date().toISOString(),
            lease_expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
        if (sentError) throw sentError;
        sent++;
      } catch (error) {
        const attempt = job.attempt_count || 1;
        const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.min(attempt, 6)));
        await admin
          .from('ticket_email_jobs')
          .update({
            status: attempt >= 8 ? 'failed' : 'pending',
            last_error: String(error.message || error).substring(0, 1000),
            next_retry_at: new Date(Date.now() + delayMinutes * 60 * 1000).toISOString(),
            lease_expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
        failed++;
      }
    }

    return json(200, { ok: true, candidates: (candidates || []).length, sent, failed, locked });
  } catch (error) {
    console.error('[EmailQueue] Error:', error.message);
    return json(500, { ok: false, error: error.message });
  }
};
