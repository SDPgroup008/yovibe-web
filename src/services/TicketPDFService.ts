import * as Print from "expo-print"
import * as Sharing from "expo-sharing"
import { Platform } from "react-native"
import type { Ticket } from "../models/Ticket"
import type { Event } from "../models/Event"
import { getTemplateById, type TicketTemplateConfig } from "../constants/ticketTemplates"

// ─── Dimensions ───────────────────────────────────────────────────────────────
const PORTRAIT_W = 600
const PORTRAIT_H = 900
const LANDSCAPE_W = 900
const LANDSCAPE_H = 500

// ─── Font stack per style ─────────────────────────────────────────────────────
const FONT_STACKS = {
  sans: "'Helvetica Neue', Arial, sans-serif",
  mono: "'Courier New', Courier, monospace",
  serif: "Georgia, 'Times New Roman', serif",
}

// ─── QR block HTML ────────────────────────────────────────────────────────────
function qrBlock(qrDataUrl: string, ticketRef: string, tpl: TicketTemplateConfig): string {
  return `
    <div class="qr-block">
      <div class="qr-card">
        <img src="${qrDataUrl}" alt="QR Code" class="qr-img" />
      </div>
      <p class="qr-hint">Scan at entrance</p>
      <div class="ticket-ref">${ticketRef}</div>
    </div>`
}

// ─── Info rows ────────────────────────────────────────────────────────────────
function infoRow(icon: string, label: string, value: string): string {
  return `
    <div class="info-row">
      <span class="info-icon">${icon}</span>
      <div class="info-text">
        <span class="info-label">${label}</span>
        <span class="info-value">${value}</span>
      </div>
    </div>`
}

