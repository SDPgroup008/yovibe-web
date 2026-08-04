import type { Event } from "../models/Event"
import type { Ticket } from "../models/Ticket"
import { getTemplateById } from "../constants/ticketTemplates"
import { computeTicketLayout, getDefaultLayout, type TicketDesignInput, type TicketLayout } from "./TicketLayoutEngine"

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
    template_id: "midnight-portrait",
    background_url: null,
    dimensions: { width: 600, height: 900 },
  }) as TicketDesignInput
  // Attach the template-specific layout if no custom layout is stored
  if (!design.layout) {
    const orientation = design.orientation || "portrait"
    design.layout = getDefaultLayout(orientation, !!event?.posterImageUrl, design)
  }
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
  }
}

function colorsFor(design: TicketDesignInput) {
  const template = design.source === "template" && design.template_id ? getTemplateById(design.template_id) : undefined
  return {
    // Ticket templates store CSS gradients. SVG stop-color only accepts a
    // color, so use a valid base color here and apply the accent as the second
    // gradient stop below.
    background: "#111827",
    accent: template?.accentColor || "#7c3aed",
    text: template?.textPrimary || "#ffffff",
    secondary: template?.textSecondary || "#c4b5fd",
    qr: template?.qrBg || "#ffffff",
    border: template?.dividerColor || "rgba(255,255,255,0.22)",
  }
}

function text(x: number, y: number, value: string, size: number, fill: string, weight = 500, anchor = "start") {
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}px" font-weight="${weight}" fill="${esc(fill)}" text-anchor="${anchor}">${esc(value)}</text>`
}

function block(layout: any, id: string) {
  return layout.blocks.find((item: any) => item.id === id) || { id, x: 24, y: 24, width: 200, height: 120, scale: 1 }
}

