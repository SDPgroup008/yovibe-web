import * as Print from "expo-print"
import * as Sharing from "expo-sharing"
import type { Ticket } from "../models/Ticket"
import type { Event } from "../models/Event"

export class TicketPDFService {
  /**
   * Generate a secure QR code data string
   * Includes ticket ID, event ID, timestamp, and hash for verification
   */
  static generateSecureQRData(ticket: Ticket): string {
    const timestamp = Date.now()
    const payload = `${ticket.id}:${ticket.eventId}:${ticket.buyerId}:${timestamp}`
    const hash = this.simpleHash(payload)
    return `${ticket.qrCode}:${hash}:${timestamp}`
  }

  /**
   * Simple hash function for ticket validation
   * In production, use a proper cryptographic hash
   */
  private static simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16).padStart(8, "0")
  }

  /**
   * Verify a QR code is valid and not tampered with
   */
  static verifyQRCode(qrData: string, ticket: Ticket): boolean {
    try {
      const parts = qrData.split(":")
      if (parts.length < 4) return false
      
      const [qrCode, hash, timestamp] = parts
      if (qrCode !== ticket.qrCode) return false
      
      // Check timestamp is within 24 hours
      const qrTimestamp = parseInt(timestamp)
      const now = Date.now()
      if (Math.abs(now - qrTimestamp) > 24 * 60 * 60 * 1000) return false
      
      // Verify hash
      const payload = `${ticket.id}:${ticket.eventId}:${ticket.buyerId}:${timestamp}`
      const expectedHash = this.simpleHash(payload)
      return hash === expectedHash
    } catch {
      return false
    }
  }

  /**
   * Generate HTML for ticket PDF
   */
  static generateTicketHTML(ticket: Ticket, event?: Event): string {
    const eventName = event?.name || ticket.eventName
    const eventLocation = event?.location || "TBA"
    
    const eventDate = ticket.eventStartTime instanceof Date 
      ? ticket.eventStartTime 
      : new Date(ticket.eventStartTime)
    
    const purchaseDate = ticket.purchaseDate instanceof Date 
      ? ticket.purchaseDate 
      : new Date(ticket.purchaseDate)

    const formatDate = (date: Date) => {
      return date.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      })
    }

    const formatTime = (date: Date) => {
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit"
      })
    }

    const secureQR = this.generateSecureQRData(ticket)

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YoVibe Ticket - ${eventName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Helvetica Neue', Arial, sans-serif; 
      background: #f5f5f5;
      color: #333;
      padding: 20px;
    }
    .ticket-container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      font-size: 24px;
      margin-bottom: 8px;
    }
    .header .subtitle {
      opacity: 0.9;
      font-size: 14px;
    }
    .event-info {
      padding: 24px;
      border-bottom: 2px dashed #eee;
    }
    .event-name {
      font-size: 22px;
      font-weight: bold;
      margin-bottom: 16px;
      color: #1a1a1a;
    }
    .event-details {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .detail-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .detail-icon {
      width: 40px;
      height: 40px;
      background: #f0f0f0;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }
    .detail-content {
      flex: 1;
    }
    .detail-label {
      font-size: 12px;
      color: #888;
      text-transform: uppercase;
    }
    .detail-value {
      font-size: 16px;
      font-weight: 500;
      color: #333;
    }
    .ticket-section {
      padding: 24px;
      text-align: center;
      border-bottom: 2px dashed #eee;
    }
    .ticket-type {
      display: inline-block;
      background: #00D4FF;
      color: white;
      padding: 8px 24px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 20px;
    }
    .qr-container {
      background: #f8f8f8;
      padding: 24px;
      border-radius: 12px;
      display: inline-block;
    }
    .qr-code {
      font-family: monospace;
      font-size: 12px;
      background: white;
      padding: 16px;
      border-radius: 8px;
      word-break: break-all;
      max-width: 280px;
    }
    .qr-instruction {
      margin-top: 16px;
      font-size: 14px;
      color: #666;
    }
    .buyer-section {
      padding: 24px;
      border-bottom: 2px dashed #eee;
    }
    .buyer-info {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
    }
    .buyer-item {
      flex: 1;
      min-width: 120px;
    }
    .buyer-label {
      font-size: 11px;
      color: #888;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .buyer-value {
      font-size: 14px;
      font-weight: 500;
    }
    .footer {
      padding: 24px;
      text-align: center;
      background: #f8f8f8;
    }
    .security-note {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #e8f5e9;
      color: #2e7d32;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 13px;
    }
    .ticket-id {
      margin-top: 16px;
      font-size: 11px;
      color: #999;
      font-family: monospace;
    }
    .purchase-info {
      margin-top: 12px;
      font-size: 12px;
      color: #888;
    }
  </style>
</head>
<body>
  <div class="ticket-container">
    <div class="header">
      <h1>🎫 YoVibe Ticket</h1>
      <div class="subtitle">Your entry to the event</div>
    </div>
    
    <div class="event-info">
      <div class="event-name">${eventName}</div>
      <div class="event-details">
        <div class="detail-row">
          <div class="detail-icon">📅</div>
          <div class="detail-content">
            <div class="detail-label">Date</div>
            <div class="detail-value">${formatDate(eventDate)}</div>
          </div>
        </div>
        <div class="detail-row">
          <div class="detail-icon">🕐</div>
          <div class="detail-content">
            <div class="detail-label">Time</div>
            <div class="detail-value">${formatTime(eventDate)}</div>
          </div>
        </div>
        <div class="detail-row">
          <div class="detail-icon">📍</div>
          <div class="detail-content">
            <div class="detail-label">Location</div>
            <div class="detail-value">${eventLocation}</div>
          </div>
        </div>
        <div class="detail-row">
          <div class="detail-icon">🎟️</div>
          <div class="detail-content">
            <div class="detail-label">Quantity</div>
            <div class="detail-value">${ticket.quantity} ticket(s)</div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="ticket-section">
      <div class="ticket-type">${ticket.entryFeeType || "Standard"}</div>
      <div class="qr-container">
        <div class="qr-code">${secureQR}</div>
        <div class="qr-instruction">Present this QR code at the event entrance</div>
      </div>
    </div>
    
    <div class="buyer-section">
      <div class="buyer-info">
        <div class="buyer-item">
          <div class="buyer-label">Purchased By</div>
          <div class="buyer-value">${ticket.buyerName}</div>
        </div>
        <div class="buyer-item">
          <div class="buyer-label">Amount Paid</div>
          <div class="buyer-value" style="color: #4CAF50; font-weight: bold;">UGX ${ticket.totalAmount.toLocaleString()}</div>
        </div>
        <div class="buyer-item">
          <div class="buyer-label">Payment Method</div>
          <div class="buyer-value">${ticket.paymentMethod?.replace("_", " ").toUpperCase() || "N/A"}</div>
        </div>
      </div>
    </div>
    
    <div class="footer">
      <div class="security-note">
        <span>🛡️</span>
        <span>This ticket is verified and secured by YoVibe</span>
      </div>
      <div class="ticket-id">Ticket ID: ${ticket.id}</div>
      <div class="purchase-info">Purchased on ${formatDate(purchaseDate)} at ${formatTime(purchaseDate)}</div>
    </div>
  </div>
</body>
</html>
    `.trim()
  }

  /**
   * Generate and download PDF ticket
   */
  static async downloadTicketPDF(ticket: Ticket, event?: Event): Promise<{ success: boolean; error?: string }> {
    try {
      console.log("📄 TicketPDFService: Generating PDF for ticket:", ticket.id)
      
      const html = this.generateTicketHTML(ticket, event)
      
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      })

      console.log("📄 TicketPDFService: PDF generated at:", uri)

      // Share the PDF
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `YoVibe Ticket - ${ticket.eventName}`,
          uri,
        })
        console.log("📄 TicketPDFService: PDF shared successfully")
        return { success: true }
      } else {
        console.log("📄 TicketPDFService: Sharing not available")
        return { success: false, error: "Sharing not available on this device" }
      }
    } catch (error) {
      console.error("📄 TicketPDFService: Error generating PDF:", error)
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
    }
  }

  /**
   * Print ticket directly
   */
  static async printTicket(ticket: Ticket, event?: Event): Promise<{ success: boolean; error?: string }> {
    try {
      console.log("📄 TicketPDFService: Printing ticket:", ticket.id)
      
      const html = this.generateTicketHTML(ticket, event)
      
      await Print.printAsync({
        html,
      })
      
      console.log("📄 TicketPDFService: Print job sent")
      return { success: true }
    } catch (error) {
      console.error("📄 TicketPDFService: Error printing:", error)
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
    }
  }
}

export default TicketPDFService
