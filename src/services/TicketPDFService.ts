import * as Print from "expo-print"
import * as Sharing from "expo-sharing"
import { Platform } from "react-native"
import type { Ticket } from "../models/Ticket"
import type { Event } from "../models/Event"
import { getTemplateById, type TicketTemplateConfig } from "../constants/ticketTemplates"

const PORTRAIT_W = 600
const PORTRAIT_H = 900
const LANDSCAPE_W = 900
const LANDSCAPE_H = 500
const CM_TO_PX = 96 / 2.54

export interface BlockLayout { id: string; x: number; y: number; scale?: number }
export interface BgTransform { x: number; y: number; scale: number }
export interface TicketLayout { blocks: BlockLayout[]; bg: BgTransform }

const FONT_STACKS = {
  sans: "'Helvetica Neue', Arial, sans-serif",
  mono: "'Courier New', Courier, monospace",
  serif: "Georgia, 'Times New Roman', serif",
}

const FAKE_QR = "data:image/svg+xml;base64," + btoa(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <rect width="160" height="160" fill="white"/>
  <rect x="10" y="10" width="50" height="50" fill="black"/>
  <rect x="15" y="15" width="40" height="40" fill="white"/>
  <rect x="20" y="20" width="30" height="30" fill="black"/>
  <rect x="100" y="10" width="50" height="50" fill="black"/>
  <rect x="105" y="15" width="40" height="40" fill="white"/>
  <rect x="110" y="20" width="30" height="30" fill="black"/>
  <rect x="10" y="100" width="50" height="50" fill="black"/>
  <rect x="15" y="105" width="40" height="40" fill="white"/>
  <rect x="20" y="110" width="30" height="30" fill="black"/>
  <rect x="70" y="10" width="10" height="10" fill="black"/>
  <rect x="70" y="30" width="10" height="10" fill="black"/>
  <rect x="70" y="50" width="10" height="10" fill="black"/>
  <rect x="70" y="70" width="10" height="10" fill="black"/>
  <rect x="90" y="70" width="10" height="10" fill="black"/>
  <rect x="110" y="70" width="10" height="10" fill="black"/>
  <rect x="130" y="70" width="10" height="10" fill="black"/>
  <rect x="70" y="90" width="10" height="10" fill="black"/>
  <rect x="90" y="90" width="10" height="10" fill="black"/>
  <rect x="110" y="90" width="10" height="10" fill="black"/>
  <rect x="70" y="110" width="10" height="10" fill="black"/>
  <rect x="90" y="110" width="10" height="10" fill="black"/>
  <rect x="110" y="110" width="10" height="10" fill="black"/>
  <rect x="130" y="110" width="10" height="10" fill="black"/>
  <rect x="70" y="130" width="10" height="10" fill="black"/>
  <rect x="90" y="130" width="10" height="10" fill="black"/>
  <rect x="110" y="130" width="10" height="10" fill="black"/>
</svg>`)

export function defaultLayout(orientation: "portrait" | "landscape", hasPoster: boolean): TicketLayout {
  if (orientation === "landscape") {
    return {
      blocks: [
        { id: "poster", x: 630, y: 20 },
        { id: "title",  x: 24,  y: 24 },
        { id: "info",   x: 24,  y: 130 },
        { id: "qr",     x: 660, y: 170 },
      ],
      bg: { x: 0, y: 0, scale: 1 },
    }
  }
  return {
    blocks: [
      { id: "poster", x: 330, y: 20 },
      { id: "title",  x: 24,  y: 24 },
      { id: "info",   x: 24,  y: 430 },
      { id: "qr",     x: 190, y: 250 },
    ],
    bg: { x: 0, y: 0, scale: 1 },
  }
}

function resolveTemplate(event?: Event): { t: TicketTemplateConfig; isUploadBg: boolean; bgImage: string; bgGradient: string; isLandscape: boolean; W: number; H: number } {
  const design = event?.ticket_design
  let tpl: TicketTemplateConfig | undefined
  if (design?.enabled && design.source === "template" && design.template_id) {
    tpl = getTemplateById(design.template_id)
  }
  const fallback: TicketTemplateConfig = {
    id: "fallback", label: "Default",
    orientation: design?.orientation || "portrait",
    background: "linear-gradient(160deg,#0f0c29 0%,#302b63 50%,#24243e 100%)",
    headerBg: "linear-gradient(90deg,#302b63,#24243e)",
    accentColor: "#7c3aed", textPrimary: "#ffffff", textSecondary: "#a78bfa",
    qrBg: "#1e1b4b", dividerColor: "rgba(167,139,250,0.25)",
    badgeBg: "#7c3aed", badgeText: "#ffffff", fontStyle: "sans",
    qrPosition: "center", thumbnailSvg: "",
  }
  const t = tpl || fallback
  const isUploadBg = !!(design?.enabled && design.source === "upload" && design.background_url)
  const bgImage = isUploadBg ? (design!.background_url as string) : ""
  const bgGradient = t.background
  const isLandscape = (design?.orientation || t.orientation) === "landscape"
  const W = isLandscape ? LANDSCAPE_W : PORTRAIT_W
  const H = isLandscape ? LANDSCAPE_H : PORTRAIT_H
  return { t, isUploadBg, bgImage, bgGradient, isLandscape, W, H }
}

// ─── Shared CSS ───────────────────────────────────────────────────────────────
function sharedCSS(t: TicketTemplateConfig, W: number, H: number): string {
  return `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: ${FONT_STACKS[t.fontStyle]}; width:${W}px; height:${H}px; overflow:hidden; position:relative; color:${t.textPrimary}; }
  .bg-layer { position:absolute; inset:0; z-index:0; }
  .content-layer { position:absolute; inset:0; z-index:1; }
  .block { position:absolute; user-select:none; touch-action:none; }
  .drag-handle { position:absolute; top:-20px; left:50%; transform:translateX(-50%); background:rgba(255,255,255,0.92); color:#222; font-size:10px; font-weight:700; padding:2px 10px; border-radius:8px 8px 0 0; white-space:nowrap; cursor:grab; display:flex; align-items:center; gap:4px; box-shadow:0 -2px 6px rgba(0,0,0,0.3); z-index:10; }
  .drag-handle:active { cursor:grabbing; background:rgba(99,179,237,0.95); }
  .block.dragging { outline:2px dashed rgba(99,179,237,0.9); outline-offset:3px; }
  .poster-block img { width:200px; height:200px; object-fit:cover; border-radius:8px; border:2px solid ${t.accentColor}; box-shadow:0 4px 20px rgba(0,0,0,0.5); display:block; }
  .poster-placeholder { width:200px; height:200px; border-radius:8px; border:2px dashed ${t.accentColor}; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.3); }
  .poster-placeholder span { color:${t.textSecondary}; font-size:12px; text-align:center; padding:8px; }
  .title-block .event-name { font-size:26px; font-weight:800; color:${t.textPrimary}; line-height:1.2; text-shadow:0 2px 8px rgba(0,0,0,0.6); max-width:280px; }
  .title-block .badge { display:inline-block; background:${t.badgeBg}; color:${t.badgeText}; font-size:11px; font-weight:700; padding:4px 14px; border-radius:20px; margin-top:8px; letter-spacing:0.5px; text-transform:uppercase; }
  .info-block { display:flex; flex-direction:column; gap:10px; background:rgba(0,0,0,0.45); backdrop-filter:blur(6px); border-radius:10px; padding:14px 16px; border:1px solid ${t.dividerColor}; max-width:260px; }
  .info-row { display:flex; align-items:flex-start; gap:10px; }
  .info-icon { font-size:14px; margin-top:1px; }
  .info-text { display:flex; flex-direction:column; gap:1px; }
  .info-label { font-size:9px; color:${t.textSecondary}; text-transform:uppercase; letter-spacing:0.5px; }
  .info-value { font-size:13px; font-weight:600; color:${t.textPrimary}; }
  .qr-block { display:flex; flex-direction:column; align-items:center; gap:6px; background:${t.qrBg}; border:2px solid ${t.accentColor}; border-radius:12px; padding:12px; }
  .qr-img { width:140px; height:140px; display:block; }
  .qr-hint { font-size:10px; color:${t.textSecondary}; }
  .ticket-ref { font-size:10px; font-family:'Courier New',monospace; color:${t.accentColor}; letter-spacing:1px; background:rgba(0,0,0,0.3); padding:2px 8px; border-radius:4px; }
  .footer { position:absolute; bottom:0; left:0; right:0; padding:8px 20px; background:rgba(0,0,0,0.4); display:flex; justify-content:space-between; align-items:center; font-size:10px; color:${t.textSecondary}; z-index:2; }
  .footer-brand { font-weight:700; color:${t.accentColor}; font-size:11px; }
  .drag-hint { position:absolute; top:4px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.6); color:#fff; font-size:9px; padding:2px 8px; border-radius:10px; white-space:nowrap; pointer-events:none; opacity:0.7; }`
}

