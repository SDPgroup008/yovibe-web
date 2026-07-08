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

// ─── Layout types ─────────────────────────────────────────────────────────────
export interface BlockLayout {
  id: string
  x: number
  y: number
}
export interface BgTransform {
  x: number
  y: number
  scale: number
}
export interface TicketLayout {
  blocks: BlockLayout[]
  bg: BgTransform
}

// ─── Font stacks ──────────────────────────────────────────────────────────────
const FONT_STACKS = {
  sans: "'Helvetica Neue', Arial, sans-serif",
  mono: "'Courier New', Courier, monospace",
  serif: "Georgia, 'Times New Roman', serif",
}

// ─── Fake QR SVG ──────────────────────────────────────────────────────────────
const FAKE_QR =
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
</svg>`)

// ─── Default block positions ───────────────────────────────────────────────────
export function defaultLayout(
  orientation: "portrait" | "landscape",
  hasPoster: boolean
): TicketLayout {
  if (orientation === "landscape") {
    return {
      blocks: [
        { id: "poster", x: 620, y: 20 },
        { id: "title",  x: 24,  y: 24 },
        { id: "info",   x: 24,  y: 120 },
        { id: "qr",     x: 680, y: 160 },
      ],
      bg: { x: 0, y: 0, scale: 1 },
    }
  }
  return {
    blocks: [
      { id: "poster", x: 320, y: 20 },
      { id: "title",  x: 24,  y: 24 },
      { id: "info",   x: 24,  y: 420 },
      { id: "qr",     x: 180, y: 240 },
    ],
    bg: { x: 0, y: 0, scale: 1 },
  }
}

// ─── Shared CSS ───────────────────────────────────────────────────────────────
function sharedCSS(t: TicketTemplateConfig, W: number, H: number, bg: string): string {
  return `
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: ${FONT_STACKS[t.fontStyle]};
    width: ${W}px; height: ${H}px;
    overflow: hidden; position: relative;
    color: ${t.textPrimary};
  }
  .bg-layer {
    position: absolute; inset: 0;
    background: ${bg};
    background-size: cover;
    background-position: center;
    z-index: 0;
  }
  .content-layer { position: absolute; inset: 0; z-index: 1; }
  .block {
    position: absolute;
    cursor: grab;
    user-select: none;
  }
  .block:active { cursor: grabbing; }
  .poster-block img {
    width: 220px; height: 220px;
    object-fit: cover;
    border-radius: 8px;
    border: 2px solid ${t.accentColor};
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    display: block;
  }
  .title-block .event-name {
    font-size: 26px; font-weight: 800;
    color: ${t.textPrimary};
    line-height: 1.2;
    text-shadow: 0 2px 8px rgba(0,0,0,0.6);
    max-width: 280px;
  }
  .title-block .badge {
    display: inline-block;
    background: ${t.badgeBg};
    color: ${t.badgeText};
    font-size: 11px; font-weight: 700;
    padding: 4px 14px; border-radius: 20px;
    margin-top: 8px; letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .info-block {
    display: flex; flex-direction: column; gap: 10px;
    background: rgba(0,0,0,0.45);
    backdrop-filter: blur(6px);
    border-radius: 10px; padding: 14px 16px;
    border: 1px solid ${t.dividerColor};
    max-width: 260px;
  }
  .info-row { display: flex; align-items: flex-start; gap: 10px; }
  .info-icon { font-size: 14px; margin-top: 1px; }
  .info-text { display: flex; flex-direction: column; gap: 1px; }
  .info-label { font-size: 9px; color: ${t.textSecondary}; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-value { font-size: 13px; font-weight: 600; color: ${t.textPrimary}; }
  .qr-block {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    background: ${t.qrBg};
    border: 2px solid ${t.accentColor};
    border-radius: 12px; padding: 12px;
  }
  .qr-img { width: 140px; height: 140px; display: block; }
  .qr-hint { font-size: 10px; color: ${t.textSecondary}; }
  .ticket-ref {
    font-size: 10px; font-family: 'Courier New', monospace;
    color: ${t.accentColor}; letter-spacing: 1px;
    background: rgba(0,0,0,0.3); padding: 2px 8px; border-radius: 4px;
  }
  .footer {
    position: absolute; bottom: 0; left: 0; right: 0;
    padding: 8px 20px;
    background: rgba(0,0,0,0.4);
    display: flex; justify-content: space-between; align-items: center;
    font-size: 10px; color: ${t.textSecondary};
    z-index: 2;
  }
  .footer-brand { font-weight: 700; color: ${t.accentColor}; font-size: 11px; }`
}

// ─── Block HTML builders ──────────────────────────────────────────────────────
function posterBlockHTML(posterUrl: string, layout: TicketLayout): string {
  const b = layout.blocks.find(b => b.id === "poster") || { x: 320, y: 20 }
  if (!posterUrl) return ""
  return `<div class="block poster-block" data-id="poster" style="left:${b.x}px;top:${b.y}px">
    <img src="${posterUrl}" alt="Event Poster"/>
  </div>`
}

function titleBlockHTML(eventName: string, ticketType: string, layout: TicketLayout): string {
  const b = layout.blocks.find(b => b.id === "title") || { x: 24, y: 24 }
  return `<div class="block title-block" data-id="title" style="left:${b.x}px;top:${b.y}px">
    <div class="event-name">${eventName}</div>
    <div class="badge">${ticketType}</div>
  </div>`
}

function infoBlockHTML(
  fmtDate: string, fmtTime: string, venueName: string, location: string,
  buyerName: string, layout: TicketLayout
): string {
  const b = layout.blocks.find(b => b.id === "info") || { x: 24, y: 420 }
  const loc = location && location !== "TBA" ? ` · ${location}` : ""
  return `<div class="block info-block" data-id="info" style="left:${b.x}px;top:${b.y}px">
    <div class="info-row"><span class="info-icon">📅</span><div class="info-text"><span class="info-label">Date</span><span class="info-value">${fmtDate}</span></div></div>
    <div class="info-row"><span class="info-icon">🕐</span><div class="info-text"><span class="info-label">Time</span><span class="info-value">${fmtTime}</span></div></div>
    <div class="info-row"><span class="info-icon">📍</span><div class="info-text"><span class="info-label">Venue</span><span class="info-value">${venueName}${loc}</span></div></div>
    <div class="info-row"><span class="info-icon">👤</span><div class="info-text"><span class="info-label">Name</span><span class="info-value">${buyerName}</span></div></div>
  </div>`
}

function qrBlockHTML(qrSrc: string, ticketRef: string, t: TicketTemplateConfig, layout: TicketLayout): string {
  const b = layout.blocks.find(b => b.id === "qr") || { x: 180, y: 240 }
  return `<div class="block qr-block" data-id="qr" style="left:${b.x}px;top:${b.y}px">
    <img src="${qrSrc}" class="qr-img" alt="QR"/>
    <span class="qr-hint">Scan at entrance</span>
    <div class="ticket-ref">${ticketRef}</div>
  </div>`
}

// ─── Resolve template + bg ────────────────────────────────────────────────────
function resolveTemplate(event?: Event): { t: TicketTemplateConfig; bg: string; isLandscape: boolean; W: number; H: number } {
  const design = event?.ticket_design
  let tpl: TicketTemplateConfig | undefined
  if (design?.enabled && design.source === "template" && design.template_id) {
    tpl = getTemplateById(design.template_id)
  }
  const fallback: TicketTemplateConfig = {
    id: "fallback", label: "Default",
    orientation: design?.orientation || "portrait",
    background: "linear-gradient(160deg,#0f0c29 0%,#302b63 50%,#24243e 100%)",
    headerBg: "linear-gradient(90deg,#302b63,#24243e)",
    accentColor: "#7c3aed", textPrimary: "#ffffff", textSecondary: "#a78bfa",
    qrBg: "#1e1b4b", dividerColor: "rgba(167,139,250,0.25)",
    badgeBg: "#7c3aed", badgeText: "#ffffff", fontStyle: "sans",
    qrPosition: "center", thumbnailSvg: "",
  }
  const t = tpl || fallback
  const uploadBg = design?.enabled && design.source === "upload" && design.background_url
    ? `url('${design.background_url}') center/cover no-repeat`
    : null
  const bg = uploadBg || t.background
  const isLandscape = (design?.orientation || t.orientation) === "landscape"
  const W = isLandscape ? LANDSCAPE_W : PORTRAIT_W
  const H = isLandscape ? LANDSCAPE_H : PORTRAIT_H
  return { t, bg, isLandscape, W, H }
}

// ─── Main ticket HTML (uses layout for absolute positioning) ──────────────────
export function generateTicketHTML(
  ticket: Ticket,
  event?: Event,
  overrideQrDataUrl?: string,
  layout?: TicketLayout
): string {
  const eventName = event?.name || ticket.eventName || "Event"
  const venueName = event?.venueName || ticket.venueName || "TBA"
  const location = event?.location || "TBA"
  const eventDate = ticket.eventStartTime instanceof Date ? ticket.eventStartTime : new Date(ticket.eventStartTime)
  const fmtDate = eventDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
  const fmtTime = eventDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  const qrSrc = overrideQrDataUrl || ticket.qrCodeDataUrl || ""
  const ticketRef = ticket.ticketRef || ticket.id?.slice(0, 8).toUpperCase() || "XXXXXXXX"
  const ticketType = ticket.entryFeeType || "Standard"
  const buyerName = ticket.buyerName || "Guest"
  const posterUrl = event?.posterImageUrl || ""

  const { t, bg, isLandscape, W, H } = resolveTemplate(event)
  const lyt = layout || defaultLayout(isLandscape ? "landscape" : "portrait", !!posterUrl)

  // Build bg CSS with transform for upload pan/zoom
  const design = event?.ticket_design
  let bgStyle = bg
  if (design?.source === "upload" && design.background_url) {
    const { x, y, scale } = lyt.bg
    bgStyle = `url('${design.background_url}')`
    const bgCSS = `background: ${bgStyle}; background-size: ${scale * 100}%; background-position: calc(50% + ${x}px) calc(50% + ${y}px); background-repeat: no-repeat;`
    return buildHTML(t, W, H, bgCSS, eventName, ticketType, fmtDate, fmtTime, venueName, location, buyerName, qrSrc, ticketRef, posterUrl, lyt, false)
  }

  return buildHTML(t, W, H, `background: ${bg};`, eventName, ticketType, fmtDate, fmtTime, venueName, location, buyerName, qrSrc, ticketRef, posterUrl, lyt, false)
}

function buildHTML(
  t: TicketTemplateConfig, W: number, H: number, bgCSS: string,
  eventName: string, ticketType: string, fmtDate: string, fmtTime: string,
  venueName: string, location: string, buyerName: string,
  qrSrc: string, ticketRef: string, posterUrl: string,
  layout: TicketLayout, editorMode: boolean
): string {
  const css = sharedCSS(t, W, H, "transparent")
  const posterHTML = posterUrl ? posterBlockHTML(posterUrl, layout) : ""
  const titleHTML = titleBlockHTML(eventName, ticketType, layout)
  const infoHTML = infoBlockHTML(fmtDate, fmtTime, venueName, location, buyerName, layout)
  const qrHTML = qrBlockHTML(qrSrc, ticketRef, t, layout)

  const editorScript = editorMode ? `
<script>
(function() {
  var blocks = {};
  document.querySelectorAll('.block').forEach(function(el) {
    var id = el.dataset.id;
    blocks[id] = { x: parseInt(el.style.left)||0, y: parseInt(el.style.top)||0 };
  });
  var bg = { x: 0, y: 0, scale: 1 };
  var bgLayer = document.querySelector('.bg-layer');

  function applyBg() {
    if (!bgLayer) return;
    bgLayer.style.backgroundSize = (bg.scale * 100) + '%';
    bgLayer.style.backgroundPosition = 'calc(50% + ' + bg.x + 'px) calc(50% + ' + bg.y + 'px)';
  }

  function emit() {
    var layout = { blocks: Object.keys(blocks).map(function(id){ return {id:id, x:blocks[id].x, y:blocks[id].y}; }), bg: bg };
    window.parent.postMessage({ type: 'LAYOUT_UPDATE', layout: layout }, '*');
  }

  // Drag blocks
  document.querySelectorAll('.block').forEach(function(el) {
    var id = el.dataset.id;
    var startX, startY, origX, origY;
    el.addEventListener('mousedown', function(e) {
      e.preventDefault();
      startX = e.clientX; startY = e.clientY;
      origX = blocks[id].x; origY = blocks[id].y;
      el.style.outline = '2px dashed rgba(255,255,255,0.7)';
      function onMove(e) {
        var dx = e.clientX - startX, dy = e.clientY - startY;
        blocks[id].x = origX + dx; blocks[id].y = origY + dy;
        el.style.left = blocks[id].x + 'px'; el.style.top = blocks[id].y + 'px';
        emit();
      }
      function onUp() {
        el.style.outline = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    // Touch
    el.addEventListener('touchstart', function(e) {
      var t0 = e.touches[0];
      startX = t0.clientX; startY = t0.clientY;
      origX = blocks[id].x; origY = blocks[id].y;
      el.style.outline = '2px dashed rgba(255,255,255,0.7)';
      function onMove(e) {
        var t0 = e.touches[0];
        var dx = t0.clientX - startX, dy = t0.clientY - startY;
        blocks[id].x = origX + dx; blocks[id].y = origY + dy;
        el.style.left = blocks[id].x + 'px'; el.style.top = blocks[id].y + 'px';
        emit();
      }
      function onEnd() {
        el.style.outline = '';
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
      }
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
    }, { passive: false });
  });

  // Listen for bg pan/zoom commands from parent
  window.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'BG_PAN') { bg.x += e.data.dx||0; bg.y += e.data.dy||0; applyBg(); emit(); }
    if (e.data.type === 'BG_ZOOM') { bg.scale = Math.max(0.5, Math.min(3, bg.scale + (e.data.delta||0))); applyBg(); emit(); }
    if (e.data.type === 'BG_RESET') { bg = {x:0,y:0,scale:1}; applyBg(); emit(); }
    if (e.data.type === 'SET_LAYOUT') {
      var l = e.data.layout;
      if (l && l.blocks) {
        l.blocks.forEach(function(b) {
          blocks[b.id] = {x:b.x, y:b.y};
          var el = document.querySelector('[data-id="'+b.id+'"]');
          if (el) { el.style.left = b.x+'px'; el.style.top = b.y+'px'; }
        });
      }
      if (l && l.bg) { bg = l.bg; applyBg(); }
    }
  });

  emit();
})();
</script>` : ""

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>YoVibe Ticket</title>
<style>${css}</style>
</head>
<body>
  <div class="bg-layer" style="${bgCSS}"></div>
  <div class="content-layer">
    ${posterHTML}
    ${titleHTML}
    ${infoHTML}
    ${qrHTML}
  </div>
  <div class="footer">
    <span class="footer-brand">YoVibe</span>
    <span>Verified &amp; Secured Ticket</span>
    <span>${ticketRef}</span>
  </div>
  ${editorScript}
</body>
</html>`
}

// ─── Editor HTML (interactive, posts layout back via postMessage) ─────────────
export function generateEditorHTML(
  templateId: string | null,
  orientation: "portrait" | "landscape",
  uploadedBgUrl?: string | null,
  posterUrl?: string | null,
  sampleData?: { eventName?: string; venueName?: string },
  initialLayout?: TicketLayout
): string {
  const eventName = sampleData?.eventName || "Sample Event Night"
  const venueName = sampleData?.venueName || "The Grand Venue"
  const isLandscape = orientation === "landscape"
  const W = isLandscape ? LANDSCAPE_W : PORTRAIT_W
  const H = isLandscape ? LANDSCAPE_H : PORTRAIT_H

  const fakeEvent: Event = {
    id: "preview", slug: "preview",
    name: eventName, venueName,
    venueSlug: "preview", description: "",
    date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    time: "21:00", location: "KAMPALA",
    posterImageUrl: posterUrl || "",
    artists: [], isFeatured: false, isFreeEntry: false,
    entryFees: [], ticketContacts: [], createdAt: new Date(),
    ticket_design: {
      enabled: true, orientation,
      source: uploadedBgUrl ? "upload" : "template",
      template_id: templateId,
      background_url: uploadedBgUrl || null,
      dimensions: isLandscape ? { width: W, height: H } : { width: W, height: H },
    },
  } as any

  const { t, bg } = resolveTemplate(fakeEvent)
  const layout = initialLayout || defaultLayout(orientation, !!posterUrl)

  let bgCSS: string
  if (uploadedBgUrl) {
    const { x, y, scale } = layout.bg
    bgCSS = `background: url('${uploadedBgUrl}'); background-size: ${scale * 100}%; background-position: calc(50% + ${x}px) calc(50% + ${y}px); background-repeat: no-repeat;`
  } else {
    bgCSS = `background: ${bg};`
  }

  const fmtDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
  const fmtTime = "09:00 PM"

  return buildHTML(
    t, W, H, bgCSS,
    eventName, "VIP", fmtDate, fmtTime, venueName, "KAMPALA", "John Doe",
    FAKE_QR, "YV-PREVIEW", posterUrl || "",
    layout, true
  )
}

// ─── Static preview HTML ──────────────────────────────────────────────────────
export function generatePreviewHTML(
  templateId: string | null,
  orientation: "portrait" | "landscape",
  uploadedBgUrl?: string | null,
  sampleData?: {
    eventName?: string
    venueName?: string
    qrPosition?: string
    posterUrl?: string
    layout?: TicketLayout
  }
): string {
  return generateEditorHTML(
    templateId, orientation, uploadedBgUrl,
    sampleData?.posterUrl || null,
    sampleData,
    sampleData?.layout
  ).replace(/<script[\s\S]*?<\/script>/g, "")
}

// ─── PDF / Print ──────────────────────────────────────────────────────────────
export class TicketPDFService {
  static generateTicketHTML(ticket: Ticket, event?: Event): string {
    return generateTicketHTML(ticket, event)
  }

  static async downloadTicketPDF(ticket: Ticket, event?: Event): Promise<{ success: boolean; error?: string }> {
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
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `YoVibe Ticket - ${ticket.eventName}` })
        return { success: true }
      }
      return { success: false, error: "Sharing not available on this device" }
    } catch (error: any) {
      return { success: false, error: error.message || "Unknown error" }
    }
  }

  static async printTicket(ticket: Ticket, event?: Event): Promise<{ success: boolean; error?: string }> {
    try {
      const html = generateTicketHTML(ticket, event)
      await Print.printAsync({ html })
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
    }
  }
}

export default TicketPDFService
