import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "../utils/URLRouter";
import SupabaseService from "../services/SupabaseService";
import GuestTicketService, { type GuestTicketOverview, type GuestRecipient } from "../services/GuestTicketService";
import type { Event } from "../models/Event";

type Section = "overview" | "issue" | "bulk" | "links" | "codes" | "sponsors" | "guests" | "reports";
const sections: Array<{ key: Section; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: "overview", label: "Overview", icon: "grid-outline" }, { key: "issue", label: "Issue", icon: "ticket-outline" },
  { key: "bulk", label: "Bulk", icon: "people-outline" }, { key: "links", label: "Claim links", icon: "link-outline" },
  { key: "codes", label: "Codes", icon: "key-outline" }, { key: "sponsors", label: "Sponsors", icon: "business-outline" },
  { key: "guests", label: "Guest list", icon: "list-outline" }, { key: "reports", label: "Reports", icon: "bar-chart-outline" },
];

const amount = (value: number) => `UGX ${Number(value || 0).toLocaleString()}`;
const emptyOverview: GuestTicketOverview = { allocations: [], guests: [], sponsorships: [], summary: { complimentaryIssued: 0, sponsoredDistributed: 0, reserved: 0, cancelled: 0, checkedIn: 0, faceValue: 0, sponsorshipRevenue: 0 } };

function parseRecipients(csv: string): { valid: GuestRecipient[]; invalid: number[] } {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const valid: GuestRecipient[] = [];
  const invalid: number[] = [];
  lines.forEach((line, index) => {
    const [name, email, phone, organisation] = line.split(",").map((value) => value.trim());
    if (!name) invalid.push(index + 1); else valid.push({ name, email: email || undefined, phone: phone || undefined, organisation: organisation || undefined });
  });
  return { valid, invalid };
}

