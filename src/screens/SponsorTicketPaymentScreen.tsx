import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "../utils/URLRouter";

async function request(body: Record<string, unknown>) {
  const response = await fetch("/.netlify/functions/sponsor-ticket-payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to continue payment");
  return payload;
}

const SponsorTicketPaymentScreen: React.FC = () => {
  const { currentPath, goBack } = useRouter();
  const token = currentPath.split("/").filter(Boolean)[2] || "";
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"credit_card" | "mobile_money" | null>(null);
  const [mobileNumber, setMobileNumber] = useState("");
  const load = useCallback(async (status = false) => {
    try {
      const result = await request({ action: status ? "status" : "details", token });
      setDetails(result);
      if (result?.order?.paymentMethod) setSelectedPaymentMethod(result.order.paymentMethod);
      if (result?.order?.sponsorPhone) setMobileNumber((current) => current || result.order.sponsorPhone);
      return result;
    }
    catch (error: any) { setMessage(error?.message || "Unable to load sponsor payment."); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (details?.order?.paymentStatus !== "processing") return;
    const timer = setInterval(() => load(true), 5000);
    return () => clearInterval(timer);
  }, [details?.order?.paymentStatus, load]);
  const pay = async (paymentMethod: "credit_card" | "mobile_money", provider?: string) => {
    setPaying(true); setMessage("");
    try {
      const result = await request({ action: "initiate", token, paymentMethod, provider, phoneNumber: mobileNumber });
      if (result.iframeUrl && typeof window !== "undefined") { window.location.assign(result.iframeUrl); return; }
      setMessage("Payment prompt sent. Approve it on your phone; this page will update automatically.");
      await load(true);
    } catch (error: any) { setMessage(error?.message || "Unable to initiate payment."); }
    finally { setPaying(false); }
  };
  if (loading) return <View style={styles.center}><ActivityIndicator color="#67E8F9" /></View>;
  const order = details?.order;
  const allocation = details?.allocation;
  const paid = order?.paymentStatus === "paid";
  const processing = order?.paymentStatus === "processing";
  const paymentQuote = selectedPaymentMethod ? order?.paymentOptions?.[selectedPaymentMethod] : null;

  const renderPaymentActions = () => {
    if (processing) return <View style={styles.processing}><ActivityIndicator color="#67E8F9" /><Text style={styles.processingText}>Your payment is being verified. This page updates automatically.</Text></View>;
    if (!selectedPaymentMethod) return <View style={styles.paymentOptions}>
      <Text style={styles.prompt}>Choose how you would like to pay.</Text>
      <TouchableOpacity style={styles.primary} onPress={() => setSelectedPaymentMethod("credit_card")}><Ionicons name="card-outline" size={20} color="#08111F" /><Text style={styles.primaryText}>Pay by card</Text></TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={() => setSelectedPaymentMethod("mobile_money")}><Ionicons name="phone-portrait-outline" size={20} color="#67E8F9" /><Text style={styles.secondaryText}>Pay with mobile money</Text></TouchableOpacity>
    </View>;
    if (selectedPaymentMethod === "credit_card") return <View style={styles.paymentOptions}>
      <Text style={styles.prompt}>Card payment total</Text>
      <Text style={styles.quote}>{order?.currency || "UGX"} {Number(paymentQuote?.total || 0).toLocaleString()}</Text>
      <Text style={styles.feeNote}>Includes gateway fee of {order?.currency || "UGX"} {Number(paymentQuote?.gatewayFee || 0).toLocaleString()}.</Text>
      <TouchableOpacity disabled={paying} style={styles.primary} onPress={() => pay("credit_card")}>{paying ? <ActivityIndicator color="#08111F" /> : <Text style={styles.primaryText}>Continue to secure card payment</Text>}</TouchableOpacity>
      <TouchableOpacity disabled={paying} style={styles.changeMethod} onPress={() => setSelectedPaymentMethod(null)}><Text style={styles.changeMethodText}>Choose a different method</Text></TouchableOpacity>
    </View>;
    return <View style={styles.paymentOptions}>
      <Text style={styles.prompt}>Mobile-money payment total</Text>
      <Text style={styles.quote}>{order?.currency || "UGX"} {Number(paymentQuote?.total || 0).toLocaleString()}</Text>
      <Text style={styles.feeNote}>Includes gateway fee of {order?.currency || "UGX"} {Number(paymentQuote?.gatewayFee || 0).toLocaleString()}.</Text>
      <TextInput value={mobileNumber} onChangeText={setMobileNumber} placeholder="Mobile-money number" placeholderTextColor="#64748B" keyboardType="phone-pad" style={styles.phoneInput} />
      <TouchableOpacity disabled={paying} style={styles.primary} onPress={() => pay("mobile_money", "MTN_MOMO_UGA")}>{paying ? <ActivityIndicator color="#08111F" /> : <Text style={styles.primaryText}>Pay with MTN MoMo</Text>}</TouchableOpacity>
      <TouchableOpacity disabled={paying} style={styles.secondary} onPress={() => pay("mobile_money", "AIRTEL_OAPI_UGA")}><Text style={styles.secondaryText}>Pay with Airtel Money</Text></TouchableOpacity>
      <TouchableOpacity disabled={paying} style={styles.changeMethod} onPress={() => setSelectedPaymentMethod(null)}><Text style={styles.changeMethodText}>Choose a different method</Text></TouchableOpacity>
    </View>;
  };

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <TouchableOpacity style={styles.back} onPress={goBack}><Ionicons name="chevron-back" size={24} color="#E2E8F0" /></TouchableOpacity>
    {allocation?.event?.poster_image_url ? <Image source={{ uri: allocation.event.poster_image_url }} style={styles.poster} /> : null}
    <Text style={styles.title}>{paid ? "Sponsorship funded" : "Fund sponsored tickets"}</Text>
    <Text style={styles.subtitle}>{allocation?.event?.name} · {allocation?.ticketType}</Text>
    <View style={styles.card}>
      <Text style={styles.name}>{allocation?.name}</Text>
      <Text style={styles.line}>{allocation?.quantity} sponsored ticket{Number(allocation?.quantity) === 1 ? "" : "s"}</Text>
      <Text style={styles.amount}>{order?.currency || "UGX"} {Number(paymentQuote?.total ?? order?.amount ?? 0).toLocaleString()}</Text>
      <Text style={styles.line}>Sponsor: {order?.sponsorOrganisation || order?.sponsorName}</Text>
      <View style={[styles.status, paid && styles.statusPaid]}><Text style={[styles.statusText, paid && styles.statusTextPaid]}>{String(order?.paymentStatus || "pending_payment").replace(/_/g, " ").toUpperCase()}</Text></View>
    </View>
    {message ? <Text style={styles.message}>{message}</Text> : null}
    {paid ? <View style={styles.success}><Ionicons name="checkmark-circle" size={26} color="#34D399" /><Text style={styles.successText}>The allocation is ready for the organiser to distribute. Beneficiaries will never be asked to pay.</Text></View> : renderPaymentActions()}
    <Text style={styles.disclaimer}>YoVibe verifies payment directly with the payment gateway before any sponsored tickets can be issued.</Text>
  </ScrollView>;
};

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: "#07111F" }, content: { width: "100%", maxWidth: 500, alignSelf: "center", padding: 20, paddingBottom: 70 }, center: { flex: 1, backgroundColor: "#07111F", alignItems: "center", justifyContent: "center" }, back: { alignSelf: "flex-start", marginBottom: 14 }, poster: { height: 170, width: "100%", resizeMode: "cover", marginBottom: 18 }, title: { color: "#F8FAFC", fontSize: 25, fontWeight: "800" }, subtitle: { color: "#94A3B8", marginTop: 5 }, card: { backgroundColor: "#0D1B2A", borderWidth: 1, borderColor: "#25445D", padding: 18, marginTop: 22 }, name: { color: "#F8FAFC", fontWeight: "800", fontSize: 17 }, line: { color: "#CBD5E1", marginTop: 8, fontSize: 13 }, amount: { color: "#67E8F9", fontSize: 28, fontWeight: "800", marginVertical: 14 }, status: { alignSelf: "flex-start", marginTop: 16, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: "rgba(251,191,36,0.14)" }, statusPaid: { backgroundColor: "rgba(52,211,153,0.14)" }, statusText: { color: "#FBBF24", fontWeight: "800", fontSize: 10 }, statusTextPaid: { color: "#34D399" }, paymentOptions: { marginTop: 2 }, primary: { minHeight: 49, marginTop: 18, backgroundColor: "#67E8F9", justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 8 }, primaryText: { color: "#08111F", fontWeight: "800" }, secondary: { minHeight: 49, marginTop: 10, borderWidth: 1, borderColor: "#1E7490", justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 8 }, secondaryText: { color: "#67E8F9", fontWeight: "800" }, prompt: { color: "#CBD5E1", lineHeight: 19, marginTop: 19 }, quote: { color: "#67E8F9", fontSize: 24, fontWeight: "800", marginTop: 6 }, feeNote: { color: "#94A3B8", fontSize: 12, lineHeight: 18, marginTop: 4 }, phoneInput: { minHeight: 48, marginTop: 16, borderWidth: 1, borderColor: "#25445D", backgroundColor: "#0D1B2A", color: "#F8FAFC", paddingHorizontal: 13 }, changeMethod: { alignSelf: "center", paddingVertical: 13, paddingHorizontal: 8 }, changeMethodText: { color: "#67E8F9", fontSize: 12, fontWeight: "700" }, processing: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 22, padding: 14, backgroundColor: "rgba(103,232,249,0.08)", borderWidth: 1, borderColor: "rgba(103,232,249,0.25)" }, processingText: { color: "#CFFAFE", flex: 1, fontSize: 13, lineHeight: 19 }, message: { color: "#FBBF24", lineHeight: 19, marginTop: 16 }, success: { flexDirection: "row", gap: 10, marginTop: 20, alignItems: "flex-start" }, successText: { flex: 1, color: "#BBF7D0", lineHeight: 20 }, disclaimer: { color: "#64748B", fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 22 } });
export default SponsorTicketPaymentScreen;
