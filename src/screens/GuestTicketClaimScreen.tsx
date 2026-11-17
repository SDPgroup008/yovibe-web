import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "../utils/URLRouter";

async function guestRequest(body: Record<string, unknown>) {
  const response = await fetch("/.netlify/functions/guest-ticket-claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to continue");
  return payload;
}

const GuestTicketClaimScreen: React.FC = () => {
  const { currentPath, goBack } = useRouter();
  const parts = currentPath.split("/").filter(Boolean);
  const mode = parts[0] === "redeem" ? "redeem" : "claim";
  const token = mode === "claim" ? parts[1] : "";
  const eventSlug = mode === "redeem" ? parts[1] : "";
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(mode === "claim");
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [code, setCode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [complete, setComplete] = useState<any>(null);
  const idempotencyKey = useRef(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `claim-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (mode !== "claim") return;
    guestRequest({ action: "details", token }).then(setDetails).catch((error) => Alert.alert("Claim unavailable", error.message)).finally(() => setLoading(false));
  }, [mode, token]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const recipient = { name, email, phone };
      const result = mode === "claim"
        ? await guestRequest({ action: "claim", token, recipient, quantity: Number(quantity || 1), password, otp, idempotencyKey: idempotencyKey.current })
        : await guestRequest({ action: "redeem", eventSlug, code, recipient });
      setComplete(result);
    } catch (error: any) { Alert.alert(mode === "claim" ? "Unable to claim" : "Unable to redeem", error?.message || "Please check your details and try again."); }
    finally { setSubmitting(false); }
  };
  const sendOtp = async () => {
    try { await guestRequest({ action: "send_otp", token, email }); Alert.alert("Verification code sent", "Check your email and enter the 6-digit code below."); }
    catch (error: any) { Alert.alert("Unable to send code", error?.message || "Try again shortly."); }
  };
  const field = (label: string, value: string, update: (value: string) => void, placeholder: string, props: any = {}) => <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={update} placeholder={placeholder} placeholderTextColor="#64748B" style={styles.input} {...props} /></View>;

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#67E8F9" /><Text style={styles.muted}>Opening secure claim…</Text></View>;
  if (complete) return <View style={styles.loading}><Ionicons name="checkmark-circle" size={58} color="#34D399" /><Text style={styles.successTitle}>Your ticket is ready</Text><Text style={styles.muted}>Ticket reference{complete.tickets?.length > 1 ? "s" : ""}: {(complete.tickets || []).map((ticket: any) => ticket.ticketRef).join(", ") || (complete.ticketIds || []).length}</Text><Text style={styles.muted}>Your ticket has been sent to the email address provided. Keep the email safe for your QR ticket and PDF.</Text><TouchableOpacity style={styles.primary} onPress={() => goBack()}><Text style={styles.primaryText}>Done</Text></TouchableOpacity></View>;

  const allocation = details?.allocation;
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}><TouchableOpacity onPress={goBack} style={styles.back}><Ionicons name="chevron-back" size={24} color="#E2E8F0" /></TouchableOpacity>{details?.event?.posterUrl && <Image source={{ uri: details.event.posterUrl }} style={styles.poster} />}<Text style={styles.title}>{mode === "claim" ? details?.event?.name || "Claim ticket" : "Redeem your complimentary ticket"}</Text>{mode === "claim" && <Text style={styles.subtitle}>{details?.event?.venueName} · {details?.event?.date ? new Date(details.event.date).toLocaleDateString() : ""}</Text>}{mode === "claim" && <View style={styles.info}><Text style={styles.infoTitle}>{allocation?.name}</Text><Text style={styles.infoText}>{allocation?.category} · Complimentary admission</Text>{allocation?.customMessage ? <Text style={styles.infoText}>{allocation.customMessage}</Text> : null}{allocation?.remaining != null ? <Text style={styles.remaining}>{allocation.remaining} ticket(s) remaining</Text> : null}</View>}{mode === "redeem" && field("Redemption code", code, setCode, "e.g. MAK-8X2K9P7W", { autoCapitalize: "characters" })}{field("Full name", name, setName, "Your full name")}{field("Email", email, setEmail, "you@example.com", { keyboardType: "email-address", autoCapitalize: "none" })}{field("Phone", phone, setPhone, "Optional phone number", { keyboardType: "phone-pad" })}{mode === "claim" && allocation?.requiresPassword && field("Access password", password, setPassword, "Enter password", { secureTextEntry: true })}{mode === "claim" && allocation?.requiresEmailVerification && <><TouchableOpacity style={styles.secondary} onPress={sendOtp}><Ionicons name="mail-outline" size={18} color="#67E8F9" /><Text style={styles.secondaryText}>Send email verification code</Text></TouchableOpacity>{field("Verification code", otp, setOtp, "6-digit code", { keyboardType: "numeric", maxLength: 6 })}</>}{mode === "claim" && <>{field("Tickets", quantity, setQuantity, `Up to ${allocation?.maxPerClaim || 1}`, { keyboardType: "numeric" })}</>}<TouchableOpacity disabled={submitting} style={[styles.primary, submitting && { opacity: 0.5 }]} onPress={submit}>{submitting ? <ActivityIndicator color="#08111F" /> : <Text style={styles.primaryText}>{mode === "claim" ? "Claim complimentary ticket" : "Redeem code"}</Text>}</TouchableOpacity><Text style={styles.privacy}>No YoVibe account is required. Your details are used only to issue and deliver this ticket.</Text></ScrollView>;
};

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: "#07111F" }, content: { width: "100%", maxWidth: 500, alignSelf: "center", padding: 20, paddingBottom: 70 }, loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 13, backgroundColor: "#07111F" }, back: { marginBottom: 15, alignSelf: "flex-start" }, poster: { width: "100%", height: 190, resizeMode: "cover", marginBottom: 18 }, title: { color: "#F8FAFC", fontSize: 25, fontWeight: "800" }, subtitle: { color: "#94A3B8", marginTop: 6, fontSize: 13 }, info: { marginVertical: 20, padding: 15, backgroundColor: "#0D1B2A", borderLeftWidth: 3, borderLeftColor: "#67E8F9" }, infoTitle: { color: "#F8FAFC", fontWeight: "800", fontSize: 16 }, infoText: { color: "#CBD5E1", fontSize: 13, lineHeight: 19, marginTop: 5 }, remaining: { color: "#6EE7B7", fontWeight: "700", fontSize: 12, marginTop: 10 }, field: { marginBottom: 14 }, label: { color: "#CBD5E1", fontSize: 12, fontWeight: "700", marginBottom: 7 }, input: { color: "#F8FAFC", backgroundColor: "#0D1B2A", borderWidth: 1, borderColor: "#25445D", paddingHorizontal: 13, paddingVertical: 12, minHeight: 46 }, primary: { backgroundColor: "#67E8F9", minHeight: 49, alignItems: "center", justifyContent: "center", marginTop: 10, paddingHorizontal: 18 }, primaryText: { color: "#08111F", fontWeight: "800" }, secondary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: "#1E7490", padding: 12, marginBottom: 14 }, secondaryText: { color: "#67E8F9", fontWeight: "700", fontSize: 13 }, muted: { color: "#94A3B8", textAlign: "center", lineHeight: 20, maxWidth: 340 }, successTitle: { color: "#F8FAFC", fontWeight: "800", fontSize: 24 }, privacy: { color: "#64748B", fontSize: 11, lineHeight: 16, marginTop: 18, textAlign: "center" } });
export default GuestTicketClaimScreen;
