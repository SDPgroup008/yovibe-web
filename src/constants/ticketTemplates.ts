// ─── Template ID compile-time validation ────────────────────────────
export const TEMPLATE_IDS = [
  'midnight-portrait', 'midnight-landscape',
  'neon-night-portrait', 'neon-night-landscape',
  'golden-vip-portrait', 'golden-vip-landscape',
  'ocean-portrait', 'ocean-landscape',
  'ember-portrait', 'ember-landscape',
  'minimal-portrait', 'minimal-landscape',
] as const

export type TemplateId = typeof TEMPLATE_IDS[number]

export interface TicketTemplateConfig {
  id: TemplateId
  label: string
  orientation: "portrait" | "landscape"
  layoutKey: string
  background: string
  headerBg: string
  accentColor: string
  textPrimary: string
  textSecondary: string
  qrBg: string
  dividerColor: string
  badgeBg: string
  badgeText: string
  fontStyle: "sans" | "mono" | "serif"
  decor: {
    borderStyle?: "solid" | "double" | "dashed"
    cornerStyle?: "rounded" | "sharp"
    hasTopStripe: boolean
    hasBottomStripe: boolean
    stripeGradient?: string
    showWatermark: boolean
    watermarkOpacity?: number
    qrBorderColor: string
    hasGlow: boolean
  }
  qrPosition: "top" | "bottom" | "center" | "left" | "right"
  thumbnailSvg: string
}

// ─── Enterprise-grade thumbnail SVGs ──────────────────────────────────
// Each SVG is a 1:1.5 aspect-ratio card designed to communicate:
//   - Brand block (YV logo + template name)
//   - QR code zone
//   - Event info text lines
//   - Unique per-template layout signature
// Inspired by Linear, Jira, Zendesk card design principles:
//   subtle depth, clear content hierarchy, generous whitespace,
//   muted secondary elements, high-contrast primary actions.

function portraitSvg(cfg: {
  bg: string; accent: string; text: string; secondary: string;
  headerBg: string; badgeBg: string; badgeText: string;
  font: string; decor: string; label: string;
}) {
  const { bg, accent, text, secondary, headerBg, badgeBg, badgeText, font, decor, label } = cfg
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="200" viewBox="0 0 120 200">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">${bg}</linearGradient></defs>
  <rect width="120" height="200" rx="8" fill="url(#bg)"/>
  ${decor}
  <!-- Brand header -->
  <rect x="10" y="8" width="100" height="22" rx="4" fill="${headerBg}" opacity="0.92"/>
  <text x="60" y="23" font-family="${font},Arial" font-size="8" fill="${text}" text-anchor="middle" font-weight="800" letter-spacing="0.5">YV</text>
  <!-- QR card area -->
  <rect x="30" y="38" width="60" height="60" rx="6" fill="#fff" opacity="0.95" filter="drop-shadow(0 1px 2px rgba(0,0,0,0.24))"/>
  <rect x="36" y="44" width="48" height="48" rx="3" fill="${secondary}22"/>
  <rect x="42" y="50" width="36" height="36" rx="2" fill="${accent}33"/>
  <text x="60" y="72" font-family="${font},Arial" font-size="6" fill="${accent}" text-anchor="middle" font-weight="700">QR</text>
  <!-- Info lines -->
  <rect x="12" y="108" width="96" height="4" rx="2" fill="${text}" opacity="0.25"/>
  <rect x="12" y="116" width="64" height="3" rx="1.5" fill="${text}" opacity="0.15"/>
  <rect x="12" y="124" width="72" height="3" rx="1.5" fill="${text}" opacity="0.15"/>
  <rect x="12" y="132" width="56" height="3" rx="1.5" fill="${text}" opacity="0.12"/>
  <!-- Ticket type badge -->
  <rect x="12" y="142" width="40" height="14" rx="7" fill="${badgeBg}" opacity="0.9"/>
  <text x="32" y="152" font-family="${font},Arial" font-size="5" fill="${badgeText}" text-anchor="middle" font-weight="700">VIP</text>
  <!-- Bottom bar -->
  <rect x="0" y="182" width="120" height="18" fill="${headerBg}" opacity="0.85"/>
  <text x="12" y="194" font-family="${font},Arial" font-size="5" fill="${text}" opacity="0.7">yovibe.net</text>
  <text x="108" y="194" font-family="${font},Arial" font-size="4.5" fill="${text}" opacity="0.5" text-anchor="end">${label}</text>
</svg>`)}`
}

