// ─── Shared Ticket Layout Engine ─────────────────────────────────────────
// Used by TicketPDFService.ts (client), send-ticket-email.js (server),
// and AddEventScreen.tsx (editor).
// The server-side mirror is at netlify/functions/ticketLayoutEngine.js

export interface BlockLayout {
  id: string
  x: number
  y: number
  scale?: number
  /** Explicit rendered width after scale (px); computed at editor save time. Falls back to defaultSize * scale when absent. */
  width?: number
  /** Explicit rendered height after scale (px); computed at editor save time. Falls back to defaultSize * scale when absent. */
  height?: number
}

export interface BgTransform {
  x: number
  y: number
  scale: number
  /** Original source image width (px) for crop computation */
  sourceWidth?: number
  /** Original source image height (px) for crop computation */
  sourceHeight?: number
}

export interface TicketLayout {
  blocks: BlockLayout[]
  bg: BgTransform
}

export interface TicketDesignInput {
  enabled?: boolean
  source?: "template" | "upload"
  template_id?: string | null
  background_url?: string | null
  orientation?: "portrait" | "landscape"
  dimensions?: { width: number; height: number }
  qr_position?: "top" | "bottom" | "center" | "left" | "right"
  layout?: TicketLayout
}

export interface ComputedBlock {
  id: string
  x: number
  y: number
  width: number
  height: number
  scale: number
  zIndex: number
  align: "left" | "center" | "right"
}

export interface ComputedLayout {
  layoutVersion: number
  blocks: ComputedBlock[]
  bgTransform: BgTransform
  pageWidth: number
  pageHeight: number
  isLandscape: boolean
  isUploadBg: boolean
  bgImage: string
  /** Scale factor to fit the design within ~600px for email */
  emailScale: number
  /** Clamped width for email rendering */
  emailWidth: number
}

const DEFAULT_BLOCK_SIZES: Record<string, { width: number; height: number }> = {
  poster: { width: 200, height: 200 },
  title: { width: 280, height: 80 },
  info: { width: 260, height: 180 },
  qr: { width: 160, height: 200 },
}

const EMAIL_MAX_WIDTH = 600

/**
 * Each template has a unique spatial arrangement on the ticket canvas.
 * Portrait: 600x900  |  Landscape: 900x500
 * Blocks (poster, title, info, qr) are positioned differently per template
 * to create distinct visual rhythms and optimized space utilization.
 */
