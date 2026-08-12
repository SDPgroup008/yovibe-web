// netlify/shared/payoutReceiptEmail.js
//
// Outlook-safe (table + inline CSS) payout receipt email template, matching the
// YoVibe brand (dark futuristic card with cyan accent). Includes a plain-text
// fallback and dark-mode support.

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmtMoney = (n) => "UGX " + Math.round(Number(n) || 0).toLocaleString("en-US");

function renderReceiptHtml(payout) {
  const amount = fmtMoney(payout.amount);
  const payoutId = escapeHtml(payout.id || payout.payoutId || "—");
  const txRef = escapeHtml(payout.transaction_reference || payout.payoutId || "—");
  const date = payout.processed_date
    ? escapeHtml(new Date(payout.processed_date).toLocaleString("en-GB", { timeZone: "Africa/Kampala" }))
    : "—";
  const name = escapeHtml(payout.recipient_name || "—");
  const email = escapeHtml(payout.recipient_email || payout.emailTo || "—");
  const phone = escapeHtml(payout.recipient_phone_number || "—");
  const provider = escapeHtml(payout.provider || (payout.payout_method === "mobile_money" ? "Mobile Money" : "—"));

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<style>
  .yovibe { background:#0f121a; font-family:Arial,Helvetica,sans-serif; padding:24px 16px; color:#e0e0e0; }
  .yovibe-card { background:#1a1e2c; border-radius:16px; max-width:560px; margin:0 auto; overflow:hidden; border:1px solid rgba(0,212,255,.18); }
  .yovibe-head { background:#0c0f17; padding:20px 24px; }
  .yovibe-brand { color:#00d4ff; font-size:22px; font-weight:800; letter-spacing:1px; }
  .yovibe-status { background:#2bd576; color:#06121a; font-size:12px; font-weight:800; padding:6px 12px; border-radius:999px; }
  .yovibe-body { padding:20px 24px; }
  .yovibe-amount-card { background:#0c0f17; border-radius:12px; padding:18px; margin-bottom:20px; }
  .yovibe-amount-label { color:#8b8ba3; font-size:12px; text-transform:uppercase; letter-spacing:1px; }
  .yovibe-amount { color:#00d4ff; font-size:34px; font-weight:800; margin-top:4px; }
  .yovibe-table { width:100%; border-collapse:collapse; }
  .yovibe-table td { padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.06); font-size:13px; }
  .yovibe-td-label { color:#8b8ba3; width:42%; }
  .yovibe-td-value { color:#f0f0f5; font-weight:600; text-align:right; }
  .yovibe-mono { font-family:'Courier New',monospace; font-size:12px; }
  .yovibe-foot { padding:16px 24px; color:#8b8ba3; font-size:11px; line-height:1.6; }
</style></head>
<body class="yovibe">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="yovibe">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="yovibe-card">
        <tr>
          <td class="yovibe-head" style="display:flex;justify-content:space-between;align-items:center;">
            <span class="yovibe-brand">YOVIBE</span>
            <span class="yovibe-status">COMPLETED</span>
          </td>
        </tr>
        <tr><td class="yovibe-body">
          <div class="yovibe-amount-card">
            <div class="yovibe-amount-label">Amount Paid</div>
            <div class="yovibe-amount">${amount}</div>
          </div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="yovibe-table">
            <tr><td class="yovibe-td-label">Payout ID</td><td class="yovibe-td-value yovibe-mono">${payoutId}</td></tr>
            <tr><td class="yovibe-td-label">Transaction Reference</td><td class="yovibe-td-value yovibe-mono">${txRef}</td></tr>
            <tr><td class="yovibe-td-label">Date &amp; Time</td><td class="yovibe-td-value">${date}</td></tr>
            <tr><td class="yovibe-td-label">Recipient Name</td><td class="yovibe-td-value">${name}</td></tr>
            <tr><td class="yovibe-td-label">Recipient Email</td><td class="yovibe-td-value">${email}</td></tr>
            <tr><td class="yovibe-td-label">Recipient Phone</td><td class="yovibe-td-value yovibe-mono">${phone}</td></tr>
            <tr><td class="yovibe-td-label">Provider</td><td class="yovibe-td-value">${provider}</td></tr>
            <tr><td class="yovibe-td-label">Method</td><td class="yovibe-td-value">Mobile Money Transfer</td></tr>
          </table>
        </td></tr>
        <tr><td class="yovibe-foot">This is an automated receipt for a YoVibe payout. A PDF copy is attached for your records. Please retain it for your records.<br>YoVibe · reinolmartin0001@gmail.com</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function renderReceiptText(payout) {
  const amount = fmtMoney(payout.amount);
  const line = "------------------------------------------------";
  return [
    "YOVIBE — PAYOUT RECEIPT",
    line,
    "Amount Paid: " + amount,
    "Status: COMPLETED",
    "",
    "Payout ID: " + (payout.id || payout.payoutId || "-"),
    "Reference: " + (payout.transaction_reference || payout.payoutId || "-"),
    "Date: " + (payout.processed_date ? new Date(payout.processed_date).toLocaleString("en-GB", { timeZone: "Africa/Kampala" }) : "-"),
    "Recipient: " + (payout.recipient_name || "-"),
    "Email: " + (payout.recipient_email || payout.emailTo || "-"),
    "Phone: " + (payout.recipient_phone_number || "-"),
    "Provider: " + (payout.provider || (payout.payout_method === "mobile_money" ? "Mobile Money" : "-")),
    line,
    "This is an automated receipt for a YoVibe payout.",
    "YoVibe · reinolmartin0001@gmail.com",
  ].join("\n");
}

module.exports = { renderReceiptHtml, renderReceiptText, fmtMoney };