function landscapeSvg(cfg: {
  bg: string; accent: string; text: string; secondary: string;
  headerBg: string; badgeBg: string; badgeText: string;
  font: string; decor: string; label: string;
}) {
  const { bg, accent, text, secondary, headerBg, badgeBg, badgeText, font, decor, label } = cfg
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="110" viewBox="0 0 200 110">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">${bg}</linearGradient></defs>
  <rect width="200" height="110" rx="8" fill="url(#bg)"/>
  ${decor}
  <!-- Brand header -->
  <rect x="10" y="8" width="100" height="18" rx="4" fill="${headerBg}" opacity="0.92"/>
  <text x="60" y="20" font-family="${font},Arial" font-size="7" fill="${text}" text-anchor="middle" font-weight="800">YV</text>
  <!-- Info panel left -->
  <rect x="12" y="34" width="102" height="60" rx="6" fill="${text}08"/>
  <rect x="18" y="40" width="90" height="3" rx="1.5" fill="${text}" opacity="0.2"/>
  <rect x="18" y="47" width="60" height="2.5" rx="1.25" fill="${text}" opacity="0.12"/>
  <rect x="18" y="54" width="68" height="2.5" rx="1.25" fill="${text}" opacity="0.12"/>
  <rect x="18" y="61" width="50" height="2.5" rx="1.25" fill="${text}" opacity="0.1"/>
  <rect x="18" y="72" width="36" height="12" rx="6" fill="${badgeBg}" opacity="0.9"/>
  <text x="36" y="80" font-family="${font},Arial" font-size="4.5" fill="${badgeText}" text-anchor="middle" font-weight="700">VIP</text>
  <!-- QR panel right -->
  <rect x="124" y="28" width="66" height="66" rx="6" fill="#fff" opacity="0.95" filter="drop-shadow(0 1px 2px rgba(0,0,0,0.2))"/>
  <rect x="130" y="34" width="54" height="54" rx="3" fill="${secondary}22"/>
  <rect x="136" y="40" width="42" height="42" rx="2" fill="${accent}33"/>
  <text x="157" y="66" font-family="${font},Arial" font-size="6" fill="${accent}" text-anchor="middle" font-weight="700">QR</text>
  <!-- Bottom bar -->
  <rect x="0" y="96" width="200" height="14" fill="${headerBg}" opacity="0.85"/>
  <text x="12" y="106" font-family="${font},Arial" font-size="4.5" fill="${text}" opacity="0.7">yovibe.net</text>
  <text x="188" y="106" font-family="${font},Arial" font-size="4" fill="${text}" opacity="0.5" text-anchor="end">${label}</text>
</svg>`)}`
}

// ─── Unique per-template decor elements ───────────────────────────────
// Each template gets a structural signature that's visible in the thumbnail:
//   midnight:  top + bottom accent bars, faint vertex dot
//   neon:      thin diagonal cut, glow strip
//   golden:    double top/bottom rules, golden border frame
//   ocean:     wavy separator line, floating halo
//   ember:     warm glow burst bottom-right, accent top rule
//   minimal:   border frame, single dividing line