const GuestTicketsScreen: React.FC = () => {
  const { currentPath, navigate, goBack } = useRouter();
  const eventSlug = currentPath.split("/").filter(Boolean)[2] || "";
  const [event, setEvent] = useState<Event | null>(null);
  const [overview, setOverview] = useState<GuestTicketOverview>(emptyOverview);
  const [section, setSection] = useState<Section>("overview");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [entryFeeType, setEntryFeeType] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("VIP");
  const [bulkCsv, setBulkCsv] = useState("");
  const [unassignedQuantity, setUnassignedQuantity] = useState("0");
  const [allocationName, setAllocationName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [expiresAt, setExpiresAt] = useState("");
  const [password, setPassword] = useState("");
  const [prefix, setPrefix] = useState("");
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [shareUrl, setShareUrl] = useState("");
  const [sponsor, setSponsor] = useState({ name: "", organisation: "", email: "", phone: "", paymentMethod: "credit_card" as "credit_card" | "mobile_money" });
  const [guestFilter, setGuestFilter] = useState("");

  const load = useCallback(async () => {
    if (!eventSlug) return;
    setLoading(true);
    try {
      const [eventRow, data] = await Promise.all([SupabaseService.getEventById(eventSlug), GuestTicketService.overview(eventSlug)]);
      setEvent(eventRow);
      setOverview(data);
      if (!entryFeeType && eventRow?.entryFees?.[0]?.name) setEntryFeeType(eventRow.entryFees[0].name);
    } catch (error: any) {
      Alert.alert("Unable to load Guest Tickets", error?.message || "Please try again.");
    } finally { setLoading(false); }
  }, [eventSlug, entryFeeType]);

  useEffect(() => { load(); }, [load]);
  const selectedFee = useMemo(() => event?.entryFees.find((fee) => fee.name === entryFeeType), [event, entryFeeType]);
  const validBulk = useMemo(() => parseRecipients(bulkCsv), [bulkCsv]);
  const statusColor = (status: string) => status.includes("cancel") || status.includes("failed") ? "#FB7185" : status.includes("paid") || status.includes("active") || status.includes("ready") ? "#34D399" : "#FBBF24";
  const setResult = (message: string) => { setNotice(message); setTimeout(() => setNotice(""), 8000); };
  const call = async (run: () => Promise<any>, success: (result: any) => string) => {
    setSubmitting(true);
    try { const result = await run(); setResult(success(result)); await load(); return result; }
    catch (error: any) { Alert.alert("Guest Tickets", error?.message || "Unable to complete that request."); }
    finally { setSubmitting(false); }
  };
  const requireFee = () => {
    if (!entryFeeType) { Alert.alert("Choose a ticket category", "Select an existing event ticket category first."); return false; }
    return true;
  };
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setResult("Copied to clipboard."); } catch { Alert.alert("Copy link", value); }
  };
  const downloadCsv = (filename: string, rows: string[][]) => {
    if (typeof document === "undefined") { Alert.alert("Export", rows.map((row) => row.join(",")).join("\n")); return; }
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
  };

  const renderFeePicker = () => <View style={styles.field}><Text style={styles.label}>Ticket category</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{(event?.entryFees || []).map((fee) => <TouchableOpacity key={fee.name} onPress={() => setEntryFeeType(fee.name)} style={[styles.chip, entryFeeType === fee.name && styles.chipActive]}><Text style={[styles.chipText, entryFeeType === fee.name && styles.chipTextActive]}>{fee.name} · {amount(Number(String(fee.amount).replace(/[^0-9.]/g, "")))}</Text></TouchableOpacity>)}</ScrollView></View>;
  const input = (label: string, value: string, onChangeText: (value: string) => void, placeholder: string, extra: any = {}) => <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#64748B" style={[styles.input, extra.multiline && styles.multiline]} {...extra} /></View>;

  const renderOverview = () => <>
    <View style={styles.metricGrid}>{[
      ["Comps issued", overview.summary.complimentaryIssued, "ticket-outline"], ["Sponsored distributed", overview.summary.sponsoredDistributed, "gift-outline"],
      ["Reserved", overview.summary.reserved, "lock-closed-outline"], ["Checked in", overview.summary.checkedIn, "checkmark-circle-outline"],
      ["Complimentary face value", amount(overview.summary.faceValue), "pricetag-outline"], ["Sponsor revenue", amount(overview.summary.sponsorshipRevenue), "cash-outline"],
    ].map(([label, value, icon]) => <View style={styles.metric} key={String(label)}><Ionicons name={icon as any} color="#67E8F9" size={19} /><Text style={styles.metricValue}>{String(value)}</Text><Text style={styles.metricLabel}>{String(label)}</Text></View>)}</View>
    <Text style={styles.sectionTitle}>Recent allocations</Text>
    {overview.allocations.length === 0 ? <View style={styles.empty}><Ionicons name="ticket-outline" size={38} color="#475569" /><Text style={styles.emptyTitle}>No guest allocations yet</Text><Text style={styles.emptyText}>Issue a VIP pass, generate a private claim link, or create an allocation for a sponsor.</Text></View> : overview.allocations.slice(0, 12).map((allocation) => <View key={allocation.id} style={styles.row}><View style={styles.rowGrow}><Text style={styles.rowTitle}>{allocation.allocation_name}</Text><Text style={styles.rowSub}>{allocation.entry_fee_type} · {allocation.distribution_method.replace("_", " ")} · {allocation.issued_quantity}/{allocation.total_quantity} issued</Text></View><View><Text style={[styles.status, { color: statusColor(allocation.status) }]}>{allocation.status.replace(/_/g, " ").toUpperCase()}</Text>{allocation.funding_type === "sponsored" && allocation.status === "ready_for_distribution" && allocation.distribution_method === "claim_link" ? <TouchableOpacity onPress={() => call(() => GuestTicketService.createSponsoredClaimLink(eventSlug, allocation.id), (r) => { setShareUrl(r.claimUrl); return "Sponsored beneficiary claim link created."; })}><Text style={styles.smallAction}>Create claim link</Text></TouchableOpacity> : <TouchableOpacity onPress={() => call(() => GuestTicketService.releaseAllocation(eventSlug, allocation.id), (r) => `${r.released} reserved ticket(s) released.`)} disabled={submitting || !allocation.reserved_quantity}><Text style={[styles.smallAction, !allocation.reserved_quantity && { opacity: 0.35 }]}>Release</Text></TouchableOpacity>}</View></View>)}</>;

  const renderIssue = () => <>
    <Text style={styles.description}>Create a zero-value order for a known guest. It uses the same QR, ticket artwork, PDF, email, and scanner path as a paid ticket.</Text>
    {renderFeePicker()}
    {input("Recipient name", name, setName, "Full name")}
    {input("Recipient email (optional)", email, setEmail, "name@example.com", { keyboardType: "email-address", autoCapitalize: "none" })}
    {input("Phone (optional)", phone, setPhone, "07XXXXXXXX")}{input("Quantity", quantity, setQuantity, "1", { keyboardType: "numeric" })}
    {input("Reason", reason, setReason, "VIP, staff, media, giveaway...")}
    <TouchableOpacity disabled={submitting} style={[styles.primary, submitting && styles.disabled]} onPress={() => { if (!requireFee()) return; const total = Math.max(1, Math.floor(Number(quantity || 1))); call(() => GuestTicketService.issueDirect({ eventSlug, entryFeeType, name: `Direct issue — ${reason}`, issuanceReason: reason, recipients: Array.from({ length: total }, () => ({ name, email, phone })) }), (r) => `${r.ids?.length || total} complimentary ticket${total === 1 ? "" : "s"} issued.`); }}><Ionicons name="ticket-outline" size={19} color="#08111F" /><Text style={styles.primaryText}>Issue complimentary ticket</Text></TouchableOpacity>
  </>;

  const renderBulk = () => <>
    <Text style={styles.description}>Paste CSV rows as <Text style={styles.inlineCode}>Name, email, phone, organisation</Text>. Invalid rows are shown before issuing; nothing is silently skipped.</Text>
    {renderFeePicker()}<TouchableOpacity style={styles.templateButton} onPress={() => downloadCsv("yovibe-guest-ticket-template.csv", [["name", "email", "phone", "organisation"], ["Amina N", "amina@example.com", "0770000000", "Radio One"]])}><Ionicons name="download-outline" size={16} color="#67E8F9" /><Text style={styles.templateText}>Download CSV template</Text></TouchableOpacity>{input("Batch name", allocationName, setAllocationName, "e.g. Media guest list")}
    {input("Recipients CSV", bulkCsv, setBulkCsv, "Amina N, amina@example.com, 0770000000, Radio One", { multiline: true, textAlignVertical: "top" })}
    {input("Unassigned tickets", unassignedQuantity, setUnassignedQuantity, "0", { keyboardType: "numeric" })}
    <View style={styles.validation}><Text style={styles.validationGood}>{validBulk.valid.length} valid recipient(s)</Text>{validBulk.invalid.length > 0 && <Text style={styles.validationBad}>Rows needing a name: {validBulk.invalid.join(", ")}</Text>}</View>
    <TouchableOpacity disabled={submitting || validBulk.invalid.length > 0} style={[styles.primary, (submitting || validBulk.invalid.length > 0) && styles.disabled]} onPress={() => { if (!requireFee()) return; call(() => GuestTicketService.bulkGenerate({ eventSlug, entryFeeType, name: allocationName, recipients: validBulk.valid, unassignedQuantity: Number(unassignedQuantity || 0) }), (r) => `Batch ready: ${r.issued} issued and ${r.unassigned} unassigned.`); }}><Ionicons name="cloud-upload-outline" size={19} color="#08111F" /><Text style={styles.primaryText}>Validate and generate batch</Text></TouchableOpacity>
  </>;

  const renderLinks = () => <>
    <Text style={styles.description}>Reserve capacity for a private group. The link contains an opaque secret, not an admission credential.</Text>
    {renderFeePicker()}{input("Allocation name", allocationName, setAllocationName, "e.g. Partner guest list")}{input("Tickets reserved", quantity, setQuantity, "1", { keyboardType: "numeric" })}{input("Expiry (optional ISO date)", expiresAt, setExpiresAt, "2026-12-31T18:00:00Z")}{input("Access password (optional)", password, setPassword, "Optional", { secureTextEntry: true })}
    <TouchableOpacity disabled={submitting} style={[styles.primary, submitting && styles.disabled]} onPress={() => { if (!requireFee()) return; call(() => GuestTicketService.createClaimLink({ eventSlug, entryFeeType, name: allocationName, quantity: Number(quantity), expiresAt: expiresAt || null, password: password || null, recipientRequirements: { name: true, email: true, phone: false } }), (r) => { setShareUrl(r.claimUrl); return "Claim link created. Copy or share it below."; }); }}><Ionicons name="link-outline" size={19} color="#08111F" /><Text style={styles.primaryText}>Create secure claim link</Text></TouchableOpacity>
    {!!shareUrl && <TouchableOpacity style={styles.linkBox} onPress={() => copy(shareUrl)}><Text style={styles.linkText} numberOfLines={1}>{shareUrl}</Text><Ionicons name="copy-outline" color="#67E8F9" size={18} /></TouchableOpacity>}
  </>;

  const renderCodes = () => <>
    <Text style={styles.description}>Codes are randomly generated, hashed at rest, and displayed only at creation. Store the export safely.</Text>
    {renderFeePicker()}{input("Campaign name", allocationName, setAllocationName, "e.g. University giveaway")}{input("Number of codes", quantity, setQuantity, "25", { keyboardType: "numeric" })}{input("Code prefix (optional)", prefix, setPrefix, "MAK")}{input("Expiry (optional ISO date)", expiresAt, setExpiresAt, "2026-12-31T18:00:00Z")}
    <TouchableOpacity disabled={submitting} style={[styles.primary, submitting && styles.disabled]} onPress={() => { if (!requireFee()) return; call(() => GuestTicketService.generateCodes({ eventSlug, entryFeeType, name: allocationName, codeCount: Number(quantity), prefix, expiresAt: expiresAt || null }), (r) => { setGeneratedCodes(r.codes); setShareUrl(r.redeemUrl); return `${r.codes.length} codes generated once. Download or copy them now.`; }); }}><Ionicons name="key-outline" size={19} color="#08111F" /><Text style={styles.primaryText}>Generate redemption codes</Text></TouchableOpacity>
    {!!generatedCodes.length && <View style={styles.codeBox}><Text style={styles.codeText}>{generatedCodes.join("\n")}</Text><TouchableOpacity onPress={() => copy(generatedCodes.join("\n"))}><Text style={styles.smallAction}>Copy codes</Text></TouchableOpacity></View>}
  </>;

  const renderSponsors = () => <>
    <Text style={styles.description}>A sponsor funds the allocation once; beneficiaries then receive tickets at zero cost without creating duplicate revenue.</Text>
    {renderFeePicker()}{input("Campaign name", allocationName, setAllocationName, "e.g. Telecom students")}{input("Sponsored tickets", quantity, setQuantity, "50", { keyboardType: "numeric" })}{input("Sponsor contact", sponsor.name, (value) => setSponsor({ ...sponsor, name: value }), "Full name")}{input("Organisation", sponsor.organisation, (value) => setSponsor({ ...sponsor, organisation: value }), "Company or organisation")}{input("Sponsor email", sponsor.email, (value) => setSponsor({ ...sponsor, email: value }), "finance@example.com", { keyboardType: "email-address", autoCapitalize: "none" })}{input("Sponsor phone", sponsor.phone, (value) => setSponsor({ ...sponsor, phone: value }), "07XXXXXXXX")}
    <View style={styles.chips}>{(["credit_card", "mobile_money"] as const).map((method) => <TouchableOpacity key={method} onPress={() => setSponsor({ ...sponsor, paymentMethod: method })} style={[styles.chip, sponsor.paymentMethod === method && styles.chipActive]}><Text style={[styles.chipText, sponsor.paymentMethod === method && styles.chipTextActive]}>{method === "credit_card" ? "Card" : "Mobile money"}</Text></TouchableOpacity>)}</View>
    <Text style={styles.financialHint}>{selectedFee ? `${Number(quantity || 0)} × ${amount(Number(String(selectedFee.amount).replace(/[^0-9.]/g, "")))}` : "Choose a category"} before existing platform and gateway fees.</Text>
    <TouchableOpacity disabled={submitting} style={[styles.primary, submitting && styles.disabled]} onPress={() => { if (!requireFee()) return; call(() => GuestTicketService.createSponsorship({ eventSlug, entryFeeType, name: allocationName, quantity: Number(quantity), sponsorName: sponsor.name, sponsorOrganisation: sponsor.organisation, sponsorEmail: sponsor.email, sponsorPhone: sponsor.phone, paymentMethod: sponsor.paymentMethod, distributionMethod: "claim_link" }), (r) => { setShareUrl(r.paymentUrl); return "Secure sponsor payment link created. Tickets remain locked until payment is verified."; }); }}><Ionicons name="business-outline" size={19} color="#08111F" /><Text style={styles.primaryText}>Create sponsored allocation</Text></TouchableOpacity>
    {!!shareUrl && <TouchableOpacity style={styles.linkBox} onPress={() => copy(shareUrl)}><Text style={styles.linkText} numberOfLines={1}>{shareUrl}</Text><Ionicons name="copy-outline" color="#67E8F9" size={18} /></TouchableOpacity>}
  </>;

  const guests = overview.guests.filter((guest) => `${guest.buyer_name || ""} ${guest.buyer_email || ""} ${guest.ticket_ref || ""}`.toLowerCase().includes(guestFilter.toLowerCase()));
  const renderGuests = () => <><Text style={styles.description}>Every complimentary and sponsored beneficiary remains in the normal scanner and ticket-delivery system.</Text>{input("Search guests", guestFilter, setGuestFilter, "Name, email, ticket reference")}{guests.length === 0 ? <View style={styles.empty}><Text style={styles.emptyText}>No matching guest tickets.</Text></View> : guests.map((guest) => <View style={styles.row} key={guest.id}><View style={styles.rowGrow}><Text style={styles.rowTitle}>{guest.buyer_name || "Unassigned guest"}</Text><Text style={styles.rowSub}>{guest.entry_fee_type} · {guest.ticket_ref || guest.id.slice(0, 8)} · {guest.funding_type}</Text></View><View style={styles.rowActions}>{guest.buyer_email && <TouchableOpacity onPress={() => call(() => GuestTicketService.resendTicket(eventSlug, guest.id), () => "Ticket delivery queued.")}><Ionicons name="mail-outline" size={19} color="#67E8F9" /></TouchableOpacity>}<TouchableOpacity onPress={() => Alert.alert("Cancel ticket", "This invalidates its QR and frees its capacity. Checked-in tickets cannot be cancelled.", [{ text: "Keep" }, { text: "Cancel ticket", style: "destructive", onPress: () => call(() => GuestTicketService.cancelTicket(eventSlug, guest.id), () => "Ticket cancelled and QR invalidated.") }])}><Ionicons name="close-circle-outline" size={20} color="#FB7185" /></TouchableOpacity></View></View>)}</>;
  const renderReports = () => <><Text style={styles.description}>Face value is tracked for operational reporting and is never treated as collected ticket revenue.</Text><View style={styles.reportCard}><Text style={styles.reportLabel}>Complimentary face value</Text><Text style={styles.reportValue}>{amount(overview.summary.faceValue)}</Text><Text style={styles.reportLabel}>Verified sponsorship revenue</Text><Text style={styles.reportValue}>{amount(overview.summary.sponsorshipRevenue)}</Text><TouchableOpacity style={styles.templateButton} onPress={() => downloadCsv("yovibe-guest-list.csv", [["name", "email", "ticket reference", "category", "funding", "status"], ...overview.guests.map((guest) => [guest.buyer_name || "", guest.buyer_email || "", guest.ticket_ref || "", guest.entry_fee_type || "", guest.funding_type || "", guest.status || ""])])}><Ionicons name="download-outline" size={16} color="#67E8F9" /><Text style={styles.templateText}>Download guest-list CSV</Text></TouchableOpacity><Text style={styles.reportHint}>Exports intentionally omit redemption credentials and sponsor payment details.</Text></View></>;
  const content = { overview: renderOverview, issue: renderIssue, bulk: renderBulk, links: renderLinks, codes: renderCodes, sponsors: renderSponsors, guests: renderGuests, reports: renderReports }[section];

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#67E8F9" /><Text style={styles.loadingText}>Loading Guest Tickets…</Text></View>;
  return <View style={styles.page}><View style={styles.header}><TouchableOpacity onPress={() => goBack()} style={styles.back}><Ionicons name="chevron-back" size={24} color="#E2E8F0" /></TouchableOpacity><View style={styles.headerGrow}><Text style={styles.title}>Guest Tickets</Text><Text style={styles.subtitle}>{event?.name || "Event"}</Text></View><TouchableOpacity onPress={load} style={styles.iconButton}><Ionicons name="refresh-outline" size={20} color="#67E8F9" /></TouchableOpacity></View><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabs}>{sections.map((item) => <TouchableOpacity key={item.key} style={[styles.tab, section === item.key && styles.tabActive]} onPress={() => setSection(item.key)}><Ionicons name={item.icon} size={15} color={section === item.key ? "#08111F" : "#94A3B8"} /><Text style={[styles.tabText, section === item.key && styles.tabTextActive]}>{item.label}</Text></TouchableOpacity>)}</ScrollView><ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>{notice ? <View style={styles.notice}><Ionicons name="checkmark-circle-outline" color="#6EE7B7" size={18} /><Text style={styles.noticeText}>{notice}</Text></View> : null}{shareUrl && section === "overview" ? <TouchableOpacity style={styles.linkBox} onPress={() => copy(shareUrl)}><Text style={styles.linkText} numberOfLines={1}>{shareUrl}</Text><Ionicons name="copy-outline" color="#67E8F9" size={18} /></TouchableOpacity> : null}{content()}</ScrollView></View>;
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#07111F" }, loading: { flex: 1, backgroundColor: "#07111F", alignItems: "center", justifyContent: "center", gap: 12 }, loadingText: { color: "#94A3B8" }, header: { paddingTop: 44, paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderColor: "#163047", flexDirection: "row", alignItems: "center", gap: 10 }, back: { padding: 5 }, headerGrow: { flex: 1 }, title: { color: "#F8FAFC", fontSize: 22, fontWeight: "800" }, subtitle: { color: "#94A3B8", fontSize: 12, marginTop: 2 }, iconButton: { padding: 8 }, tabScroll: { maxHeight: 57, borderBottomWidth: 1, borderColor: "#163047" }, tabs: { paddingHorizontal: 14, alignItems: "center", gap: 8 }, tab: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 18, backgroundColor: "#0D1B2A" }, tabActive: { backgroundColor: "#67E8F9" }, tabText: { color: "#94A3B8", fontWeight: "700", fontSize: 12 }, tabTextActive: { color: "#08111F" }, content: { flex: 1 }, contentInner: { width: "100%", maxWidth: 860, alignSelf: "center", padding: 18, paddingBottom: 80 }, notice: { flexDirection: "row", backgroundColor: "rgba(16,185,129,0.12)", borderWidth: 1, borderColor: "rgba(52,211,153,0.35)", padding: 12, gap: 8, marginBottom: 16 }, noticeText: { color: "#D1FAE5", flex: 1, fontSize: 13, lineHeight: 19 }, metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 }, metric: { width: "31%", minWidth: 155, flexGrow: 1, backgroundColor: "#0D1B2A", borderWidth: 1, borderColor: "#163047", padding: 14 }, metricValue: { color: "#F8FAFC", fontWeight: "800", fontSize: 18, marginTop: 10 }, metricLabel: { color: "#94A3B8", fontSize: 11, marginTop: 4 }, sectionTitle: { color: "#F8FAFC", fontSize: 17, fontWeight: "800", marginBottom: 10 }, row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 13, backgroundColor: "#0D1B2A", borderBottomWidth: 1, borderColor: "#163047" }, rowGrow: { flex: 1, minWidth: 0 }, rowTitle: { color: "#E2E8F0", fontSize: 14, fontWeight: "700" }, rowSub: { color: "#94A3B8", fontSize: 11, marginTop: 4, textTransform: "capitalize" }, rowActions: { flexDirection: "row", gap: 13, alignItems: "center" }, status: { textAlign: "right", fontSize: 10, fontWeight: "800", marginBottom: 8 }, smallAction: { color: "#67E8F9", fontSize: 12, fontWeight: "700", textAlign: "right" }, empty: { alignItems: "center", padding: 35, backgroundColor: "#0D1B2A", borderWidth: 1, borderColor: "#163047" }, emptyTitle: { color: "#E2E8F0", fontSize: 16, fontWeight: "700", marginTop: 10 }, emptyText: { color: "#94A3B8", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 6, maxWidth: 360 }, description: { color: "#94A3B8", fontSize: 13, lineHeight: 20, marginBottom: 20 }, inlineCode: { color: "#67E8F9", fontFamily: "monospace" }, field: { marginBottom: 15 }, label: { color: "#CBD5E1", fontWeight: "700", fontSize: 12, marginBottom: 7 }, input: { backgroundColor: "#0D1B2A", color: "#F8FAFC", borderWidth: 1, borderColor: "#25445D", paddingHorizontal: 13, paddingVertical: 12, minHeight: 45, fontSize: 14 }, multiline: { minHeight: 150 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { backgroundColor: "#0D1B2A", borderWidth: 1, borderColor: "#25445D", paddingHorizontal: 11, paddingVertical: 8, borderRadius: 18 }, chipActive: { backgroundColor: "#67E8F9", borderColor: "#67E8F9" }, chipText: { color: "#CBD5E1", fontSize: 12, fontWeight: "700" }, chipTextActive: { color: "#08111F" }, primary: { minHeight: 48, backgroundColor: "#67E8F9", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 5 }, disabled: { opacity: 0.45 }, primaryText: { color: "#08111F", fontWeight: "800", fontSize: 14 }, validation: { padding: 10, borderWidth: 1, borderColor: "#163047", marginBottom: 14, gap: 3 }, validationGood: { color: "#6EE7B7", fontSize: 12 }, validationBad: { color: "#FDA4AF", fontSize: 12 }, linkBox: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "#10273A", borderWidth: 1, borderColor: "#1E7490", padding: 12, marginTop: 14 }, linkText: { color: "#BAE6FD", flex: 1, fontSize: 12 }, codeBox: { marginTop: 14, padding: 14, backgroundColor: "#0B1726", borderWidth: 1, borderColor: "#25445D" }, codeText: { color: "#E2E8F0", fontFamily: "monospace", lineHeight: 21, marginBottom: 10 }, financialHint: { color: "#FBBF24", fontSize: 12, marginVertical: 13 }, reportCard: { padding: 18, backgroundColor: "#0D1B2A", borderWidth: 1, borderColor: "#163047" }, reportLabel: { color: "#94A3B8", fontSize: 12, marginTop: 5 }, reportValue: { color: "#F8FAFC", fontWeight: "800", fontSize: 22, marginTop: 4, marginBottom: 13 }, reportHint: { color: "#94A3B8", lineHeight: 19, fontSize: 12, marginTop: 8 }, templateButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, borderWidth: 1, borderColor: "#1E7490", paddingHorizontal: 10, paddingVertical: 8, marginBottom: 14 }, templateText: { color: "#67E8F9", fontSize: 12, fontWeight: "700" },
});

export default GuestTicketsScreen;
