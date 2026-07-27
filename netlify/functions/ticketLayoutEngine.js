// ─── Server-side Ticket Layout Engine (CommonJS) ───────────────────────
// Mirrors src/services/TicketLayoutEngine.ts for use in Netlify functions.
// Keep in sync with the TypeScript source.

var DEFAULT_BLOCK_SIZES = {
  poster: { width: 200, height: 200 },
  title: { width: 280, height: 80 },
  info: { width: 260, height: 180 },
  qr: { width: 160, height: 200 },
};

var EMAIL_MAX_WIDTH = 600;

// ─── Template-specific layouts ──────────────────────────────────────────
// Must match TicketLayoutEngine.ts exactly.

var LAYOUTS = {
  midnight: {
    portrait: { blocks: [
      { id: "poster", x: 340, y: 20, scale: 1, width: 240, height: 260 },
      { id: "title",  x: 24,  y: 24, scale: 1, width: 290, height: 80 },
      { id: "qr",     x: 160, y: 320, scale: 1, width: 200, height: 220 },
      { id: "info",   x: 24,  y: 580, scale: 1, width: 260, height: 220 },
    ], bg: { x: 0, y: 0, scale: 1 } },
    landscape: { blocks: [
      { id: "poster", x: 680, y: 20, scale: 1, width: 200, height: 240 },
      { id: "title",  x: 24,  y: 20, scale: 1, width: 320, height: 70 },
      { id: "info",   x: 24,  y: 120, scale: 1, width: 300, height: 200 },
      { id: "qr",     x: 340, y: 120, scale: 1, width: 220, height: 240 },
    ], bg: { x: 0, y: 0, scale: 1 } },
  },
  neon: {
    portrait: { blocks: [
      { id: "poster", x: 0,   y: 0, scale: 1.2, width: 600, height: 320 },
      { id: "title",  x: 24,  y: 240, scale: 1, width: 400, height: 70 },
      { id: "info",   x: 24,  y: 380, scale: 1, width: 270, height: 260 },
      { id: "qr",     x: 316, y: 380, scale: 1, width: 260, height: 260 },
    ], bg: { x: 0, y: 0, scale: 1 } },
    landscape: { blocks: [
      { id: "poster", x: 0,   y: 0, scale: 1.1, width: 360, height: 500 },
      { id: "title",  x: 380, y: 24, scale: 1, width: 300, height: 70 },
      { id: "info",   x: 380, y: 130, scale: 1, width: 250, height: 180 },
      { id: "qr",     x: 640, y: 130, scale: 1, width: 240, height: 260 },
    ], bg: { x: 0, y: 0, scale: 1 } },
  },
  golden: {
    portrait: { blocks: [
      { id: "title",  x: 24,  y: 24, scale: 1, width: 280, height: 80 },
      { id: "poster", x: 24,  y: 130, scale: 1, width: 280, height: 280 },
      { id: "info",   x: 320, y: 24, scale: 1, width: 260, height: 200 },
      { id: "qr",     x: 320, y: 250, scale: 1, width: 260, height: 260 },
    ], bg: { x: 0, y: 0, scale: 1 } },
    landscape: { blocks: [
      { id: "title",  x: 24,  y: 20, scale: 1, width: 280, height: 70 },
      { id: "poster", x: 24,  y: 120, scale: 1, width: 240, height: 240 },
      { id: "info",   x: 296, y: 20, scale: 1, width: 280, height: 180 },
      { id: "qr",     x: 296, y: 220, scale: 1, width: 240, height: 240 },
    ], bg: { x: 0, y: 0, scale: 1 } },
  },
  ocean: {
    portrait: { blocks: [
      { id: "poster", x: 0,   y: 0, scale: 1.1, width: 600, height: 400 },
      { id: "title",  x: 24,  y: 410, scale: 1, width: 260, height: 80 },
      { id: "qr",     x: 290, y: 410, scale: 1, width: 180, height: 200 },
      { id: "info",   x: 290, y: 620, scale: 1, width: 280, height: 200 },
    ], bg: { x: 0, y: 0, scale: 1 } },
    landscape: { blocks: [
      { id: "poster", x: 0,   y: 0, scale: 1.1, width: 420, height: 500 },
      { id: "title",  x: 440, y: 20, scale: 1, width: 440, height: 70 },
      { id: "qr",     x: 440, y: 120, scale: 1, width: 200, height: 220 },
      { id: "info",   x: 660, y: 120, scale: 1, width: 220, height: 220 },
    ], bg: { x: 0, y: 0, scale: 1 } },
  },
  ember: {
    portrait: { blocks: [
      { id: "poster", x: 24,  y: 320, scale: 1, width: 260, height: 260 },
      { id: "title",  x: 300, y: 24, scale: 1, width: 280, height: 80 },
      { id: "info",   x: 300, y: 130, scale: 1, width: 280, height: 220 },
      { id: "qr",     x: 130, y: 600, scale: 1, width: 220, height: 220 },
    ], bg: { x: 0, y: 0, scale: 1 } },
    landscape: { blocks: [
      { id: "poster", x: 24,  y: 24, scale: 1, width: 260, height: 260 },
      { id: "title",  x: 310, y: 24, scale: 1, width: 320, height: 70 },
      { id: "info",   x: 310, y: 120, scale: 1, width: 320, height: 180 },
      { id: "qr",     x: 640, y: 24, scale: 1, width: 240, height: 280 },
    ], bg: { x: 0, y: 0, scale: 1 } },
  },
  minimal: {
    portrait: { blocks: [
      { id: "poster", x: 60,  y: 20, scale: 1, width: 480, height: 260 },
      { id: "title",  x: 60,  y: 300, scale: 1, width: 480, height: 70 },
      { id: "info",   x: 60,  y: 390, scale: 1, width: 480, height: 200 },
      { id: "qr",     x: 180, y: 620, scale: 1, width: 240, height: 200 },
    ], bg: { x: 0, y: 0, scale: 1 } },
    landscape: { blocks: [
      { id: "poster", x: 24,  y: 20, scale: 1, width: 200, height: 460 },
      { id: "title",  x: 250, y: 20, scale: 1, width: 400, height: 70 },
      { id: "info",   x: 250, y: 120, scale: 1, width: 400, height: 200 },
      { id: "qr",     x: 670, y: 20, scale: 1, width: 210, height: 260 },
    ], bg: { x: 0, y: 0, scale: 1 } },
  },
};

