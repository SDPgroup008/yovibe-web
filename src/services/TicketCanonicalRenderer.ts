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
  return (fee?.ticketDesign || event?.ticket_design || {
    enabled: true,
    orientation: "portrait",
    source: "template",
    template_id: "midnight-portrait",
    background_url: null,
    dimensions: { width: 600, height: 900 },
    layout: getDefaultLayout("portrait", !!event?.posterImageUrl),
  }) as TicketDesignInput
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
    ticketRef: ticket.ticketRef || ticket.id?.slice(0, 8).toUpperCase() || "XXXXXXXX",
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
  const bgPaint = design.source === "template" ? `url(#${gradientId})` : "#111827"
  const qrSize = Math.max(64, Math.min(qr.width - 24, qr.height - 36))
  const infoRows = [
    ["Date", data.date], ["Time", data.time], ["Venue", data.venue], ["Attendee", data.attendee],
  ]
  const infoRowHeight = Math.max(22, (info.height - 24) / infoRows.length)
  const blockScale = (b: any) => ` transform="translate(${b.x} ${b.y}) scale(${b.scale || 1})"`
  const bgImage = computed.isUploadBg
    ? `<image href="${xmlUrl(computed.bgImage)}" x="${bg.x}" y="${bg.y}" width="${W * (bg.scale || 1)}" height="${H * (bg.scale || 1)}" preserveAspectRatio="xMidYMid slice" opacity="0.96"/>`
    : ""
  const posterSvg = data.poster ? `<image href="${xmlUrl(data.poster)}" x="0" y="0" width="${poster.width}" height="${poster.height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#posterClip)"/>` : ""
  const qrSvg = data.qr ? `<image href="${xmlUrl(data.qr)}" x="${(qr.width - qrSize) / 2}" y="10" width="${qrSize}" height="${qrSize}" preserveAspectRatio="xMidYMid meet"/>` : text(qr.width / 2, qr.height / 2, "QR unavailable", 14, colors.secondary, 600, "middle")

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${esc(colors.background)}"/><stop offset="100%" stop-color="${esc(colors.accent)}" stop-opacity="0.72"/></linearGradient>
      <clipPath id="posterClip"><rect width="${poster.width}" height="${poster.height}" rx="10"/></clipPath>
    </defs>
    <rect width="${W}" height="${H}" fill="${bgPaint}"/>
    ${bgImage}
    <rect width="${W}" height="${H}" fill="#000000" opacity="0.16"/>
    <g${blockScale(poster)}>${data.poster ? `<rect width="${poster.width}" height="${poster.height}" rx="10" fill="#000" opacity="0.35"/>${posterSvg}` : ""}</g>
    <g${blockScale(title)}><rect width="${title.width}" height="${title.height}" rx="10" fill="#000" opacity="0.46" stroke="${esc(colors.border)}"/><text x="16" y="34" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(16, Math.min(30, title.height / 3))}px" font-weight="800" fill="${esc(colors.text)}">${esc(data.eventName)}</text><rect x="16" y="${title.height - 32}" width="${Math.min(title.width - 32, Math.max(90, data.ticketType.length * 8 + 28))}" height="20" rx="10" fill="${esc(colors.accent)}"/><text x="${Math.min(title.width - 32, Math.max(90, data.ticketType.length * 8 + 28)) / 2 + 16}" y="${title.height - 18}" font-family="Arial, Helvetica, sans-serif" font-size="10px" font-weight="700" fill="#fff" text-anchor="middle">${esc(data.ticketType.toUpperCase())}</text></g>
    <g${blockScale(info)}><rect width="${info.width}" height="${info.height}" rx="10" fill="#000" opacity="0.48" stroke="${esc(colors.border)}"/>${infoRows.map(([label, value], i) => `${text(16, 22 + i * infoRowHeight, label.toUpperCase(), 9, colors.secondary, 700)}${text(16, 36 + i * infoRowHeight, value, 12, colors.text, 600)}`).join("")}</g>
    <g${blockScale(qr)}><rect width="${qr.width}" height="${qr.height}" rx="12" fill="${esc(colors.qr)}" stroke="${esc(colors.accent)}" stroke-width="2"/>${qrSvg}${text(qr.width / 2, qr.height - 20, data.ticketRef, 10, colors.accent, 700, "middle")}</g>
    <rect x="0" y="${H - 34}" width="${W}" height="34" fill="#000" opacity="0.55"/><text x="18" y="${H - 13}" font-family="Arial, Helvetica, sans-serif" font-size="10px" font-weight="700" fill="${esc(colors.accent)}">YOVIBE</text><text x="${W - 18}" y="${H - 13}" font-family="Courier New, monospace" font-size="10px" fill="${esc(colors.secondary)}" text-anchor="end">${esc(data.ticketRef)}</text>
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