const LAYOUTS: Record<string, { portrait: TicketLayout; landscape: TicketLayout }> = {

  // ── MIDNIGHT — "Corner-Weighted" ────────────────────────────────────
  // Poster top-right corner, QR floating centrally, info anchored bottom-left.
  // Creates a diagonal visual flow from top-right → center → bottom-left.
  midnight: {
    portrait: {
      blocks: [
        { id: "poster", x: 340, y: 20, scale: 1, width: 240, height: 260 },
        { id: "title",  x: 24,  y: 24, scale: 1, width: 290, height: 80 },
        { id: "qr",     x: 160, y: 320, scale: 1, width: 200, height: 220 },
        { id: "info",   x: 24,  y: 580, scale: 1, width: 260, height: 220 },
      ],
      bg: { x: 0, y: 0, scale: 1 },
    },
    landscape: {
      blocks: [
        { id: "poster", x: 680, y: 20, scale: 1, width: 200, height: 240 },
        { id: "title",  x: 24,  y: 20, scale: 1, width: 320, height: 70 },
        { id: "info",   x: 24,  y: 120, scale: 1, width: 300, height: 200 },
        { id: "qr",     x: 340, y: 120, scale: 1, width: 220, height: 240 },
      ],
      bg: { x: 0, y: 0, scale: 1 },
    },
  },

  // ── NEON NIGHT — "Full-Bleed Edge" ──────────────────────────────────
  // Poster spans full width as a hero strip. Title overlays onto poster.
  // Info and QR split the bottom half in a two-column grid.
  neon: {
    portrait: {
      blocks: [
        { id: "poster", x: 0,   y: 0, scale: 1.2, width: 600, height: 320 },
        { id: "title",  x: 24,  y: 240, scale: 1, width: 400, height: 70 },
        { id: "info",   x: 24,  y: 380, scale: 1, width: 270, height: 260 },
        { id: "qr",     x: 316, y: 380, scale: 1, width: 260, height: 260 },
      ],
      bg: { x: 0, y: 0, scale: 1 },
    },
    landscape: {
      blocks: [
        { id: "poster", x: 0,   y: 0, scale: 1.1, width: 360, height: 500 },
        { id: "title",  x: 380, y: 24, scale: 1, width: 300, height: 70 },
        { id: "info",   x: 380, y: 130, scale: 1, width: 250, height: 180 },
        { id: "qr",     x: 640, y: 130, scale: 1, width: 240, height: 260 },
      ],
      bg: { x: 0, y: 0, scale: 1 },
    },
  },

  // ── GOLDEN VIP — "Split Vertical" ───────────────────────────────────
  // Left column: title + poster stacked. Right column: info + QR.
  // Elegant columned layout ideal for VIP events.
  golden: {
    portrait: {
      blocks: [
        { id: "title",  x: 24,  y: 24, scale: 1, width: 280, height: 80 },
        { id: "poster", x: 24,  y: 130, scale: 1, width: 280, height: 280 },
        { id: "info",   x: 320, y: 24, scale: 1, width: 260, height: 200 },
        { id: "qr",     x: 320, y: 250, scale: 1, width: 260, height: 260 },
      ],
      bg: { x: 0, y: 0, scale: 1 },
    },
    landscape: {
      blocks: [
        { id: "title",  x: 24,  y: 20, scale: 1, width: 280, height: 70 },
        { id: "poster", x: 24,  y: 120, scale: 1, width: 240, height: 240 },
        { id: "info",   x: 296, y: 20, scale: 1, width: 280, height: 180 },
        { id: "qr",     x: 296, y: 220, scale: 1, width: 240, height: 240 },
      ],
      bg: { x: 0, y: 0, scale: 1 },
    },
  },

  // ── OCEAN — "Hero + Triptych" ──────────────────────────────────────
  // Large poster fills the upper half. Below it, a three-column strip
  // of title, QR, and info creates a horizontal rhythm.
  ocean: {
    portrait: {
      blocks: [
        { id: "poster", x: 0,   y: 0, scale: 1.1, width: 600, height: 400 },
        { id: "title",  x: 24,  y: 410, scale: 1, width: 260, height: 80 },
        { id: "qr",     x: 290, y: 410, scale: 1, width: 180, height: 200 },
        { id: "info",   x: 290, y: 620, scale: 1, width: 280, height: 200 },
      ],
      bg: { x: 0, y: 0, scale: 1 },
    },
    landscape: {
      blocks: [
        { id: "poster", x: 0,   y: 0, scale: 1.1, width: 420, height: 500 },
        { id: "title",  x: 440, y: 20, scale: 1, width: 440, height: 70 },
        { id: "qr",     x: 440, y: 120, scale: 1, width: 200, height: 220 },
        { id: "info",   x: 660, y: 120, scale: 1, width: 220, height: 220 },
      ],
      bg: { x: 0, y: 0, scale: 1 },
    },
  },

  // ── EMBER — "Floating Asymmetric" ───────────────────────────────────
  // Poster takes the lower-left as a grounded block. QR floats in the
  // center. Title and info are stacked on the right. Asymmetric layout
  // creates visual tension.
  ember: {
    portrait: {
      blocks: [
        { id: "poster", x: 24,  y: 320, scale: 1, width: 260, height: 260 },
        { id: "title",  x: 300, y: 24, scale: 1, width: 280, height: 80 },
        { id: "info",   x: 300, y: 130, scale: 1, width: 280, height: 220 },
        { id: "qr",     x: 130, y: 600, scale: 1, width: 220, height: 220 },
      ],
      bg: { x: 0, y: 0, scale: 1 },
    },
    landscape: {
      blocks: [
        { id: "poster", x: 24,  y: 24, scale: 1, width: 260, height: 260 },
        { id: "title",  x: 310, y: 24, scale: 1, width: 320, height: 70 },
        { id: "info",   x: 310, y: 120, scale: 1, width: 320, height: 180 },
        { id: "qr",     x: 640, y: 24, scale: 1, width: 240, height: 280 },
      ],
      bg: { x: 0, y: 0, scale: 1 },
    },
  },

  // ── MINIMAL — "Centered Column" ─────────────────────────────────────
  // Everything stacks vertically along the central axis.
  // Poster at top, then title, info, QR. Clean, app-like scroll.
  minimal: {
    portrait: {
      blocks: [
        { id: "poster", x: 60,  y: 20, scale: 1, width: 480, height: 260 },
        { id: "title",  x: 60,  y: 300, scale: 1, width: 480, height: 70 },
        { id: "info",   x: 60,  y: 390, scale: 1, width: 480, height: 200 },
        { id: "qr",     x: 180, y: 620, scale: 1, width: 240, height: 200 },
      ],
      bg: { x: 0, y: 0, scale: 1 },
    },
    landscape: {
      blocks: [
        { id: "poster", x: 24,  y: 20, scale: 1, width: 200, height: 460 },
        { id: "title",  x: 250, y: 20, scale: 1, width: 400, height: 70 },
        { id: "info",   x: 250, y: 120, scale: 1, width: 400, height: 200 },
        { id: "qr",     x: 670, y: 20, scale: 1, width: 210, height: 260 },
      ],
      bg: { x: 0, y: 0, scale: 1 },
    },
  },
}

/** Resolve which layout key to use for a given template_id string */
function layoutKey(templateId?: string | null): string {
  if (!templateId) return "midnight"
  for (const key of Object.keys(LAYOUTS)) {
    if (templateId.startsWith(key)) return key
  }
  return "midnight"
}

