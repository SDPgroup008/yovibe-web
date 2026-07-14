// ─── Shared Ticket Layout Engine ─────────────────────────────────────────
// Used by TicketPDFService.ts (client), send-ticket-email.js (server),
// and AddEventScreen.tsx (editor).
// The server-side mirror is at netlify/functions/ticketLayoutEngine.js

export interface BlockLayout {
  id: string
  x: number
  y: number
  scale?: number
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

export interface TicketDesignInput {
  source?: "template" | "upload"
  background_url?: string | null
  orientation?: "portrait" | "landscape"
  dimensions?: { width: number; height: number }
  qr_position?: string
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
  blocks: ComputedBlock[]
  bgTransform: BgTransform
  pageWidth: number
  pageHeight: number
  isLandscape: boolean
  isUploadBg: boolean
  bgImage: string
}

const DEFAULT_BLOCK_SIZES: Record<string, { width: number; height: number }> = {
  poster: { width: 200, height: 200 },
  title: { width: 280, height: 80 },
  info: { width: 260, height: 180 },
  qr: { width: 160, height: 200 },
}

export function getDefaultLayout(orientation: "portrait" | "landscape", hasPoster: boolean): TicketLayout {
  if (orientation === "landscape") {
    return {
      blocks: [
        { id: "poster", x: 630, y: 20, scale: 1 },
        { id: "title",  x: 24,  y: 24, scale: 1 },
        { id: "info",   x: 24,  y: 130, scale: 1 },
        { id: "qr",     x: 660, y: 170, scale: 1 },
      ],
      bg: { x: 0, y: 0, scale: 1 },
    }
  }
  return {
    blocks: [
      { id: "poster", x: 330, y: 20, scale: 1 },
      { id: "title",  x: 24,  y: 24, scale: 1 },
      { id: "info",   x: 24,  y: 430, scale: 1 },
      { id: "qr",     x: 190, y: 250, scale: 1 },
    ],
    bg: { x: 0, y: 0, scale: 1 },
  }
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
    contentHints?.hasPoster ?? true
  )

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
      width: Math.round(defaultSize.width * scale),
      height: Math.round(defaultSize.height * scale),
      scale: scale,
      zIndex: idx,
      align,
    }
  })

  return {
    blocks,
    bgTransform: layout.bg,
    pageWidth,
    pageHeight,
    isLandscape,
    isUploadBg,
    bgImage,
  }
}

/**
 * Convert a computed layout into an ordered list of sections for email tables.
 * Blocks are ordered by Y (top to bottom), then grouped by horizontal region.
 */
export function computeEmailSections(layout: ComputedLayout): ComputedBlock[] {
  return [...layout.blocks].sort((a, b) => {
    if (Math.abs(a.y - b.y) < 50) {
      const order = { poster: 0, title: 1, info: 2, qr: 3 }
      return (order[a.id as keyof typeof order] ?? 0) - (order[b.id as keyof typeof order] ?? 0)
    }
    return a.y - b.y
  })
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