export function renderCanonicalTicketSvg(ticket: Ticket, event?: Event, designOverride?: TicketDesignInput): string {
  const design = designOverride || resolveTicketDesign(event, ticket)
  const computed = computeTicketLayout(design, { hasPoster: !!event?.posterImageUrl })
  const data = canonicalTicketData(ticket, event)
  const colors = colorsFor(design)
  const W = computed.pageWidth
  const H = computed.pageHeight
  const isLandscape = computed.isLandscape
  const poster = block(computed, "poster")
  const title = block(computed, "title")
  const info = block(computed, "info")
  const qrBase = block(computed, "qr")
  const qr = { ...qrBase }
  if (!(design as any).layout && (design as any).source === "template" && (design as any).qr_position) {
    const position = (design as any).qr_position
    if (position === "top") { qr.x = Math.round((W - qr.width) / 2); qr.y = 110 }
    if (position === "center") { qr.x = Math.round((W - qr.width) / 2); qr.y = Math.round((H - qr.height) / 2) }
    if (position === "bottom") { qr.x = Math.round((W - qr.width) / 2); qr.y = H - qr.height - 50 }
    if (position === "left") { qr.x = 24; qr.y = Math.round((H - qr.height) / 2) }
    if (position === "right") { qr.x = W - qr.width - 24; qr.y = Math.round((H - qr.height) / 2) }
  }
  const bg = computed.bgTransform || { x: 0, y: 0, scale: 1 }
  const gradientId = `ticket-bg-${Math.abs(W * 31 + H * 17)}`
  const grainId = `ticket-grain-${Math.abs(W * 31 + H * 17)}`
  const bgPaint = design.source === "template" ? `url(#${gradientId})` : "#111827"
  const qrSize = Math.max(64, Math.min(qr.width - 24, qr.height - 36))
  const infoRows = [
    ["Date", data.date], ["Time", data.time], ["Venue", data.venue],
  ]
  const infoRowHeight = Math.max(24, (info.height - 28) / infoRows.length)
  const blockScale = (b: any) => ` transform="translate(${b.x} ${b.y}) scale(${b.scale || 1})"`
  const bgImage = computed.isUploadBg
    ? `<image href="${xmlUrl(computed.bgImage)}" x="${bg.x}" y="${bg.y}" width="${W * (bg.scale || 1)}" height="${H * (bg.scale || 1)}" preserveAspectRatio="xMidYMid slice" opacity="0.85"/>`
    : ""

  // Artwork-first: poster becomes a full-bleed hero with bottom gradient overlay
  const heroClip = `ticket-hero-${Math.abs(W * 31 + H * 17)}`
  const posterHero = data.poster ? `
    <image href="${xmlUrl(data.poster)}" x="0" y="0" width="${W}" height="${isLandscape ? Math.round(H * 0.7) : Math.round(H * 0.55)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${heroClip})"/>
    <rect x="0" y="${isLandscape ? Math.round(H * 0.7) - Math.round(H * 0.25) : Math.round(H * 0.55) - Math.round(H * 0.25)}" width="${W}" height="${Math.round(H * 0.25)}" fill="url(#${gradientId})" opacity="0.9"/>
  ` : ""

  // QR credential panel with eyebrow + VALID chip + ref
  const qrEyebrow = `<text x="${qr.width / 2}" y="18" font-family="'Inter', 'Segoe UI', Arial, sans-serif" font-size="8px" font-weight="800" fill="${esc(colors.accent)}" text-anchor="middle" letter-spacing="2">SCAN AT ENTRANCE</text>`
  const qrSvg = data.qr
    ? `<image href="${xmlUrl(data.qr)}" x="${(qr.width - qrSize) / 2}" y="${30}" width="${qrSize}" height="${qrSize}" preserveAspectRatio="xMidYMid meet"/>`
    : text(qr.width / 2, qr.height / 2, "QR unavailable", 14, colors.secondary, 600, "middle")

  // Info card: label/value pairs, accent bar, with attendee emphasized
  const infoCard = infoRows.map(([label, value], i) => `
    <g transform="translate(16 ${18 + i * infoRowHeight})">
      <text x="0" y="0" font-family="'Inter', 'Segoe UI', Arial, sans-serif" font-size="8px" font-weight="700" fill="${esc(colors.secondary)}" text-anchor="start" letter-spacing="1">${esc(label.toUpperCase())}</text>
      <text x="0" y="16" font-family="'Inter', 'Segoe UI', Arial, sans-serif" font-size="13px" font-weight="600" fill="${esc(colors.text)}">${esc(value)}</text>
    </g>`).join('')
  // Attendee emphasized block below the generic info rows
  const attendeeY = 18 + infoRows.length * infoRowHeight + 6
  const attendeeBlock = `
    <text x="16" y="${attendeeY}" font-family="'Inter', 'Segoe UI', Arial, sans-serif" font-size="8px" font-weight="700" fill="${esc(colors.accent)}" text-anchor="start" letter-spacing="1">ADMITS</text>
    <text x="16" y="${attendeeY + 22}" font-family="'Inter', 'Segoe UI', Arial, sans-serif" font-size="20px" font-weight="800" fill="${esc(colors.text)}">${esc(data.attendee)}</text>`

  const FONT_STACK = "'Inter', 'Segoe UI', -apple-system, Roboto, 'Helvetica Neue', Arial, sans-serif"
  const MONO = "'SF Mono', 'JetBrains Mono', 'Courier New', monospace"

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${esc(colors.background)}"/><stop offset="65%" stop-color="${esc(colors.background)}"/><stop offset="100%" stop-color="${esc(colors.accent)}" stop-opacity="0.55"/></linearGradient>
      <radialGradient id="${grainId}" cx="0.5" cy="0.5" r="0.7"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.04"/><stop offset="100%" stop-color="#000000" stop-opacity="0.12"/></radialGradient>
      <clipPath id="${heroClip}"><rect width="${W}" height="${isLandscape ? Math.round(H * 0.7) : Math.round(H * 0.55)}" rx="0"/></clipPath>
      <clipPath id="posterClip"><rect width="${poster.width}" height="${poster.height}" rx="10"/></clipPath>
      <filter id="titleShadow" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity="0.75"/></filter>
      <filter id="qrShadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="1" stdDeviation="3" flood-color="#000000" flood-opacity="0.3"/></filter>
    </defs>

    <!-- Layered background: base + radial glow + grain -->
    <rect width="${W}" height="${H}" fill="${bgPaint}"/>
    <rect width="${W}" height="${H}" fill="url(#${grainId})"/>

    <!-- Artwork hero (full-bleed when poster exists) -->
    ${computed.isUploadBg ? bgImage : (data.poster ? posterHero : "")}
    ${!computed.isUploadBg && !data.poster ? `<rect width="${W}" height="${H}" fill="#000000" opacity="0.16"/>` : ""}

    <!-- Poster block (if not used as hero, keep the small card for custom layouts) -->
    ${!data.poster || (design as any).layout ? `<g${blockScale(poster)}>${data.poster ? `<rect width="${poster.width}" height="${poster.height}" rx="10" fill="#000" opacity="0.35"/><image href="${xmlUrl(data.poster)}" x="0" y="0" width="${poster.width}" height="${poster.height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#posterClip)"/>` : ""}</g>` : ""}

    <!-- Title -->
    <g${blockScale(title)}>
      <text x="16" y="36" font-family="${FONT_STACK}" font-size="${Math.max(20, Math.min(34, title.height / 3))}px" font-weight="800" fill="${esc(colors.text)}" filter="url(#titleShadow)" letter-spacing="-0.5">${esc(data.eventName)}</text>
      <rect x="16" y="${title.height - 30}" width="${Math.min(title.width - 32, Math.max(90, data.ticketType.length * 8 + 28))}" height="22" rx="11" fill="${esc(colors.accent)}"/>
      <text x="${Math.min(title.width - 32, Math.max(90, data.ticketType.length * 8 + 28)) / 2 + 16}" y="${title.height - 15}" font-family="${FONT_STACK}" font-size="10px" font-weight="700" fill="#fff" text-anchor="middle" letter-spacing="1">${esc(data.ticketType.toUpperCase())}</text>
    </g>

    <!-- VALID status chip (top-right) -->
    <g>
      <circle cx="${W - 52}" cy="24" r="4" fill="#4CAF50"/>
      <text x="${W - 44}" y="27" font-family="${FONT_STACK}" font-size="9px" font-weight="700" fill="${esc(colors.text)}" text-anchor="start" letter-spacing="0.5">VALID ENTRY</text>
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
      <rect x="0" y="${qr.height - 30}" width="${qr.width}" height="30" rx="0 0 14 14" fill="${esc(colors.accent)}" opacity="0.1"/>
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
  const computed = computeTicketLayout(design, { hasPoster: !!event?.posterImageUrl })
  const svg = renderCanonicalTicketSvg(ticket, event, design)
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${computed.pageWidth}px ${computed.pageHeight}px;margin:0}html,body{margin:0;padding:0;background:#111;overflow:hidden}svg{display:block;width:${computed.pageWidth}px;height:${computed.pageHeight}px}</style></head><body>${svg}</body></html>`
}
