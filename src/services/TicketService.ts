import { collection, addDoc, getDocs, doc, query, where, updateDoc, Timestamp } from "firebase/firestore"
import { db } from "../config/firebase"
import { v4 as uuidv4 } from "uuid"
import type { Ticket, TicketValidation } from "../models/Ticket"
import PaymentService from "./PaymentService"
import BiometricService from "./BiometricService"
import NotificationService from "./NotificationService"

class TicketService {
  // Purchase tickets
  async purchaseTickets(
    eventId: string,
    eventName: string,
    venueId: string,
    venueName: string,
    buyerId: string,
    buyerName: string,
    buyerEmail: string,
    quantity: number,
    unitPrice: number,
  ): Promise<Ticket> {
    try {
      console.log("TicketService: Starting ticket purchase process")

      const totalAmount = quantity * unitPrice
      const { appCommission, venueRevenue } = PaymentService.calculateCommission(totalAmount)

      // Capture biometric data
      console.log("TicketService: Capturing biometric data...")
      const biometricHash = await BiometricService.captureEyeScan()

      // Create payment intent
      const paymentIntent = await PaymentService.createPaymentIntent(totalAmount)

      // Process payment
      console.log("TicketService: Processing payment...")
      const paymentSuccess = await PaymentService.processPayment(paymentIntent.id, "mobile_money")

      if (!paymentSuccess) {
        throw new Error("Payment failed")
      }

      // Generate unique ticket code
      const ticketCode = this.generateTicketCode()

      // Create ticket
      const ticket: Omit<Ticket, "id"> = {
        eventId,
        eventName,
        venueId,
        venueName,
        buyerId,
        buyerName,
        buyerEmail,
        quantity,
        unitPrice,
        totalAmount,
        appCommission,
        venueRevenue,
        purchaseDate: new Date(),
        ticketCode,
        biometricHash,
        status: "active",
        paymentId: paymentIntent.id,
        paymentStatus: "completed",
      }

      // Save to database
      const ticketRef = await addDoc(collection(db, "tickets"), {
        ...ticket,
        purchaseDate: Timestamp.fromDate(ticket.purchaseDate),
      })

      const savedTicket: Ticket = {
        id: ticketRef.id,
        ...ticket,
      }

      // Send notification to event owner
      await NotificationService.notifyEventOwner(eventId, {
        type: "ticket_purchased",
        message: `${buyerName} purchased ${quantity} ticket(s) for ${eventName}`,
        ticketId: savedTicket.id,
        amount: totalAmount,
      })

      console.log("TicketService: Ticket purchased successfully", savedTicket.id)
      return savedTicket
    } catch (error) {
      console.error("TicketService: Error purchasing tickets:", error)
      throw error
    }
  }

