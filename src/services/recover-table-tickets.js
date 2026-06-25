"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * recover-table-tickets.ts
 *
 * ONE-OFF recovery script for the stalled "Campus beach party" table booking
 * (pending_ticket_fulfillments.id = 55c1d65b-4a4d-4ce5-9edf-f78d283fffb1).
 *
 * Payment was confirmed (PawaPay deposit completed) but ticket creation failed
 * for ALL 5 attendees before any row was written (the `photoUploadToken` view
 * bug killed it on attendee #1, before even the R2 upload step). This script:
 *
 *   1. Generates a fresh QR value + QR image data URL for each of the 5 attendees
 *      (martin's original QR from the logs was never actually persisted as a
 *      ticket row, so we regenerate all 5 fresh rather than mixing old + new)
 *   2. Uploads each QR image to R2 via your REAL uploadQRCode() function —
 *      same code path your app already uses, so the URLs are genuine and correct
 *   3. Prints a ready-to-run SQL INSERT for all 5 ticket rows, with the real
 *      R2 URLs filled in
 *
 * HOW TO RUN:
 *   1. Place this file anywhere in your project that can import R2Service
 *      (e.g. alongside TicketService.ts), adjust the import path below if needed
 *   2. npx ts-node recover-table-tickets.ts
 *      (or compile with tsc first if ts-node isn't set up)
 *   3. Copy the printed SQL block and run it in Supabase's SQL editor
 *
 * This script does NOT touch Supabase directly — it only generates QR images
 * and uploads them to R2, then prints the SQL for you to review and run
 * yourself, so nothing gets inserted without you double-checking it first.
 */
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
const qrcode_1 = __importDefault(require("qrcode"));
const R2Service_1 = require("./R2Service"); // ⚠️ adjust path to match your project structure
// ---- Known facts from the original purchase logs ----
const EVENT_ID = "campus-beach-party";
const EVENT_NAME = "Campus beach party";
const EVENT_START_TIME = "2026-06-30T03:00:00+03:00";
const PURCHASE_DEADLINE = "2026-06-29T03:00:00+03:00";
const PAYMENT_ID = "pi_1782304566047_mdde7xqfy";
const PAWAPAY_DEPOSIT_ID = "8bc2e25b-b1a7-4661-8917-14a45d18a78a"; // from pending_ticket_fulfillments row
const BUYER_EMAIL = "reinolmartin001@gmail.com"; // single-email distribution chosen at checkout
// Per-ticket pricing, from the original log (per attendee, NOT the order total)
const PER_TICKET_TOTAL = 120;
const PER_TICKET_BASE_PRICE = 120;
const PER_TICKET_LATE_FEE = 0;
const PER_TICKET_APP_COMMISSION = 18; // 8% per log
const PER_TICKET_VENUE_REVENUE = 102;
const ATTENDEE_NAMES = ["martin", "marvin", "marrick", "martha", "mark"];
function generateTicketId() {
    const rand = Math.random().toString(36).substr(2, 9);
    return `ticket_${Date.now()}_${rand}`;
}
function generateQrValue() {
    const rand = Math.random().toString(36).substr(2, 9);
    return `YOVIBE_${Date.now()}_${rand}`;
}
// QR codes generally encoded as valid until shortly after event start —
// matching the pattern from the original log (~1 day after event start).
function computeQrExpiry() {
    const eventStart = new Date(EVENT_START_TIME);
    eventStart.setDate(eventStart.getDate() + 1);
    return eventStart.toISOString();
}
async function recoverTickets() {
    const results = [];
    for (const buyerName of ATTENDEE_NAMES) {
        const ticketId = generateTicketId();
        const qrCodeValue = generateQrValue();
        console.log(`\nGenerating QR for ${buyerName} (${ticketId})...`);
        // Same call your app already makes: QRCode.toDataURL() produces a base64
        // PNG data URL, matching exactly what ticket.qrCodeDataUrl holds pre-upload.
        const qrDataUrl = await qrcode_1.default.toDataURL(qrCodeValue);
        // Real upload, through your real Netlify function — no shortcuts.
        const uploadResult = await (0, R2Service_1.uploadQRCode)(qrDataUrl, ticketId);
        console.log(`  Uploaded: ${uploadResult.url}`);
        results.push({
            ticketId,
            buyerName,
            qrCodeValue,
            qrCodeUrl: uploadResult.url,
        });
    }
    const qrExpiry = computeQrExpiry();
    console.log("\n\n========== COPY THE SQL BELOW INTO SUPABASE ==========\n");
    console.log("insert into tickets (");
    console.log("  id, event_id, event_name, buyer_id, buyer_name, buyer_email, quantity,");
    console.log("  total_amount, base_price, late_fee, venue_revenue, app_commission,");
    console.log("  qr_code, qr_code_data_url, status, payment_id, payment_status, payment_method,");
    console.log("  payout_status, pawapay_deposit_id, is_late_purchase, is_scanned,");
    console.log("  purchase_deadline, expires_at, event_start_time, event_slug, purchase_date");
    console.log(") values");
    const valueLines = results.map(({ ticketId, buyerName, qrCodeValue, qrCodeUrl }, i) => {
        const comma = i < results.length - 1 ? "," : ";";
        return `  ('${ticketId}', '${EVENT_ID}', '${EVENT_NAME}', null, '${buyerName}', '${BUYER_EMAIL}', 1,
   ${PER_TICKET_TOTAL}, ${PER_TICKET_BASE_PRICE}, ${PER_TICKET_LATE_FEE}, ${PER_TICKET_VENUE_REVENUE}, ${PER_TICKET_APP_COMMISSION},
   '${qrCodeValue}', '${qrCodeUrl}', 'active', '${PAYMENT_ID}', 'completed', 'mobile_money',
   'pending', '${PAWAPAY_DEPOSIT_ID}', false, false,
   '${PURCHASE_DEADLINE}', '${qrExpiry}', '${EVENT_START_TIME}', '${EVENT_ID}', now())${comma}`;
    });
    console.log(valueLines.join("\n"));
    console.log("\n=======================================================\n");
    console.log("⚠️  buyer_id is set to null for all 5 — fill in manually if any of these 5 attendees have real accounts.\n" +
        "    (Per our checkout flow, only the BUYER (martin, who paid) might have an account —\n" +
        "    marvin/marrick/martha/mark are likely just names with no associated user row.)\n");
    console.log("After running the SQL, also update the safety-net row:\n" +
        `  update pending_ticket_fulfillments\n` +
        `  set status = 'fulfilled', ticket_ids = array[${results.map(r => `'${r.ticketId}'`).join(", ")}]\n` +
        `  where id = '55c1d65b-4a4d-4ce5-9edf-f78d283fffb1';\n`);
}
recoverTickets().catch((err) => {
    console.error("Recovery script failed:", err);
    process.exit(1);
});