// ─── Main HTML generator ──────────────────────────────────────────────────────
export function generateTicketHTML(
  ticket: Ticket,
  event?: Event,
  overrideQrDataUrl?: string
): string {
  const eventName = event?.name || ticket.eventName || "Event"
  const venueName = event?.venueName || ticket.venueName || "TBA"
  const location = event?.location || "TBA"

  const eventDate =
    ticket.eventStartTime instanceof Date
      ? ticket.eventStartTime
      : new Date(ticket.eventStartTime)

  const fmtDate = eventDate.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  })
  const fmtTime = eventDate.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit",
  })

  const qrSrc = overrideQrDataUrl || ticket.qrCodeDataUrl || ""
  const ticketRef = ticket.ticketRef || ticket.id?.slice(0, 8).toUpperCase() || "XXXXXXXX"
  const ticketType = ticket.entryFeeType || "Standard"
  const buyerName = ticket.buyerName || "Guest"

  // Resolve template
  const design = event?.ticket_design
  let tpl: TicketTemplateConfig | undefined

  if (design?.enabled && design.source === "template" && design.template_id) {
    tpl = getTemplateById(design.template_id)
  }

  // Fallback template when no design or upload-based design
  const fallback: TicketTemplateConfig = {
    id: "fallback",
    label: "Default",
    orientation: design?.orientation || "portrait",
    background: "linear-gradient(160deg,#0f0c29 0%,#302b63 50%,#24243e 100%)",
    headerBg: "linear-gradient(90deg,#302b63,#24243e)",
    accentColor: "#7c3aed",
    textPrimary: "#ffffff",
    textSecondary: "#a78bfa",
    qrBg: "#1e1b4b",
    dividerColor: "rgba(167,139,250,0.25)",
    badgeBg: "#7c3aed",
    badgeText: "#ffffff",
    fontStyle: "sans",
    qrPosition: "center",
    thumbnailSvg: "",
  }

  // If upload-based, use fallback layout but swap background to the uploaded image
  const uploadBg =
    design?.enabled && design.source === "upload" && design.background_url
      ? `url('${design.background_url}') center/cover no-repeat`
      : null

  const t = tpl || fallback
  // Allow preview to override qrPosition without changing the template
  const qrPos = (design as any)?.qrPositionOverride || t.qrPosition
  const isLandscape = t.orientation === "landscape"
  const W = isLandscape ? LANDSCAPE_W : PORTRAIT_W
  const H = isLandscape ? LANDSCAPE_H : PORTRAIT_H
  const fontStack = FONT_STACKS[t.fontStyle]
  const bg = uploadBg || t.background

  const qr = qrBlock(qrSrc, ticketRef, t)
  const info = `
    ${infoRow("📅", "Date", fmtDate)}
    ${infoRow("🕐", "Time", fmtTime)}
    ${infoRow("📍", "Venue", `${venueName}${location !== "TBA" ? ` · ${location}` : ""}`)}
    ${infoRow("👤", "Name", buyerName)}`

  // ── Portrait layouts ──────────────────────────────────────────────────────
  let bodyContent: string

  if (!isLandscape) {
    if (qrPos === "top") {
      bodyContent = `
        <div class="header">${qr}</div>
        <div class="divider"></div>
        <div class="event-name">${eventName}</div>
        <div class="badge">${ticketType}</div>
        <div class="info-block">${info}</div>`
    } else if (qrPos === "bottom") {
      bodyContent = `
        <div class="header">
          <div class="event-name">${eventName}</div>
          <div class="badge">${ticketType}</div>
        </div>
        <div class="info-block">${info}</div>
        <div class="divider"></div>
        <div class="qr-section">${qr}</div>`
    } else {
      // center (default)
      bodyContent = `
        <div class="header">
          <div class="event-name">${eventName}</div>
          <div class="badge">${ticketType}</div>
        </div>
        <div class="divider"></div>
        <div class="qr-section">${qr}</div>
        <div class="divider"></div>
        <div class="info-block">${info}</div>`
    }
  } else {
    // ── Landscape layouts ───────────────────────────────────────────────────
    const infoPanel = `
      <div class="ls-info">
        <div class="event-name">${eventName}</div>
        <div class="badge">${ticketType}</div>
        <div class="info-block">${info}</div>
      </div>`
    const qrPanel = `<div class="ls-qr">${qr}</div>`

    if (qrPos === "left") {
      bodyContent = `${qrPanel}${infoPanel}`
    } else {
      bodyContent = `${infoPanel}${qrPanel}`
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>YoVibe Ticket</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: ${fontStack};
    background: ${bg};
    color: ${t.textPrimary};
    width: ${W}px;
    height: ${H}px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Shared ── */
  .header {
    padding: 28px 28px 20px;
    background: ${t.headerBg};
  }
  .event-name {
    font-size: 22px;
    font-weight: 700;
    color: ${t.textPrimary};
    line-height: 1.3;
    padding: 20px 28px 8px;
  }
  .badge {
    display: inline-block;
    background: ${t.badgeBg};
    color: ${t.badgeText};
    font-size: 12px;
    font-weight: 700;
    padding: 5px 16px;
    border-radius: 20px;
    margin: 0 28px 16px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .divider {
    height: 1px;
    background: ${t.dividerColor};
    margin: 8px 28px;
  }
  .info-block {
    padding: 12px 28px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .info-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .info-icon { font-size: 16px; margin-top: 1px; }
  .info-text { display: flex; flex-direction: column; gap: 2px; }
  .info-label { font-size: 10px; color: ${t.textSecondary}; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-value { font-size: 14px; font-weight: 600; color: ${t.textPrimary}; }

  /* ── QR block ── */
  .qr-section { display: flex; justify-content: center; padding: 16px 28px; }
  .qr-block { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .qr-card {
    background: ${t.qrBg};
    border: 2px solid ${t.accentColor};
    border-radius: 12px;
    padding: 12px;
  }
  .qr-img { width: 160px; height: 160px; display: block; }
  .qr-hint { font-size: 11px; color: ${t.textSecondary}; }
  .ticket-ref {
    font-size: 11px;
    font-family: 'Courier New', monospace;
    color: ${t.accentColor};
    letter-spacing: 1px;
    background: rgba(0,0,0,0.2);
    padding: 3px 10px;
    border-radius: 4px;
  }

  /* ── Portrait: QR in header ── */
  .header .qr-block { padding: 8px 0; }
  .header .qr-img { width: 140px; height: 140px; }

  /* ── Portrait: QR at bottom ── */
  .qr-section { padding: 20px 28px 28px; }

  /* ── Landscape ── */
  body.landscape {
    flex-direction: row;
    min-height: ${H}px;
  }
  .ls-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0;
  }
  .ls-info .event-name { padding: 24px 24px 8px; font-size: 20px; }
  .ls-info .badge { margin: 0 24px 12px; }
  .ls-info .info-block { padding: 8px 24px 24px; gap: 10px; }
  .ls-qr {
    width: 220px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.2);
    padding: 20px;
  }
  .ls-qr .qr-img { width: 140px; height: 140px; }

  /* ── Footer strip ── */
  .footer {
    margin-top: auto;
    padding: 10px 28px;
    background: rgba(0,0,0,0.3);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    color: ${t.textSecondary};
  }
  .footer-brand { font-weight: 700; color: ${t.accentColor}; font-size: 12px; }
</style>
</head>
<body class="${isLandscape ? "landscape" : ""}">
  ${bodyContent}
  <div class="footer">
    <span class="footer-brand">YoVibe</span>
    <span>Verified &amp; Secured Ticket</span>
    <span>${ticketRef}</span>
  </div>
</body>
</html>`
}

// ─── Preview HTML (sample data, no real ticket needed) ────────────────────────
export function generatePreviewHTML(
  templateId: string | null,
  orientation: "portrait" | "landscape",
  uploadedBgUrl?: string | null,
  sampleData?: {
    eventName?: string
    venueName?: string
    ticketType?: string
    buyerName?: string
    qrPosition?: "top" | "bottom" | "center" | "left" | "right"
  }
): string {
  const fakeTicket: Ticket = {
    id: "preview-00000000",
    eventId: "preview",
    eventName: sampleData?.eventName || "Sample Event Night",
    venueName: sampleData?.venueName || "The Grand Venue",
    buyerId: "preview",
    buyerName: sampleData?.buyerName || "John Doe",
    buyerEmail: "preview@yovibe.net",
    quantity: 1,
    totalAmount: 50000,
    basePrice: 50000,
    lateFee: 0,
    venueRevenue: 42500,
    appCommission: 7500,
    purchaseDate: new Date(),
    eventStartTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    purchaseDeadline: new Date(),
    qrCode: "PREVIEW",
    qrCodeDataUrl:
      "data:image/svg+xml;base64," +
      btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
        <rect width="160" height="160" fill="white"/>
        <rect x="10" y="10" width="50" height="50" fill="black"/>
        <rect x="15" y="15" width="40" height="40" fill="white"/>
        <rect x="20" y="20" width="30" height="30" fill="black"/>
        <rect x="100" y="10" width="50" height="50" fill="black"/>
        <rect x="105" y="15" width="40" height="40" fill="white"/>
        <rect x="110" y="20" width="30" height="30" fill="black"/>
        <rect x="10" y="100" width="50" height="50" fill="black"/>
        <rect x="15" y="105" width="40" height="40" fill="white"/>
        <rect x="20" y="110" width="30" height="30" fill="black"/>
        <rect x="70" y="10" width="10" height="10" fill="black"/>
        <rect x="70" y="30" width="10" height="10" fill="black"/>
        <rect x="70" y="50" width="10" height="10" fill="black"/>
        <rect x="70" y="70" width="10" height="10" fill="black"/>
        <rect x="90" y="70" width="10" height="10" fill="black"/>
        <rect x="110" y="70" width="10" height="10" fill="black"/>
        <rect x="130" y="70" width="10" height="10" fill="black"/>
        <rect x="70" y="90" width="10" height="10" fill="black"/>
        <rect x="90" y="90" width="10" height="10" fill="black"/>
        <rect x="110" y="90" width="10" height="10" fill="black"/>
        <rect x="70" y="110" width="10" height="10" fill="black"/>
        <rect x="90" y="110" width="10" height="10" fill="black"/>
        <rect x="110" y="110" width="10" height="10" fill="black"/>
        <rect x="130" y="110" width="10" height="10" fill="black"/>
        <rect x="70" y="130" width="10" height="10" fill="black"/>
        <rect x="90" y="130" width="10" height="10" fill="black"/>
        <rect x="110" y="130" width="10" height="10" fill="black"/>
      </svg>`),
    ticketRef: "YV-PREVIEW",
    status: "active",
    validationHistory: [],
    entryFeeType: sampleData?.ticketType || "VIP",
    isLatePurchase: false,
    isScanned: false,
    expiresAt: new Date(),
    payoutEligible: false,
    payoutStatus: "pending",
    paymentMethod: "mobile_money",
  } as any

  const fakeEvent: Event = {
    id: "preview",
    slug: "preview",
    name: sampleData?.eventName || "Sample Event Night",
    venueName: sampleData?.venueName || "The Grand Venue",
    venueSlug: "preview",
    description: "",
    date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    time: "21:00",
    location: "KAMPALA",
    posterImageUrl: "",
    artists: [],
    isFeatured: false,
    isFreeEntry: false,
    entryFees: [],
    ticketContacts: [],
    createdAt: new Date(),
    ticket_design: {
      enabled: true,
      orientation,
      source: uploadedBgUrl ? "upload" : "template",
      template_id: templateId,
      background_url: uploadedBgUrl || null,
      dimensions:
        orientation === "portrait"
          ? { width: PORTRAIT_W, height: PORTRAIT_H }
          : { width: LANDSCAPE_W, height: LANDSCAPE_H },
      qrPositionOverride: sampleData?.qrPosition,
    },
  }

  return generateTicketHTML(fakeTicket, fakeEvent)
}

// ─── PDF / Print (unchanged API) ─────────────────────────────────────────────

export class TicketPDFService {
  static generateTicketHTML(ticket: Ticket, event?: Event): string {
    return generateTicketHTML(ticket, event)
  }

  static async downloadTicketPDF(
    ticket: Ticket,
    event?: Event
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const html = generateTicketHTML(ticket, event)

      if (Platform.OS === "web") {
        const blob = new Blob([html], { type: "text/html" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `ticket-${ticket.ticketRef || ticket.id}.html`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        return { success: true }
      }

      const { uri } = await Print.printToFileAsync({ html, base64: false })
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `YoVibe Ticket - ${ticket.eventName}`,
        })
        return { success: true }
      }
      return { success: false, error: "Sharing not available on this device" }
    } catch (error: any) {
      return { success: false, error: error.message || "Unknown error" }
    }
  }

  static async printTicket(
    ticket: Ticket,
    event?: Event
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const html = generateTicketHTML(ticket, event)
      await Print.printAsync({ html })
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }
}

export default TicketPDFService