export function getDefaultLayout(
  orientation: "portrait" | "landscape",
  _hasPoster: boolean,
  design?: TicketDesignInput,
): TicketLayout {
  const key = layoutKey(design?.template_id)
  const layouts = LAYOUTS[key] || LAYOUTS.midnight
  const layout = orientation === "landscape" ? layouts.landscape : layouts.portrait
  return JSON.parse(JSON.stringify(layout)) // deep clone to avoid mutation
}

/**
 * Given a ticket design (with optional stored layout), return a computed
 * layout with pixel sizes, scales, and z-ordering for all renderers.
 */
export function computeTicketLayout(
  design: TicketDesignInput,
  contentHints?: { title?: string; hasPoster?: boolean }
): ComputedLayout {
  const isLandscape = design?.orientation === "landscape"
  const isUploadBg = design?.source === "upload" && !!design?.background_url
  const bgImage = design?.background_url || ""

  const pageWidth = design?.dimensions?.width || (isLandscape ? 900 : 600)
  const pageHeight = design?.dimensions?.height || (isLandscape ? 500 : 900)

  const storedLayout = design?.layout
  const layout = storedLayout || getDefaultLayout(
    design?.orientation || "portrait",
    contentHints?.hasPoster ?? true,
    design,
  )

  const emailScale = Math.min(EMAIL_MAX_WIDTH, pageWidth) / pageWidth
  const emailWidth = Math.round(pageWidth * emailScale)

  const blocks: ComputedBlock[] = layout.blocks.map((block, idx) => {
    const defaultSize = DEFAULT_BLOCK_SIZES[block.id] || { width: 200, height: 150 }
    const scale = block.scale ?? 1

    let align: "left" | "center" | "right" = "center"
    if (block.x < pageWidth * 0.3) {
      align = "left"
    } else if (block.x > pageWidth * 0.7) {
      align = "right"
    }

    return {
      id: block.id,
      x: block.x,
      y: block.y,
      // Use stored explicit dimensions if available, otherwise compute from defaults * scale
      width: block.width ?? Math.round(defaultSize.width * scale),
      height: block.height ?? Math.round(defaultSize.height * scale),
      scale,
      zIndex: idx,
      align,
    }
  })

  return {
    layoutVersion: 1,
    blocks,
    bgTransform: layout.bg,
    pageWidth,
    pageHeight,
    isLandscape,
    isUploadBg,
    bgImage,
    emailScale,
    emailWidth,
  }
}

/**
 * Convert a computed layout into an ordered list of sections for email tables.
 * Blocks are ordered by Y (top to bottom), then grouped by type.
 * Each block's width/height are proportionally scaled to fit email width.
 */
export function computeEmailSections(layout: ComputedLayout): ComputedBlock[] {
  const sorted = [...layout.blocks].sort((a, b) => {
    if (Math.abs(a.y - b.y) < 50) {
      const order = { poster: 0, title: 1, info: 2, qr: 3 }
      return (order[a.id as keyof typeof order] ?? 0) - (order[b.id as keyof typeof order] ?? 0)
    }
    return a.y - b.y
  })

  // Scale each block proportionally for email rendering
  return sorted.map((block) => ({
    ...block,
    width: Math.max(80, Math.round(block.width * layout.emailScale)),
    height: Math.max(40, Math.round(block.height * layout.emailScale)),
  }))
}

/**
 * Convert a computed layout to PDF-renderable dimensions.
 * Flips Y-axis (CSS Y=0 is top, PDF Y=0 is bottom).
 */
export function computePdfPositions(
  layout: ComputedLayout,
  pageHeight: number
): Array<{ id: string; x: number; y: number; width: number; height: number; scale: number }> {
  return layout.blocks.map((block) => ({
    id: block.id,
    x: block.x,
    y: pageHeight - block.y - block.height,
    width: block.width,
    height: block.height,
    scale: block.scale,
  }))
}

/**
 * Given a background transform and the page/canvas dimensions,
 * compute the crop rectangle to apply when rendering the source image.
 * Returns the source rect (sx, sy, sw, sh) and destination rect (dw, dh).
 */
export function computeBgCrop(
  bgTransform: BgTransform,
  pageWidth: number,
  pageHeight: number,
  imageWidth: number,
  imageHeight: number
): { sx: number; sy: number; sw: number; sh: number } {
  const { x: panX, y: panY, scale: zoom } = bgTransform

  // How much of the source image is visible after zoom
  const visibleW = imageWidth / zoom
  const visibleH = imageHeight / zoom

  // Center the visible region, then apply pan offset
  const sx = (imageWidth - visibleW) / 2 - (panX / pageWidth) * visibleW
  const sy = (imageHeight - visibleH) / 2 - (panY / pageHeight) * visibleH

  return {
    sx: Math.max(0, sx),
    sy: Math.max(0, sy),
    sw: Math.min(visibleW, imageWidth - sx),
    sh: Math.min(visibleH, imageHeight - sy),
  }
}
