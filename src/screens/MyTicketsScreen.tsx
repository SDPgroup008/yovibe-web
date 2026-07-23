"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image, TextInput } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useCompatNavigation } from "../utils/compatNavigation"
import { useCachedUserTickets } from "../hooks/useDataCache"
import { useMyTicketsScroll } from "../hooks/useScrollPersistence"
import { useAuth } from "../contexts/AuthContext"
import SupabaseService from "../services/SupabaseService"
import TicketPDFService from "../services/TicketPDFService"
import InstallmentService from "../services/InstallmentService"
import PawaPayService from "../services/PawaPayService"
import PesaPalService from "../services/PesaPalService"
import RefundService, { type RefundReason } from "../services/RefundService"
import { Platform } from "react-native"
import type { Ticket } from "../models/Ticket"
import type { InstallmentPlan, InstallmentPlanType } from "../models/InstallmentPlan"
import { renderCanonicalTicketSvgWithEmbeddedAssets, svgDataUri } from "../services/TicketCanonicalRenderer"
import { computeTicketLayout } from "../services/TicketLayoutEngine"

// Generate short ticket reference like YV-2026-X5RD or YVG-<event>-<timestamp> for table tickets
const shortTicketRef = (ticket: Ticket): string => {
  if (ticket.ticketRef) {
    return ticket.ticketRef
  }
  
  const year = new Date().getFullYear()
  const suffix = (ticket.id.match(/[A-Za-z0-9]{4}$/) || ["XXXX"])[0].toUpperCase()
  
  // For table tickets, show the group ID
  if (ticket.tableGroupId) {
    return ticket.tableGroupId
  }
  
  // For regular tickets, use the existing format
  return `YV-${year}-${suffix}`
}

