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
const ZEPTOMAIL_TOKEN = process.env.ZEPTOMAIL_TOKEN;

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
  ticketRef,
  qrCodeDataUrl,
  buyerName,
  photoUploadLink,
  ticketDesign,
}) {
  const greetingName = buyerName ? escapeHtml(buyerName) : "there";
  
  // Extract colors and layout from ticket design or use defaults
  const isEnabled = ticketDesign?.enabled !== false;
  const templateId = ticketDesign?.source === "template" ? ticketDesign.template_id : null;
  const isLandscape = ticketDesign?.orientation === "landscape";
  const qrPosition = ticketDesign?.qr_position || "center";
  const isUploadBg = ticketDesign?.source === "upload" && ticketDesign.background_url;
  const customDims = ticketDesign?.dimensions || null;
  
  // Define color schemes for different templates
  const templateColors = {
    "midnight-portrait": {
      bg: "linear-gradient(160deg,#0f0c29 0%,#302b63 50%,#24243e 100%)",
      header: "linear-gradient(90deg,#302b63,#24243e)",
      accent: "#7c3aed",
      text: "#ffffff",
      qr: "#1e1b4b",
      footer: "#101010",
    },
    "neon-night-portrait": {
      bg: "linear-gradient(160deg,#0a0a0a 0%,#1a0533 60%,#0d0d0d 100%)",
      header: "linear-gradient(90deg,#ff0080,#7928ca)",
      accent: "#ff0080",
      text: "#ffffff",
      qr: "#1a0533",
      footer: "#101010",
    },
    "golden-vip-portrait": {
      bg: "linear-gradient(160deg,#1a1200 0%,#2d1f00 50%,#1a1200 100%)",
      header: "linear-gradient(90deg,#b8860b,#ffd700)",
      accent: "#ffd700",
      text: "#fff8dc",
      qr: "#2d1f00",
      footer: "#101010",
    },
    "ocean-portrait": {
      bg: "linear-gradient(160deg,#001f3f 0%,#003366 50%,#0074d9 100%)",
      header: "linear-gradient(90deg,#0074d9,#00b4d8)",
      accent: "#00b4d9",
      text: "#ffffff",
      qr: "#003366",
      footer: "#101010",
    },
    "ember-portrait": {
      bg: "linear-gradient(160deg,#1a0500 0%,#3d0c00 50%,#7c1900 100%)",
      header: "linear-gradient(90deg,#ff4500,#ff8c00)",
      accent: "#ff4500",
      text: "#fff5f0",
      qr: "#3d0c00",
      footer: "#101010",
    },
    "midnight-landscape": {
      bg: "linear-gradient(120deg,#0f0c29 0%,#302b63 50%,#24243e 100%)",
      header: "linear-gradient(180deg,#302b63,#24243e)",
      accent: "#7c3aed",
      text: "#ffffff",
      qr: "#1e1b4b",
      footer: "#101010",
    },
    "neon-night-landscape": {
      bg: "linear-gradient(120deg,#0a0a0a 0%,#1a0533 60%,#0d0d0d 100%)",
      header: "linear-gradient(180deg,#ff0080,#7928ca)",
      accent: "#ff0080",
      text: "#ffffff",
      qr: "#1a0533",
      footer: "#101010",
    },
    "golden-vip-landscape": {
      bg: "linear-gradient(120deg,#1a1200 0%,#2d1f00 50%,#1a1200 100%)",
      header: "linear-gradient(180deg,#b8860b,#ffd700)",
      accent: "#ffd700",
      text: "#fff8dc",
      qr: "#2d1f00",
      footer: "#101010",
    },
    "ocean-landscape": {
      bg: "linear-gradient(120deg,#001f3f 0%,#003366 50%,#0074d9 100%)",
      header: "linear-gradient(180deg,#0074d9,#00b4d8)",
      accent: "#00b4d9",
      text: "#ffffff",
      qr: "#003366",
      footer: "#101010",
    },
    "ember-landscape": {
      bg: "linear-gradient(120deg,#1a0500 0%,#3d0c00 50%,#7c1900 100%)",
      header: "linear-gradient(180deg,#ff4500,#ff8c00)",
      accent: "#ff4500",
      text: "#fff5f0",
      qr: "#3d0c00",
      footer: "#101010",
    },
  };
  
  const colors = templateColors[templateId || ""] || templateColors["midnight-portrait"] || {
    bg: "#0b0b0b",
    header: "#ff3b3b",
    accent: "#ff3b3b",
    text: "#f5f5f5",
    qr: "#ffffff",
    footer: "#101010",
  };
  
  // Use uploaded background if available
  // For email compatibility, use a table-based layout with background attribute
  // This works better across email clients than CSS background-image
  const hasUploadBg = ticketDesign?.source === "upload" && ticketDesign.background_url
  
  const photoLinkSection = photoUploadLink
    ? `
      <div style="margin-top:20px; padding:16px; background:#1a1a1a; border-radius:10px; border:1px solid #2a2a2a; text-align:center;">
        <p style="margin:0 0 12px; font-size:13px; color:#cfcfcf;">
          Add a quick photo to this ticket for extra security at the gate.
        </p>
        <a href="${escapeHtml(photoUploadLink)}" style="display:inline-block; background:#ff3b3b; color:#ffffff; text-decoration:none; padding:10px 20px; border-radius:8px; font-size:13px; font-weight:600;">
          Add Security Photo
        </a>
      </div>
      `
    : "";
  
// Build QR section based on position
  const qrAlign = qrPosition === "right" ? "right" : (qrPosition === "left" ? "left" : "center");
  const qrSection = `
      <div style="background:${colors.qr}; border-radius:10px; padding:16px; text-align:${qrAlign}; margin-bottom:20px; border:1px solid #2a2a2a;">
        <img src="${qrCodeDataUrl}" alt="Ticket QR Code" style="width:200px; height:200px; display:block; margin:0 auto;" />
      </div>
      <p style="text-align:${qrAlign}; font-size:13px; color:#9a9a9a; margin:0 0 24px;">
        Present this QR code at the event entrance
      </p>
    `;
  
  // Build the inner ticket content
  const ticketContent = `
    <div style="padding:20px 24px; border-bottom:1px solid #2a2a2a;">
      <span style="color:${colors.accent}; font-weight:700; font-size:18px;">YoVibe</span>
    </div>

    <div style="padding:24px;">
      <p style="margin:0 0 16px; font-size:15px; color:#cfcfcf;">Hi ${greetingName}, here's your ticket.</p>

      ${qrSection}

      <div style="border-top:1px solid #2a2a2a; padding-top:16px;">
        ${row("Event", escapeHtml(eventName))}
        ${row("Ticket Type", escapeHtml(ticketType))}
        ${venue ? row("Venue", escapeHtml(venue)) : ""}
        ${row("Date", escapeHtml(date))}
        ${row("Time", escapeHtml(time))}
        ${row("Ticket Ref", escapeHtml(ticketRef))}
      </div>
    </div>

    <div style="padding:16px 24px; background:${colors.footer}; text-align:center;">
      <p style="margin:0; font-size:11px; color:#6b6b6b;">
        This ticket is verified and secured by YoVibe
      </p>
    </div>
    ${photoLinkSection}
  `;
  
  // Use custom dimensions if available, otherwise use defaults
  const ticketWidth = customDims?.width || 480;
  const ticketHeight = customDims?.height || 560;
  
  // For uploaded backgrounds, apply background-image to the ticket card itself
  if (hasUploadBg) {
    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.bg}; padding:24px; border-collapse:collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="${ticketWidth}" cellpadding="0" cellspacing="0" style="background-image:url('${ticketDesign.background_url}'); background-size:cover; background-position:center; background-repeat:no-repeat; border-radius:12px; overflow:hidden; border:1px solid #2a2a2a; border-collapse:collapse;">
            <tr>
              <td style="padding:24px; color:${colors.text}; font-family:-apple-system, Segoe UI, Roboto, Arial, sans-serif; background:transparent;">
                ${ticketContent}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    `
  }
  
  // Default gradient background
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:${colors.bg}; padding:24px; color:${colors.text};">
    <div style="max-width:${ticketWidth}px; margin:0 auto; background:#161616; border-radius:12px; overflow:hidden; border:1px solid #2a2a2a;">
      ${ticketContent}
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

// Load background image bytes from R2 URL or data URL
async function loadBackgroundImageBytes(backgroundUrl) {
  if (!backgroundUrl) return null;
  
  // Check if it's a data URL
  if (backgroundUrl.startsWith('data:image/')) {
    const dataUrlMatch = /^data:(image\/(png|jpeg|jpg));base64,(.+)$/i.exec(backgroundUrl);
    if (dataUrlMatch) {
      return {
        isPng: dataUrlMatch[1].toLowerCase().includes("png"),
        bytes: Buffer.from(dataUrlMatch[3], "base64"),
      };
    }
    return null;
  }
  
  // Fetch from URL (R2 or other hosted URL)
  try {
    const response = await fetch(backgroundUrl);
    if (!response.ok) {
      console.warn(`Failed to fetch background image: ${response.status}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "";
    const isPng = contentType.includes("png") || /\.png($|\?)/i.test(backgroundUrl);
    return {
      isPng,
      bytes: Buffer.from(arrayBuffer),
    };
  } catch (error) {
    console.warn("Error fetching background image:", error.message);
    return null;
  }
}

