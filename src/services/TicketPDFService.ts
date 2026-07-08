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

export interface BlockLayout { id: string; x: number; y: number }
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
  .block { position:absolute; cursor:grab; user-select:none; }
  .block:active { cursor:grabbing; }
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

function posterBlockHTML(posterUrl: string | null, layout: TicketLayout, editorMode: boolean): string {
  const b = layout.blocks.find(b => b.id === "poster") || { x: 330, y: 20 }
  if (posterUrl) {
    return `<div class="block poster-block" data-id="poster" style="left:${b.x}px;top:${b.y}px"><img src="${posterUrl}" alt="Poster"/></div>`
  }
  if (editorMode) {
    return `<div class="block poster-block" data-id="poster" style="left:${b.x}px;top:${b.y}px"><div class="poster-placeholder"><span>🖼️<br/>Event Poster<br/>will appear here</span></div></div>`
  }
  return ""
}

function titleBlockHTML(eventName: string, ticketType: string, layout: TicketLayout): string {
  const b = layout.blocks.find(b => b.id === "title") || { x: 24, y: 24 }
  return `<div class="block title-block" data-id="title" style="left:${b.x}px;top:${b.y}px"><div class="event-name">${eventName}</div><div class="badge">${ticketType}</div></div>`
}

function infoBlockHTML(fmtDate: string, fmtTime: string, venueName: string, location: string, buyerName: string, layout: TicketLayout): string {
  const b = layout.blocks.find(b => b.id === "info") || { x: 24, y: 430 }
  const loc = location && location !== "TBA" ? ` · ${location}` : ""
  return `<div class="block info-block" data-id="info" style="left:${b.x}px;top:${b.y}px">
    <div class="info-row"><span class="info-icon">📅</span><div class="info-text"><span class="info-label">Date</span><span class="info-value">${fmtDate}</span></div></div>
    <div class="info-row"><span class="info-icon">🕐</span><div class="info-text"><span class="info-label">Time</span><span class="info-value">${fmtTime}</span></div></div>
    <div class="info-row"><span class="info-icon">📍</span><div class="info-text"><span class="info-label">Venue</span><span class="info-value">${venueName}${loc}</span></div></div>
    <div class="info-row"><span class="info-icon">👤</span><div class="info-text"><span class="info-label">Name</span><span class="info-value">${buyerName}</span></div></div>
  </div>`
}

function qrBlockHTML(qrSrc: string, ticketRef: string, t: TicketTemplateConfig, layout: TicketLayout): string {
  const b = layout.blocks.find(b => b.id === "qr") || { x: 190, y: 250 }
  return `<div class="block qr-block" data-id="qr" style="left:${b.x}px;top:${b.y}px"><img src="${qrSrc}" class="qr-img" alt="QR"/><span class="qr-hint">Scan at entrance</span><div class="ticket-ref">${ticketRef}</div></div>`
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
  const titleHTML  = titleBlockHTML(eventName, ticketType, layout)
  const infoHTML   = infoBlockHTML(fmtDate, fmtTime, venueName, location, buyerName, layout)
  const qrHTML     = qrBlockHTML(qrSrc, ticketRef, t, layout)

  const editorScript = editorMode ? `<script>
(function(){
  var blocks={};
  document.querySelectorAll('.block').forEach(function(el){
    var id=el.dataset.id;
    blocks[id]={x:parseInt(el.style.left)||0,y:parseInt(el.style.top)||0};
  });
  var bg={x:${bgTransform.x},y:${bgTransform.y},scale:${bgTransform.scale}};
  var bgLayer=document.querySelector('.bg-layer');
  var isUpload=${isUploadBg ? "true" : "false"};

  function applyBg(){
    if(!bgLayer||!isUpload) return;
    bgLayer.style.backgroundSize=(bg.scale*100)+'%';
    bgLayer.style.backgroundPosition='calc(50% + '+bg.x+'px) calc(50% + '+bg.y+'px)';
  }

  function emit(){
    var layout={blocks:Object.keys(blocks).map(function(id){return{id:id,x:blocks[id].x,y:blocks[id].y};}),bg:bg};
    window.parent.postMessage({type:'LAYOUT_UPDATE',layout:layout},'*');
  }

  document.querySelectorAll('.block').forEach(function(el){
    var id=el.dataset.id;
    var sx,sy,ox,oy;
    function startDrag(cx,cy){
      sx=cx;sy=cy;ox=blocks[id].x;oy=blocks[id].y;
      el.style.outline='2px dashed rgba(255,255,255,0.8)';
    }
    function moveDrag(cx,cy){
      blocks[id].x=ox+(cx-sx);blocks[id].y=oy+(cy-sy);
      el.style.left=blocks[id].x+'px';el.style.top=blocks[id].y+'px';
      emit();
    }
    function endDrag(){ el.style.outline=''; }

    el.addEventListener('mousedown',function(e){
      e.preventDefault();startDrag(e.clientX,e.clientY);
      function mm(e){moveDrag(e.clientX,e.clientY);}
      function mu(){endDrag();document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);}
      document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);
    });
    el.addEventListener('touchstart',function(e){
      var t0=e.touches[0];startDrag(t0.clientX,t0.clientY);
      function tm(e){var t0=e.touches[0];moveDrag(t0.clientX,t0.clientY);}
      function te(){endDrag();document.removeEventListener('touchmove',tm);document.removeEventListener('touchend',te);}
      document.addEventListener('touchmove',tm,{passive:false});document.addEventListener('touchend',te);
    },{passive:false});
  });

  window.addEventListener('message',function(e){
    if(!e.data) return;
    var d=e.data;
    if(d.type==='BG_PAN'){ bg.x+=(d.dx||0); bg.y+=(d.dy||0); applyBg(); emit(); }
    if(d.type==='BG_ZOOM'){ bg.scale=Math.max(0.3,Math.min(4,bg.scale+(d.delta||0))); applyBg(); emit(); }
    if(d.type==='BG_RESET'){ bg={x:0,y:0,scale:1}; applyBg(); emit(); }
    if(d.type==='SET_LAYOUT'){
      var l=d.layout;
      if(l&&l.blocks) l.blocks.forEach(function(b){
        blocks[b.id]={x:b.x,y:b.y};
        var el=document.querySelector('[data-id="'+b.id+'"]');
        if(el){el.style.left=b.x+'px';el.style.top=b.y+'px';}
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
  initialLayout?: TicketLayout
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