function blockStyle(b: BlockLayout, extra = ""): string {
  const s = b.scale && b.scale !== 1 ? `transform:scale(${b.scale});transform-origin:top left;` : ""
  return `left:${b.x}px;top:${b.y}px;${s}${extra}`
}

const HANDLE = (label: string) => `<div class="drag-handle">⠿ ${label}</div>`

function posterBlockHTML(posterUrl: string | null, layout: TicketLayout, editorMode: boolean): string {
  const b = layout.blocks.find(b => b.id === "poster") || { id:"poster", x: 330, y: 20 }
  const handle = editorMode ? HANDLE("Poster") : ""
  if (posterUrl) {
    return `<div class="block poster-block" data-id="poster" style="${blockStyle(b)}">${handle}<img src="${posterUrl}" alt="Poster"/></div>`
  }
  if (editorMode) {
    return `<div class="block poster-block" data-id="poster" style="${blockStyle(b)}">${handle}<div class="poster-placeholder"><span>🖼️<br/>Event Poster<br/>will appear here</span></div></div>`
  }
  return ""
}

function titleBlockHTML(eventName: string, ticketType: string, layout: TicketLayout, editorMode = false): string {
  const b = layout.blocks.find(b => b.id === "title") || { id:"title", x: 24, y: 24 }
  const handle = editorMode ? HANDLE("Title") : ""
  return `<div class="block title-block" data-id="title" style="${blockStyle(b)}">${handle}<div class="event-name">${eventName}</div><div class="badge">${ticketType}</div></div>`
}