// Builds a single-page PDF ticket using pdf-lib (no headless browser needed,
// keeps the function lightweight for Netlify's serverless environment).
async function buildTicketPdf({
  eventName,
  ticketType,
  venue,
  date,
  time,
  ticketRef,
  qrCodeDataUrl,
  buyerName,
  ticketDesign,
}) {
  // Use dimensions from ticket design if available
  const isLandscape = ticketDesign?.orientation === "landscape";
  const qrPosition = ticketDesign?.qr_position || "center";
  const customDims = ticketDesign?.dimensions;
  
  // PDF page dimensions: use custom dimensions or defaults
  // Default: portrait 600x900, landscape 900x500
  const pdfWidth = customDims?.width || (isLandscape ? 900 : 600);
  const pdfHeight = customDims?.height || (isLandscape ? 500 : 900);
  
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([pdfWidth, pdfHeight]);
  const { width, height } = page.getSize();
  
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  const textGrey = rgb(0.6, 0.6, 0.6);
  const textWhite = rgb(0.96, 0.96, 0.96);
  const green = rgb(0.29, 0.87, 0.5);
  const brandRed = rgb(1, 0.23, 0.23);
  
  // Extract colors from ticket design or use defaults
  const isEnabled = ticketDesign?.enabled !== false;
  const templateId = ticketDesign?.source === "template" ? ticketDesign.template_id : null;
  
  // Define color schemes for different templates
  const templateColors = {
    "midnight-portrait": { bg: rgb(0.07, 0.07, 0.07), accent: rgb(0.49, 0.51, 0.73), text: textWhite, qr: rgb(0.12, 0.18, 0.31) },
    "neon-night-portrait": { bg: rgb(0.04, 0.04, 0.04), accent: rgb(1, 0, 0.5), text: textWhite, qr: rgb(0.10, 0.02, 0.20) },
    "golden-vip-portrait": { bg: rgb(0.10, 0.12, 0.00), accent: rgb(0.85, 0.53, 0.00), text: textWhite, qr: rgb(0.18, 0.12, 0.00) },
    "ocean-portrait": { bg: rgb(0.00, 0.12, 0.24), accent: rgb(0.00, 0.72, 0.85), text: textWhite, qr: rgb(0.00, 0.20, 0.40) },
    "ember-portrait": { bg: rgb(0.10, 0.02, 0.00), accent: rgb(1, 0.27, 0.14), text: textWhite, qr: rgb(0.24, 0.05, 0.00) },
    "midnight-landscape": { bg: rgb(0.07, 0.07, 0.07), accent: rgb(0.49, 0.51, 0.73), text: textWhite, qr: rgb(0.12, 0.18, 0.31) },
    "neon-night-landscape": { bg: rgb(0.04, 0.04, 0.04), accent: rgb(1, 0, 0.5), text: textWhite, qr: rgb(0.10, 0.02, 0.20) },
    "golden-vip-landscape": { bg: rgb(0.10, 0.12, 0.00), accent: rgb(0.85, 0.53, 0.00), text: textWhite, qr: rgb(0.18, 0.12, 0.00) },
    "ocean-landscape": { bg: rgb(0.00, 0.12, 0.24), accent: rgb(0.00, 0.72, 0.85), text: textWhite, qr: rgb(0.00, 0.20, 0.40) },
    "ember-landscape": { bg: rgb(0.10, 0.02, 0.00), accent: rgb(1, 0.27, 0.14), text: textWhite, qr: rgb(0.24, 0.05, 0.00) },
  };
  
  const colors = templateColors[templateId || ""] || templateColors["midnight-portrait"] || {
    bg: rgb(0.07, 0.07, 0.07),
    accent: brandRed,
    text: textWhite,
    qr: rgb(1, 1, 1),
  };
  
  // Load and embed background image if available
  let bgImageEmbed = null;
  const isUploadBg = ticketDesign?.source === "upload" && ticketDesign.background_url
  if (isUploadBg) {
    try {
      const bgImg = await loadBackgroundImageBytes(ticketDesign.background_url);
      if (bgImg) {
        bgImageEmbed = bgImg.isPng
          ? await pdfDoc.embedPng(bgImg.bytes)
          : await pdfDoc.embedJpg(bgImg.bytes);
        console.log("PDF: Background image loaded and embedded");
      }
    } catch (error) {
      console.warn("PDF: Failed to load background image:", error.message);
    }
  }
  
  // Draw background image if available
  if (bgImageEmbed) {
    page.drawImage(bgImageEmbed, {
      x: 0,
      y: 0,
      width: width,
      height: height,
      opacity: 0.3, // Semi-transparent for text readability
    });
  }
  
  let cursorY = height - 36;

  // Brand header
  page.drawText("YoVibe", {
    x: 24,
    y: cursorY,
    size: 16,
    font: fontBold,
    color: colors.accent,
  });
  cursorY -= 28;

  page.drawText(buyerName ? `Ticket for ${buyerName}` : "Your Ticket", {
    x: 24,
    y: cursorY,
    size: 11,
    font: fontRegular,
    color: colors.text,
  });
  cursorY -= 24;

  // QR code image — fetched from R2/hosted URL or decoded from inline base64
  const decoded = await loadQrImageBytes(qrCodeDataUrl);
  const qrSize = isLandscape ? 140 : 200;
  
  // Position QR based on qr_position
  let qrX = (width - qrSize) / 2;
  if (qrPosition === "right") {
    qrX = width - qrSize - 24;
  } else if (qrPosition === "left") {
    qrX = 24;
  }
  
  // For right position, move QR section earlier in the layout
  if (qrPosition === "right" && isLandscape) {
    // In landscape with right QR, we need to adjust layout
    // For simplicity, keep centered in PDF for now
    qrX = (width - qrSize) / 2;
  }

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
    color: colors.text,
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
    ["Ticket Ref", ticketRef],
  ];

  for (const [label, value, isAmount] of fields) {
    page.drawText(label, {
      x: 24,
      y: cursorY,
      size: 10,
      font: fontRegular,
      color: colors.qr,
    });
    const valueText = String(value);
    const valueWidth = fontBold.widthOfTextAtSize(valueText, 10);
    page.drawText(valueText, {
      x: width - 24 - valueWidth,
      y: cursorY,
      size: 10,
      font: fontBold,
      color: isAmount ? green : colors.text,
    });
    cursorY -= 20;
  }

  // Footer
  page.drawText("This ticket is verified and secured by YoVibe", {
    x: 24,
    y: 20,
    size: 8,
    font: fontRegular,
    color: colors.qr,
  });

  return pdfDoc.save(); // returns Uint8Array
}

