import type { TicketLayout } from "../services/TicketLayoutEngine"

// ─── Template ID list (for reference / validation) ──────────────────
export const TEMPLATE_IDS = [
  'midnight-portrait', 'midnight-landscape',
  'neon-night-portrait', 'neon-night-landscape',
  'golden-vip-portrait', 'golden-vip-landscape',
  'ocean-portrait', 'ocean-landscape',
  'ember-portrait', 'ember-landscape',
  'minimal-portrait', 'minimal-landscape',
] as const

export type TemplateId = typeof TEMPLATE_IDS[number]

// ─── Template Layout Config ─────────────────────────────────────────
// Each template defines its visual identity, dimensions and layout rules.
export interface TicketTemplateConfig {
  id: string
  label: string
  orientation: "portrait" | "landscape"
  // Dimensions (single source of truth for ticket size)
  width: number
  height: number
  // Block arrangement (single source of truth for item positions)
  layout: TicketLayout
  // Visual identity
  background: string          // CSS background (gradient or solid)
  headerBg: string            // top strip / header area
  accentColor: string         // highlights, borders, badge
  textPrimary: string
  textSecondary: string
  qrBg: string                // card behind QR
  dividerColor: string
  badgeBg: string             // ticket-type badge
  badgeText: string
  fontStyle: "sans" | "mono" | "serif"
  // Layout
  qrPosition: "top" | "bottom" | "center" | "left" | "right"
  // Thumbnail — inline SVG data URI (no external deps)
  thumbnailSvg: string
}

