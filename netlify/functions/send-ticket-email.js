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

const {
  computeTicketLayout,
  computeEmailSections,
  computePdfPositions,
} = require("./ticketLayoutEngine");

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
  
  // Extract template id for color scheme
  const templateId = ticketDesign?.source === "template" ? ticketDesign.template_id : null;
  
  // Compute layout using the shared engine
  const computed = computeTicketLayout(ticketDesign || {}, { hasPoster: false });
  const emailSections = computeEmailSections(computed);
  
  // Get page width from computed layout
  const ticketWidth = Math.min(computed.pageWidth, 600);
  
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
  
  // Build section HTML for each block based on its computed position
  function blockToHtml(block) {
    const align = block.align || "center";
    const marginDir = align === "center" ? "0 auto" : (align === "right" ? "0 0 0 auto" : "0 auto 0 0");
    
    if (block.id === "qr") {
      return `
        <div style="background:${colors.qr}; border-radius:10px; padding:16px; text-align:${align}; margin-bottom:20px; max-width:${block.width}px; margin-left:${align === "right" ? "auto" : "0"}; margin-right:${align === "left" ? "auto" : "0"}; border:1px solid #2a2a2a;">
          <img src="${qrCodeDataUrl}" alt="Ticket QR Code" style="width:${Math.min(block.width, 200)}px; height:${Math.min(block.height, 200)}px; display:block; margin:0 auto;" />
        </div>
        <p style="text-align:${align}; font-size:13px; color:#9a9a9a; margin:0 0 24px;">
          Present this QR code at the event entrance
        </p>
      `;
    }
    
    if (block.id === "title") {
      return `
        <div style="text-align:${align}; margin-bottom:16px;">
          <p style="margin:0 0 4px; font-size:26px; font-weight:800; color:${colors.text}; text-shadow:0 2px 8px rgba(0,0,0,0.6);">${escapeHtml(eventName)}</p>
          <span style="display:inline-block; background:${colors.accent}; color:#ffffff; font-size:11px; font-weight:700; padding:4px 14px; border-radius:20px; letter-spacing:0.5px; text-transform:uppercase;">${escapeHtml(ticketType)}</span>
        </div>
      `;
    }
    
    if (block.id === "info") {
      return `
        <div style="display:flex; flex-direction:column; gap:10px; background:rgba(0,0,0,0.45); border-radius:10px; padding:14px 16px; border:1px solid rgba(167,139,250,0.25); max-width:${block.width}px; margin-bottom:20px; margin-left:${align === "right" ? "auto" : "0"}; margin-right:${align === "left" ? "auto" : "0"}; text-align:${align};">
          ${row("Event", escapeHtml(eventName))}
          ${row("Ticket Type", escapeHtml(ticketType))}
          ${venue ? row("Venue", escapeHtml(venue)) : ""}
          ${row("Date", escapeHtml(date))}
          ${row("Time", escapeHtml(time))}
          ${row("Ticket Ref", escapeHtml(ticketRef))}
        </div>
      `;
    }
    
    if (block.id === "poster") {
      return ``;
    }
    
    return "";
  }
  
  const sectionsHtml = emailSections.map(function(block) {
    return blockToHtml(block);
  }).filter(function(s) { return s; }).join("\n");
  
  // Build the full ticket HTML
  const ticketContent = `
    <div style="padding:20px 24px; border-bottom:1px solid #2a2a2a;">
      <span style="color:${colors.accent}; font-weight:700; font-size:18px;">YoVibe</span>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px; font-size:15px; color:#cfcfcf;">Hi ${greetingName}, here's your ticket.</p>
      ${sectionsHtml}
    </div>
    <div style="padding:16px 24px; background:${colors.footer}; text-align:center;">
      <p style="margin:0; font-size:11px; color:#6b6b6b;">
        This ticket is verified and secured by YoVibe
      </p>
    </div>
    ${photoLinkSection}
  `;
  
  // Apply background image transform to the ticket card
  function bgStyleFromTransform(bg) {
    return `background-image:url('${computed.bgImage}'); background-size:${bg.scale * 100}%; background-position:calc(50% + ${bg.x}px) calc(50% + ${bg.y}px); background-repeat:no-repeat;`;
  }
  
  if (computed.isUploadBg) {
    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.bg}; padding:24px; border-collapse:collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="${ticketWidth}" cellpadding="0" cellspacing="0" style="${bgStyleFromTransform(computed.bgTransform)} border-radius:12px; overflow:hidden; border:1px solid #2a2a2a; border-collapse:collapse;">
            <tr>
              <td style="padding:0; color:${colors.text}; font-family:-apple-system, Segoe UI, Roboto, Arial, sans-serif; background:transparent;">
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
  // Compute layout from ticket design using the shared engine
  const computed = computeTicketLayout(ticketDesign || {}, { hasPoster: false });
  
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([computed.pageWidth, computed.pageHeight]);
  const { width, height } = page.getSize();
  
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  const textWhite = rgb(0.96, 0.96, 0.96);
  const brandRed = rgb(1, 0.23, 0.23);
  
  // Extract colors from ticket design or use defaults
  const templateId = ticketDesign?.source === "template" ? ticketDesign.template_id : null;
  
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
  
  // Load and draw background image with transform from layout
  let bgImageEmbed = null;
  if (computed.isUploadBg) {
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
  
  if (bgImageEmbed) {
    const bg = computed.bgTransform;
    const bgW = width * bg.scale;
    const bgH = height * bg.scale;
    const bgX = (width - bgW) / 2 + bg.x;
    const bgY = (height - bgH) / 2 + bg.y;
    page.drawImage(bgImageEmbed, {
      x: bgX,
      y: bgY,
      width: bgW,
      height: bgH,
      opacity: 0.3,
    });
  }
  
  // Get PDF positions (Y-axis flipped) for all blocks
  const pdfPositions = computePdfPositions(computed, height);
  
  // Draw each block at its computed position
  const qrDecoded = await loadQrImageBytes(qrCodeDataUrl);
  let qrEmbed = null;
  if (qrDecoded) {
    qrEmbed = qrDecoded.isPng
      ? await pdfDoc.embedPng(qrDecoded.bytes)
      : await pdfDoc.embedJpg(qrDecoded.bytes);
  }
  
  for (const pos of pdfPositions) {
    if (pos.id === "qr" && qrEmbed) {
      const qrW = Math.min(pos.width, qrEmbed.width);
      const qrH = Math.min(pos.height, qrEmbed.height);
      page.drawRectangle({
        x: pos.x - 6,
        y: pos.y - 6,
        width: qrW + 12,
        height: qrH + 12,
        color: rgb(1, 1, 1),
      });
      page.drawImage(qrEmbed, {
        x: pos.x,
        y: pos.y,
        width: qrW,
        height: qrH,
      });
    }
    
    if (pos.id === "title") {
      const titleFontSize = Math.max(10, Math.min(16, pos.scale * 14));
      page.drawText(eventName, {
        x: pos.x,
        y: pos.y + pos.height - titleFontSize,
        size: titleFontSize,
        font: fontBold,
        color: colors.text,
      });
    }
    
    if (pos.id === "info") {
      const infoLines = [
        `${buyerName ? "Ticket for " + buyerName : "Your Ticket"}`,
        `${eventName}`,
        venue ? `Venue: ${venue}` : "",
        date ? `Date: ${date}` : "",
        time ? `Time: ${time}` : "",
        `Ref: ${ticketRef}`,
      ].filter(Boolean);
      
      const lineHeight = Math.max(8, Math.min(12, pos.scale * 10));
      let infoY = pos.y + pos.height - lineHeight;
      for (const line of infoLines) {
        page.drawText(line.slice(0, 40), {
          x: pos.x,
          y: infoY,
          size: lineHeight * 0.9,
          font: fontRegular,
          color: colors.text,
        });
        infoY -= lineHeight + 2;
      }
    }
  }
  
  // Footer
  page.drawText("This ticket is verified and secured by YoVibe", {
    x: 24,
    y: 20,
    size: 8,
    font: fontRegular,
    color: colors.qr,
  });
  
  return pdfDoc.save();
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