function infoBlockHTML(fmtDate: string, fmtTime: string, venueName: string, location: string, buyerName: string, layout: TicketLayout, editorMode = false): string {
  const b = layout.blocks.find(b => b.id === "info") || { id:"info", x: 24, y: 430 }
  const loc = location && location !== "TBA" ? ` · ${location}` : ""
  const handle = editorMode ? HANDLE("Info") : ""
  return `<div class="block info-block" data-id="info" style="${blockStyle(b)}">${handle}
    <div class="info-row"><span class="info-icon">📅</span><div class="info-text"><span class="info-label">Date</span><span class="info-value">${fmtDate}</span></div></div>
    <div class="info-row"><span class="info-icon">🕐</span><div class="info-text"><span class="info-label">Time</span><span class="info-value">${fmtTime}</span></div></div>
    <div class="info-row"><span class="info-icon">📍</span><div class="info-text"><span class="info-label">Venue</span><span class="info-value">${venueName}${loc}</span></div></div>
    <div class="info-row"><span class="info-icon">👤</span><div class="info-text"><span class="info-label">Name</span><span class="info-value">${buyerName}</span></div></div>
  </div>`
}

function qrBlockHTML(qrSrc: string, ticketRef: string, t: TicketTemplateConfig, layout: TicketLayout, editorMode = false): string {
  const b = layout.blocks.find(b => b.id === "qr") || { id:"qr", x: 190, y: 250 }
  const handle = editorMode ? HANDLE("QR") : ""
  return `<div class="block qr-block" data-id="qr" style="${blockStyle(b)}">${handle}<img src="${qrSrc}" class="qr-img" alt="QR"/><span class="qr-hint">Scan at entrance</span><div class="ticket-ref">${ticketRef}</div></div>`
}