// ─── Inline SVG thumbnail generators ────────────────────────────────
function portraitSvg(bg: string, accent: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="200" viewBox="0 0 120 200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      ${bg}
    </linearGradient>
  </defs>
  <rect width="120" height="200" rx="10" fill="url(#bg)"/>
  <rect x="10" y="10" width="100" height="28" rx="4" fill="${accent}" opacity="0.9"/>
  <text x="60" y="29" font-family="Arial" font-size="9" fill="white" text-anchor="middle" font-weight="bold">YoVibe</text>
  <rect x="30" y="50" width="60" height="60" rx="4" fill="white" opacity="0.95"/>
  <rect x="36" y="56" width="48" height="48" rx="2" fill="#111"/>
  <text x="60" y="84" font-family="Arial" font-size="7" fill="white" text-anchor="middle">QR</text>
  <rect x="10" y="125" width="70" height="6" rx="3" fill="white" opacity="0.7"/>
  <rect x="10" y="137" width="50" height="4" rx="2" fill="white" opacity="0.4"/>
  <rect x="10" y="148" width="55" height="4" rx="2" fill="white" opacity="0.4"/>
  <rect x="10" y="159" width="40" height="4" rx="2" fill="white" opacity="0.4"/>
  <rect x="10" y="175" width="100" height="16" rx="4" fill="${accent}" opacity="0.5"/>
  <text x="60" y="186" font-family="Arial" font-size="7" fill="white" text-anchor="middle">${label}</text>
</svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

function landscapeSvg(bg: string, accent: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="110" viewBox="0 0 200 110">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
      ${bg}
    </linearGradient>
  </defs>
  <rect width="200" height="110" rx="10" fill="url(#bg)"/>
  <rect x="10" y="10" width="110" height="90" rx="4" fill="rgba(0,0,0,0.25)"/>
  <rect x="15" y="15" width="80" height="10" rx="3" fill="white" opacity="0.8"/>
  <rect x="15" y="31" width="60" height="5" rx="2" fill="white" opacity="0.5"/>
  <rect x="15" y="42" width="65" height="5" rx="2" fill="white" opacity="0.5"/>
  <rect x="15" y="53" width="50" height="5" rx="2" fill="white" opacity="0.5"/>
  <rect x="15" y="64" width="55" height="5" rx="2" fill="white" opacity="0.5"/>
  <rect x="15" y="80" width="100" height="14" rx="4" fill="${accent}" opacity="0.7"/>
  <rect x="135" y="15" width="55" height="55" rx="4" fill="white" opacity="0.95"/>
  <rect x="140" y="20" width="45" height="45" rx="2" fill="#111"/>
  <text x="162" y="46" font-family="Arial" font-size="7" fill="white" text-anchor="middle">QR</text>
  <text x="162" y="90" font-family="Arial" font-size="6" fill="white" text-anchor="middle" opacity="0.7">${label}</text>
</svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

// ─── Helper to build a ticket layout with all 4 blocks ──────────────
function blk(id: string, x: number, y: number, w: number, h: number) {
  return { id, x, y, width: w, height: h, scale: 1 }
}
function layoutOf(poster: [number, number, number, number], title: [number, number, number, number], info: [number, number, number, number], qr: [number, number, number, number]): TicketLayout {
  return {
    blocks: [blk("poster", ...poster), blk("title", ...title), blk("info", ...info), blk("qr", ...qr)],
    bg: { x: 0, y: 0, scale: 1 },
  }
}

// ─── Theme layouts (single source of truth for item arrangement) ───
const LAYOUTS: Record<string, { portrait: TicketLayout; landscape: TicketLayout }> = {
  midnight: {
    portrait: layoutOf([340, 20, 240, 260], [24, 24, 290, 80], [24, 580, 260, 220], [160, 320, 200, 220]),
    landscape: layoutOf([680, 20, 200, 240], [24, 20, 320, 70], [24, 120, 300, 200], [340, 120, 220, 240]),
  },
  neon: {
    portrait: layoutOf([0, 0, 600, 320], [24, 240, 400, 70], [24, 380, 270, 260], [316, 380, 260, 260]),
    landscape: layoutOf([0, 0, 360, 500], [380, 24, 300, 70], [380, 130, 250, 180], [640, 130, 240, 260]),
  },
  golden: {
    portrait: layoutOf([24, 130, 280, 280], [24, 24, 280, 80], [320, 24, 260, 200], [320, 250, 260, 260]),
    landscape: layoutOf([24, 120, 240, 240], [24, 20, 280, 70], [296, 20, 280, 180], [296, 220, 240, 240]),
  },
  ocean: {
    portrait: layoutOf([0, 0, 600, 400], [24, 410, 260, 80], [290, 620, 280, 200], [290, 410, 180, 200]),
    landscape: layoutOf([0, 0, 420, 500], [440, 20, 440, 70], [660, 120, 220, 220], [440, 120, 200, 220]),
  },
  ember: {
    portrait: layoutOf([24, 320, 260, 260], [300, 24, 280, 80], [300, 130, 280, 220], [130, 600, 220, 220]),
    landscape: layoutOf([24, 24, 260, 260], [310, 24, 320, 70], [310, 120, 320, 180], [640, 24, 240, 280]),
  },
  minimal: {
    portrait: layoutOf([60, 20, 480, 260], [60, 300, 480, 70], [60, 390, 480, 200], [180, 620, 240, 200]),
    landscape: layoutOf([24, 20, 200, 460], [250, 20, 400, 70], [250, 120, 400, 200], [670, 20, 210, 260]),
  },
}

// ─── Template Definitions ───────────────────────────────────────────

export const TICKET_TEMPLATES: TicketTemplateConfig[] = [
  // ── PORTRAIT (600 x 900) ──────────────────────────────────────────
  {
    id: "midnight-portrait", label: "Midnight", orientation: "portrait",
    width: 600, height: 900, layout: LAYOUTS.midnight.portrait,
    background: "linear-gradient(160deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
    headerBg: "linear-gradient(90deg, #302b63, #24243e)",
    accentColor: "#7c3aed", textPrimary: "#ffffff", textSecondary: "#a78bfa",
    qrBg: "#1e1b4b", dividerColor: "rgba(167,139,250,0.25)",
    badgeBg: "#7c3aed", badgeText: "#ffffff", fontStyle: "sans", qrPosition: "center",
    thumbnailSvg: portraitSvg('<stop offset="0%" stop-color="#0f0c29"/><stop offset="50%" stop-color="#302b63"/><stop offset="100%" stop-color="#24243e"/>', "#7c3aed", "Midnight"),
  },
  {
    id: "neon-night-portrait", label: "Neon Night", orientation: "portrait",
    width: 600, height: 900, layout: LAYOUTS.neon.portrait,
    background: "linear-gradient(160deg, #0a0a0a 0%, #1a0533 60%, #0d0d0d 100%)",
    headerBg: "linear-gradient(90deg, #ff0080, #7928ca)",
    accentColor: "#ff0080", textPrimary: "#ffffff", textSecondary: "#f0abfc",
    qrBg: "#1a0533", dividerColor: "rgba(255,0,128,0.3)",
    badgeBg: "linear-gradient(90deg,#ff0080,#7928ca)", badgeText: "#ffffff", fontStyle: "sans", qrPosition: "top",
    thumbnailSvg: portraitSvg('<stop offset="0%" stop-color="#0a0a0a"/><stop offset="60%" stop-color="#1a0533"/><stop offset="100%" stop-color="#0d0d0d"/>', "#ff0080", "Neon Night"),
  },
  {
    id: "golden-vip-portrait", label: "Golden VIP", orientation: "portrait",
    width: 600, height: 900, layout: LAYOUTS.golden.portrait,
    background: "linear-gradient(160deg, #1a1200 0%, #2d1f00 50%, #1a1200 100%)",
    headerBg: "linear-gradient(90deg, #b8860b, #ffd700)",
    accentColor: "#ffd700", textPrimary: "#fff8dc", textSecondary: "#d4af37",
    qrBg: "#2d1f00", dividerColor: "rgba(212,175,55,0.35)",
    badgeBg: "linear-gradient(90deg,#b8860b,#ffd700)", badgeText: "#1a1200", fontStyle: "serif", qrPosition: "bottom",
    thumbnailSvg: portraitSvg('<stop offset="0%" stop-color="#1a1200"/><stop offset="50%" stop-color="#2d1f00"/><stop offset="100%" stop-color="#1a1200"/>', "#ffd700", "Golden VIP"),
  },
  {
    id: "ocean-portrait", label: "Ocean", orientation: "portrait",
    width: 600, height: 900, layout: LAYOUTS.ocean.portrait,
    background: "linear-gradient(160deg, #001f3f 0%, #003366 50%, #0074d9 100%)",
    headerBg: "linear-gradient(90deg, #0074d9, #00b4d8)",
    accentColor: "#00b4d8", textPrimary: "#ffffff", textSecondary: "#90e0ef",
    qrBg: "#003366", dividerColor: "rgba(0,180,216,0.3)",
    badgeBg: "#0074d9", badgeText: "#ffffff", fontStyle: "sans", qrPosition: "center",
    thumbnailSvg: portraitSvg('<stop offset="0%" stop-color="#001f3f"/><stop offset="50%" stop-color="#003366"/><stop offset="100%" stop-color="#0074d9"/>', "#00b4d8", "Ocean"),
  },
  {
    id: "ember-portrait", label: "Ember", orientation: "portrait",
    width: 600, height: 900, layout: LAYOUTS.ember.portrait,
    background: "linear-gradient(160deg, #1a0500 0%, #3d0c00 50%, #7c1900 100%)",
    headerBg: "linear-gradient(90deg, #ff4500, #ff8c00)",
    accentColor: "#ff4500", textPrimary: "#fff5f0", textSecondary: "#ffb347",
    qrBg: "#3d0c00", dividerColor: "rgba(255,69,0,0.3)",
    badgeBg: "linear-gradient(90deg,#ff4500,#ff8c00)", badgeText: "#ffffff", fontStyle: "sans", qrPosition: "top",
    thumbnailSvg: portraitSvg('<stop offset="0%" stop-color="#1a0500"/><stop offset="50%" stop-color="#3d0c00"/><stop offset="100%" stop-color="#7c1900"/>', "#ff4500", "Ember"),
  },
  {
    id: "minimal-portrait", label: "Minimal", orientation: "portrait",
    width: 600, height: 900, layout: LAYOUTS.minimal.portrait,
    background: "#f8f8f8", headerBg: "#111111", accentColor: "#111111",
    textPrimary: "#111111", textSecondary: "#555555", qrBg: "#ffffff",
    dividerColor: "#e0e0e0", badgeBg: "#111111", badgeText: "#ffffff", fontStyle: "mono", qrPosition: "bottom",
    thumbnailSvg: portraitSvg('<stop offset="0%" stop-color="#f8f8f8"/><stop offset="100%" stop-color="#eeeeee"/>', "#111111", "Minimal"),
  },
  // ── LANDSCAPE (900 x 500) ─────────────────────────────────────────
  {
    id: "midnight-landscape", label: "Midnight", orientation: "landscape",
    width: 900, height: 500, layout: LAYOUTS.midnight.landscape,
    background: "linear-gradient(120deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
    headerBg: "linear-gradient(180deg, #302b63, #24243e)",
    accentColor: "#7c3aed", textPrimary: "#ffffff", textSecondary: "#a78bfa",
    qrBg: "#1e1b4b", dividerColor: "rgba(167,139,250,0.25)",
    badgeBg: "#7c3aed", badgeText: "#ffffff", fontStyle: "sans", qrPosition: "right",
    thumbnailSvg: landscapeSvg('<stop offset="0%" stop-color="#0f0c29"/><stop offset="50%" stop-color="#302b63"/><stop offset="100%" stop-color="#24243e"/>', "#7c3aed", "Midnight"),
  },
  {
    id: "neon-night-landscape", label: "Neon Night", orientation: "landscape",
    width: 900, height: 500, layout: LAYOUTS.neon.landscape,
    background: "linear-gradient(120deg, #0a0a0a 0%, #1a0533 60%, #0d0d0d 100%)",
    headerBg: "linear-gradient(180deg, #ff0080, #7928ca)",
    accentColor: "#ff0080", textPrimary: "#ffffff", textSecondary: "#f0abfc",
    qrBg: "#1a0533", dividerColor: "rgba(255,0,128,0.3)",
    badgeBg: "linear-gradient(90deg,#ff0080,#7928ca)", badgeText: "#ffffff", fontStyle: "sans", qrPosition: "right",
    thumbnailSvg: landscapeSvg('<stop offset="0%" stop-color="#0a0a0a"/><stop offset="60%" stop-color="#1a0533"/><stop offset="100%" stop-color="#0d0d0d"/>', "#ff0080", "Neon Night"),
  },
  {
    id: "golden-vip-landscape", label: "Golden VIP", orientation: "landscape",
    width: 900, height: 500, layout: LAYOUTS.golden.landscape,
    background: "linear-gradient(120deg, #1a1200 0%, #2d1f00 50%, #1a1200 100%)",
    headerBg: "linear-gradient(180deg, #b8860b, #ffd700)",
    accentColor: "#ffd700", textPrimary: "#fff8dc", textSecondary: "#d4af37",
    qrBg: "#2d1f00", dividerColor: "rgba(212,175,55,0.35)",
    badgeBg: "linear-gradient(90deg,#b8860b,#ffd700)", badgeText: "#1a1200", fontStyle: "serif", qrPosition: "left",
    thumbnailSvg: landscapeSvg('<stop offset="0%" stop-color="#1a1200"/><stop offset="50%" stop-color="#2d1f00"/><stop offset="100%" stop-color="#1a1200"/>', "#ffd700", "Golden VIP"),
  },
  {
    id: "ocean-landscape", label: "Ocean", orientation: "landscape",
    width: 900, height: 500, layout: LAYOUTS.ocean.landscape,
    background: "linear-gradient(120deg, #001f3f 0%, #003366 50%, #0074d9 100%)",
    headerBg: "linear-gradient(180deg, #0074d9, #00b4d8)",
    accentColor: "#00b4d8", textPrimary: "#ffffff", textSecondary: "#90e0ef",
    qrBg: "#003366", dividerColor: "rgba(0,180,216,0.3)",
    badgeBg: "#0074d9", badgeText: "#ffffff", fontStyle: "sans", qrPosition: "right",
    thumbnailSvg: landscapeSvg('<stop offset="0%" stop-color="#001f3f"/><stop offset="50%" stop-color="#003366"/><stop offset="100%" stop-color="#0074d9"/>', "#00b4d8", "Ocean"),
  },
  {
    id: "ember-landscape", label: "Ember", orientation: "landscape",
    width: 900, height: 500, layout: LAYOUTS.ember.landscape,
    background: "linear-gradient(120deg, #1a0500 0%, #3d0c00 50%, #7c1900 100%)",
    headerBg: "linear-gradient(180deg, #ff4500, #ff8c00)",
    accentColor: "#ff4500", textPrimary: "#fff5f0", textSecondary: "#ffb347",
    qrBg: "#3d0c00", dividerColor: "rgba(255,69,0,0.3)",
    badgeBg: "linear-gradient(90deg,#ff4500,#ff8c00)", badgeText: "#ffffff", fontStyle: "sans", qrPosition: "right",
    thumbnailSvg: landscapeSvg('<stop offset="0%" stop-color="#1a0500"/><stop offset="50%" stop-color="#3d0c00"/><stop offset="100%" stop-color="#7c1900"/>', "#ff4500", "Ember"),
  },
  {
    id: "minimal-landscape", label: "Minimal", orientation: "landscape",
    width: 900, height: 500, layout: LAYOUTS.minimal.landscape,
    background: "#f8f8f8", headerBg: "#111111", accentColor: "#111111",
    textPrimary: "#111111", textSecondary: "#555555", qrBg: "#ffffff",
    dividerColor: "#e0e0e0", badgeBg: "#111111", badgeText: "#ffffff", fontStyle: "mono", qrPosition: "left",
    thumbnailSvg: landscapeSvg('<stop offset="0%" stop-color="#f8f8f8"/><stop offset="100%" stop-color="#eeeeee"/>', "#111111", "Minimal"),
  },
]

// ─── Lookup helpers ──────────────────────────────────────────────────
export function getTemplateById(id: string): TicketTemplateConfig | undefined {
  return TICKET_TEMPLATES.find((t) => t.id === id)
}

export function getTemplatesByOrientation(
  orientation: "portrait" | "landscape"
): TicketTemplateConfig[] {
  return TICKET_TEMPLATES.filter((t) => t.orientation === orientation)
}

// Legacy compat — kept so existing code that imports TICKET_TEMPLATE_BACKGROUNDS doesn't break
export const TICKET_TEMPLATE_BACKGROUNDS: Record<string, string> = Object.fromEntries(
  TICKET_TEMPLATES.map((t) => [t.id, t.background])
)
