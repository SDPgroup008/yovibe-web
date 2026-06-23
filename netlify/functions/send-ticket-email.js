// netlify/functions/send-ticket-email.js
//
// Sends a ticket confirmation email (with QR code) to a buyer, including
// unauthenticated/guest buyers who checked out with just an email address.
//
//RESEND_API_KEY
//
// Call this from the app immediately after the ticket row is created in Supabase.

const { Resend } = require("resend");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

const resend = new Resend(process.env.RESEND_API_KEY);

// Basic email format check — not exhaustive, just catches obvious bad input
function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildTicketEmailHtml({
  eventName,
  ticketType,
  venue,
  date,
  time,
  quantity,
  amountPaid,
  ticketRef,
  qrCodeDataUrl,
  buyerName,
}) {
  const greetingName = buyerName ? escapeHtml(buyerName) : "there";

  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#0b0b0b; padding:24px; color:#f5f5f5;">
    <div style="max-width:480px; margin:0 auto; background:#161616; border-radius:12px; overflow:hidden; border:1px solid #2a2a2a;">
      <div style="padding:20px 24px; border-bottom:1px solid #2a2a2a;">
        <span style="color:#ff3b3b; font-weight:700; font-size:18px;">YoVibe</span>
      </div>

      <div style="padding:24px;">
        <p style="margin:0 0 16px; font-size:15px; color:#cfcfcf;">Hi ${greetingName}, here's your ticket.</p>

        <div style="background:#ffffff; border-radius:10px; padding:16px; text-align:center; margin-bottom:20px;">
          <img src="${qrCodeDataUrl}" alt="Ticket QR Code" style="width:200px; height:200px; display:block; margin:0 auto;" />
        </div>
        <p style="text-align:center; font-size:13px; color:#9a9a9a; margin:0 0 24px;">
          Present this QR code at the event entrance
        </p>

        <div style="border-top:1px solid #2a2a2a; padding-top:16px;">
          ${row("Event", escapeHtml(eventName))}
          ${row("Ticket Type", escapeHtml(ticketType))}
          ${venue ? row("Venue", escapeHtml(venue)) : ""}
          ${row("Date", escapeHtml(date))}
          ${row("Time", escapeHtml(time))}
          ${row("Quantity", escapeHtml(quantity))}
          ${row("Amount Paid", escapeHtml(amountPaid), "#4ade80")}
          ${row("Ticket Ref", escapeHtml(ticketRef))}
        </div>
      </div>

      <div style="padding:16px 24px; background:#101010; text-align:center;">
        <p style="margin:0; font-size:11px; color:#6b6b6b;">
          This ticket is verified and secured by YoVibe
        </p>
      </div>
    </div>
  </div>
  `;
}

function row(label, value, valueColor) {
  return `
    <div style="display:flex; justify-content:space-between; padding:6px 0; font-size:13px;">
      <span style="color:#9a9a9a;">${label}</span>
      <span style="color:${valueColor || "#f5f5f5"}; font-weight:600;">${value}</span>
    </div>
  `;
}

// Loads QR image bytes whether qrCodeInput is a hosted URL (e.g. Cloudflare R2)
// or an inline base64 data URL. Detects PNG vs JPEG either from the data URL's
// declared mime type or from the URL's file extension / response content-type.
async function loadQrImageBytes(qrCodeInput) {
  if (!qrCodeInput) return null;

  // Case 1: inline base64 data URL
  const dataUrlMatch = /^data:(image\/(png|jpeg|jpg));base64,(.+)$/i.exec(qrCodeInput);
  if (dataUrlMatch) {
    return {
      isPng: dataUrlMatch[1].toLowerCase().includes("png"),
      bytes: Buffer.from(dataUrlMatch[3], "base64"),
    };
  }

  // Case 2: hosted URL (e.g. https://pub-xxxx.r2.dev/qr-codes/ticket_xxx.png)
  if (/^https?:\/\//i.test(qrCodeInput)) {
    const response = await fetch(qrCodeInput);
    if (!response.ok) {
      throw new Error(`Failed to fetch QR image: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "";
    const isPng = contentType.includes("png") || /\.png($|\?)/i.test(qrCodeInput);
    return {
      isPng,
      bytes: Buffer.from(arrayBuffer),
    };
  }

  return null;
}