const decor = {
  midnight: `<rect x="0" y="0" width="120" height="3" fill="#7c3aed" opacity="0.6"/>
              <rect x="0" y="197" width="120" height="3" fill="#7c3aed" opacity="0.3"/>
              <circle cx="100" cy="168" r="16" fill="none" stroke="#a78bfa" opacity="0.12" stroke-width="1"/>`,
  neon:     `<path d="M0,16 L120,0" stroke="#ff0080" stroke-width="2" opacity="0.4"/>
              <rect x="0" y="197" width="120" height="3" fill="#ff0080" opacity="0.2" rx="1.5"/>`,
  golden:   `<rect x="0" y="0" width="120" height="1.5" fill="#ffd700" opacity="0.5"/>
              <rect x="0" y="198.5" width="120" height="1.5" fill="#b8860b" opacity="0.5"/>
              <rect x="4" y="4" width="112" height="192" rx="6" fill="none" stroke="#ffd700" opacity="0.08" stroke-width="1"/>`,
  ocean:    `<path d="M0,38 Q30,34 60,38 T120,36" stroke="#00b4d8" stroke-width="1" fill="none" opacity="0.25"/>
              <circle cx="24" cy="24" r="10" fill="none" stroke="#90e0ef" opacity="0.12" stroke-width="1"/>`,
  ember:    `<rect x="0" y="0" width="120" height="3" fill="#ff4500" opacity="0.5"/>
              <circle cx="100" cy="186" r="20" fill="#ff4500" opacity="0.06"/>
              <line x1="0" y1="196" x2="120" y2="196" stroke="#ff4500" stroke-width="0.5" opacity="0.15"/>`,
  minimal:  `<rect x="4" y="4" width="112" height="192" rx="6" fill="none" stroke="#ddd" stroke-width="0.5"/>
              <line x1="12" y1="32" x2="108" y2="32" stroke="#e0e0e0" stroke-width="0.5" opacity="0.5"/>`,
}

const decorLandscape = {
  midnight: `<rect x="0" y="0" width="200" height="2.5" fill="#7c3aed" opacity="0.6"/>
              <rect x="0" y="107.5" width="200" height="2.5" fill="#7c3aed" opacity="0.3"/>`,
  neon:     `<path d="M0,12 L200,0" stroke="#ff0080" stroke-width="2" opacity="0.35"/>
              <rect x="0" y="108" width="200" height="2" fill="#ff0080" opacity="0.2"/>`,
  golden:   `<rect x="0" y="0" width="200" height="1" fill="#ffd700" opacity="0.5"/>
              <rect x="0" y="109" width="200" height="1" fill="#b8860b" opacity="0.5"/>`,
  ocean:    `<path d="M0,20 Q50,16 100,20 T200,18" stroke="#00b4d8" stroke-width="1" fill="none" opacity="0.2"/>`,
  ember:    `<rect x="0" y="0" width="200" height="2.5" fill="#ff4500" opacity="0.5"/>
              <circle cx="180" cy="100" r="14" fill="#ff4500" opacity="0.05"/>`,
  minimal:  `<rect x="3" y="3" width="194" height="104" rx="6" fill="none" stroke="#ddd" stroke-width="0.5"/>`,
}

function getDecor(id: string, orientation: string): string {
  const pool = orientation === 'landscape' ? decorLandscape : decor
  if (id.includes('midnight')) return pool.midnight
  if (id.includes('neon')) return pool.neon
  if (id.includes('golden')) return pool.golden
  if (id.includes('ocean')) return pool.ocean
  if (id.includes('ember')) return pool.ember
  return pool.minimal
}

const FONT_MAP: Record<string, string> = { sans: 'Arial', serif: 'Georgia', mono: 'Courier New' }

