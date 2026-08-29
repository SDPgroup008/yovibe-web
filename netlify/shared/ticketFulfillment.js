// netlify/shared/ticketFulfillment.js
//
// Shared server-side helpers for the payment trust boundary (Phase 1):
//  - Payment verification directly against PesaPal / PawaPay
//  - Ticket QR signing (HMAC secret stays server-side only)
//  - R2 uploads (QR images, buyer security photos)
//  - Revenue split + gateway fee math (mirrors the client, 15% commission)
//  - Basic ticket creation for stranded-fulfillment retry
//
// Used by: fulfill-purchase, pesapal-ipn, pawapay-deposit-callback,
// process-stuck-fulfillments, verify-pesapal-payment, verify-pawapay-payment.

const crypto = require('crypto');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getAdminClient } = require('./supabaseAdmin');

const APP_COMMISSION_RATE = 0.15;
const QR_HOST = 'https://yovibe.net';

// ─── QR signing ─────────────────────────────────────────────────────────────

function getQrSecret() {
  const secret = process.env.QR_HMAC_SECRET;
  if (!secret) throw new Error('QR_HMAC_SECRET is not configured');
  return secret;
}

function hmacSign(ticketId, issuedAt) {
  return crypto.createHmac('sha256', getQrSecret()).update(`${ticketId}:${issuedAt}`).digest('base64url');
}

function signQrPayload(ticketId) {
  const issuedAt = Date.now();
  const signature = hmacSign(ticketId, issuedAt);
  return {
    url: `${QR_HOST}/t/${ticketId}?s=${signature}&ts=${issuedAt}`,
    signature,
    issuedAt,
  };
}

// ─── Ticket refs ────────────────────────────────────────────────────────────

function deriveTicketRef(ticketId, isTableEntry) {
  const prefix = isTableEntry ? 'YVT' : 'YV';
  const clean = ticketId.replace(/-/g, '');
  if (clean.length >= 17) {
    const a = clean[5];
    const b = clean[9];
    const c = clean.substring(14, 17);
    return `${prefix}-${a}${b}-${c}`;
  }
  throw new Error(`Unexpected ticket ID format, cannot derive ticket_ref: ${ticketId}`);
}

// ─── Event helpers ──────────────────────────────────────────────────────────

