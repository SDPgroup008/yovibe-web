// ─── Server-side Ticket Layout Engine (CommonJS) ───────────────────────
// Mirrors src/services/TicketLayoutEngine.ts for use in Netlify functions.
// Keep in sync with the TypeScript source.

const DEFAULT_BLOCK_SIZES = {
  poster: { width: 200, height: 200 },
  title: { width: 280, height: 80 },
  info: { width: 260, height: 180 },
  qr: { width: 160, height: 200 },
};

const EMAIL_MAX_WIDTH = 600;

function getDefaultLayout(orientation, hasPoster) {
  if (orientation === "landscape") {
    return {
      blocks: [
        { id: "poster", x: 630, y: 20, scale: 1 },
        { id: "title",  x: 24,  y: 24, scale: 1 },
        { id: "info",   x: 24,  y: 130, scale: 1 },
        { id: "qr",     x: 660, y: 170, scale: 1 },
      ],
      bg: { x: 0, y: 0, scale: 1 },
    };
  }
  return {
    blocks: [
      { id: "poster", x: 330, y: 20, scale: 1 },
      { id: "title",  x: 24,  y: 24, scale: 1 },
      { id: "info",   x: 24,  y: 430, scale: 1 },
      { id: "qr",     x: 190, y: 250, scale: 1 },
    ],
    bg: { x: 0, y: 0, scale: 1 },
  };
}

/**
 * Given a ticket design, return a computed layout with pixel sizes, scales, etc.
 */
function computeTicketLayout(design, contentHints) {
  const isLandscape = design?.orientation === "landscape";
  const isUploadBg = design?.source === "upload" && !!design?.background_url;
  const bgImage = design?.background_url || "";

  const pageWidth = design?.dimensions?.width || (isLandscape ? 900 : 600);
  const pageHeight = design?.dimensions?.height || (isLandscape ? 500 : 900);

  const storedLayout = design?.layout;
  const layout = storedLayout || getDefaultLayout(
    design?.orientation || "portrait",
    contentHints?.hasPoster ?? true
  );

  const emailScale = Math.min(EMAIL_MAX_WIDTH, pageWidth) / pageWidth;
  const emailWidth = Math.round(pageWidth * emailScale);

  const blocks = layout.blocks.map(function(block, idx) {
    const defaultSize = DEFAULT_BLOCK_SIZES[block.id] || { width: 200, height: 150 };
    const scale = block.scale ?? 1;

    let align = "center";
    if (block.x < pageWidth * 0.3) {
      align = "left";
    } else if (block.x > pageWidth * 0.7) {
      align = "right";
    }

    return {
      id: block.id,
      x: block.x,
      y: block.y,
      width: Math.round(defaultSize.width * scale),
      height: Math.round(defaultSize.height * scale),
      scale: scale,
      zIndex: idx,
      align: align,
    };
  });

  return {
    layoutVersion: 1,
    blocks: blocks,
    bgTransform: layout.bg,
    pageWidth: pageWidth,
    pageHeight: pageHeight,
    isLandscape: isLandscape,
    isUploadBg: isUploadBg,
    bgImage: bgImage,
    emailScale: emailScale,
    emailWidth: emailWidth,
  };
}

/**
 * Convert computed layout into an ordered list for email table layout.
 * Blocks are proportionally scaled to fit email width.
 */
function computeEmailSections(layout) {
  var orderBy = { poster: 0, title: 1, info: 2, qr: 3 };
  var sorted = layout.blocks.slice().sort(function(a, b) {
    if (Math.abs(a.y - b.y) < 50) {
      return (orderBy[a.id] ?? 0) - (orderBy[b.id] ?? 0);
    }
    return a.y - b.y;
  });

  // Scale each block proportionally for email rendering
  return sorted.map(function(block) {
    return {
      id: block.id,
      x: block.x,
      y: block.y,
      width: Math.max(80, Math.round(block.width * layout.emailScale)),
      height: Math.max(40, Math.round(block.height * layout.emailScale)),
      scale: block.scale,
      zIndex: block.zIndex,
      align: block.align,
    };
  });
}

/**
 * Convert computed layout to PDF-renderable positions (Y-axis flipped).
 */
function computePdfPositions(layout, pageHeight) {
  return layout.blocks.map(function(block) {
    return {
      id: block.id,
      x: block.x,
      y: pageHeight - block.y - block.height,
      width: block.width,
      height: block.height,
      scale: block.scale,
    };
  });
}

module.exports = {
  computeTicketLayout: computeTicketLayout,
  computeEmailSections: computeEmailSections,
  computePdfPositions: computePdfPositions,
  getDefaultLayout: getDefaultLayout,
};