// ─── Core HTML builder ────────────────────────────────────────────────────────
function buildHTML(
  t: TicketTemplateConfig, W: number, H: number,
  isUploadBg: boolean, bgImage: string, bgGradient: string, bgTransform: BgTransform,
  eventName: string, ticketType: string, fmtDate: string, fmtTime: string,
  venueName: string, location: string, buyerName: string,
  qrSrc: string, ticketRef: string, posterUrl: string | null,
  layout: TicketLayout, editorMode: boolean
): string {
  const css = sharedCSS(t, W, H)

  // KEY FIX: for upload bg, set background-image, background-size, background-position
  // as SEPARATE inline style properties so JS can override each independently
  const bgLayerStyle = isUploadBg
    ? `background-image:url('${bgImage}'); background-size:${bgTransform.scale * 100}%; background-position:calc(50% + ${bgTransform.x}px) calc(50% + ${bgTransform.y}px); background-repeat:no-repeat;`
    : `background:${bgGradient};`

  const posterHTML = posterBlockHTML(posterUrl, layout, editorMode)
  const titleHTML  = titleBlockHTML(eventName, ticketType, layout, editorMode)
  const infoHTML   = infoBlockHTML(fmtDate, fmtTime, venueName, location, buyerName, layout, editorMode)
  const qrHTML     = qrBlockHTML(qrSrc, ticketRef, t, layout, editorMode)

  const editorScript = editorMode ? `<script>
(function(){
  var blocks={};
  document.querySelectorAll('.block').forEach(function(el){
    var id=el.dataset.id;
    var sc=parseFloat(el.style.transform&&el.style.transform.match(/scale\\(([^)]+)\\)/)?el.style.transform.match(/scale\\(([^)]+)\\)/)[1]:"1")||1;
    blocks[id]={x:parseInt(el.style.left)||0,y:parseInt(el.style.top)||0,scale:sc};
  });
  var bg={x:${bgTransform.x},y:${bgTransform.y},scale:${bgTransform.scale}};
  var bgLayer=document.querySelector('.bg-layer');
  var isUpload=${isUploadBg ? "true" : "false"};

  // Get the CSS zoom applied to the iframe from the parent so we can
  // convert screen-space pointer deltas back to iframe-space coordinates.
  // The iframe sends its own devicePixelRatio; parent zoom is communicated
  // via a SET_ZOOM message, defaulting to 1 until received.
  var iframeZoom=1;

  function applyBg(){
    if(!bgLayer||!isUpload) return;
    bgLayer.style.backgroundSize=(bg.scale*100)+'%';
    bgLayer.style.backgroundPosition='calc(50% + '+bg.x+'px) calc(50% + '+bg.y+'px)';
  }

  function applyBlockScale(id){
    var el=document.querySelector('[data-id="'+id+'"]');
    if(!el) return;
    var s=blocks[id].scale;
    el.style.transform=s===1?'':'scale('+s+')';
    el.style.transformOrigin='top left';
  }

  function emit(){
    var layout={blocks:Object.keys(blocks).map(function(id){return{id:id,x:blocks[id].x,y:blocks[id].y,scale:blocks[id].scale};}),bg:bg};
    window.parent.postMessage({type:'LAYOUT_UPDATE',layout:layout},'*');
  }

  document.querySelectorAll('.block').forEach(function(el){
    var id=el.dataset.id;
    var handle=el.querySelector('.drag-handle');
    var dragTarget=handle||el;
    var dragging=false,sx,sy,ox,oy;

    function startDrag(cx,cy){
      dragging=true;
      sx=cx/iframeZoom; sy=cy/iframeZoom;
      ox=blocks[id].x; oy=blocks[id].y;
      el.classList.add('dragging');
      document.body.style.userSelect='none';
    }
    function moveDrag(cx,cy){
      if(!dragging) return;
      var nx=ox+((cx/iframeZoom)-sx);
      var ny=oy+((cy/iframeZoom)-sy);
      blocks[id].x=nx; blocks[id].y=ny;
      el.style.left=nx+'px'; el.style.top=ny+'px';
      emit();
    }
    function endDrag(){
      dragging=false;
      el.classList.remove('dragging');
      document.body.style.userSelect='';
    }

    dragTarget.addEventListener('mousedown',function(e){
      e.preventDefault(); e.stopPropagation();
      startDrag(e.clientX,e.clientY);
      function mm(e){ moveDrag(e.clientX,e.clientY); }
      function mu(){ endDrag(); document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu); }
      document.addEventListener('mousemove',mm);
      document.addEventListener('mouseup',mu);
    });

    dragTarget.addEventListener('touchstart',function(e){
      e.preventDefault(); e.stopPropagation();
      var t0=e.touches[0]; startDrag(t0.clientX,t0.clientY);
      function tm(e){ e.preventDefault(); var t0=e.touches[0]; moveDrag(t0.clientX,t0.clientY); }
      function te(){ endDrag(); document.removeEventListener('touchmove',tm); document.removeEventListener('touchend',te); }
      document.addEventListener('touchmove',tm,{passive:false});
      document.addEventListener('touchend',te);
    },{passive:false});
  });

  window.addEventListener('message',function(e){
    if(!e.data) return;
    var d=e.data;
    if(d.type==='SET_ZOOM'){ iframeZoom=d.zoom||1; }
    if(d.type==='BG_PAN'){ bg.x+=(d.dx||0); bg.y+=(d.dy||0); applyBg(); emit(); }
    if(d.type==='BG_ZOOM'){ bg.scale=Math.max(0.3,Math.min(4,bg.scale+(d.delta||0))); applyBg(); emit(); }
    if(d.type==='BG_RESET'){ bg={x:0,y:0,scale:1}; applyBg(); emit(); }
    if(d.type==='BLOCK_RESIZE'){
      var id=d.id; if(!blocks[id]) return;
      blocks[id].scale=Math.max(0.3,Math.min(3,(blocks[id].scale||1)+(d.delta||0)));
      applyBlockScale(id); emit();
    }
    if(d.type==='SET_LAYOUT'){
      var l=d.layout;
      if(l&&l.blocks) l.blocks.forEach(function(b){
        blocks[b.id]={x:b.x,y:b.y,scale:b.scale||1};
        var el=document.querySelector('[data-id="'+b.id+'"]');
        if(el){el.style.left=b.x+'px';el.style.top=b.y+'px';applyBlockScale(b.id);}
      });
      if(l&&l.bg){bg=l.bg;applyBg();}
    }
  });

  emit();
})();
</script>` : ""

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body>
  <div class="bg-layer" style="${bgLayerStyle}"></div>
  <div class="content-layer">
    ${posterHTML}${titleHTML}${infoHTML}${qrHTML}
  </div>
  <div class="footer"><span class="footer-brand">YoVibe</span><span>Verified &amp; Secured Ticket</span><span>${ticketRef}</span></div>
  ${editorScript}
</body></html>`
}

// ─── Original styled template preview (no draggable blocks) ─────────────────
function buildOriginalPreviewHTML(t: TicketTemplateConfig, W: number, H: number, eventName: string, venueName: string): string {
  const css = sharedCSS(t, W, H)
  const fmtDate = new Date(Date.now() + 7*24*60*60*1000).toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric", year:"numeric" })
  const isLandscape = W > H

  if (isLandscape) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}
    .header-strip { position:absolute; top:0; left:0; right:0; height:44px; background:${t.headerBg}; display:flex; align-items:center; padding:0 20px; gap:12px; z-index:2; }
    .brand { font-size:16px; font-weight:800; color:${t.badgeText}; letter-spacing:1px; }
    .badge2 { background:${t.badgeBg}; color:${t.badgeText}; font-size:10px; font-weight:700; padding:3px 10px; border-radius:20px; text-transform:uppercase; }
    .left-panel { position:absolute; left:0; top:44px; bottom:32px; width:60%; padding:18px 20px; display:flex; flex-direction:column; justify-content:space-between; }
    .right-panel { position:absolute; right:0; top:44px; bottom:32px; width:38%; display:flex; align-items:center; justify-content:center; }
    .event-title { font-size:22px; font-weight:800; color:${t.textPrimary}; line-height:1.2; text-shadow:0 2px 8px rgba(0,0,0,0.5); }
    .info-grid { display:flex; flex-direction:column; gap:8px; background:rgba(0,0,0,0.35); backdrop-filter:blur(6px); border-radius:8px; padding:10px 14px; border:1px solid ${t.dividerColor}; }
    .info-row2 { display:flex; align-items:center; gap:8px; }
    .info-label2 { font-size:9px; color:${t.textSecondary}; text-transform:uppercase; letter-spacing:0.5px; width:36px; }
    .info-val2 { font-size:12px; font-weight:600; color:${t.textPrimary}; }
    .qr-wrap { display:flex; flex-direction:column; align-items:center; gap:6px; background:${t.qrBg}; border:2px solid ${t.accentColor}; border-radius:10px; padding:10px; }
    .footer2 { position:absolute; bottom:0; left:0; right:0; height:32px; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:space-between; padding:0 16px; font-size:10px; color:${t.textSecondary}; z-index:2; }
    </style></head><body>
    <div class="bg-layer" style="background:${t.background};"></div>
    <div class="header-strip"><span class="brand">YoVibe</span><span class="badge2">VIP</span></div>
    <div class="left-panel">
      <div class="event-title">${eventName}</div>
      <div class="info-grid">
        <div class="info-row2"><span class="info-label2">📅 Date</span><span class="info-val2">${fmtDate}</span></div>
        <div class="info-row2"><span class="info-label2">🕐 Time</span><span class="info-val2">09:00 PM</span></div>
        <div class="info-row2"><span class="info-label2">📍 Venue</span><span class="info-val2">${venueName}</span></div>
        <div class="info-row2"><span class="info-label2">👤 Name</span><span class="info-val2">John Doe</span></div>
      </div>
    </div>
    <div class="right-panel">
      <div class="qr-wrap"><img src="${FAKE_QR}" style="width:110px;height:110px;display:block;"/><span style="font-size:9px;color:${t.textSecondary};">Scan at entrance</span><span style="font-size:9px;font-family:monospace;color:${t.accentColor};">YV-PREVIEW</span></div>
    </div>
    <div class="footer2"><span style="font-weight:700;color:${t.accentColor};">YoVibe</span><span>Verified &amp; Secured Ticket</span><span>YV-PREVIEW</span></div>
    </body></html>`
  }

  // Portrait
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}
  .header-strip { position:absolute; top:0; left:0; right:0; height:52px; background:${t.headerBg}; display:flex; align-items:center; padding:0 20px; gap:12px; z-index:2; }
  .brand { font-size:18px; font-weight:800; color:${t.badgeText}; letter-spacing:1px; }
  .badge2 { background:${t.badgeBg}; color:${t.badgeText}; font-size:10px; font-weight:700; padding:3px 12px; border-radius:20px; text-transform:uppercase; }
  .event-title { position:absolute; top:68px; left:20px; right:20px; font-size:28px; font-weight:800; color:${t.textPrimary}; line-height:1.2; text-shadow:0 2px 8px rgba(0,0,0,0.6); }
  .qr-section { position:absolute; top:${t.qrPosition === "top" ? "140px" : t.qrPosition === "center" ? "280px" : "520px"}; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:6px; background:${t.qrBg}; border:2px solid ${t.accentColor}; border-radius:12px; padding:14px; }
  .info-section { position:absolute; bottom:48px; left:20px; right:20px; display:flex; flex-direction:column; gap:10px; background:rgba(0,0,0,0.45); backdrop-filter:blur(6px); border-radius:10px; padding:14px 16px; border:1px solid ${t.dividerColor}; }
  .info-row2 { display:flex; align-items:center; gap:10px; }
  .info-label2 { font-size:9px; color:${t.textSecondary}; text-transform:uppercase; letter-spacing:0.5px; width:40px; }
  .info-val2 { font-size:13px; font-weight:600; color:${t.textPrimary}; }
  .footer2 { position:absolute; bottom:0; left:0; right:0; height:40px; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:space-between; padding:0 20px; font-size:10px; color:${t.textSecondary}; z-index:2; }
  </style></head><body>
  <div class="bg-layer" style="background:${t.background};"></div>
  <div class="header-strip"><span class="brand">YoVibe</span><span class="badge2">VIP</span></div>
  <div class="event-title">${eventName}</div>
  <div class="qr-section"><img src="${FAKE_QR}" style="width:140px;height:140px;display:block;"/><span style="font-size:10px;color:${t.textSecondary};">Scan at entrance</span><span style="font-size:10px;font-family:monospace;color:${t.accentColor};">YV-PREVIEW</span></div>
  <div class="info-section">
    <div class="info-row2"><span class="info-label2">📅 Date</span><span class="info-val2">${fmtDate}</span></div>
    <div class="info-row2"><span class="info-label2">🕐 Time</span><span class="info-val2">09:00 PM</span></div>
    <div class="info-row2"><span class="info-label2">📍 Venue</span><span class="info-val2">${venueName}</span></div>
    <div class="info-row2"><span class="info-label2">👤 Name</span><span class="info-val2">John Doe</span></div>
  </div>
  <div class="footer2"><span style="font-weight:700;color:${t.accentColor};">YoVibe</span><span>Verified &amp; Secured Ticket</span><span>YV-PREVIEW</span></div>
  </body></html>`
}

// ─── Public: static preview (no scripts, no poster placeholder) ───────────────
export function generatePreviewHTML(
  templateId: string | null,
  orientation: "portrait" | "landscape",
  uploadedBgUrl?: string | null,
  sampleData?: { eventName?: string; venueName?: string; posterUrl?: string; layout?: TicketLayout }
): string {
  const isLandscape = orientation === "landscape"
  const W = isLandscape ? LANDSCAPE_W : PORTRAIT_W
  const H = isLandscape ? LANDSCAPE_H : PORTRAIT_H
  const fakeEvent: any = {
    ticket_design: {
      enabled: true, orientation,
      source: uploadedBgUrl ? "upload" : "template",
      template_id: templateId,
      background_url: uploadedBgUrl || null,
      dimensions: { width: W, height: H },
    },
  }
  const { t, isUploadBg, bgImage, bgGradient } = resolveTemplate(fakeEvent)

  // For template mode: render the original styled layout (not draggable blocks)
  if (!isUploadBg && templateId) {
    return buildOriginalPreviewHTML(t, W, H, sampleData?.eventName || "Sample Event Night", sampleData?.venueName || "The Grand Venue")
  }

  // For upload mode: render with actual bg image
  const layout = sampleData?.layout || defaultLayout(orientation, false)
  const fmtDate = new Date(Date.now() + 7*24*60*60*1000).toLocaleDateString("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" })
  return buildHTML(
    t, W, H, isUploadBg, bgImage, bgGradient, layout.bg,
    sampleData?.eventName || "Sample Event Night", "VIP",
    fmtDate, "09:00 PM",
    sampleData?.venueName || "The Grand Venue", "KAMPALA", "John Doe",
    FAKE_QR, "YV-PREVIEW", sampleData?.posterUrl || null,
    layout, false
  )
}

// ─── Public: interactive editor (with drag scripts + poster placeholder) ──────
export function generateEditorHTML(
  templateId: string | null,
  orientation: "portrait" | "landscape",
  uploadedBgUrl?: string | null,
  posterUrl?: string | null,
  sampleData?: { eventName?: string; venueName?: string },
  initialLayout?: TicketLayout,
  widthCm?: number,
  heightCm?: number
): string {
  const isLandscape = orientation === "landscape"
  const W = widthCm ? Math.round(widthCm * CM_TO_PX) : (isLandscape ? LANDSCAPE_W : PORTRAIT_W)
  const H = heightCm ? Math.round(heightCm * CM_TO_PX) : (isLandscape ? LANDSCAPE_H : PORTRAIT_H)
  const fakeEvent: any = {
    ticket_design: {
      enabled: true, orientation,
      source: uploadedBgUrl ? "upload" : "template",
      template_id: templateId,
      background_url: uploadedBgUrl || null,
      dimensions: { width: W, height: H },
    },
  }
  const { t, isUploadBg, bgImage, bgGradient } = resolveTemplate(fakeEvent)
  const layout = initialLayout || defaultLayout(orientation, !!posterUrl)
  const fmtDate = new Date(Date.now() + 7*24*60*60*1000).toLocaleDateString("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" })
  return buildHTML(
    t, W, H, isUploadBg, bgImage, bgGradient, layout.bg,
    sampleData?.eventName || "Sample Event Night", "VIP",
    fmtDate, "09:00 PM",
    sampleData?.venueName || "The Grand Venue", "KAMPALA", "John Doe",
    FAKE_QR, "YV-PREVIEW", posterUrl || null,
    layout, true
  )
}

// ─── Main ticket HTML (for actual tickets) ────────────────────────────────────
export function generateTicketHTML(ticket: Ticket, event?: Event, overrideQrDataUrl?: string, layout?: TicketLayout): string {
  const eventName = event?.name || ticket.eventName || "Event"
  const venueName = event?.venueName || ticket.venueName || "TBA"
  const location  = event?.location || "TBA"
  const eventDate = ticket.eventStartTime instanceof Date ? ticket.eventStartTime : new Date(ticket.eventStartTime)
  const fmtDate   = eventDate.toLocaleDateString("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" })
  const fmtTime   = eventDate.toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit" })
  const qrSrc     = overrideQrDataUrl || ticket.qrCodeDataUrl || ""
  const ticketRef = ticket.ticketRef || ticket.id?.slice(0,8).toUpperCase() || "XXXXXXXX"
  const ticketType = ticket.entryFeeType || "Standard"
  const buyerName  = ticket.buyerName || "Guest"
  const posterUrl  = event?.posterImageUrl || null

  const { t, isUploadBg, bgImage, bgGradient, isLandscape, W, H } = resolveTemplate(event)
  const lyt = layout || defaultLayout(isLandscape ? "landscape" : "portrait", !!posterUrl)

  return buildHTML(
    t, W, H, isUploadBg, bgImage, bgGradient, lyt.bg,
    eventName, ticketType, fmtDate, fmtTime, venueName, location, buyerName,
    qrSrc, ticketRef, posterUrl, lyt, false
  )
}

export class TicketPDFService {
  static generateTicketHTML(ticket: Ticket, event?: Event): string { return generateTicketHTML(ticket, event) }

  static async downloadTicketPDF(ticket: Ticket, event?: Event): Promise<{ success: boolean; error?: string }> {
    try {
      const html = generateTicketHTML(ticket, event)
      if (Platform.OS === "web") {
        const blob = new Blob([html], { type: "text/html" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url; a.download = `ticket-${ticket.ticketRef || ticket.id}.html`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
        return { success: true }
      }
      const { uri } = await Print.printToFileAsync({ html, base64: false })
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `YoVibe Ticket - ${ticket.eventName}` })
        return { success: true }
      }
      return { success: false, error: "Sharing not available" }
    } catch (e: any) { return { success: false, error: e.message || "Unknown error" } }
  }

  static async printTicket(ticket: Ticket, event?: Event): Promise<{ success: boolean; error?: string }> {
    try { await Print.printAsync({ html: generateTicketHTML(ticket, event) }); return { success: true } }
    catch (e) { return { success: false, error: e instanceof Error ? e.message : "Unknown error" } }
  }
}

export default TicketPDFService
