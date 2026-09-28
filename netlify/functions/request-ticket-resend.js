const crypto = require('crypto');
const { getAdminClient } = require('../shared/supabaseAdmin');
const { handler: sendTicketEmail } = require('./send-ticket-email');

const GENERIC_MESSAGE = 'If tickets exist for that email address, they have been sent again.';
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const attempts = new Map();

const response = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function tooManyRequests(event, email) {
  const ip = event.headers?.['x-nf-client-connection-ip'] || event.headers?.['x-forwarded-for']?.split(',')[0] || 'unknown';
  const key = crypto.createHash('sha256').update(`${ip}|${email}`).digest('hex');
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((time) => now - time < WINDOW_MS);
  recent.push(now); attempts.set(key, recent);
  return recent.length > MAX_ATTEMPTS;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });
  const startedAt = Date.now();
  try {
    const body = JSON.parse(event.body || '{}');
    const email = normalizeEmail(body.email);
    if (!isEmail(email) || tooManyRequests(event, email)) return response(200, { message: GENERIC_MESSAGE });
    const admin = getAdminClient();
    const { data: tickets, error } = await admin.from('tickets').select('*').eq('buyer_email', email).in('status', ['active', 'used']);
    if (error) throw error;
    for (const ticket of tickets || []) {
      const start = ticket.event_start_time ? new Date(ticket.event_start_time) : ticket.event_date ? new Date(ticket.event_date) : null;
      await sendTicketEmail({
        httpMethod: 'POST', headers: {},
        body: JSON.stringify({
          buyerEmail: ticket.buyer_email, buyerName: ticket.buyer_name,
          eventName: ticket.event_name, ticketType: ticket.entry_fee_type,
          venue: ticket.venue_name, ticketRef: ticket.ticket_ref,
          qrCodeDataUrl: ticket.qr_code_data_url,
          date: start ? start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '',
          time: start ? start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
          seatNumber: ticket.seat_number || undefined, tableNumber: ticket.table_number || undefined,
          tableGroupId: ticket.table_group_id || undefined, posterUrl: ticket.poster_image_url || undefined,
        }),
      });
    }
  } catch (error) {
    console.error('request-ticket-resend failed:', error.message);
  }
  const remaining = Math.max(0, 300 - (Date.now() - startedAt));
  if (remaining) await new Promise((resolve) => setTimeout(resolve, remaining));
  return response(200, { message: GENERIC_MESSAGE });
};