function tpl(id: TemplateId, cfg: Omit<TicketTemplateConfig, 'id' | 'thumbnailSvg'>): TicketTemplateConfig {
  const orientation = cfg.orientation
  const font = FONT_MAP[cfg.fontStyle] || 'Arial'
  const d = getDecor(id, orientation)
  const base = {
    bg: cfg.background, accent: cfg.accentColor, text: cfg.textPrimary,
    secondary: cfg.textSecondary, headerBg: cfg.headerBg,
    badgeBg: cfg.badgeBg, badgeText: cfg.badgeText, font, decor: d, label: cfg.label,
  }
  const thumbnailSvg = orientation === 'landscape' ? landscapeSvg(base) : portraitSvg(base)
  return { ...cfg, id, thumbnailSvg }
}

export const TICKET_TEMPLATES: TicketTemplateConfig[] = [
  tpl('midnight-portrait', {
    label: "Midnight", orientation: "portrait", layoutKey: "midnight",
    background: "linear-gradient(160deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
    headerBg: "linear-gradient(90deg, #302b63, #24243e)",
    accentColor: "#7c3aed", textPrimary: "#ffffff", textSecondary: "#a78bfa",
    qrBg: "#1e1b4b", dividerColor: "rgba(167,139,250,0.25)", badgeBg: "#7c3aed", badgeText: "#ffffff",
    fontStyle: "sans", qrPosition: "center",
    decor: { hasTopStripe: true, hasBottomStripe: true, hasGlow: false, showWatermark: true, watermarkOpacity: 0.15, qrBorderColor: "#a78bfa", borderStyle: "solid", cornerStyle: "rounded", stripeGradient: undefined },
  }),
  tpl('neon-night-portrait', {
    label: "Neon Night", orientation: "portrait", layoutKey: "neon",
    background: "linear-gradient(160deg, #0a0a0a 0%, #1a0533 60%, #0d0d0d 100%)",
    headerBg: "linear-gradient(90deg, #ff0080, #7928ca)",
    accentColor: "#ff0080", textPrimary: "#ffffff", textSecondary: "#f0abfc",
    qrBg: "#1a0533", dividerColor: "rgba(255,0,128,0.3)", badgeBg: "linear-gradient(90deg,#ff0080,#7928ca)", badgeText: "#ffffff",
    fontStyle: "sans", qrPosition: "top",
    decor: { hasTopStripe: true, hasBottomStripe: true, hasGlow: true, showWatermark: true, watermarkOpacity: 0.08, qrBorderColor: "#ff0080", borderStyle: "solid", cornerStyle: "sharp", stripeGradient: "linear-gradient(90deg,#ff0080,#7928ca)" },
  }),
  tpl('golden-vip-portrait', {
    label: "Golden VIP", orientation: "portrait", layoutKey: "golden",
    background: "linear-gradient(160deg, #1a1200 0%, #2d1f00 50%, #1a1200 100%)",
    headerBg: "linear-gradient(90deg, #b8860b, #ffd700)",
    accentColor: "#ffd700", textPrimary: "#fff8dc", textSecondary: "#d4af37",
    qrBg: "#2d1f00", dividerColor: "rgba(212,175,55,0.35)", badgeBg: "linear-gradient(90deg,#b8860b,#ffd700)", badgeText: "#1a1200",
    fontStyle: "serif", qrPosition: "bottom",
    decor: { hasTopStripe: true, hasBottomStripe: true, hasGlow: false, showWatermark: true, watermarkOpacity: 0.12, qrBorderColor: "#ffd700", borderStyle: "double", cornerStyle: "rounded", stripeGradient: undefined },
  }),
  tpl('ocean-portrait', {
    label: "Ocean", orientation: "portrait", layoutKey: "ocean",
    background: "linear-gradient(160deg, #001f3f 0%, #003366 50%, #0074d9 100%)",
    headerBg: "linear-gradient(90deg, #0074d9, #00b4d8)",
    accentColor: "#00b4d8", textPrimary: "#ffffff", textSecondary: "#90e0ef",
    qrBg: "#003366", dividerColor: "rgba(0,180,216,0.3)", badgeBg: "#0074d9", badgeText: "#ffffff",
    fontStyle: "sans", qrPosition: "center",
    decor: { hasTopStripe: false, hasBottomStripe: false, hasGlow: false, showWatermark: true, watermarkOpacity: 0.1, qrBorderColor: "#90e0ef", borderStyle: "solid", cornerStyle: "rounded", stripeGradient: undefined },
  }),
  tpl('ember-portrait', {
    label: "Ember", orientation: "portrait", layoutKey: "ember",
    background: "linear-gradient(160deg, #1a0500 0%, #3d0c00 50%, #7c1900 100%)",
    headerBg: "linear-gradient(90deg, #ff4500, #ff8c00)",
    accentColor: "#ff4500", textPrimary: "#fff5f0", textSecondary: "#ffb347",
    qrBg: "#3d0c00", dividerColor: "rgba(255,69,0,0.3)", badgeBg: "linear-gradient(90deg,#ff4500,#ff8c00)", badgeText: "#ffffff",
    fontStyle: "sans", qrPosition: "top",
    decor: { hasTopStripe: true, hasBottomStripe: false, hasGlow: true, showWatermark: true, watermarkOpacity: 0.08, qrBorderColor: "#ff8c00", borderStyle: "solid", cornerStyle: "rounded", stripeGradient: undefined },
  }),
  tpl('minimal-portrait', {
    label: "Minimal", orientation: "portrait", layoutKey: "minimal",
    background: "#f8f8f8", headerBg: "#111111", accentColor: "#111111",
    textPrimary: "#111111", textSecondary: "#555555", qrBg: "#ffffff",
    dividerColor: "#e0e0e0", badgeBg: "#111111", badgeText: "#ffffff",
    fontStyle: "mono", qrPosition: "bottom",
    decor: { hasTopStripe: false, hasBottomStripe: false, hasGlow: false, showWatermark: false, qrBorderColor: "#ddd", borderStyle: "solid", cornerStyle: "rounded", stripeGradient: undefined },
  }),
  tpl('midnight-landscape', {
    label: "Midnight", orientation: "landscape", layoutKey: "midnight",
    background: "linear-gradient(120deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
    headerBg: "linear-gradient(180deg, #302b63, #24243e)", accentColor: "#7c3aed",
    textPrimary: "#ffffff", textSecondary: "#a78bfa", qrBg: "#1e1b4b",
    dividerColor: "rgba(167,139,250,0.25)", badgeBg: "#7c3aed", badgeText: "#ffffff",
    fontStyle: "sans", qrPosition: "right",
    decor: { hasTopStripe: true, hasBottomStripe: true, hasGlow: false, showWatermark: true, watermarkOpacity: 0.15, qrBorderColor: "#a78bfa", borderStyle: "solid", cornerStyle: "rounded", stripeGradient: undefined },
  }),
  tpl('neon-night-landscape', {
    label: "Neon Night", orientation: "landscape", layoutKey: "neon",
    background: "linear-gradient(120deg, #0a0a0a 0%, #1a0533 60%, #0d0d0d 100%)",
    headerBg: "linear-gradient(180deg, #ff0080, #7928ca)", accentColor: "#ff0080",
    textPrimary: "#ffffff", textSecondary: "#f0abfc", qrBg: "#1a0533",
    dividerColor: "rgba(255,0,128,0.3)", badgeBg: "linear-gradient(90deg,#ff0080,#7928ca)", badgeText: "#ffffff",
    fontStyle: "sans", qrPosition: "right",
    decor: { hasTopStripe: true, hasBottomStripe: true, hasGlow: true, showWatermark: true, watermarkOpacity: 0.08, qrBorderColor: "#ff0080", borderStyle: "solid", cornerStyle: "sharp", stripeGradient: "linear-gradient(90deg,#ff0080,#7928ca)" },
  }),
  tpl('golden-vip-landscape', {
    label: "Golden VIP", orientation: "landscape", layoutKey: "golden",
    background: "linear-gradient(120deg, #1a1200 0%, #2d1f00 50%, #1a1200 100%)",
    headerBg: "linear-gradient(180deg, #b8860b, #ffd700)", accentColor: "#ffd700",
    textPrimary: "#fff8dc", textSecondary: "#d4af37", qrBg: "#2d1f00",
    dividerColor: "rgba(212,175,55,0.35)", badgeBg: "linear-gradient(90deg,#b8860b,#ffd700)", badgeText: "#1a1200",
    fontStyle: "serif", qrPosition: "left",
    decor: { hasTopStripe: true, hasBottomStripe: true, hasGlow: false, showWatermark: true, watermarkOpacity: 0.12, qrBorderColor: "#ffd700", borderStyle: "double", cornerStyle: "rounded", stripeGradient: undefined },
  }),
  tpl('ocean-landscape', {
    label: "Ocean", orientation: "landscape", layoutKey: "ocean",
    background: "linear-gradient(120deg, #001f3f 0%, #003366 50%, #0074d9 100%)",
    headerBg: "linear-gradient(180deg, #0074d9, #00b4d8)", accentColor: "#00b4d8",
    textPrimary: "#ffffff", textSecondary: "#90e0ef", qrBg: "#003366",
    dividerColor: "rgba(0,180,216,0.3)", badgeBg: "#0074d9", badgeText: "#ffffff",
    fontStyle: "sans", qrPosition: "right",
    decor: { hasTopStripe: false, hasBottomStripe: false, hasGlow: false, showWatermark: true, watermarkOpacity: 0.1, qrBorderColor: "#90e0ef", borderStyle: "solid", cornerStyle: "rounded", stripeGradient: undefined },
  }),
  tpl('ember-landscape', {
    label: "Ember", orientation: "landscape", layoutKey: "ember",
    background: "linear-gradient(120deg, #1a0500 0%, #3d0c00 50%, #7c1900 100%)",
    headerBg: "linear-gradient(180deg, #ff4500, #ff8c00)", accentColor: "#ff4500",
    textPrimary: "#fff5f0", textSecondary: "#ffb347", qrBg: "#3d0c00",
    dividerColor: "rgba(255,69,0,0.3)", badgeBg: "linear-gradient(90deg,#ff4500,#ff8c00)", badgeText: "#ffffff",
    fontStyle: "sans", qrPosition: "right",
    decor: { hasTopStripe: true, hasBottomStripe: false, hasGlow: true, showWatermark: true, watermarkOpacity: 0.08, qrBorderColor: "#ff8c00", borderStyle: "solid", cornerStyle: "rounded", stripeGradient: undefined },
  }),
  tpl('minimal-landscape', {
    label: "Minimal", orientation: "landscape", layoutKey: "minimal",
    background: "#f8f8f8", headerBg: "#111111", accentColor: "#111111",
    textPrimary: "#111111", textSecondary: "#555555", qrBg: "#ffffff",
    dividerColor: "#e0e0e0", badgeBg: "#111111", badgeText: "#ffffff",
    fontStyle: "mono", qrPosition: "left",
    decor: { hasTopStripe: false, hasBottomStripe: false, hasGlow: false, showWatermark: false, qrBorderColor: "#ddd", borderStyle: "solid", cornerStyle: "rounded", stripeGradient: undefined },
  }),
]

export function getTemplateById(id: string): TicketTemplateConfig | undefined {
  return TICKET_TEMPLATES.find((t) => t.id === id)
}

export function getTemplatesByOrientation(orientation: "portrait" | "landscape"): TicketTemplateConfig[] {
  return TICKET_TEMPLATES.filter((t) => t.orientation === orientation)
}

export const TICKET_TEMPLATE_BACKGROUNDS: Record<string, string> = Object.fromEntries(
  TICKET_TEMPLATES.map((t) => [t.id, t.background])
)
