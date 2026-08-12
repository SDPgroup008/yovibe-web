// netlify/shared/payoutReceiptPdf.js
//
// Generates a professional A4 PDF payout receipt using pdf-lib with embedded
// Helvetica (renders text without any server-side system fonts). Returns the
// raw PDF bytes as a Uint8Array.

const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const CYAN = rgb(0, 0.83, 1);        // #00D4FF
const GREEN = rgb(0.17, 0.84, 0.46); // #2BD576
const DARK = rgb(0.05, 0.07, 0.1);
const DARK2 = rgb(0.1, 0.13, 0.18);
const TEXT = rgb(0.25, 0.28, 0.35);
const MUTED = rgb(0.55, 0.58, 0.66);
const WHITE = rgb(1, 1, 1);
const LIGHT = rgb(0.94, 0.95, 0.97);
const BORDER = rgb(0.85, 0.87, 0.9);

const fmtMoney = (n) => "UGX " + Math.round(Number(n) || 0).toLocaleString("en-US");

function drawRow(page, label, value, y, font, bold, mono, width, left, right) {
  page.drawText(String(label), { x: left, y, size: 11, font, color: MUTED });
  const valueText = String(value ?? "—");
  const valueWidth = mono.widthOfTextAtSize(valueText, 11);
  page.drawText(valueText, { x: right - valueWidth, y, size: 11, font: bold || mono, color: TEXT });
}

async function buildPayoutReceiptPdf(payout) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 portrait (pt)
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const W = page.getWidth();
  const H = page.getHeight();
  const L = 50;
  const R = W - 50;
  const contentW = R - L;

  const amount = Number(payout.amount || 0);
  const txRef = payout.transaction_reference || payout.payoutId || "—";
  const payoutId = payout.id || payout.payoutId || "—";
  const date = payout.processed_date ? new Date(payout.processed_date) : new Date();
  const dateStr = date.toLocaleString("en-GB", { timeZone: "Africa/Kampala" });
  const recipientEmail = payout.recipient_email || payout.emailTo || "—";

  // ── Header bar ─────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: DARK });
  page.drawText("YOVIBE", { x: L, y: H - 58, size: 26, font: helvBold, color: CYAN });
  page.drawText("PAYOUT RECEIPT", { x: L, y: H - 92 + 26, size: 13, font: helv, color: WHITE });
  const statusText = "COMPLETED";
  const statusW = helvBold.widthOfTextAtSize(statusText, 12) + 24;
  page.drawRectangle({ x: R - statusW, y: H - 68, width: statusW, height: 26, color: GREEN });
  page.drawText(statusText, { x: R - statusW + 12, y: H - 51, size: 12, font: helvBold, color: WHITE });

  // ── Amount card ────────────────────────────────────────────────────────
  page.drawRectangle({ x: L, y: 640, width: contentW, height: 104, color: LIGHT });
  page.drawText("AMOUNT PAID", { x: L + 20, y: 710, size: 11, font: helv, color: MUTED });
  page.drawText(fmtMoney(amount), { x: L + 20, y: 668, size: 34, font: helvBold, color: DARK });
  page.drawText("Official transaction receipt", { x: L + 20, y: 654, size: 10, font: helv, color: MUTED });

  // ── Details table ──────────────────────────────────────────────────────
  const topY = 600;
  const rowH = 28;
  const rows = [
    ["Payout ID", payoutId, true],
    ["Transaction Reference", txRef, true],
    ["Date & Time", dateStr, false],
    ["Recipient Name", payout.recipient_name || "—", false],
    ["Recipient Email", recipientEmail, false],
    ["Recipient Phone", payout.recipient_phone_number || "—", true],
    ["Provider", payout.payout_method === "mobile_money" ? "Mobile Money" : (payout.provider || "—"), false],
    ["Method", "Mobile Money Transfer", false],
  ];

  rows.forEach(([label, value, isMono], i) => {
    const y = topY - i * rowH;
    if (i % 2 === 0) {
      page.drawRectangle({ x: L, y: y - 8, width: contentW, height: rowH, color: WHITE });
    } else {
      page.drawRectangle({ x: L, y: y - 8, width: contentW, height: rowH, color: LIGHT });
    }
    page.drawText(String(label), { x: L + 16, y, size: 11, font: helv, color: MUTED });
    const valueText = String(value ?? "—");
    const fontUsed = isMono ? mono : helvBold;
    const vw = fontUsed.widthOfTextAtSize(valueText, 11);
    page.drawText(valueText, { x: R - 16 - vw, y, size: 11, font: fontUsed, color: TEXT });
  });

  // ── Footer ─────────────────────────────────────────────────────────────
  page.drawRectangle({ x: L, y: 44, width: contentW, height: 1, color: BORDER });
  page.drawText("This is an automated receipt for a YoVibe payout. Please retain for your records.",
    { x: L, y: 30, size: 9, font: helv, color: MUTED });
  page.drawText("YoVibe · reinolmartin0001@gmail.com", { x: L, y: 16, size: 9, font: helv, color: MUTED });

  return pdf.save();
}

module.exports = { buildPayoutReceiptPdf, fmtMoney };
