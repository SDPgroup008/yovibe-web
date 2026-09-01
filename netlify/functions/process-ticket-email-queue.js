// Scheduled email worker. Ticket creation never waits for this function.

const { getAdminClient } = require('../shared/supabaseAdmin');
const { sendTicketEmail } = require('../shared/ticketFulfillment');

const BATCH_SIZE = 10;
const LEASE_SECONDS = 300;

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  // Netlify's scheduled invocation and dashboard "Run now" action can use
  // POST even though this function has no caller-supplied request payload.
  if (event?.httpMethod && !['GET', 'POST'].includes(event.httpMethod)) {
    console.warn('[EmailQueue] Rejected invocation method:', event.httpMethod);
    return json(405, { error: 'Method Not Allowed' });
  }

  const now = new Date().toISOString();
  const configuredSupabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  let supabaseHost = 'not-configured';
  try {
    supabaseHost = configuredSupabaseUrl ? new URL(configuredSupabaseUrl).host : supabaseHost;
  } catch {
    supabaseHost = 'invalid-url';
  }

  console.log('[EmailQueue] Invocation started:', {
    method: event?.httpMethod || null,
    path: event?.path || null,
    scheduledHeader: event?.headers?.['x-netlify-scheduled'] || event?.headers?.['X-Netlify-Scheduled'] || null,
    supabaseHost,
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY),
    hasZeptoMailToken: Boolean(process.env.ZEPTOMAIL_TOKEN),
    hasResendKey: Boolean(process.env.RESEND_API_KEY),
    now,
  });

  try {
    const admin = getAdminClient();
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const fallbackResult = await admin
      .from('ticket_email_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('provider', 'resend-fallback')
      .gte('updated_at', startOfDay.toISOString());
    if (fallbackResult.error) {
      console.warn('[EmailQueue] Fallback-count query error:', {
        message: fallbackResult.error.message,
        code: fallbackResult.error.code || null,
      });
    }
    const fallbackCount = fallbackResult.count;
    const fallbackAllowed = (fallbackCount || 0) < 80;
    console.log('[EmailQueue] Fallback policy:', {
      fallbackCount: fallbackCount || 0,
      fallbackAllowed,
    });

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
    console.log('[EmailQueue] Queue query results:', {
      readyRows: readyResult.data?.length || 0,
      expiredSendingRows: expiredResult.data?.length || 0,
      readyError: readyResult.error ? { message: readyResult.error.message, code: readyResult.error.code || null } : null,
      expiredError: expiredResult.error ? { message: expiredResult.error.message, code: expiredResult.error.code || null } : null,
    });
    if (readyResult.error) throw readyResult.error;
    if (expiredResult.error) throw expiredResult.error;
    const candidates = [...(readyResult.data || []), ...(expiredResult.data || [])]
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .slice(0, BATCH_SIZE);
    console.log('[EmailQueue] Candidates selected:', {
      count: candidates.length,
      jobIds: candidates.map((candidate) => candidate.id),
    });

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

      if (claimError) {
        console.error('[EmailQueue] Job claim error:', {
          jobId: candidate.id,
          message: claimError.message,
          code: claimError.code || null,
        });
        throw claimError;
      }
      if (!job) {
        console.warn('[EmailQueue] Job was not claimable:', { jobId: candidate.id });
        locked++;
        continue;
      }

      try {
        console.log('[EmailQueue] Sending claimed job:', {
          jobId: job.id,
          ticketId: job.ticket_id,
          attempt: job.attempt_count,
        });
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
        console.log('[EmailQueue] Job sent:', { jobId: job.id, provider });
        sent++;
      } catch (error) {
        const attempt = job.attempt_count || 1;
        console.error('[EmailQueue] Job send failed:', {
          jobId: job.id,
          attempt,
          message: error.message || String(error),
        });
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

    console.log('[EmailQueue] Invocation completed:', {
      candidates: candidates.length,
      sent,
      failed,
      locked,
    });
    return json(200, { ok: true, candidates: (candidates || []).length, sent, failed, locked });
  } catch (error) {
    console.error('[EmailQueue] Invocation error:', {
      message: error.message || String(error),
      code: error.code || null,
    });
    return json(500, { ok: false, error: error.message });
  }
};