// Builds a single-page PDF ticket using pdf-lib (no headless browser needed,
// keeps the function lightweight for Netlify's serverless environment).
async function buildTicketPdf({
  eventName,
  ticketType,
  venue,
  date,
  time,
  quantity,
  amountPaid,
  ticketRef,
  qrCodeDataUrl,
  buyerName,
}) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([320, 560]); // narrow, receipt-like ticket shape
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const dark = rgb(0.07, 0.07, 0.07);
  const textGrey = rgb(0.6, 0.6, 0.6);
  const textWhite = rgb(0.96, 0.96, 0.96);
  const green = rgb(0.29, 0.87, 0.5);
  const brandRed = rgb(1, 0.23, 0.23);

  // Full-page dark background
  page.drawRectangle({ x: 0, y: 0, width, height, color: dark });

  let cursorY = height - 36;

  // Brand header
  page.drawText("YoVibe", {
    x: 24,
    y: cursorY,
    size: 16,
    font: fontBold,
    color: brandRed,
  });
  cursorY -= 28;

  page.drawText(buyerName ? `Ticket for ${buyerName}` : "Your Ticket", {
    x: 24,
    y: cursorY,
    size: 11,
    font: fontRegular,
    color: textGrey,
  });
  cursorY -= 24;

  // QR code image — fetched from R2/hosted URL or decoded from inline base64
  const decoded = await loadQrImageBytes(qrCodeDataUrl);
  const qrSize = 200;
  const qrX = (width - qrSize) / 2;

  if (decoded) {
    const qrImage = decoded.isPng
      ? await pdfDoc.embedPng(decoded.bytes)
      : await pdfDoc.embedJpg(decoded.bytes);

    // White card behind QR for contrast/scan-ability
    page.drawRectangle({
      x: qrX - 12,
      y: cursorY - qrSize - 12,
      width: qrSize + 24,
      height: qrSize + 24,
      color: rgb(1, 1, 1),
    });
    page.drawImage(qrImage, {
      x: qrX,
      y: cursorY - qrSize,
      width: qrSize,
      height: qrSize,
    });
  }
  cursorY -= qrSize + 30;

  page.drawText("Present this QR code at the event entrance", {
    x: 24,
    y: cursorY,
    size: 9,
    font: fontRegular,
    color: textGrey,
  });
  cursorY -= 26;

  // Divider
  page.drawLine({
    start: { x: 24, y: cursorY },
    end: { x: width - 24, y: cursorY },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  });
  cursorY -= 22;

  // Detail rows
  const fields = [
    ["Event", eventName],
    ["Ticket Type", ticketType],
    ...(venue ? [["Venue", venue]] : []),
    ["Date", date],
    ["Time", time],
    ["Quantity", String(quantity)],
    ["Amount Paid", amountPaid, true],
    ["Ticket Ref", ticketRef],
  ];

  for (const [label, value, isAmount] of fields) {
    page.drawText(label, {
      x: 24,
      y: cursorY,
      size: 10,
      font: fontRegular,
      color: textGrey,
    });
    const valueText = String(value);
    const valueWidth = fontBold.widthOfTextAtSize(valueText, 10);
    page.drawText(valueText, {
      x: width - 24 - valueWidth,
      y: cursorY,
      size: 10,
      font: fontBold,
      color: isAmount ? green : textWhite,
    });
    cursorY -= 20;
  }

  // Footer
  page.drawText("This ticket is verified and secured by YoVibe", {
    x: 24,
    y: 20,
    size: 8,
    font: fontRegular,
    color: textGrey,
  });

  return pdfDoc.save(); // returns Uint8Array
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("send-ticket-email: RESEND_API_KEY is not set");
    return { statusCode: 500, body: JSON.stringify({ error: "Email service not configured" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const {
    buyerEmail,
    buyerName,
    eventName,
    ticketType,
    venue,
    date,
    time,
    quantity,
    amountPaid,
    ticketRef,
    qrCodeDataUrl,
  } = payload;

  // Required fields — fail fast with a clear message rather than a vague 500 later
  const missing = [];
  if (!isValidEmail(buyerEmail)) missing.push("buyerEmail (invalid or missing)");
  if (!eventName) missing.push("eventName");
  if (!ticketType) missing.push("ticketType");
  if (!date) missing.push("date");
  if (!time) missing.push("time");
  if (!quantity) missing.push("quantity");
  if (!amountPaid) missing.push("amountPaid");
  if (!ticketRef) missing.push("ticketRef");
  if (!qrCodeDataUrl) missing.push("qrCodeDataUrl");

  if (missing.length > 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing or invalid fields", missing }),
    };
  }

  const html = buildTicketEmailHtml({
    eventName,
    ticketType,
    venue,
    date,
    time,
    quantity,
    amountPaid,
    ticketRef,
    qrCodeDataUrl,
    buyerName,
  });

  let pdfBytes;
  try {
    pdfBytes = await buildTicketPdf({
      eventName,
      ticketType,
      venue,
      date,
      time,
      quantity,
      amountPaid,
      ticketRef,
      qrCodeDataUrl,
      buyerName,
    });
  } catch (err) {
    // PDF generation failing shouldn't block the email entirely — log it
    // and fall back to sending the HTML-only email so the buyer still gets something.
    console.error("send-ticket-email: PDF generation failed", err);
  }

  try {
    const { data, error } = await resend.emails.send({
      from: "YoVibe Tickets <tickets@yovibe.net>",
      to: [buyerEmail],
      subject: `Your ticket for ${eventName}`,
      html,
      attachments: pdfBytes
        ? [
            {
              filename: `${ticketRef}.pdf`,
              content: Buffer.from(pdfBytes).toString("base64"),
            },
          ]
        : undefined,
    });

    if (error) {
      console.error("send-ticket-email: Resend error", error);
      return { statusCode: 502, body: JSON.stringify({ error: "Failed to send email", details: error }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id: data?.id }),
    };
  } catch (err) {
    console.error("send-ticket-email: Unexpected error", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Unexpected server error" }) };
  }
};
