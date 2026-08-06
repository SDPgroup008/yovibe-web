import type { Event } from "../models/Event"
import type { Ticket } from "../models/Ticket"
import { getTemplateById } from "../constants/ticketTemplates"
import { computeTicketLayout, type TicketDesignInput } from "./TicketLayoutEngine"

export interface CanonicalTicketData {
  eventName: string
  ticketType: string
  venue: string
  location: string
  date: string
  time: string
  attendee: string
  ticketRef: string
  qr: string
  poster?: string | null
  seatNumber?: number | null
  tableNumber?: number | null
}

const esc = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;")

const xmlUrl = (value: string) => esc(value).replace(/#/g, "%23")

function formatDate(value: Date | string | undefined) {
  const d = value instanceof Date ? value : new Date(value || Date.now())
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
}

function formatTime(value: Date | string | undefined) {
  const d = value instanceof Date ? value : new Date(value || Date.now())
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
}

export function resolveTicketDesign(event?: Event, ticket?: Ticket): TicketDesignInput {
  const feeType = ticket?.entryFeeType
  const fee = feeType ? event?.entryFees?.find((item) => item.name === feeType) : undefined
  const design = (fee?.ticketDesign || event?.ticket_design || {
    enabled: true,
    orientation: "portrait",
    source: "template",
    template_id: null,
    background_url: null,
  }) as TicketDesignInput
  console.log("[TicketDesign] resolveTicketDesign → source:", design.source, "background_url:", design.background_url ? "set" : "null")
  return design
}

export function canonicalTicketData(ticket: Ticket, event?: Event): CanonicalTicketData {
  return {
    eventName: event?.name || ticket.eventName || "Event",
    ticketType: ticket.entryFeeType || "Standard",
    venue: event?.venueName || ticket.venueName || "Venue TBA",
    location: event?.location || "",
    date: formatDate(ticket.eventStartTime),
    time: formatTime(ticket.eventStartTime),
    attendee: ticket.buyerName || "Guest",
    ticketRef: ticket.ticketRef || (ticket as any).ticket_ref || ticket.tableGroupId || ticket.id?.slice(0, 8).toUpperCase() || "XXXXXXXX",
    qr: ticket.qrCodeDataUrl || "",
    poster: event?.posterImageUrl || null,
    seatNumber: ticket.seatNumber ?? null,
    tableNumber: ticket.tableNumber ?? null,
  }
}

/**
 * Compute the hero poster rectangle for the DEFAULT (email-style) in-app ticket.
 * The SVG no longer renders the poster hero; MyTicketsScreen overlays the actual
 * poster image here (it loads directly, avoiding the CORS-limited embed fetch).
 */
export function computeEmailHeroRect(ticket: Ticket, event?: Event, design?: TicketDesignInput): { x: number; y: number; width: number; height: number } {
  const d = design || resolveTicketDesign(event, ticket)
  const W = d.dimensions?.width || 600
  const H = d.dimensions?.height || 900
  const isLandscape = d.orientation === "landscape"
  const data = canonicalTicketData(ticket, event)
  const hasPoster = !!data.poster

  const FOOTER_H = 36
  const BRAND_H = 0   // header removed; hero fills from the top
  const pad = isLandscape ? 24 : 32
  const rowH = isLandscape ? 24 : 28
  const gap = isLandscape ? 4 : 6
  const rowCount = 6 + (data.seatNumber != null ? 1 : 0) + (data.tableNumber != null ? 1 : 0)
  const detailsCardH = rowCount * rowH + (isLandscape ? 12 : 18)
  const titleH = isLandscape ? 54 : 66
  const attendeeH = isLandscape ? 50 : 58
  const qrH = isLandscape ? 244 : 274
  const qrPad = isLandscape ? 8 : 16
  const fixedH = pad + titleH + gap + attendeeH + gap + detailsCardH + qrPad + qrH
  const availY = H - FOOTER_H - BRAND_H
  const heroH = hasPoster ? Math.max(0, availY - fixedH - 8) : 0
  return { x: 0, y: BRAND_H, width: W, height: heroH }
}

// Extract hex color stops from a template's CSS background value.
// e.g. "linear-gradient(160deg, #0d47a1 0%, #1976d2 50%, #2196F3 100%)" → ["#0d47a1","#1976d2","#2196F3"]
//      "#eeeeee" → ["#eeeeee"]
function extractBackgroundColors(bg: string): string[] {
  const hexes = String(bg || "").match(/#[0-9a-fA-F]{3,8}/g) || []
  return hexes
}

// Build SVG <stop> elements from a template's background stops + accent.
function gradientStops(bgStops: string[], accent: string): string {
  const stops = bgStops.length > 1 ? bgStops : [bgStops[0] || "#111827", accent]
  if (stops.length === 1) {
    return `<stop offset="0%" stop-color="${esc(stops[0])}"/><stop offset="100%" stop-color="${esc(stops[0])}"/>`
  }
  return stops.map((c, i) => `<stop offset="${Math.round((i / (stops.length - 1)) * 100)}%" stop-color="${esc(c)}"/>`).join("")
}

function colorsFor(design: TicketDesignInput) {
  const template = design.source === "template" && design.template_id ? getTemplateById(design.template_id) : undefined
  const bgStops = template ? extractBackgroundColors(template.background) : ["#111827"]
  return {
    background: bgStops[0] || "#111827",
    accent: template?.accentColor || "#7c3aed",
    text: template?.textPrimary || "#ffffff",
    secondary: template?.textSecondary || "#c4b5fd",
    qr: template?.qrBg || "#ffffff",
    border: template?.dividerColor || "rgba(255,255,255,0.22)",
    bgStops,
  }
}

function text(x: number, y: number, value: string, size: number, fill: string, weight = 500, anchor = "start") {
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}px" font-weight="${weight}" fill="${esc(fill)}" text-anchor="${anchor}">${esc(value)}</text>`
}

function block(layout: any, id: string) {
  return layout.blocks.find((item: any) => item.id === id) || { id, x: 24, y: 24, width: 200, height: 120, scale: 1 }
}

const FONT_STACK = "'Inter', 'Segoe UI', -apple-system, Roboto, 'Helvetica Neue', Arial, sans-serif"
const MONO = "'SF Mono', 'JetBrains Mono', 'Courier New', monospace"

// Renders the DEFAULT ticket as a vertical stacked layout that mirrors the
// email design: brand bar → hero poster → title → attendee → details → QR panel → footer.
function renderEmailStyleSvg(ticket: Ticket, event: Event | undefined, design: TicketDesignInput): string {
  const data = canonicalTicketData(ticket, event)
  const colors = colorsFor(design)
  const W = design.dimensions?.width || 600
  const H = design.dimensions?.height || 900
  const isLandscape = design.orientation === "landscape"

  const gradientId = `email-bg-${Math.abs(W * 31 + H * 17)}`
  const heroClip = `email-hero-${Math.abs(W * 31 + H * 17)}`

  // ── Sizing ──────────────────────────────────────────────────────────────
  // Fixed stacked content below the hero so the hero flexes to fill the leftover
  // space and the QR panel + footer never overflow.
  const FOOTER_H = 36
  const pad = isLandscape ? 24 : 32
  const contentW = isLandscape ? Math.round(W * 0.52) : W - pad * 2
  const rowH = isLandscape ? 24 : 28
  const gap = isLandscape ? 4 : 6

  const details: Array<[string, string]> = [
    ["Event", data.eventName],
    ["Ticket Type", data.ticketType],
    ["Venue", data.venue],
    ["Date", data.date],
    ["Time", data.time],
    ["Ticket Ref", data.ticketRef],
  ]
  if (data.seatNumber != null) details.push(["Seat", String(data.seatNumber)])
  if (data.tableNumber != null) details.push(["Table", String(data.tableNumber)])
  const detailsCardH = details.length * rowH + (isLandscape ? 12 : 18)

  const titleH = isLandscape ? 54 : 66
  const attendeeH = isLandscape ? 50 : 58
  const qrH = isLandscape ? 244 : 274
  const qrPad = isLandscape ? 8 : 16

  // Hero height comes from the shared helper so MyTicketsScreen's poster overlay
  // (computedEmailHeroRect) always lines up with this layout.
  const heroH = computeEmailHeroRect(ticket, event, design).height

  // Helper: label/value row (rendered inside a translate group, so coords are relative to the card)
  const detailRow = (label: string, value: string, y: number) => `
    <text x="0" y="${y}" font-family="${FONT_STACK}" font-size="9px" font-weight="700" fill="${esc(colors.secondary)}" letter-spacing="1">${esc(label.toUpperCase())}</text>
    <text x="${contentW - 30}" y="${y}" font-family="${FONT_STACK}" font-size="13px" font-weight="600" fill="${esc(colors.text)}" text-anchor="end">${esc(value)}</text>
    <line x1="0" y1="${y + 10}" x2="${contentW - 30}" y2="${y + 10}" stroke="${esc(colors.border)}" stroke-width="0.5" opacity="0.5"/>`

  let y = 0

  // Hero band — the poster image is NOT drawn here. MyTicketsScreen overlays the
  // actual poster (loaded directly) to cover this band as a rectangle, which
  // avoids the CORS-limited embed fetch. The band still occupies heroH so the
  // rest of the layout lines up.
  y += heroH

  // Title
  const titleY = y + pad
  const badgeW = Math.min(contentW, Math.max(96, data.ticketType.length * 8 + 30))
  const titleBlock = `
    <text x="${pad}" y="${titleY + 24}" font-family="${FONT_STACK}" font-size="24px" font-weight="800" fill="${esc(colors.text)}" letter-spacing="-0.5">${esc(data.eventName)}</text>
    <rect x="${pad}" y="${titleY + 34}" width="${badgeW}" height="22" rx="11" fill="${esc(colors.accent)}"/>
    <text x="${pad + badgeW / 2}" y="${titleY + 48}" font-family="${FONT_STACK}" font-size="11px" font-weight="700" fill="#fff" text-anchor="middle" letter-spacing="1">${esc(data.ticketType.toUpperCase())}</text>`
  y = titleY + titleH

  // Attendee card
  const attendeeY = y + gap
  const attendeeBlock = `
    <rect x="${pad}" y="${attendeeY}" width="${contentW}" height="${attendeeH}" rx="10" fill="#000" opacity="0.45" stroke="${esc(colors.border)}"/>
    <text x="${pad + 14}" y="${attendeeY + 20}" font-family="${FONT_STACK}" font-size="9px" font-weight="700" fill="${esc(colors.accent)}" letter-spacing="1">ADMITS</text>
    <text x="${pad + 14}" y="${attendeeY + 42}" font-family="${FONT_STACK}" font-size="19px" font-weight="800" fill="${esc(colors.text)}">${esc(data.attendee)}</text>`
  y = attendeeY + attendeeH

  // Details card
  const detailCardY = y + gap
  const detailCard = `
    <rect x="${pad}" y="${detailCardY}" width="${contentW}" height="${detailsCardH}" rx="12" fill="#000" opacity="0.45" stroke="${esc(colors.border)}"/>
    <rect x="${pad}" y="${detailCardY}" width="4" height="${detailsCardH}" rx="2" fill="${esc(colors.accent)}" opacity="0.7"/>
    <g transform="translate(${pad + 16} 0)">${details.map(([l, v], i) => detailRow(l, v, detailCardY + 24 + i * rowH)).join("")}</g>`
  y = detailCardY + detailsCardH

  // QR credential panel — fills the remaining space before the footer. The QR
  // fills the panel (no SCAN AT ENTRANCE label / ticket ref; ref already shown
  // in the details card), using the freed space to make it larger.
  const qrY = y + qrPad
  const remainingH = H - FOOTER_H - qrY - 8
  const panelH = Math.max(100, Math.min(qrH, remainingH))
  const qrFit = Math.max(64, Math.min(contentW, panelH) - 44)
  const qrPanel = `
    <rect x="${pad}" y="${qrY}" width="${contentW}" height="${panelH}" rx="12" fill="${esc(colors.qr)}" stroke="${esc(colors.accent)}" stroke-width="1.5"/>
    ${data.qr ? `<image href="${xmlUrl(data.qr)}" x="${pad + (contentW - qrFit) / 2}" y="${qrY + (panelH - qrFit) / 2}" width="${qrFit}" height="${qrFit}" preserveAspectRatio="xMidYMid meet"/>` : text(pad + contentW / 2, qrY + panelH / 2, "QR unavailable", 14, colors.secondary, 600, "middle")}`

  // Footer
  const footer = `
    <rect x="0" y="${H - FOOTER_H}" width="${W}" height="${FOOTER_H}" fill="#000" opacity="0.55"/>
    <text x="18" y="${H - 13}" font-family="${FONT_STACK}" font-size="10px" font-weight="800" fill="${esc(colors.accent)}" letter-spacing="2">YOVIBE</text>
    <text x="${W - 18}" y="${H - 13}" font-family="${MONO}" font-size="9px" fill="${esc(colors.secondary)}" text-anchor="end">${esc(data.ticketRef)}</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">${gradientStops(colors.bgStops, colors.accent)}</linearGradient>
      <clipPath id="${heroClip}"><rect width="${W}" height="${heroH}" rx="0"/></clipPath>
      <filter id="qrShadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="1" stdDeviation="3" flood-color="#000000" flood-opacity="0.3"/></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#${gradientId})"/>
    ${titleBlock}
    ${attendeeBlock}
    ${detailCard}
    <g filter="url(#qrShadow)">${qrPanel}</g>
    ${footer}
  </svg>`
}

export function renderCanonicalTicketSvg(ticket: Ticket, event?: Event, designOverride?: TicketDesignInput): string {
  const design = designOverride || resolveTicketDesign(event, ticket)

  // No uploaded custom background → default ticket that mirrors the email design
  if (design.source !== "upload" || !design.background_url) {
    return renderEmailStyleSvg(ticket, event, design)
  }

  const computed = computeTicketLayout(design, { hasPoster: !!event?.posterImageUrl })
  const data = canonicalTicketData(ticket, event)
  const colors = colorsFor(design)
  const W = computed.pageWidth
  const H = computed.pageHeight
  console.log("[TicketRender] computed page:", W, "x", H, "| blocks:", computed.blocks.map((b: any) => `${b.id}@${b.x},${b.y}`).join(" | "))
  const isLandscape = computed.isLandscape
  const poster = block(computed, "poster")
  const title = block(computed, "title")
  const info = block(computed, "info")
  const qrBase = block(computed, "qr")
  const qr = { ...qrBase }
  const bg = computed.bgTransform || { x: 0, y: 0, scale: 1 }
  const bgScale = bg.scale || 1
  // Replicate the editor's CSS background model (TicketPDFService buildHTML):
  //   background-size: scale*100%              → background box = scale·W × scale·H
  //   background-position: calc(50% + x) calc(50% + y)
  // Centered by default, then offset by (x, y) in ticket-space pixels. The SVG
  // <image> top-left must equal that centered top-left, otherwise the final
  // ticket crops the wrong region (e.g. the top-left corner) of the upload.
  const bgLeft = (W - W * bgScale) / 2 + (bg.x || 0)
  const bgTop = (H - H * bgScale) / 2 + (bg.y || 0)
  const gradientId = `ticket-bg-${Math.abs(W * 31 + H * 17)}`
  const grainId = `ticket-grain-${Math.abs(W * 31 + H * 17)}`
  const bgPaint = "#111827"
  const qrSize = Math.max(64, Math.min(qr.width - 24, qr.height - 36))
  const infoRows = [
    ["Date", data.date], ["Time", data.time], ["Venue", data.venue],
  ]
  const infoRowHeight = Math.max(24, (info.height - 28) / infoRows.length)
  const blockScale = (b: any) => ` transform="translate(${b.x} ${b.y}) scale(${b.scale || 1})"`
  const bgImage = computed.isUploadBg
    ? `<image href="${xmlUrl(computed.bgImage)}" x="${bgLeft}" y="${bgTop}" width="${W * bgScale}" height="${H * bgScale}" preserveAspectRatio="xMidYMid slice" opacity="0.85"/>`
    : ""

  // Artwork-first: poster becomes a full-bleed hero with bottom gradient overlay
  const heroClip = `ticket-hero-${Math.abs(W * 31 + H * 17)}`
  const posterHero = data.poster ? `
    <image href="${xmlUrl(data.poster)}" x="0" y="0" width="${W}" height="${isLandscape ? Math.round(H * 0.7) : Math.round(H * 0.55)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${heroClip})"/>
    <rect x="0" y="${isLandscape ? Math.round(H * 0.7) - Math.round(H * 0.25) : Math.round(H * 0.55) - Math.round(H * 0.25)}" width="${W}" height="${Math.round(H * 0.25)}" fill="url(#${gradientId})" opacity="0.9"/>
  ` : ""

  // QR credential panel with eyebrow + VALID chip + ref
  const qrEyebrow = `<text x="${qr.width / 2}" y="18" font-family="${FONT_STACK}" font-size="8px" font-weight="800" fill="${esc(colors.accent)}" text-anchor="middle" letter-spacing="2">SCAN AT ENTRANCE</text>`
  const qrSvg = data.qr
    ? `<image href="${xmlUrl(data.qr)}" x="${(qr.width - qrSize) / 2}" y="${30}" width="${qrSize}" height="${qrSize}" preserveAspectRatio="xMidYMid meet"/>`
    : text(qr.width / 2, qr.height / 2, "QR unavailable", 14, colors.secondary, 600, "middle")

  // Info card: label/value pairs, accent bar, with attendee emphasized
  const infoCard = infoRows.map(([label, value], i) => `
    <g transform="translate(16 ${18 + i * infoRowHeight})">
      <text x="0" y="0" font-family="${FONT_STACK}" font-size="8px" font-weight="700" fill="${esc(colors.secondary)}" text-anchor="start" letter-spacing="1">${esc(label.toUpperCase())}</text>
      <text x="0" y="16" font-family="${FONT_STACK}" font-size="13px" font-weight="600" fill="${esc(colors.text)}">${esc(value)}</text>
    </g>`).join('')
  // Attendee emphasized block below the generic info rows
  const attendeeY = 18 + infoRows.length * infoRowHeight + 6
  const attendeeBlock = `
    <text x="16" y="${attendeeY}" font-family="${FONT_STACK}" font-size="8px" font-weight="700" fill="${esc(colors.accent)}" text-anchor="start" letter-spacing="1">ADMITS</text>
    <text x="16" y="${attendeeY + 22}" font-family="${FONT_STACK}" font-size="20px" font-weight="800" fill="${esc(colors.text)}">${esc(data.attendee)}</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">${gradientStops(colors.bgStops, colors.accent)}</linearGradient>
      <radialGradient id="${grainId}" cx="0.5" cy="0.5" r="0.7"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.04"/><stop offset="100%" stop-color="#000000" stop-opacity="0.12"/></radialGradient>
      <clipPath id="${heroClip}"><rect width="${W}" height="${isLandscape ? Math.round(H * 0.7) : Math.round(H * 0.55)}" rx="0"/></clipPath>
      <clipPath id="posterClip"><rect width="${poster.width}" height="${poster.height}" rx="10"/></clipPath>
      <filter id="titleShadow" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity="0.75"/></filter>
      <filter id="qrShadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="1" stdDeviation="3" flood-color="#000000" flood-opacity="0.3"/></filter>
    </defs>

    <!-- Layered background: base + radial glow + grain -->
    <rect width="${W}" height="${H}" fill="${bgPaint}"/>
    <rect width="${W}" height="${H}" fill="url(#${grainId})"/>

    <!-- Artwork hero (full-bleed only when there's NO custom block layout; otherwise the
         draggable poster block is used so it stays behind overlapping blocks) -->
    ${computed.isUploadBg ? bgImage : (data.poster && !(design as any).layout ? posterHero : "")}
    ${!computed.isUploadBg && !data.poster ? `<rect width="${W}" height="${H}" fill="#000000" opacity="0.16"/>` : ""}

    <!-- Poster block (if not used as hero, keep the small card for custom layouts) -->
    ${!data.poster || (design as any).layout ? `<g${blockScale(poster)}>${data.poster ? `<rect width="${poster.width}" height="${poster.height}" rx="10" fill="#000" opacity="0.35"/><image href="${xmlUrl(data.poster)}" x="0" y="0" width="${poster.width}" height="${poster.height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#posterClip)"/>` : ""}</g>` : ""}

    <!-- Title -->
    <g${blockScale(title)}>
      <text x="16" y="36" font-family="${FONT_STACK}" font-size="${Math.max(20, Math.min(34, title.height / 3))}px" font-weight="800" fill="${esc(colors.text)}" filter="url(#titleShadow)" letter-spacing="-0.5">${esc(data.eventName)}</text>
      <rect x="16" y="${title.height - 30}" width="${Math.min(title.width - 32, Math.max(90, data.ticketType.length * 8 + 28))}" height="22" rx="11" fill="${esc(colors.accent)}"/>
      <text x="${Math.min(title.width - 32, Math.max(90, data.ticketType.length * 8 + 28)) / 2 + 16}" y="${title.height - 15}" font-family="${FONT_STACK}" font-size="10px" font-weight="700" fill="#fff" text-anchor="middle" letter-spacing="1">${esc(data.ticketType.toUpperCase())}</text>
    </g>

    <!-- Info card with attendee emphasis -->
    <g${blockScale(info)}>
      <rect width="${info.width}" height="${info.height}" rx="12" fill="#000" opacity="0.55" stroke="${esc(colors.border)}" stroke-width="1"/>
      <rect x="0" y="0" width="4" height="${info.height}" rx="2" fill="${esc(colors.accent)}" opacity="0.7"/>
      ${infoCard}
      ${attendeeBlock}
    </g>

    <!-- QR credential panel -->
    <g${blockScale(qr)}>
      <rect width="${qr.width}" height="${qr.height}" rx="14" fill="${esc(colors.qr)}" stroke="${esc(colors.accent)}" stroke-width="1.5" filter="url(#qrShadow)"/>
      ${qrEyebrow}
      ${qrSvg}
      <rect x="0" y="${qr.height - 30}" width="${qr.width}" height="30" rx="14" fill="${esc(colors.accent)}" opacity="0.1"/>
      <text x="${qr.width / 2}" y="${qr.height - 13}" font-family="${MONO}" font-size="9px" font-weight="700" fill="${esc(colors.accent)}" text-anchor="middle" letter-spacing="0.5">${esc(data.ticketRef)}</text>
    </g>

    <!-- Footer -->
    <rect x="0" y="${H - 36}" width="${W}" height="36" fill="#000" opacity="0.55"/>
    <text x="18" y="${H - 14}" font-family="${FONT_STACK}" font-size="10px" font-weight="800" fill="${esc(colors.accent)}" letter-spacing="2">YOVIBE</text>
    <text x="${W - 18}" y="${H - 14}" font-family="${MONO}" font-size="9px" fill="${esc(colors.secondary)}" text-anchor="end">${esc(data.ticketRef)}</text>
  </svg>`
}

export function svgDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * React Native's Image component cannot reliably load remote images nested
 * inside an SVG data URI. Inline the ticket assets first so the in-app ticket
 * and browser export receive a self-contained artifact.
 */
export async function renderCanonicalTicketSvgWithEmbeddedAssets(ticket: Ticket, event?: Event, designOverride?: TicketDesignInput) {
  let svg = renderCanonicalTicketSvg(ticket, event, designOverride)
  const assets = [ticket.qrCodeDataUrl, event?.posterImageUrl, designOverride?.background_url || resolveTicketDesign(event, ticket).background_url]
    .filter((value): value is string => !!value && !value.startsWith("data:"))

  for (const asset of Array.from(new Set(assets))) {
    try {
      const response = await fetch(asset)
      if (!response.ok) continue
      const blob = await response.blob()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      const escaped = xmlUrl(asset)
      svg = svg.split(`href="${escaped}"`).join(`href="${dataUrl}"`)
    } catch (error) {
      console.warn("Ticket asset could not be embedded", asset, error)
    }
  }
  return svg
}

export function canonicalTicketHtml(ticket: Ticket, event?: Event) {
  const design = resolveTicketDesign(event, ticket)
  const svg = renderCanonicalTicketSvg(ticket, event, design)
  let pageW: number
  let pageH: number
  if (design.source === "upload" && design.background_url) {
    const computed = computeTicketLayout(design, { hasPoster: !!event?.posterImageUrl })
    pageW = computed.pageWidth
    pageH = computed.pageHeight
  } else {
    pageW = design.dimensions?.width || 600
    pageH = design.dimensions?.height || 900
  }
  console.log("[TicketRender] canonicalTicketHtml → page:", pageW, "x", pageH,
    "source:", design.source, "dimensions:", JSON.stringify(design.dimensions))
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${pageW}px ${pageH}px;margin:0}html,body{margin:0;padding:0;background:#111;overflow:hidden}svg{display:block;width:${pageW}px;height:${pageH}px}</style></head><body>${svg}</body></html>`
}