function layoutKey(templateId) {
  if (!templateId) return "midnight";
  for (var key of Object.keys(LAYOUTS)) {
    if (templateId.startsWith(key)) return key;
  }
  return "midnight";
}

function getDefaultLayout(orientation, hasPoster, design) {
  var key = layoutKey(design ? design.template_id : null);
  var layouts = LAYOUTS[key] || LAYOUTS.midnight;
  var layout = orientation === "landscape" ? layouts.landscape : layouts.portrait;
  return JSON.parse(JSON.stringify(layout)); // deep clone
}

function computeTicketLayout(design, contentHints) {
  var isLandscape = design && design.orientation === "landscape";
  var isUploadBg = design && design.source === "upload" && design.background_url;
  var bgImage = design ? design.background_url || "" : "";

  var pageWidth = design && design.dimensions ? design.dimensions.width : (isLandscape ? 900 : 600);
  var pageHeight = design && design.dimensions ? design.dimensions.height : (isLandscape ? 500 : 900);

  var storedLayout = design ? design.layout : null;
  var layout = storedLayout || getDefaultLayout(
    design ? design.orientation || "portrait" : "portrait",
    contentHints ? contentHints.hasPoster : true,
    design,
  );

  var emailScale = Math.min(EMAIL_MAX_WIDTH, pageWidth) / pageWidth;
  var emailWidth = Math.round(pageWidth * emailScale);

  var blocks = layout.blocks.map(function(block, idx) {
    var defaultSize = DEFAULT_BLOCK_SIZES[block.id] || { width: 200, height: 150 };
    var scale = block.scale || 1;

    var align = "center";
    if (block.x < pageWidth * 0.3) { align = "left"; }
    else if (block.x > pageWidth * 0.7) { align = "right"; }

    return {
      id: block.id,
      x: block.x,
      y: block.y,
      width: block.width != null ? block.width : Math.round(defaultSize.width * scale),
      height: block.height != null ? block.height : Math.round(defaultSize.height * scale),
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

function computeEmailSections(layout) {
  var orderBy = { poster: 0, title: 1, info: 2, qr: 3 };
  var sorted = layout.blocks.slice().sort(function(a, b) {
    if (Math.abs(a.y - b.y) < 50) {
      return (orderBy[a.id] || 0) - (orderBy[b.id] || 0);
    }
    return a.y - b.y;
  });

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

function computeBgCrop(bgTransform, pageWidth, pageHeight, imageWidth, imageHeight) {
  var panX = bgTransform.x || 0;
  var panY = bgTransform.y || 0;
  var zoom = bgTransform.scale || 1;
  var visibleW = imageWidth / zoom;
  var visibleH = imageHeight / zoom;
  var sx = (imageWidth - visibleW) / 2 - (panX / pageWidth) * visibleW;
  var sy = (imageHeight - visibleH) / 2 - (panY / pageHeight) * visibleH;
  return { sx: Math.max(0, sx), sy: Math.max(0, sy), sw: Math.min(visibleW, imageWidth - sx), sh: Math.min(visibleH, imageHeight - sy) };
}

module.exports = {
  computeTicketLayout: computeTicketLayout,
  computeEmailSections: computeEmailSections,
  computePdfPositions: computePdfPositions,
  getDefaultLayout: getDefaultLayout,
  computeBgCrop: computeBgCrop,
};