const MyTicketsScreen: React.FC = () => {
  const navigation = useCompatNavigation()
  const { user } = useAuth()
  const { data: ticketsRaw, loading: cacheLoading, error, refetch } = useCachedUserTickets(user?.uid || "")
  const tickets = ticketsRaw || []
  const { scrollRef, onScroll } = useMyTicketsScroll()
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)
  const [selectedTicketSvg, setSelectedTicketSvg] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "active" | "used" | "upcoming">("all")
  const [loading, setLoading] = useState(true)
  const [localTickets, setLocalTickets] = useState<Ticket[]>([])
  const [installmentPlans, setInstallmentPlans] = useState<InstallmentPlan[]>([])
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null)
  const [payInstallmentMethod, setPayInstallmentMethod] = useState<"mobile_money" | "credit_card">("mobile_money")
  const [payInstallmentProvider, setPayInstallmentProvider] = useState<"mtn" | "airtel">("mtn")
  const [payInstallmentNumber, setPayInstallmentNumber] = useState("")
  const [payInstallmentLoading, setPayInstallmentLoading] = useState(false)
  const [payInstallmentStatus, setPayInstallmentStatus] = useState<"idle" | "polling" | "success" | "error">("idle")
  const [payInstallmentMessage, setPayInstallmentMessage] = useState("")

  const selectedFeeDesign = selectedEvent?.entryFees?.find((fee: any) => fee.name === selectedTicket?.entryFeeType)?.ticketDesign
    || selectedEvent?.ticket_design
    || { orientation: "portrait", dimensions: { width: 600, height: 900 } }
  const selectedTicketLayout = computeTicketLayout(selectedFeeDesign, { hasPoster: !!selectedEvent?.posterImageUrl })
  const selectedPosterBlock = selectedTicketLayout.blocks.find((block) => block.id === "poster")
  const [installmentsExpanded, setInstallmentsExpanded] = useState(false)

  // Load tickets on mount and when user changes
  useEffect(() => {
    if (user) {
      console.log("📋 MyTicketsScreen: useEffect triggered, calling loadUserTickets")
      loadUserTickets()
    } else {
      setLoading(false)
    }
  }, [user])

  const loadUserTickets = async () => {
    if (!user) {
      setLoading(false)
      return
    }

    try {
      const [userTickets, plans] = await Promise.all([
        SupabaseService.getTicketsByUser(user.id),
        InstallmentService.getPlansByBuyerId(user.id),
      ])

      const sorted = (userTickets || []).sort((a, b) => {
        const dateA = a.purchaseDate instanceof Date ? a.purchaseDate.getTime() : new Date(a.purchaseDate || 0).getTime()
        const dateB = b.purchaseDate instanceof Date ? b.purchaseDate.getTime() : new Date(b.purchaseDate || 0).getTime()
        return dateB - dateA
      })

      setLocalTickets(sorted)
      setInstallmentPlans(plans.filter((p) => p.status === "active"))
    } catch (error) {
      console.error("📋 MyTicketsScreen: Error loading tickets:", error)
      Alert.alert("Error", "Failed to load tickets")
    } finally {
      setLoading(false)
    }
  }

  const filteredTickets = (localTickets || []).filter((ticket) => {
    if (filter === "all") return true
    if (filter === "active") return ticket.status === "active" && !ticket.isScanned
    if (filter === "used") return ticket.status === "used" || ticket.isScanned
    if (filter === "upcoming") {
      const eventDate = ticket.eventStartTime instanceof Date ? ticket.eventStartTime : new Date(ticket.eventStartTime)
      return eventDate > new Date() && ticket.status === "active"
    }
    return true
  })

  const formatDate = (date: Date | string) => {
    const d = date instanceof Date ? date : new Date(date)
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    })
  }

  const formatTime = (date: Date | string) => {
    const d = date instanceof Date ? date : new Date(date)
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  const getStatusColor = (status: string, isScanned: boolean) => {
    if (status === "used" || isScanned) return "#FF6B6B" // Red for used
    if (status === "cancelled") return "#888888" // Gray for cancelled
    if (status === "active") {
      const eventDate = selectedTicket?.eventStartTime instanceof Date 
        ? selectedTicket.eventStartTime 
        : new Date(selectedTicket?.eventStartTime || Date.now())
      if (eventDate < new Date()) return "#FF6B6B" // Event passed
      return "#4CAF50" // Green for active
    }
    return "#00D4FF"
  }

  const getStatusLabel = (ticket: Ticket) => {
    if (ticket.status === "cancelled") return "Cancelled"
    if (ticket.status === "refunded") return "Refunded"
    if (ticket.status === "used" || ticket.isScanned) return "Used"
    const eventDate = ticket.eventStartTime instanceof Date 
      ? ticket.eventStartTime 
      : new Date(ticket.eventStartTime)
    if (eventDate < new Date()) return "Event Ended"
    return "Active"
  }

  const handleViewTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket)
    setSelectedTicketSvg(null)
    try {
      const event = await SupabaseService.getEventById(ticket.eventId)
      setSelectedEvent(event)
      setSelectedTicketSvg(await renderCanonicalTicketSvgWithEmbeddedAssets(ticket, event || undefined))
    } catch {
      setSelectedEvent(null)
      setSelectedTicketSvg(await renderCanonicalTicketSvgWithEmbeddedAssets(ticket))
    }
  }

  const handleCloseTicket = () => {
    setSelectedTicket(null)
    setSelectedEvent(null)
    setSelectedTicketSvg(null)
  }

  const handleDownloadTicket = async (ticket: Ticket) => {
    try {
      const event = await SupabaseService.getEventById(ticket.eventId)
      const result = await TicketPDFService.downloadTicketPDF(ticket, event ?? undefined)
      if (!result.success) {
        Alert.alert("Error", result.error || "Failed to generate ticket PDF. Please try again.")
      }
    } catch (error: any) {
      console.error("Error generating PDF:", error)
      Alert.alert("Error", "Failed to generate ticket PDF. Please try again.")
    }
  }

  const handleRefundRequest = (ticket: Ticket) => {
    const status = String(selectedEvent?.event_status || "").toLowerCase()
    const options: { label: string; reason: RefundReason }[] = []
    if (status === "cancelled") options.push({ label: "Event cancelled", reason: "event_cancelled" })
    if (status === "postponed") options.push({ label: "Event postponed", reason: "event_postponed" })
    const plan = installmentPlans.find((p) => p.ticketIds?.includes(ticket.id) || (p.eventId === ticket.eventId && p.status === "expired"))
    if (plan) options.push({ label: "Installments incomplete", reason: "installments_incomplete" })
    if (!options.length) return Alert.alert("Refund unavailable", "Refunds are available only for a cancelled or postponed event, or an incomplete installment plan after the event.")
    Alert.alert("Request refund", "Select the applicable reason. An administrator must review and execute every refund.", options.map((option) => ({ text: option.label, onPress: async () => { try { await RefundService.request(ticket.id, option.reason, plan?.id); Alert.alert("Submitted", "Your refund request was submitted for admin review.") } catch (e: any) { Alert.alert("Refund request", e.message) } } })))
  }

  const handleRefresh = () => {
    setLoading(true)
    refetch()
    loadUserTickets()
  }

  const getNextPendingInstallment = (plan: InstallmentPlan) =>
    plan.installments.find((i) => i.status === "pending")

  const handlePayInstallment = async (plan: InstallmentPlan) => {
    const next = getNextPendingInstallment(plan)
    if (!next) return

    if (!payInstallmentNumber.trim() && payInstallmentMethod === "mobile_money") {
      Alert.alert("Number Required", "Please enter your mobile money number")
      return
    }

    try {
      setPayInstallmentLoading(true)
      setPayInstallmentStatus("idle")

      const result = await InstallmentService.payInstallment(plan.id, next.index, {
        method: payInstallmentMethod,
        provider: payInstallmentMethod === "mobile_money" ? payInstallmentProvider : undefined,
        number: payInstallmentMethod === "mobile_money" ? payInstallmentNumber : undefined,
      })

      if (payInstallmentMethod === "mobile_money" && result.depositId) {
        setPayInstallmentStatus("polling")
        setPayInstallmentMessage("Check your phone and enter your PIN...")

        let attempts = 0
        let status = "PENDING"
        while (attempts < 25 && (status === "PENDING" || status === "PROCESSING")) {
          await new Promise((r) => setTimeout(r, 2000))
          attempts++
          try {
            const check = await PawaPayService.checkDepositStatus(result.depositId)
            status = (check.status || "").toUpperCase()
          } catch { /* keep polling */ }
        }

        if (status === "COMPLETED") {
          const { planComplete } = await InstallmentService.onInstallmentPaid(
            plan.id, next.index, result.depositId, "mobile_money"
          )
          setPayInstallmentStatus("success")
          setPayInstallmentMessage(
            planComplete
              ? "All installments paid! Your ticket is being emailed to you."
              : "Installment paid! Check back here for remaining installments."
          )
          setPayingPlanId(null)
          loadUserTickets()
        } else {
          setPayInstallmentStatus("error")
          setPayInstallmentMessage("Payment not confirmed. Try again.")
        }
      } else if (result.paymentUrl) {
        if (typeof window !== "undefined") window.open(result.paymentUrl, "_blank")
        setPayInstallmentStatus("success")
        setPayInstallmentMessage("Complete payment in the opened tab, then refresh.")
      }
    } catch (error: any) {
      setPayInstallmentStatus("error")
      setPayInstallmentMessage(error.message || "Payment failed")
    } finally {
      setPayInstallmentLoading(false)
    }
  }

  if (loading || cacheLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00D4FF" />
        <Text style={styles.loadingText}>Loading your tickets...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Tickets</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate("ResendTicket")}>
            <Text style={styles.resendLink}>Resend Ticket</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleRefresh}>
            <Ionicons name="refresh" size={24} color="#00D4FF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {(["all", "active", "upcoming", "used"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Installment Plans */}
      {installmentPlans.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <TouchableOpacity
            onPress={() => setInstallmentsExpanded(prev => !prev)}
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
          >
            <Text style={{ color: "#F59E0B", fontWeight: "700", fontSize: 13, letterSpacing: 0.5 }}>
              RESERVED TICKETS — INSTALLMENTS
            </Text>
            <Ionicons name={installmentsExpanded ? "chevron-up" : "chevron-down"} size={18} color="#F59E0B" />
          </TouchableOpacity>
          {installmentsExpanded && installmentPlans.map((plan) => {
            const next = getNextPendingInstallment(plan)
            const paidCount = plan.installments.filter((i) => i.status === "paid").length
            const total = plan.installments.length
            const progress = paidCount / total
            const isOverdue = next && new Date() > next.dueDate
            const eventPassed = plan.eventDate && new Date() > plan.eventDate

            return (
              <View key={plan.id} style={styles.installmentCard}>
                <View style={styles.installmentCardHeader}>
                  <Text style={styles.installmentCardEvent} numberOfLines={1}>{plan.eventName}</Text>
                  <View style={[styles.installmentBadge, eventPassed && styles.installmentBadgeExpired]}>
                    <Text style={styles.installmentBadgeText}>
                      {eventPassed ? "EXPIRED" : `${paidCount}/${total} PAID`}
                    </Text>
                  </View>
                </View>

                <Text style={styles.installmentCardType}>{plan.ticketType} · {plan.quantity} ticket{plan.quantity > 1 ? "s" : ""}</Text>

                {/* Progress bar */}
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${progress * 100}%` as any }]} />
                </View>
                <Text style={styles.progressText}>
                  UGX {plan.amountPaid.toLocaleString()} of UGX {plan.totalAmount.toLocaleString()} paid
                </Text>

                {next && !eventPassed && (
                  <>
                    <View style={styles.nextInstallmentRow}>
                      <Text style={[styles.nextInstallmentLabel, isOverdue && styles.overdueText]}>
                        {isOverdue ? "⚠ Overdue — " : "Next: "}
                        UGX {next.totalDue.toLocaleString()}
                        <Text style={{ color: "#666", fontSize: 11 }}> (incl. UGX {next.serviceFee.toLocaleString()} fee)</Text>
                      </Text>
                    </View>

                    {payingPlanId === plan.id ? (
                      <View style={styles.payInstallmentForm}>
                        {/* Method toggle */}
                        <View style={styles.methodRow}>
                          {(["mobile_money", "credit_card"] as const).map((m) => (
                            <TouchableOpacity
                              key={m}
                              style={[styles.methodBtn, payInstallmentMethod === m && styles.methodBtnActive]}
                              onPress={() => setPayInstallmentMethod(m)}
                            >
                              <Text style={[styles.methodBtnText, payInstallmentMethod === m && styles.methodBtnTextActive]}>
                                {m === "mobile_money" ? "Mobile Money" : "Card"}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        {payInstallmentMethod === "mobile_money" && (
                          <>
                            <View style={styles.methodRow}>
                              {(["mtn", "airtel"] as const).map((p) => (
                                <TouchableOpacity
                                  key={p}
                                  style={[styles.methodBtn, payInstallmentProvider === p && styles.methodBtnActive]}
                                  onPress={() => setPayInstallmentProvider(p)}
                                >
                                  <Text style={[styles.methodBtnText, payInstallmentProvider === p && styles.methodBtnTextActive]}>
                                    {p.toUpperCase()}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                            <TextInput
                              style={styles.payInput}
                              value={payInstallmentNumber}
                              onChangeText={setPayInstallmentNumber}
                              placeholder="Mobile money number"
                              placeholderTextColor="#666"
                              keyboardType="phone-pad"
                            />
                          </>
                        )}

                        {payInstallmentStatus === "polling" && (
                          <View style={styles.pollingRow}>
                            <ActivityIndicator size="small" color="#F59E0B" />
                            <Text style={styles.pollingText}>{payInstallmentMessage}</Text>
                          </View>
                        )}
                        {payInstallmentStatus === "success" && (
                          <Text style={styles.successMsg}>{payInstallmentMessage}</Text>
                        )}
                        {payInstallmentStatus === "error" && (
                          <Text style={styles.errorMsg}>{payInstallmentMessage}</Text>
                        )}

                        <View style={styles.methodRow}>
                          <TouchableOpacity
                            style={[styles.payNowBtn, payInstallmentLoading && { opacity: 0.6 }]}
                            onPress={() => handlePayInstallment(plan)}
                            disabled={payInstallmentLoading}
                          >
                            {payInstallmentLoading
                              ? <ActivityIndicator size="small" color="#FFF" />
                              : <Text style={styles.payNowBtnText}>Pay UGX {next.totalDue.toLocaleString()}</Text>
                            }
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.cancelBtn}
                            onPress={() => { setPayingPlanId(null); setPayInstallmentStatus("idle") }}
                          >
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.payInstallmentBtn}
                        onPress={() => {
                          setPayingPlanId(plan.id)
                          setPayInstallmentStatus("idle")
                          setPayInstallmentNumber(plan.paymentNumber || "")
                        }}
                      >
                        <Ionicons name="card-outline" size={16} color="#F59E0B" />
                        <Text style={styles.payInstallmentBtnText}>Pay Next Installment</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            )
          })}
        </View>
      )}

      {/* Ticket Summary */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{localTickets.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {(localTickets || []).filter((t) => t.status === "active" && !t.isScanned).length}
          </Text>
          <Text style={styles.summaryLabel}>Active</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {(localTickets || []).filter((t) => t.status === "used" || t.isScanned).length}
          </Text>
          <Text style={styles.summaryLabel}>Used</Text>
        </View>
      </View>

      <ScrollView 
        ref={scrollRef} 
        style={styles.ticketList} 
        showsVerticalScrollIndicator={false} 
        onScroll={onScroll}
      >
        {filteredTickets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="ticket-outline" size={64} color="#444444" />
            <Text style={styles.emptyTitle}>No Tickets Found</Text>
            <Text style={styles.emptyText}>
              {filter === "all" 
                ? "You haven't purchased any tickets yet."
                : `No ${filter} tickets found.`}
            </Text>
          </View>
        ) : (
          filteredTickets.map((ticket) => (
            <TouchableOpacity
              key={ticket.id}
              style={styles.ticketCard}
              onPress={() => handleViewTicket(ticket)}
            >
              <View style={styles.ticketCardHeader}>
                <View style={styles.ticketRefRow}>
                  <Text style={styles.ticketRefBadge}>{shortTicketRef(ticket)}</Text>
                  <View style={[styles.ticketStatusBadgeSmall, { backgroundColor: getStatusColor(ticket.status, ticket.isScanned) + "20" }]}>
                    <Text style={[styles.ticketStatusTextSmall, { color: getStatusColor(ticket.status, ticket.isScanned) }]}>
                      {getStatusLabel(ticket)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Event name – big */}
              <Text style={styles.cardEventName} numberOfLines={1}>{ticket.eventName}</Text>

              {/* Venue & attendee – medium */}
              <View style={styles.cardMetaRow}>
                <Ionicons name="location-outline" size={14} color="#00D4FF" />
                <Text style={styles.cardMetaText} numberOfLines={1}>{ticket.venueName || "Venue TBA"}</Text>
              </View>
              {ticket.buyerName && (
                <View style={styles.cardMetaRow}>
                  <Ionicons name="person-outline" size={14} color="#888" />
                  <Text style={styles.cardMetaText}>{ticket.buyerName}</Text>
                </View>
              )}
              {ticket.tableNumber != null && (
                <View style={styles.cardMetaRow}>
                  <Ionicons name="grid-outline" size={14} color="#00D4FF" />
                  <Text style={styles.cardMetaText}>Table {ticket.tableNumber}</Text>
                </View>
              )}
              {ticket.seatNumber != null && (
                <View style={styles.cardMetaRow}>
                  <Ionicons name="grid-outline" size={14} color="#F59E0B" />
                  <Text style={styles.cardMetaText}>Seat {ticket.seatNumber}</Text>
                </View>
              )}
              {ticket.tableGroupId && !ticket.tableNumber && (
                <View style={styles.cardMetaRow}>
                  <Ionicons name="grid-outline" size={14} color="#00D4FF" />
                  <Text style={styles.cardMetaText}>{ticket.tableGroupId.includes("TABLE") ? `Table ${ticket.tableGroupId.split("TABLE_").pop()}` : `Table: ${ticket.tableGroupId.slice(-4)}`}</Text>
                </View>
              )}

              {/* Date/time + price – small */}
              <View style={styles.cardFooterRow}>
                <View style={styles.cardMetaRow}>
                  <Ionicons name="calendar-outline" size={12} color="#666" />
                  <Text style={styles.cardMetaSmall}>{formatDate(ticket.eventStartTime)}</Text>
                </View>
                <Text style={styles.cardPrice}>UGX {(ticket.totalAmount || 0).toLocaleString()}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Your Ticket</Text>
              <TouchableOpacity onPress={handleCloseTicket}>
                <Ionicons name="close" size={28} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Ticket Reference Badge */}
            <View style={styles.modalRefRow}>
              <Text style={styles.modalRefBadge}>{shortTicketRef(selectedTicket)}</Text>
              <View style={[styles.modalStatusBadge, { backgroundColor: getStatusColor(selectedTicket.status, selectedTicket.isScanned) + "20" }]}>
                <Text style={[styles.modalStatusText, { color: getStatusColor(selectedTicket.status, selectedTicket.isScanned) }]}>
                  {getStatusLabel(selectedTicket)}
                </Text>
              </View>
            </View>

            {/* Seat / Table info */}
            {(selectedTicket.tableNumber != null || selectedTicket.seatNumber != null) && (
              <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, marginBottom: 14 }}>
                {selectedTicket.tableNumber != null && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="grid-outline" size={14} color="#00D4FF" />
                    <Text style={{ color: "#00D4FF", fontSize: 13, fontWeight: "600" }}>Table {selectedTicket.tableNumber}</Text>
                  </View>
                )}
                {selectedTicket.seatNumber != null && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="grid-outline" size={14} color="#F59E0B" />
                    <Text style={{ color: "#F59E0B", fontSize: 13, fontWeight: "600" }}>Seat {selectedTicket.seatNumber}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Canonical organizer-designed ticket. This same SVG is used by
                the browser PDF path and the email visual renderer. */}
            <View style={{ width: "100%", aspectRatio: selectedTicketLayout.pageWidth / selectedTicketLayout.pageHeight, marginBottom: 18, borderRadius: 12, overflow: "hidden", backgroundColor: "#111827" }}>
              <Image
                source={selectedTicketSvg ? { uri: svgDataUri(selectedTicketSvg) } : undefined}
                style={{ ...StyleSheet.absoluteFillObject }}
                resizeMode="contain"
                accessibilityLabel="Organizer-designed ticket"
              />
              {selectedEvent?.posterImageUrl && selectedPosterBlock && (
                <Image
                  source={{ uri: selectedEvent.posterImageUrl }}
                  style={{
                    position: "absolute",
                    left: `${(selectedPosterBlock.x / selectedTicketLayout.pageWidth) * 100}%`,
                    top: `${(selectedPosterBlock.y / selectedTicketLayout.pageHeight) * 100}%`,
                    width: `${((selectedPosterBlock.width * selectedPosterBlock.scale) / selectedTicketLayout.pageWidth) * 100}%`,
                    height: `${((selectedPosterBlock.height * selectedPosterBlock.scale) / selectedTicketLayout.pageHeight) * 100}%`,
                    borderRadius: 10,
                  }}
                  resizeMode="cover"
                  accessibilityLabel="Event poster"
                />
              )}
            </View>

            <Text style={{ color: "#9CA3AF", textAlign: "center", marginBottom: 18 }}>
              Present this ticket and QR code at the event entrance.
            </Text>

            {/* Download Button */}
            <TouchableOpacity style={styles.downloadButton} onPress={() => handleDownloadTicket(selectedTicket)}>
              <Ionicons name="download-outline" size={20} color="#FFFFFF" />
              <Text style={styles.downloadButtonText}>Download Ticket PDF</Text>
            </TouchableOpacity>
            {selectedTicket && selectedEvent && (() => {
              const evStatus = String(selectedEvent?.event_status || "").toLowerCase()
              const hasPlan = installmentPlans.some((p) => p.ticketIds?.includes(selectedTicket.id) || (p.eventId === selectedTicket.eventId && p.status === "expired"))
              const canRefund = !["used", "refunded"].includes(selectedTicket.status) && (evStatus === "cancelled" || evStatus === "postponed" || hasPlan)
              return canRefund ? (
                <TouchableOpacity style={[styles.downloadButton, { backgroundColor: "#374151", marginTop: 10 }]} onPress={() => handleRefundRequest(selectedTicket)}>
                  <Ionicons name="return-down-back-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.downloadButtonText}>Request refund</Text>
                </TouchableOpacity>
              ) : null
            })()}
          </ScrollView>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 16,
    marginTop: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    paddingTop: 24,
    backgroundColor: "#1a1a1a",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
  },
  filterContainer: {
    flexDirection: "row",
    padding: 16,
    paddingBottom: 8,
    backgroundColor: "#1a1a1a",
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: "#2a2a2a",
    alignItems: "center",
  },
  filterTabActive: {
    backgroundColor: "#00D4FF",
  },
  filterText: {
    color: "#888888",
    fontSize: 12,
    fontWeight: "600",
  },
  filterTextActive: {
    color: "#FFFFFF",
  },
  summaryContainer: {
    flexDirection: "row",
    padding: 6,
    backgroundColor: "#1a1a1a",
    marginBottom: 8,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryValue: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "bold",
  },
  summaryLabel: {
    color: "#888888",
    fontSize: 12,
    marginTop: 4,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: "#333333",
    marginHorizontal: 16,
  },
  ticketList: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 16,
  },
  emptyText: {
    color: "#888888",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 32,
  },
  ticketCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(0,212,255,0.12)",
    shadowColor: "#00D4FF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  ticketCardHeader: {
    marginBottom: 10,
  },
  ticketRefRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ticketRefBadge: {
    color: "#00D4FF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    fontFamily: "monospace",
  },
  ticketStatusBadgeSmall: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  ticketStatusTextSmall: {
    fontSize: 10,
    fontWeight: "700",
  },
  cardEventName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  cardMetaText: {
    color: "#CCC",
    fontSize: 13,
  },
  cardMetaSmall: {
    color: "#666",
    fontSize: 11,
  },
  cardFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  cardPrice: {
    color: "#4CAF50",
    fontSize: 15,
    fontWeight: "700",
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
  },
  modalContent: {
    flex: 1,
    marginTop: 48,
    marginBottom: 0,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
  },
  modalRefRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  modalRefBadge: {
    color: "#00D4FF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
    fontFamily: "monospace",
  },
  modalStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  modalStatusText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  modalEventName: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "bold",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  modalMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  modalMetaText: {
    color: "#CCC",
    fontSize: 14,
  },
  infoValueSmall: {
    color: "#888888",
    fontSize: 12,
  },
  qrContainer: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: "#1a1a1a",
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  qrImage: {
    width: 200,
    height: 200,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 10,
  },
  qrPlaceholder: {
    alignItems: "center",
    padding: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
  },
  qrText: {
    color: "#000000",
    fontSize: 10,
    marginTop: 8,
    fontFamily: "monospace",
  },
  qrInstruction: {
    color: "#888888",
    fontSize: 14,
    marginTop: 20,
    textAlign: "center",
  },
  ticketInfoCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  infoLabel: {
    color: "#888888",
    fontSize: 14,
  },
  infoValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  infoValueHighlight: {
    color: "#4CAF50",
    fontSize: 16,
    fontWeight: "bold",
  },
  infoValueMono: {
    color: "#00D4FF",
    fontSize: 11,
    fontFamily: "monospace",
    maxWidth: 180,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  securityBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 24,
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
  },
  securityText: {
    color: "#4CAF50",
    fontSize: 12,
    marginLeft: 8,
  },
downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 32,
  },
  downloadButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    marginLeft: 8,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  resendLink: {
    color: "#00D4FF",
    fontSize: 14,
    fontWeight: "500",
  },
  // Installment plan card styles
  installmentCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.25)",
  },
  installmentCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  installmentCardEvent: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
    marginRight: 8,
  },
  installmentBadge: {
    backgroundColor: "rgba(245,158,11,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  installmentBadgeExpired: {
    backgroundColor: "rgba(239,68,68,0.15)",
  },
  installmentBadgeText: {
    color: "#F59E0B",
    fontSize: 10,
    fontWeight: "700",
  },
  installmentCardType: {
    color: "#888",
    fontSize: 12,
    marginBottom: 10,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: "#2a2a2a",
    borderRadius: 3,
    marginBottom: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 6,
    backgroundColor: "#F59E0B",
    borderRadius: 3,
  },
  progressText: {
    color: "#666",
    fontSize: 11,
    marginBottom: 10,
  },
  nextInstallmentRow: {
    marginBottom: 10,
  },
  nextInstallmentLabel: {
    color: "#CCCCCC",
    fontSize: 13,
    fontWeight: "500",
  },
  overdueText: {
    color: "#EF4444",
  },
  payInstallmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(245,158,11,0.12)",
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderRadius: 8,
    paddingVertical: 10,
  },
  payInstallmentBtnText: {
    color: "#F59E0B",
    fontWeight: "700",
    fontSize: 14,
  },
  payInstallmentForm: {
    marginTop: 8,
    gap: 8,
  },
  methodRow: {
    flexDirection: "row",
    gap: 8,
  },
  methodBtn: {
    flex: 1,
    padding: 10,
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  methodBtnActive: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderColor: "#F59E0B",
  },
  methodBtnText: {
    color: "#888",
    fontSize: 13,
    fontWeight: "600",
  },
  methodBtnTextActive: {
    color: "#F59E0B",
  },
  payInput: {
    backgroundColor: "#2a2a2a",
    color: "#FFF",
    padding: 10,
    borderRadius: 8,
    fontSize: 14,
  },
  payNowBtn: {
    flex: 1,
    backgroundColor: "#F59E0B",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  payNowBtnText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 14,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    color: "#666",
    fontSize: 13,
  },
  pollingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderRadius: 8,
  },
  pollingText: {
    color: "#D97706",
    fontSize: 12,
    flex: 1,
  },
  successMsg: {
    color: "#4CAF50",
    fontSize: 13,
    padding: 8,
    backgroundColor: "rgba(76,175,80,0.08)",
    borderRadius: 8,
  },
  errorMsg: {
    color: "#EF4444",
    fontSize: 13,
    padding: 8,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderRadius: 8,
  },
})

export default MyTicketsScreen