async function sendViaZeptoMail({ to, subject, html, pdfBytes, ticketRef }) {
  if (!ZEPTOMAIL_TOKEN) {
    return { ok: false, error: "ZEPTOMAIL_TOKEN not configured" };
  }

  const body = {
    from: { address: "tickets@yovibe.net", name: "YoVibe Tickets" },
    to: [{ email_address: { address: to } }],
    subject,
    htmlbody: html,
  };

  if (pdfBytes) {
    body.attachments = [
      {
        content: Buffer.from(pdfBytes).toString("base64"),
        mime_type: "application/pdf",
        name: `${ticketRef}.pdf`,
      },
    ];
  }

  try {
    const res = await fetch("https://api.zeptomail.com/v1.1/email", {
      method: "POST",
      headers: {
        "Authorization": ZEPTOMAIL_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `ZeptoMail API error: ${errText}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: `ZeptoMail request failed: ${err.message}` };
  }
}

async function sendViaResendFallback({ to, subject, html, pdfBytes, ticketRef }) {
  const { data, error } = await resend.emails.send({
    from: "YoVibe Tickets <tickets@yovibe.net>",
    to: [to],
    subject,
    html,
    attachments: pdfBytes
      ? [{ filename: `${ticketRef}.pdf`, content: Buffer.from(pdfBytes).toString("base64") }]
      : undefined,
  });

  if (error) {
    return { ok: false, error };
  }
  return { ok: true, id: data?.id };
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
    ticketRef,
    qrCodeDataUrl,
    photoUploadLink,
    ticketDesign,
  } = payload;

  // Required fields — fail fast with a clear message rather than a vague 500 later
  const missing = [];
  if (!isValidEmail(buyerEmail)) missing.push("buyerEmail (invalid or missing)");
  if (!eventName) missing.push("eventName");
  if (!ticketType) missing.push("ticketType");
  if (!date) missing.push("date");
  if (!time) missing.push("time");
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
    ticketRef,
    qrCodeDataUrl,
    buyerName,
    photoUploadLink,
    ticketDesign,
  });

  let pdfBytes;
  try {
    pdfBytes = await buildTicketPdf({
      eventName,
      ticketType,
      venue,
      date,
      time,
      ticketRef,
      qrCodeDataUrl,
      buyerName,
      ticketDesign,
    });
  } catch (err) {
    // PDF generation failing shouldn't block the email entirely — log it
    // and fall back to sending the HTML-only email so the buyer still gets something.
    console.error("send-ticket-email: PDF generation failed", err);
  }

  const emailSubject = `Your ticket for ${eventName}`;

  const zeptoResult = await sendViaZeptoMail({
    to: buyerEmail,
    subject: emailSubject,
    html,
    pdfBytes,
    ticketRef,
  });

  if (zeptoResult.ok) {
    console.log("send-ticket-email: sent successfully via ZeptoMail");
    return { statusCode: 200, body: JSON.stringify({ success: true, provider: "zeptomail" }) };
  }

  console.warn("send-ticket-email: ZeptoMail failed, falling back to Resend:", zeptoResult.error);

  const resendResult = await sendViaResendFallback({
    to: buyerEmail,
    subject: emailSubject,
    html,
    pdfBytes,
    ticketRef,
    eventName,
  });

  if (!resendResult.ok) {
    console.error("send-ticket-email: Resend fallback also failed", resendResult.error);
    return {
      statusCode: 502,
      body: JSON.stringify({
        error: "Failed to send email via both providers",
        zeptoError: zeptoResult.error,
        resendError: resendResult.error,
      }),
    };
  }

  console.log("send-ticket-email: sent successfully via Resend (fallback)");
  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, provider: "resend-fallback", id: resendResult.id }),
  };
};