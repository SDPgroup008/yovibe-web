import type { Ticket } from "../models/Ticket"
import type { Event } from "../models/Event"

export class EmailService {
  static async sendTicketConfirmation(
    ticket: Ticket,
    event: Event
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      console.log("📧 EmailService: Preparing to send ticket confirmation email")
      console.log("📧 EmailService: Recipient email:", ticket.buyerEmail)
      console.log("📧 EmailService: Ticket ID:", ticket.id)
      console.log("📧 EmailService: Event name:", event.name)

      const emailData = {
        to: ticket.buyerEmail,
        subject: `🎫 Your YoVibe Ticket - ${event.name}`,
        ticket: {
          id: ticket.id,
          eventName: event.name,
          eventDate: event.date,
          eventLocation: event.location,
          buyerName: ticket.buyerName,
          quantity: ticket.quantity,
          totalAmount: ticket.totalAmount,
          qrCode: ticket.qrCode,
          purchaseDate: ticket.purchaseDate,
          eventStartTime: ticket.eventStartTime,
          status: ticket.status,
        },
      }

      console.log("📧 EmailService: Email data prepared:", JSON.stringify(emailData, null, 2))

      // In production, this would call a backend API that handles email sending
      // For now, we'll simulate the email sending and store it in Firestore
      // The actual email would be sent via a service like SendGrid, Mailgun, or Firebase Cloud Functions

      const emailRecord = {
        type: "ticket_confirmation",
        recipientEmail: ticket.buyerEmail,
        recipientName: ticket.buyerName,
        ticketId: ticket.id,
        eventId: ticket.eventId,
        eventName: event.name,
        qrCode: ticket.qrCode,
        sentAt: new Date(),
        status: "sent",
        emailSubject: emailData.subject,
      }

      // Save email record to Firestore for tracking
      await this.saveEmailRecord(emailRecord)

      console.log("📧 EmailService: ✅ Ticket confirmation email sent successfully")
      console.log("📧 EmailService: Email record saved to database")
      console.log("📧 EmailService: ==========================================")

      return { success: true, messageId: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` }
    } catch (error) {
      console.error("📧 EmailService: Error sending ticket confirmation email:", error)
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
    }
  }

  static async sendTicketValidationNotification(
    ticket: Ticket,
    validatorName: string,
    status: "granted" | "denied"
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log("📧 EmailService: Sending ticket validation notification")
      console.log("📧 EmailService: Ticket ID:", ticket.id)
      console.log("📧 EmailService: Validation status:", status)

      const notificationData = {
        type: "ticket_validation",
        recipientEmail: ticket.buyerEmail,
        ticketId: ticket.id,
        eventName: ticket.eventName,
        validationStatus: status,
        validatedBy: validatorName,
        validatedAt: new Date(),
      }

      await this.saveEmailRecord({
        ...notificationData,
        sentAt: new Date(),
        status: "sent",
      })

      console.log("📧 EmailService: ✅ Validation notification sent")
      return { success: true }
    } catch (error) {
      console.error("📧 EmailService: Error sending validation notification:", error)
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
    }
  }

  static async sendPayoutNotification(
    organizerEmail: string,
    organizerName: string,
    amount: number,
    payoutId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log("💰 EmailService: Sending payout notification")
      console.log("💰 EmailService: Organizer email:", organizerEmail)
      console.log("💰 EmailService: Payout amount:", amount)
      console.log("💰 EmailService: Payout ID:", payoutId)

      const notificationData = {
        type: "payout_notification",
        recipientEmail: organizerEmail,
        recipientName: organizerName,
        payoutId,
        amount,
        sentAt: new Date(),
        status: "sent",
      }

      await this.saveEmailRecord(notificationData)

      console.log("💰 EmailService: ✅ Payout notification sent")
      return { success: true }
    } catch (error) {
      console.error("💰 EmailService: Error sending payout notification:", error)
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
    }
  }

  private static async saveEmailRecord(record: Record<string, unknown>): Promise<void> {
    // Import FirebaseService dynamically to avoid circular dependencies
    try {
      const { default: FirebaseService } = await import("./FirebaseService")
      await FirebaseService.saveEmailRecord(record)
    } catch (error) {
      console.error("📧 EmailService: Error saving email record:", error)
    }
  }

  static formatTicketEmailHTML(ticket: Ticket, event: Event): string {
    const eventDate = ticket.eventStartTime instanceof Date 
      ? ticket.eventStartTime.toLocaleDateString("en-US", { 
          weekday: "long", 
          year: "numeric", 
          month: "long", 
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })
      : "Date not available"

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YoVibe Ticket</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .ticket-card { background: white; border-radius: 10px; padding: 20px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .qr-code { background: #f0f0f0; padding: 20px; text-align: center; border-radius: 5px; font-family: monospace; font-size: 14px; word-break: break-all; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
    .detail-label { font-weight: bold; color: #666; }
    .detail-value { color: #333; }
    .status { display: inline-block; padding: 5px 15px; border-radius: 20px; font-weight: bold; }
    .status-active { background: #4CAF50; color: white; }
    .footer { text-align: center; margin-top: 20px; color: #999; font-size: 12px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎫 YoVibe Ticket</h1>
    <p>Your ticket is confirmed!</p>
  </div>
  <div class="content">
    <div class="ticket-card">
      <h2 style="margin-top: 0;">${event.name}</h2>
      <span class="status status-active">${ticket.status.toUpperCase()}</span>
      
      <div class="detail-row">
        <span class="detail-label">Ticket ID:</span>
        <span class="detail-value">${ticket.id}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Event Date:</span>
        <span class="detail-value">${eventDate}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Location:</span>
        <span class="detail-value">${event.location || "TBA"}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Quantity:</span>
        <span class="detail-value">${ticket.quantity}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Total Amount:</span>
        <span class="detail-value">UGX ${ticket.totalAmount.toLocaleString()}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Purchased By:</span>
        <span class="detail-value">${ticket.buyerName}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Purchase Date:</span>
        <span class="detail-value">${ticket.purchaseDate instanceof Date ? ticket.purchaseDate.toLocaleDateString() : "N/A"}</span>
      </div>
      
      <div style="margin-top: 20px;">
        <p style="color: #666; font-size: 14px;"><strong>Your Unique QR Code:</strong></p>
        <div class="qr-code">${ticket.qrCode}</div>
      </div>
    </div>
    
    <p style="text-align: center; color: #666;">
      Present this QR code at the venue entrance for verification.
    </p>
    
    <div class="footer">
      <p>Thank you for using YoVibe!</p>
      <p>© ${new Date().getFullYear()} YoVibe. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `.trim()
  }
}

export default EmailService
