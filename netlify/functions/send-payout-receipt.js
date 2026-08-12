// netlify/functions/send-payout-receipt.js
//
// Sends an automated payout receipt email (with a PDF attachment) to the
// payout initiator, CC'ing the company. Invoked server-side after a payout is
// successfully recorded. Idempotent via the payouts.email_sent_at column.
//
//RESEND_API_KEY

const { Resend } = require("resend");
const { createClient } = require("@supabase/supabase-js");
const { buildPayoutReceiptPdf } = require("../shared/payoutReceiptPdf");
const { renderReceiptHtml, renderReceiptText } = require("../shared/payoutReceiptEmail");

const resend = new Resend(process.env.RESEND_API_KEY);
const ZEPTOMAIL_TOKEN = process.env.ZEPTOMAIL_TOKEN;
const CC_EMAIL = process.env.PAYOUT_CC || "reinolmartin0001@gmail.com";
const FROM_EMAIL = process.env.PAYOUT_EMAIL_FROM || "YoVibe Payouts <payouts@yovibe.net>";

const supabaseUrl = process.env.SUPABASE_URL || "https://uqukizjohackrcwrtefk.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const isValidEmail = (e) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function sendViaZeptoMail({ to, cc, subject, html, text, pdfBase64, filename }) {
  if (!ZEPTOMAIL_TOKEN) return { ok: false, error: "ZEPTOMAIL_TOKEN not configured" };
  const res = await fetch("https://api.zeptomail.com/v1.1/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: ZEPTOMAIL_TOKEN },
    body: JSON.stringify({
      from: { address: "payouts@yovibe.net", name: "YoVibe Payouts" },
      to: [{ email_address: { address: to, name: "" } }],
      cc: [{ email_address: { address: cc } }],
      subject,
      htmlbody: html,
      textbody: text,
      attachments: [{ content: pdfBase64, mime_type: "application/pdf", name: filename }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, error: `ZeptoMail API error: ${errText}` };
  }
  return { ok: true };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const payoutId = body.payoutId;
    const email = body.email;

    if (!payoutId) return { statusCode: 400, body: JSON.stringify({ error: "Missing payoutId" }) };
    if (!isValidEmail(email)) return { statusCode: 400, body: JSON.stringify({ error: "Invalid email" }) };

    // Load the payout row (server-side, bypasses RLS).
    const { data: payout, error: fetchError } = await supabase
      .from("payouts")
      .select("*")
      .eq("id", payoutId)
      .single();
    if (fetchError || !payout) {
      return { statusCode: 404, body: JSON.stringify({ error: "Payout not found" }) };
    }

    // Only email completed payouts.
    const status = (payout.status || "").toLowerCase();
    if (status !== "completed" && status !== "paid") {
      return { statusCode: 400, body: JSON.stringify({ error: "Payout not completed" }) };
    }

    // Idempotency — skip if already emailed.
    if (payout.email_sent_at) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, alreadySent: true }) };
    }

    // Build the receipt payload (email comes from the request, not the DB).
    const receipt = { ...payout, recipient_email: email, emailTo: email };

    const pdfBytes = await buildPayoutReceiptPdf(receipt);
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");
    const filename = `Payout_Receipt_${payoutId}.pdf`;
    const subject = `Payout Receipt ${Math.round(Number(payout.amount) || 0).toLocaleString("en-US")} UGX — ${payoutId}`;
    const html = renderReceiptHtml(receipt);
    const text = renderReceiptText(receipt);

    // Send via Resend (primary), fall back to ZeptoMail.
    let sent = false;
    let sendError = null;
    try {
      const res = await resend.emails.send({
        from: FROM_EMAIL,
        to: [email],
        cc: [CC_EMAIL],
        subject,
        html,
        text,
        attachments: [{ filename, content: pdfBase64 }],
      });
      if (res.error) throw new Error(res.error.message || "Resend error");
      sent = true;
    } catch (err) {
      sendError = err;
      console.error("send-payout-receipt: Resend failed, trying ZeptoMail:", err.message);
      const z = await sendViaZeptoMail({ to: email, cc: CC_EMAIL, subject, html, text, pdfBase64, filename });
      if (!z.ok) {
        console.error("send-payout-receipt: ZeptoMail also failed:", z.error);
        return { statusCode: 502, body: JSON.stringify({ ok: false, error: sendError?.message || z.error }) };
      }
      sent = true;
    }

    if (sent) {
      // Mark as emailed (idempotency). Column may not exist in older DBs.
      try {
        await supabase
          .from("payouts")
          .update({ email_sent_at: new Date().toISOString(), email_to: email })
          .eq("id", payoutId);
      } catch (e) {
        console.error("send-payout-receipt: Failed to mark email_sent_at (column may be missing):", e.message);
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, sent, payoutId }) };
  } catch (err) {
    console.error("send-payout-receipt: Unexpected error:", err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Internal error" }) };
  }
};