function parseStartTime(text) {
  if (!text) return null;
  const first = String(text).split('-')[0].trim();
  const match = first.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = (match[3] || '').toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function resolveEventStartTime(event) {
  const base = new Date(event.date || Date.now());
  const parsed = parseStartTime(event.time);
  if (parsed) base.setHours(parsed.hour, parsed.minute, 0, 0);
  return base;
}

// Load an event by slug (events.id maps to the public slug in the client model)
async function loadEvent(admin, eventId) {
  const { data, error } = await admin
    .from('events')
    .select('*')
    .eq('slug', eventId)
    .maybeSingle();
  if (!data && !error) {
    const fallback = await admin.from('events').select('*').eq('id', eventId).maybeSingle();
    return fallback.data || null;
  }
  return data || null;
}

// ─── Revenue / fees ─────────────────────────────────────────────────────────

function calculateRevenueSplit(total) {
  const appCommission = Math.round(total * APP_COMMISSION_RATE);
  return { appCommission, venueRevenue: total - appCommission };
}

function calculateGatewayFee(method, total) {
  if (method === 'credit_card') return Math.round(total * 0.034 * 100) / 100;
  if (method === 'mobile_money') return Math.round(total * 0.03 * 100) / 100;
  return 0;
}

// ─── Payment verification (server-side, direct to the providers) ────────────

async function verifyPesapalPayment({ trackingId, orderId }) {
  const { getPesapalToken } = require('./pesapalAuth');
  const apiUrl = process.env.PESAPAL_API_URL || 'https://pay.pesapal.com/v3/api';
  const id = trackingId || orderId;
  if (!id) return { status: 'invalid', reason: 'missing_payment_id' };

  const token = await getPesapalToken();
  const response = await fetch(
    `${apiUrl}/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(id)}`,
    { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PesaPal verification error: ${response.status} — ${text.substring(0, 200)}`);
  }

  const data = await response.json();
  const statusCode = data.status_code != null ? Number(data.status_code) : -1;
  const STATUS_CODES = { 0: 'invalid', 1: 'completed', 2: 'failed', 3: 'reversed' };
  const rawStatus = STATUS_CODES[statusCode] || (data.payment_status_description || 'pending').toLowerCase();
  const status =
    rawStatus === 'completed'
      ? 'completed'
      : rawStatus === 'failed' || rawStatus === 'invalid' || rawStatus === 'reversed'
        ? 'failed'
        : 'pending';

  return {
    status,
    rawStatus,
    transactionId: data.confirmation_code || data.merchant_reference || id,
    confirmationCode: data.confirmation_code || undefined,
    amount: parseFloat(data.amount) || 0,
  };
}

async function verifyPawaPayDeposit(depositId) {
  if (!depositId) return { status: 'invalid', reason: 'missing_deposit_id' };
  const apiKey = process.env.PAWAPAY_API_KEY;
  if (!apiKey) throw new Error('PAWAPAY_API_KEY is not configured');
  const base = process.env.PAWAPAY_API_URL || 'https://api.pawapay.io/v2';

  const response = await fetch(`${base}/deposits/${depositId}`, {
    headers: { Authorization: 'Bearer ' + apiKey },
  });
  if (response.status === 404) return { status: 'failed', rawStatus: 'NOT_FOUND' };
  if (!response.ok) throw new Error(`PawaPay verification error: ${response.status}`);

  const data = await response.json();
  const deposit = data.data || data || {};
  const rawStatus = deposit.status || 'PENDING';
  const status =
    rawStatus === 'COMPLETED'
      ? 'completed'
      : rawStatus === 'FAILED'
        ? 'failed'
        : 'pending';

  return {
    status,
    rawStatus,
    amount: parseFloat(deposit.amount) || 0,
    provider: deposit.payer?.accountDetails?.provider,
    providerTransactionId: deposit.providerTransactionId,
  };
}

// ─── Verify via the deployed Netlify verify functions ────────────────────────
// The UI polls /verify-pawapay-payment and /verify-pesapal-payment. Fulfillment
// MUST agree with what the buyer's screen saw, so these route through the SAME
// deployed functions instead of a parallel implementation that can drift.

function siteBase() {
  return process.env.SITE_URL || process.env.URL || 'https://yovibe.net';
}

async function verifyPawaPayDepositViaFunction(depositId) {
  if (!depositId) return { status: 'invalid', reason: 'missing_deposit_id' };
  const res = await fetch(
    `${siteBase()}/.netlify/functions/verify-pawapay-payment?depositId=${encodeURIComponent(depositId)}`
  );
  const data = await res.json().catch(() => ({}));
  const status = ['completed', 'failed', 'pending'].includes(data.status) ? data.status : 'pending';
  return { status, ...data };
}

async function verifyPesapalPaymentViaFunction({ trackingId, orderId }) {
  const params = new URLSearchParams();
  if (trackingId) params.set('orderTrackingId', trackingId);
  if (orderId) params.set('merchantReference', orderId);
  const res = await fetch(`${siteBase()}/.netlify/functions/verify-pesapal-payment?${params.toString()}`);
  const data = await res.json().catch(() => ({}));
  const status = ['completed', 'failed', 'pending'].includes(data.status) ? data.status : 'pending';
  return { status, transactionId: data.transactionId, confirmationCode: data.confirmationCode, ...data };
}

// ─── R2 uploads ─────────────────────────────────────────────────────────────

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT || 'https://fa2758d1964bd534d143d8716fd37928.r2.cloudflarestorage.com',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
    forcePathStyle: true,
  });
}

async function uploadToR2(key, body, contentType) {
  if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 credentials not configured');
  }
  const s3 = getR2Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME || 'yovibe',
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: 'public-read',
    })
  );
  const publicUrl = process.env.R2_PUBLIC_URL || 'https://pub-9790a44a83ab4a5e92acd4f1904afbbe.r2.dev';
  return `${publicUrl}/${key}`;
}

async function generateQrPngDataUrl(signedUrl) {
  return QRCode.toDataURL(signedUrl, {
    width: 300,
    margin: 4,
    color: { dark: '#000000', light: '#FFFFFF' },
    errorCorrectionLevel: 'H',
  });
}

// Upload a base64/data-URL image to R2. Returns the public URL or null.
async function uploadImageDataUrl(dataUrl, pathPrefix, filenameBase) {
  if (!dataUrl) return null;
  const match = /^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i.exec(String(dataUrl));
  if (!match) return null;
  const mime = match[1].toLowerCase() === 'image/png' ? 'image/png' : 'image/jpeg';
  const ext = mime === 'image/png' ? 'png' : 'jpg';
  const bytes = Buffer.from(match[2], 'base64');
  const key = `${pathPrefix}/${filenameBase}.${ext}`;
  return uploadToR2(key, bytes, mime);
}

// ─── Notification (replicates NotificationService.notifyTicketPurchase) ─────

async function insertTicketNotification(admin, event, ticket) {
  try {
    const { error } = await admin.from('notifications').insert({
      user_id: event.created_by || event.created_by_auth || '',
      title: '🎫 New Ticket Purchased',
      body: `${ticket.buyer_name} purchased a ticket for ${event.name}`,
      type: 'ticket_purchase',
      data: { eventId: event.slug || event.id, ticketId: ticket.id, buyerName: ticket.buyer_name },
      is_read: false,
    });
    if (error) console.warn('[TicketFulfillment] Notification insert skipped:', error.message);
  } catch (e) {
    console.warn('[TicketFulfillment] Notification insert error:', e.message);
  }
}

// ─── Email delivery (reuses send-ticket-email, the canonical sender) ────────

function siteBaseUrl() {
  return process.env.SITE_URL || process.env.URL || 'https://yovibe.net';
}

async function sendTicketEmail(emailPayload) {
  const response = await fetch(`${siteBaseUrl()}/.netlify/functions/send-ticket-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(emailPayload),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`send-ticket-email failed: ${response.status} ${text.substring(0, 200)}`);
  }
  return response.json();
}

// ─── Ticket creation (server-side, full fidelity) ───────────────────────────
//
// Mirrors the client's createSingleTicket path: pricing split, QR sign + image,
// R2 uploads, and a snake_case insert into the `tickets` table.
async function createTicketServerSide(admin, {
  event,               // raw DB row (snake_case) + slug/id helpers
  attendeeName,
  payerEmail,
  buyerId,
  deliveryEmail,
  totalAmount,         // per-ticket total (totalAmount / quantity)
  unitPrice,           // Phase 2.2: verified notified price for the selected fee
  lateFeePercent,      // Phase 2.2: from event.late_fee_percent (with unitPrice)
  isTableEntry,
  tableSize,
  tableGroupId,
  tableTotalAmount,
  seatNumber,
  tableNumber,
  buyerPhone,
  sharedPaymentId,
  cardPaymentName,
  photoUrl,            // already-uploaded R2 URL (null when none)
  payment,             // { method, provider?, number?, name?, cardName?, bankName?, accountNumber?, accountName? }
  pesapalTransactionId,
  pesapalConfirmationCode,
}) {
  const eventSlug = event.slug || event.id;
  // Match the client model exactly: the app treats the public slug as the
  // event's canonical id (SupabaseService maps id: data.slug), and existing
  // tickets store the slug in BOTH event_id and event_slug.
  const eventIdForTicket = eventSlug;
  const startTime = resolveEventStartTime(event);
  const lateFeePct = unitPrice != null
    ? (Number(lateFeePercent ?? 0) || 0)
    : (Number(event.late_fee_percent ?? 0) || 0);
  const sevenAm = new Date(startTime);
  sevenAm.setHours(7, 0, 0, 0);
  const isLatePurchase = new Date() >= sevenAm;
  const baseAmount = unitPrice != null ? unitPrice : totalAmount;
  const lateFee = isLatePurchase ? Math.round(baseAmount * lateFeePct / 100) : 0;

  // With a verified unitPrice, the snapshot is authoritative: subtotal = price
  // per ticket, total = price + late fee. Without it (stranded-retry path) the
  // legacy behaviour is preserved (totalAmount is the per-ticket total).
  const subtotal = baseAmount;
  const total = unitPrice != null ? baseAmount + lateFee : totalAmount;
  const { appCommission, venueRevenue } = calculateRevenueSplit(total);
  const gatewayFee = calculateGatewayFee(payment.method, total);
  const purchaseDeadline = new Date(startTime.getTime() - 24 * 60 * 60 * 1000);

  const id = uuidv4();
  const ticketRef = deriveTicketRef(id, isTableEntry);
  const signed = signQrPayload(id);
  const qrPng = await generateQrPngDataUrl(signed.url);
  const qrUrl = await uploadToR2(
    `qr-codes/${id}.png`,
    Buffer.from(qrPng.split(',')[1] || '', 'base64'),
    'image/png'
  );

  const photoUploadToken = uuidv4();
  const expiresAt = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);
  const paymentId = sharedPaymentId || `pi_${Date.now()}`;
  const paymentName =
    payment.method === 'credit_card'
      ? (cardPaymentName || payment.name || '')
      : payment.method === 'mobile_money'
        ? (payment.name || '')
        : '';

  const row = {
    id,
    event_id: eventIdForTicket,
    event_slug: eventSlug,
    event_name: event.name,
    venue_name: event.venue_name || '',
    buyer_id: buyerId || null,
    buyer_name: attendeeName,
    buyer_email: payerEmail || '',
    delivery_email: deliveryEmail || payerEmail || '',
    ticket_ref: ticketRef,
    buyer_phone: buyerPhone || null,
    quantity: 1,
    total_amount: total,
    table_total_amount: isTableEntry ? tableTotalAmount : null,
    table_size: isTableEntry ? tableSize : null,
    seat_number: tableNumber != null ? null : (seatNumber ?? null),
    table_number: tableNumber ?? null,
    table_group_id: tableGroupId || null,
    base_price: subtotal,
    late_fee: lateFee,
    venue_revenue: venueRevenue,
    app_commission: appCommission,
    purchase_date: new Date().toISOString(),
    purchase_deadline: purchaseDeadline.toISOString(),
    event_start_time: startTime.toISOString(),
    qr_code: id,
    qr_code_data_url: qrUrl,
    buyer_photo_url: photoUrl,
    photo_upload_token: photoUploadToken,
    photo_upload_token_expires_at: expiresAt.toISOString(),
    status: 'active',
    validation_history: [],
    entry_fee_type: payment.ticketType || (event.entry_fees && event.entry_fees.length ? event.entry_fees[0].name : 'Standard'),
    is_late_purchase: isLatePurchase,
    is_scanned: false,
    expires_at: expiresAt.toISOString(),
    payout_eligible: false,
    payout_status: 'pending',
    payment_id: paymentId,
    payment_status: 'completed',
    payment_reference: `ref_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    pesapal_transaction_id: payment.method !== 'mobile_money' ? (pesapalTransactionId || `txn_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`) : null,
    pesapal_confirmation_code: payment.method !== 'mobile_money' ? (pesapalConfirmationCode || null) : null,
    pawapay_deposit_id: payment.method === 'mobile_money' ? sharedPaymentId : null,
    gateway_fee: gatewayFee,
    payment_method: payment.method,
    payment_provider: payment.provider || null,
    payment_number: payment.number || null,
    payment_name: paymentName,
    qr_signature: signed.signature,
    reentry_pass: null,
    refunded_amount: 0,
    refund_status: 'none',
  };

  // Phase 2.1: NO insert here — the caller persists the whole batch atomically
  // via persistTicketRows() → create_tickets_batch (capacity + table/seat
  // conflict checks under an event-level advisory lock).
  return row;
}

// ─── Atomic batch persistence (Phase 2.1) ────────────────────────────────────

/**
 * Persist a batch of ticket rows atomically through the inventory RPC.
 * Throws errors prefixed with SOLD_OUT / TABLE_TAKEN / SEAT_TAKEN / DUPLICATE
 * so callers can map them to buyer-facing messages.
 */
async function persistTicketRows(admin, rows) {
  if (!rows || rows.length === 0) return [];
  const { data, error } = await admin.rpc('create_tickets_batch', {
    p_event_slug: rows[0].event_slug,
    p_rows: rows,
  });
  if (error) {
    const msg = String(error.message || '');
    let code = 'INVENTORY_ERROR';
    if (msg.includes('SOLD_OUT')) code = 'SOLD_OUT';
    else if (msg.includes('TABLE_TAKEN')) code = 'TABLE_TAKEN';
    else if (msg.includes('SEAT_TAKEN')) code = 'SEAT_TAKEN';
    else if (msg.includes('duplicate key') || msg.includes('23505')) code = 'DUPLICATE';
    throw new Error(`${code}: ${msg}`);
  }
  return Array.isArray(data) ? data : (rows.map((r) => r.id));
}

/**
 * Best-effort removal of QR images / buyer photos uploaded for a batch that
 * failed to persist (avoids orphaned R2 objects).
 */
async function cleanupTicketAssets(rows) {
  try {
    if (!rows || rows.length === 0) return;
    if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) return;
    const s3 = getR2Client();
    const bucket = process.env.R2_BUCKET_NAME || 'yovibe';
    const keys = [];
    for (const r of rows) {
      if (r && r.id) keys.push(`qr-codes/${r.id}.png`);
      if (r && r.buyer_photo_url && String(r.buyer_photo_url).includes('/buyer-photos/')) {
        try {
          keys.push(decodeURIComponent(new URL(String(r.buyer_photo_url)).pathname.slice(1)));
        } catch {
          // ignore malformed URL
        }
      }
    }
    await Promise.allSettled(
      keys.map((key) => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })))
    );
  } catch (e) {
    console.warn('[TicketFulfillment] asset cleanup failed:', e.message);
  }
}

// ─── Reversal / failure reconciliation (P1.5) ───────────────────────────────

async function markTicketsByPayment(admin, { paymentId, depositId, status, refundStatus }) {
  let query = admin.from('tickets').update({
    status,
    refund_status: refundStatus || null,
  });
  if (depositId) {
    query = query.eq('pawapay_deposit_id', depositId);
  } else if (paymentId) {
    query = query.eq('payment_id', paymentId);
  } else {
    return { updated: 0 };
  }
  const { data, error } = await query.select('id');
  if (error) {
    console.warn('[TicketFulfillment] markTicketsByPayment error:', error.message);
    return { updated: 0, error };
  }
  return { updated: (data || []).length };
}

module.exports = {
  signQrPayload,
  deriveTicketRef,
  resolveEventStartTime,
  loadEvent,
  calculateRevenueSplit,
  calculateGatewayFee,
  verifyPesapalPayment,
  verifyPawaPayDeposit,
  verifyPawaPayDepositViaFunction,
  verifyPesapalPaymentViaFunction,
  uploadToR2,
  uploadImageDataUrl,
  generateQrPngDataUrl,
  insertTicketNotification,
  sendTicketEmail,
  siteBaseUrl,
  createTicketServerSide,
  persistTicketRows,
  cleanupTicketAssets,
  markTicketsByPayment,
};
