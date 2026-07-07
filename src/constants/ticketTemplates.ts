// ─── Template Layout Config ───────────────────────────────────────────────────
// Each template defines its visual identity and layout rules.
// qrPosition: where the QR block sits on the ticket
//   portrait  → "top" | "bottom" | "center"
//   landscape → "left" | "right"

export interface TicketTemplateConfig {
  id: string
  label: string
  orientation: "portrait" | "landscape"
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

// ─── Inline SVG thumbnail generators ─────────────────────────────────────────

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

// ─── Template Definitions ─────────────────────────────────────────────────────

export const TICKET_TEMPLATES: TicketTemplateConfig[] = [
  // ── PORTRAIT ──────────────────────────────────────────────────────────────
  {
    id: "midnight-portrait",
    label: "Midnight",
    orientation: "portrait",
    background: "linear-gradient(160deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
    headerBg: "linear-gradient(90deg, #302b63, #24243e)",
    accentColor: "#7c3aed",
    textPrimary: "#ffffff",
    textSecondary: "#a78bfa",
    qrBg: "#1e1b4b",
    dividerColor: "rgba(167,139,250,0.25)",
    badgeBg: "#7c3aed",
    badgeText: "#ffffff",
    fontStyle: "sans",
    qrPosition: "center",
    thumbnailSvg: portraitSvg(
      '<stop offset="0%" stop-color="#0f0c29"/><stop offset="50%" stop-color="#302b63"/><stop offset="100%" stop-color="#24243e"/>',
      "#7c3aed", "Midnight"
    ),
  },
  {
    id: "neon-night-portrait",
    label: "Neon Night",
    orientation: "portrait",
    background: "linear-gradient(160deg, #0a0a0a 0%, #1a0533 60%, #0d0d0d 100%)",
    headerBg: "linear-gradient(90deg, #ff0080, #7928ca)",
    accentColor: "#ff0080",
    textPrimary: "#ffffff",
    textSecondary: "#f0abfc",
    qrBg: "#1a0533",
    dividerColor: "rgba(255,0,128,0.3)",
    badgeBg: "linear-gradient(90deg,#ff0080,#7928ca)",
    badgeText: "#ffffff",
    fontStyle: "sans",
    qrPosition: "top",
    thumbnailSvg: portraitSvg(
      '<stop offset="0%" stop-color="#0a0a0a"/><stop offset="60%" stop-color="#1a0533"/><stop offset="100%" stop-color="#0d0d0d"/>',
      "#ff0080", "Neon Night"
    ),
  },
  {
    id: "golden-vip-portrait",
    label: "Golden VIP",
    orientation: "portrait",
    background: "linear-gradient(160deg, #1a1200 0%, #2d1f00 50%, #1a1200 100%)",
    headerBg: "linear-gradient(90deg, #b8860b, #ffd700)",
    accentColor: "#ffd700",
    textPrimary: "#fff8dc",
    textSecondary: "#d4af37",
    qrBg: "#2d1f00",
    dividerColor: "rgba(212,175,55,0.35)",
    badgeBg: "linear-gradient(90deg,#b8860b,#ffd700)",
    badgeText: "#1a1200",
    fontStyle: "serif",
    qrPosition: "bottom",
    thumbnailSvg: portraitSvg(
      '<stop offset="0%" stop-color="#1a1200"/><stop offset="50%" stop-color="#2d1f00"/><stop offset="100%" stop-color="#1a1200"/>',
      "#ffd700", "Golden VIP"
    ),
  },
  {
    id: "ocean-portrait",
    label: "Ocean",
    orientation: "portrait",
    background: "linear-gradient(160deg, #001f3f 0%, #003366 50%, #0074d9 100%)",
    headerBg: "linear-gradient(90deg, #0074d9, #00b4d8)",
    accentColor: "#00b4d8",
    textPrimary: "#ffffff",
    textSecondary: "#90e0ef",
    qrBg: "#003366",
    dividerColor: "rgba(0,180,216,0.3)",
    badgeBg: "#0074d9",
    badgeText: "#ffffff",
    fontStyle: "sans",
    qrPosition: "center",
    thumbnailSvg: portraitSvg(
      '<stop offset="0%" stop-color="#001f3f"/><stop offset="50%" stop-color="#003366"/><stop offset="100%" stop-color="#0074d9"/>',
      "#00b4d8", "Ocean"
    ),
  },
  {
    id: "ember-portrait",
    label: "Ember",
    orientation: "portrait",
    background: "linear-gradient(160deg, #1a0500 0%, #3d0c00 50%, #7c1900 100%)",
    headerBg: "linear-gradient(90deg, #ff4500, #ff8c00)",
    accentColor: "#ff4500",
    textPrimary: "#fff5f0",
    textSecondary: "#ffb347",
    qrBg: "#3d0c00",
    dividerColor: "rgba(255,69,0,0.3)",
    badgeBg: "linear-gradient(90deg,#ff4500,#ff8c00)",
    badgeText: "#ffffff",
    fontStyle: "sans",
    qrPosition: "top",
    thumbnailSvg: portraitSvg(
      '<stop offset="0%" stop-color="#1a0500"/><stop offset="50%" stop-color="#3d0c00"/><stop offset="100%" stop-color="#7c1900"/>',
      "#ff4500", "Ember"
    ),
  },
  {
    id: "minimal-portrait",
    label: "Minimal",
    orientation: "portrait",
    background: "#f8f8f8",
    headerBg: "#111111",
    accentColor: "#111111",
    textPrimary: "#111111",
    textSecondary: "#555555",
    qrBg: "#ffffff",
    dividerColor: "#e0e0e0",
    badgeBg: "#111111",
    badgeText: "#ffffff",
    fontStyle: "mono",
    qrPosition: "bottom",
    thumbnailSvg: portraitSvg(
      '<stop offset="0%" stop-color="#f8f8f8"/><stop offset="100%" stop-color="#eeeeee"/>',
      "#111111", "Minimal"
    ),
  },

  // ── LANDSCAPE ─────────────────────────────────────────────────────────────
  {
    id: "midnight-landscape",
    label: "Midnight",
    orientation: "landscape",
    background: "linear-gradient(120deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
    headerBg: "linear-gradient(180deg, #302b63, #24243e)",
    accentColor: "#7c3aed",
    textPrimary: "#ffffff",
    textSecondary: "#a78bfa",
    qrBg: "#1e1b4b",
    dividerColor: "rgba(167,139,250,0.25)",
    badgeBg: "#7c3aed",
    badgeText: "#ffffff",
    fontStyle: "sans",
    qrPosition: "right",
    thumbnailSvg: landscapeSvg(
      '<stop offset="0%" stop-color="#0f0c29"/><stop offset="50%" stop-color="#302b63"/><stop offset="100%" stop-color="#24243e"/>',
      "#7c3aed", "Midnight"
    ),
  },
  {
    id: "neon-night-landscape",
    label: "Neon Night",
    orientation: "landscape",
    background: "linear-gradient(120deg, #0a0a0a 0%, #1a0533 60%, #0d0d0d 100%)",
    headerBg: "linear-gradient(180deg, #ff0080, #7928ca)",
    accentColor: "#ff0080",
    textPrimary: "#ffffff",
    textSecondary: "#f0abfc",
    qrBg: "#1a0533",
    dividerColor: "rgba(255,0,128,0.3)",
    badgeBg: "linear-gradient(90deg,#ff0080,#7928ca)",
    badgeText: "#ffffff",
    fontStyle: "sans",
    qrPosition: "right",
    thumbnailSvg: landscapeSvg(
      '<stop offset="0%" stop-color="#0a0a0a"/><stop offset="60%" stop-color="#1a0533"/><stop offset="100%" stop-color="#0d0d0d"/>',
      "#ff0080", "Neon Night"
    ),
  },
  {
    id: "golden-vip-landscape",
    label: "Golden VIP",
    orientation: "landscape",
    background: "linear-gradient(120deg, #1a1200 0%, #2d1f00 50%, #1a1200 100%)",
    headerBg: "linear-gradient(180deg, #b8860b, #ffd700)",
    accentColor: "#ffd700",
    textPrimary: "#fff8dc",
    textSecondary: "#d4af37",
    qrBg: "#2d1f00",
    dividerColor: "rgba(212,175,55,0.35)",
    badgeBg: "linear-gradient(90deg,#b8860b,#ffd700)",
    badgeText: "#1a1200",
    fontStyle: "serif",
    qrPosition: "left",
    thumbnailSvg: landscapeSvg(
      '<stop offset="0%" stop-color="#1a1200"/><stop offset="50%" stop-color="#2d1f00"/><stop offset="100%" stop-color="#1a1200"/>',
      "#ffd700", "Golden VIP"
    ),
  },
  {
    id: "ocean-landscape",
    label: "Ocean",
    orientation: "landscape",
    background: "linear-gradient(120deg, #001f3f 0%, #003366 50%, #0074d9 100%)",
    headerBg: "linear-gradient(180deg, #0074d9, #00b4d8)",
    accentColor: "#00b4d8",
    textPrimary: "#ffffff",
    textSecondary: "#90e0ef",
    qrBg: "#003366",
    dividerColor: "rgba(0,180,216,0.3)",
    badgeBg: "#0074d9",
    badgeText: "#ffffff",
    fontStyle: "sans",
    qrPosition: "right",
    thumbnailSvg: landscapeSvg(
      '<stop offset="0%" stop-color="#001f3f"/><stop offset="50%" stop-color="#003366"/><stop offset="100%" stop-color="#0074d9"/>',
      "#00b4d8", "Ocean"
    ),
  },
  {
    id: "ember-landscape",
    label: "Ember",
    orientation: "landscape",
    background: "linear-gradient(120deg, #1a0500 0%, #3d0c00 50%, #7c1900 100%)",
    headerBg: "linear-gradient(180deg, #ff4500, #ff8c00)",
    accentColor: "#ff4500",
    textPrimary: "#fff5f0",
    textSecondary: "#ffb347",
    qrBg: "#3d0c00",
    dividerColor: "rgba(255,69,0,0.3)",
    badgeBg: "linear-gradient(90deg,#ff4500,#ff8c00)",
    badgeText: "#ffffff",
    fontStyle: "sans",
    qrPosition: "right",
    thumbnailSvg: landscapeSvg(
      '<stop offset="0%" stop-color="#1a0500"/><stop offset="50%" stop-color="#3d0c00"/><stop offset="100%" stop-color="#7c1900"/>',
      "#ff4500", "Ember"
    ),
  },
  {
    id: "minimal-landscape",
    label: "Minimal",
    orientation: "landscape",
    background: "#f8f8f8",
    headerBg: "#111111",
    accentColor: "#111111",
    textPrimary: "#111111",
    textSecondary: "#555555",
    qrBg: "#ffffff",
    dividerColor: "#e0e0e0",
    badgeBg: "#111111",
    badgeText: "#ffffff",
    fontStyle: "mono",
    qrPosition: "left",
    thumbnailSvg: landscapeSvg(
      '<stop offset="0%" stop-color="#f8f8f8"/><stop offset="100%" stop-color="#eeeeee"/>',
      "#111111", "Minimal"
    ),
  },
]

// ─── Lookup helpers ───────────────────────────────────────────────────────────

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