  // Get tickets for an event (for event owners)
  async getEventTickets(eventId: string): Promise<Ticket[]> {
    try {
      const ticketsRef = collection(db, "tickets")
      const q = query(ticketsRef, where("eventId", "==", eventId))
      const querySnapshot = await getDocs(q)
      const tickets: Ticket[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        tickets.push({
          id: doc.id,
          eventId: data.eventId,
          eventName: data.eventName,
          venueId: data.venueId,
          venueName: data.venueName,
          buyerId: data.buyerId,
          buyerName: data.buyerName,
          buyerEmail: data.buyerEmail,
          quantity: data.quantity,
          unitPrice: data.unitPrice,
          totalAmount: data.totalAmount,
          appCommission: data.appCommission,
          venueRevenue: data.venueRevenue,
          purchaseDate: data.purchaseDate.toDate(),
          ticketCode: data.ticketCode,
          biometricHash: data.biometricHash,
          status: data.status,
          paymentId: data.paymentId,
          paymentStatus: data.paymentStatus,
          usedAt: data.usedAt?.toDate(),
          validatedBy: data.validatedBy,
        })
      })

      return tickets.sort((a, b) => b.purchaseDate.getTime() - a.purchaseDate.getTime())
    } catch (error) {
      console.error("TicketService: Error getting event tickets:", error)
      throw error
    }
  }

  // Get user's tickets
  async getUserTickets(userId: string): Promise<Ticket[]> {
    try {
      const ticketsRef = collection(db, "tickets")
      const q = query(ticketsRef, where("buyerId", "==", userId))
      const querySnapshot = await getDocs(q)
      const tickets: Ticket[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        tickets.push({
          id: doc.id,
          eventId: data.eventId,
          eventName: data.eventName,
          venueId: data.venueId,
          venueName: data.venueName,
          buyerId: data.buyerId,
          buyerName: data.buyerName,
          buyerEmail: data.buyerEmail,
          quantity: data.quantity,
          unitPrice: data.unitPrice,
          totalAmount: data.totalAmount,
          appCommission: data.appCommission,
          venueRevenue: data.venueRevenue,
          purchaseDate: data.purchaseDate.toDate(),
          ticketCode: data.ticketCode,
          biometricHash: data.biometricHash,
          status: data.status,
          paymentId: data.paymentId,
          paymentStatus: data.paymentStatus,
          usedAt: data.usedAt?.toDate(),
          validatedBy: data.validatedBy,
        })
      })

      return tickets.sort((a, b) => b.purchaseDate.getTime() - a.purchaseDate.getTime())
    } catch (error) {
      console.error("TicketService: Error getting user tickets:", error)
      throw error
    }
  }

  // Validate ticket at entry
  async validateTicket(ticketCode: string, validatorId: string): Promise<TicketValidation> {
    try {
      console.log("TicketService: Validating ticket", ticketCode)

      // Find ticket by code
      const ticketsRef = collection(db, "tickets")
      const q = query(ticketsRef, where("ticketCode", "==", ticketCode))
      const querySnapshot = await getDocs(q)

      if (querySnapshot.empty) {
        throw new Error("Ticket not found")
      }

      const ticketDoc = querySnapshot.docs[0]
      const ticketData = ticketDoc.data()

      if (ticketData.status !== "active") {
        throw new Error("Ticket is not active")
      }

      // Verify biometric data
      console.log("TicketService: Verifying biometric data...")
      const biometricMatch = await BiometricService.verifyEyeScan(ticketData.biometricHash)

      if (!biometricMatch) {
        // Log failed validation
        const validation: TicketValidation = {
          id: uuidv4(),
          ticketId: ticketDoc.id,
          eventId: ticketData.eventId,
          validatedAt: new Date(),
          validatedBy: validatorId,
          biometricMatch: false,
          entryGranted: false,
          notes: "Biometric verification failed",
        }

        await addDoc(collection(db, "ticketValidations"), {
          ...validation,
          validatedAt: Timestamp.fromDate(validation.validatedAt),
        })

        throw new Error("Biometric verification failed")
      }

      // Mark ticket as used
      await updateDoc(doc(db, "tickets", ticketDoc.id), {
        status: "used",
        usedAt: Timestamp.now(),
        validatedBy: validatorId,
      })

      // Log successful validation
      const validation: TicketValidation = {
        id: uuidv4(),
        ticketId: ticketDoc.id,
        eventId: ticketData.eventId,
        validatedAt: new Date(),
        validatedBy: validatorId,
        biometricMatch: true,
        entryGranted: true,
      }

      await addDoc(collection(db, "ticketValidations"), {
        ...validation,
        validatedAt: Timestamp.fromDate(validation.validatedAt),
      })

      console.log("TicketService: Ticket validated successfully")
      return validation
    } catch (error) {
      console.error("TicketService: Error validating ticket:", error)
      throw error
    }
  }

  // Generate unique ticket code
  private generateTicketCode(): string {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 8)
    return `TKT-${timestamp}-${random}`.toUpperCase()
  }

  // Get ticket by code
  async getTicketByCode(ticketCode: string): Promise<Ticket | null> {
    try {
      const ticketsRef = collection(db, "tickets")
      const q = query(ticketsRef, where("ticketCode", "==", ticketCode))
      const querySnapshot = await getDocs(q)

      if (querySnapshot.empty) {
        return null
      }

      const doc = querySnapshot.docs[0]
      const data = doc.data()

      return {
        id: doc.id,
        eventId: data.eventId,
        eventName: data.eventName,
        venueId: data.venueId,
        venueName: data.venueName,
        buyerId: data.buyerId,
        buyerName: data.buyerName,
        buyerEmail: data.buyerEmail,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        totalAmount: data.totalAmount,
        appCommission: data.appCommission,
        venueRevenue: data.venueRevenue,
        purchaseDate: data.purchaseDate.toDate(),
        ticketCode: data.ticketCode,
        biometricHash: data.biometricHash,
        status: data.status,
        paymentId: data.paymentId,
        paymentStatus: data.paymentStatus,
        usedAt: data.usedAt?.toDate(),
        validatedBy: data.validatedBy,
      }
    } catch (error) {
      console.error("TicketService: Error getting ticket by code:", error)
      return null
    }
  }
}

export default new TicketService()
