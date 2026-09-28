// Metro must use pdf-lib's CommonJS distribution. Its ESM distribution imports
// tslib's ESM default export, which is incompatible with Expo web's runtime.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib/cjs"
import QRCode from "qrcode"
import { publicSiteUrl } from "../config/runtime"

export type ShareableEvent = {
  id: string
  slug?: string
  name?: string
}

const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89

const requireBrowser = () => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Event promotion downloads are available in the web app")
  }
}

const safeFileName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "event"

const asPdfText = (value: string) => value.replace(/[^\x20-\x7E]/g, "?")

const truncate = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value

const downloadBlob = (blob: Blob, fileName: string) => {
  requireBrowser()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.style.display = "none"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

const dataUrlToBytes = (dataUrl: string) => {
  const base64 = dataUrl.split(",")[1]
  if (!base64) throw new Error("The QR image could not be prepared for download")
  const binary = atob(base64)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export const EventPromotionShareService = {
  getEventUrl(event: ShareableEvent): string {
    const eventIdentifier = event.slug || event.id
    if (!eventIdentifier) throw new Error("The event link is unavailable")
    return `${publicSiteUrl()}/events/${encodeURIComponent(eventIdentifier)}`
  },

  async generateQrCode(eventUrl: string): Promise<string> {
    requireBrowser()
    return QRCode.toDataURL(eventUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 1200,
      color: { dark: "#0B1020", light: "#FFFFFF" },
    })
  },

  downloadPng(qrCodeDataUrl: string, event: ShareableEvent) {
    requireBrowser()
    const bytes = dataUrlToBytes(qrCodeDataUrl)
    downloadBlob(new Blob([bytes], { type: "image/png" }), `${safeFileName(event.name || event.slug || event.id)}-event-qr.png`)
  },

  async downloadPdf(qrCodeDataUrl: string, event: ShareableEvent, eventUrl: string) {
    requireBrowser()
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([A4_WIDTH, A4_HEIGHT])
    const regular = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const qr = await pdf.embedPng(dataUrlToBytes(qrCodeDataUrl))
    const eventName = truncate(asPdfText(event.name || "YoVibe Event"), 58)
    const displayUrl = truncate(asPdfText(eventUrl), 76)

    page.drawRectangle({ x: 0, y: A4_HEIGHT - 170, width: A4_WIDTH, height: 170, color: rgb(0.035, 0.055, 0.11) })
    page.drawText("Yo", { x: 56, y: A4_HEIGHT - 82, size: 35, font: bold, color: rgb(0.94, 0.13, 0.2) })
    page.drawText("Vibe", { x: 96, y: A4_HEIGHT - 82, size: 35, font: bold, color: rgb(0.0, 0.67, 0.96) })
    page.drawText("EVENT INVITATION", { x: 56, y: A4_HEIGHT - 116, size: 11, font: bold, color: rgb(0.72, 0.77, 0.87) })
    page.drawText(eventName, { x: 56, y: A4_HEIGHT - 146, size: 18, font: bold, color: rgb(1, 1, 1), maxWidth: A4_WIDTH - 112 })

    const qrSize = 310
    page.drawRectangle({ x: (A4_WIDTH - qrSize) / 2 - 18, y: 286 - 18, width: qrSize + 36, height: qrSize + 36, color: rgb(1, 1, 1), borderColor: rgb(0.84, 0.87, 0.92), borderWidth: 1 })
    page.drawImage(qr, { x: (A4_WIDTH - qrSize) / 2, y: 286, width: qrSize, height: qrSize })
    page.drawText("Scan to view event details and tickets", { x: 148, y: 240, size: 13, font: bold, color: rgb(0.04, 0.07, 0.13) })
    page.drawText(displayUrl, { x: 70, y: 212, size: 8.5, font: regular, color: rgb(0.28, 0.34, 0.44), maxWidth: A4_WIDTH - 140 })
    page.drawLine({ start: { x: 56, y: 116 }, end: { x: A4_WIDTH - 56, y: 116 }, thickness: 1, color: rgb(0.86, 0.89, 0.94) })
    page.drawText("Discover. Book. Experience.", { x: 56, y: 80, size: 12, font: bold, color: rgb(0.04, 0.07, 0.13) })
    page.drawText("Powered by YoVibe", { x: A4_WIDTH - 150, y: 80, size: 10, font: regular, color: rgb(0.38, 0.44, 0.55) })

    const pdfBytes = await pdf.save()
    downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), `${safeFileName(event.name || event.slug || event.id)}-event-invitation.pdf`)
  },
}

export default EventPromotionShareService
