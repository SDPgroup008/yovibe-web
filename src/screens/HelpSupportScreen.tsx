import type React from "react"
import { useState } from "react"
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Linking, TextInput, ActivityIndicator, Modal } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../contexts/AuthContext"

const SUPPORT_EMAIL = "reinolmartin0001@gmail.com"
const PHONE_NUMBER = "+256764336256"
const WHATSAPP_NUMBER = "+256764336256"

export default function HelpSupportScreen() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<"faq" | "contact" | "report">("faq")
  const [showContactForm, setShowContactForm] = useState(false)
  const [contactMessage, setContactMessage] = useState("")
  const [contactSubject, setContactSubject] = useState("")
  const [contactLoading, setContactLoading] = useState(false)
  const [reportIssueModal, setReportIssueModal] = useState(false)
  const [reportType, setReportType] = useState("")
  const [reportDescription, setReportDescription] = useState("")
  const [reportLoading, setReportLoading] = useState(false)

  const faqItems = [
    { question: "How do I create an event?", answer: "Go to your Profile, tap 'Add Event', fill in the details (name, date, venue, ticket types), and publish." },
    { question: "How do I purchase tickets?", answer: "Browse events, select one, choose your ticket type and quantity, enter attendee details, and complete payment via mobile money or card." },
    { question: "How do I create a venue profile?", answer: "Sign up as a Club Owner, go to 'My Venues', tap 'Add Venue', and fill in the venue details." },
    { question: "How do I post a vibe for my venue?", answer: "Navigate to your venue and tap 'Add Today's Vibe'. Take or upload a photo and the AI will analyze the atmosphere." },
    { question: "How do I find events near me?", answer: "Use the Events tab to browse upcoming events. You can filter by date and venue." },
    { question: "How do I get notifications?", answer: "Enable notifications in Settings > Notification Settings to control what you're notified about." },
    { question: "Can I edit my profile?", answer: "Go to Profile to change your display name, photo, and other personal information." },
    { question: "How do I delete my account?", answer: "Contact support to request account deletion. This action is permanent." },
  ]

  const openEmailClient = async () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("YoVibe Support Request")}&body=${encodeURIComponent("Hi YoVibe Support Team,\n\nI need assistance with:\n\n[Please describe your issue here]\n\nThank you!")}`
    try { await Linking.openURL(url) } catch { Alert.alert("Error", "Unable to open email client") }
  }

  const openPhone = async () => {
    try { await Linking.openURL(`tel:${PHONE_NUMBER}`) } catch { Alert.alert("Error", "Unable to make phone call") }
  }

  const openWhatsApp = async () => {
    try {
      await Linking.openURL(`whatsapp://send?phone=${WHATSAPP_NUMBER}`)
    } catch {
      try {
        await Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}`)
      } catch {
        Alert.alert("WhatsApp not found", "WhatsApp is not installed on this device")
      }
    }
  }

  const sendContactMessage = async () => {
    if (!contactSubject.trim() || !contactMessage.trim()) { Alert.alert("Error", "Please fill in all fields"); return }
    setContactLoading(true)
    try {
      const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Support Request: ${contactSubject}`)}&body=${encodeURIComponent(`From: ${user?.email}\n\nSubject: ${contactSubject}\n\nMessage:\n${contactMessage}`)}`
      await Linking.openURL(url)
      Alert.alert("Success", "Your message has been sent to our support team")
      setShowContactForm(false); setContactSubject(""); setContactMessage("")
    } catch { Alert.alert("Error", "Failed to send message") }
    finally { setContactLoading(false) }
  }

  const submitIssueReport = async () => {
    if (!reportType || !reportDescription.trim()) { Alert.alert("Error", "Please fill in all fields"); return }
    setReportLoading(true)
    try {
      const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Bug Report: ${reportType}`)}&body=${encodeURIComponent(`Bug Report\n\nType: ${reportType}\nUser Email: ${user?.email}\n\nDescription:\n${reportDescription}`)}`
      await Linking.openURL(url)
      Alert.alert("Thank You", "Your bug report has been submitted. Our team will investigate it shortly.")
      setReportIssueModal(false); setReportType(""); setReportDescription("")
    } catch { Alert.alert("Error", "Failed to submit report") }
    finally { setReportLoading(false) }
  }

  const reportReasons = ["Bug/Technical Issue", "Inappropriate Content", "Fake/Spam Account", "Feature Request", "Other"]

  return (
    <View style={styles.container}>
      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, activeTab === "faq" && styles.activeTab]} onPress={() => setActiveTab("faq")}>
          <Ionicons name="help-circle" size={20} color={activeTab === "faq" ? "#2196F3" : "#666666"} />
          <Text style={[styles.tabText, activeTab === "faq" && styles.activeTabText]}>FAQ</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === "contact" && styles.activeTab]} onPress={() => setActiveTab("contact")}>
          <Ionicons name="call" size={20} color={activeTab === "contact" ? "#2196F3" : "#666666"} />
          <Text style={[styles.tabText, activeTab === "contact" && styles.activeTabText]}>Contact</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === "report" && styles.activeTab]} onPress={() => setActiveTab("report")}>
          <Ionicons name="alert-circle" size={20} color={activeTab === "report" ? "#2196F3" : "#666666"} />
          <Text style={[styles.tabText, activeTab === "report" && styles.activeTabText]}>Report</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.content}>
        {activeTab === "faq" && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
            <Text style={styles.sectionSubtitle}>Find answers to common questions</Text>
            {faqItems.map((item, i) => <FAQItem key={i} question={item.question} answer={item.answer} />)}
          </View>
        )}

        {activeTab === "contact" && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionTitle}>Get in Touch</Text>
            <Text style={styles.sectionSubtitle}>We're here to help</Text>
            <ContactOption icon="mail" title="Email Support" desc="Send us an email with your inquiry" action={openEmailClient} />
            <ContactOption icon="call" title="Call Support" desc="Speak directly with our support team" action={openPhone} />
            <ContactOption icon="chatbubbles" title="Live WhatsApp Chat" desc="Chat with support team in real-time" action={openWhatsApp} />
            <ContactOption icon="help-circle" title="FAQ & Docs" desc="Browse frequently asked questions" action={() => Alert.alert("Help Center", "Visit our full help documentation")} />
            <TouchableOpacity style={styles.sendMessageButton} onPress={() => setShowContactForm(true)}>
              <Ionicons name="mail" size={20} color="#FFFFFF" /><Text style={styles.sendMessageButtonText}>Send Message</Text>
            </TouchableOpacity>
            <View style={styles.supportEmailContainer}>
              <Ionicons name="information-circle" size={20} color="#2196F3" />
              <Text style={styles.supportEmailText}>Support Email: <Text style={{ fontWeight: "bold", color: "#2196F3" }}>{SUPPORT_EMAIL}</Text></Text>
            </View>
          </View>
        )}

        {activeTab === "report" && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionTitle}>Report an Issue</Text>
            <Text style={styles.sectionSubtitle}>Help us improve YoVibe</Text>
            <View style={styles.reportContainer}>
              <Text style={styles.reportDescription}>Found a bug or have an issue with the app? Let us know and our team will investigate it immediately.</Text>
              <TouchableOpacity style={styles.reportButton} onPress={() => setReportIssueModal(true)}>
                <Ionicons name="bug" size={20} color="#FFFFFF" /><Text style={styles.reportButtonText}>Report Issue</Text>
              </TouchableOpacity>
              <View style={styles.reportInfo}>
                <Ionicons name="shield-checkmark" size={20} color="#4CAF50" />
                <Text style={styles.reportInfoText}>All reports are reviewed by our team within 24 hours. Thank you for helping us improve YoVibe!</Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={showContactForm} transparent animationType="slide" onRequestClose={() => setShowContactForm(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>Send Message</Text><TouchableOpacity onPress={() => setShowContactForm(false)}><Ionicons name="close" size={28} color="#FFFFFF" /></TouchableOpacity></View>
            <TextInput style={styles.input} placeholder="Subject" placeholderTextColor="#666666" value={contactSubject} onChangeText={setContactSubject} />
            <TextInput style={[styles.input, styles.messageInput]} placeholder="Message" placeholderTextColor="#666666" value={contactMessage} onChangeText={setContactMessage} multiline numberOfLines={6} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setShowContactForm(false)} disabled={contactLoading}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.sendButton, contactLoading && { opacity: 0.6 }]} onPress={sendContactMessage} disabled={contactLoading}>
                {contactLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.sendButtonText}>Send</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={reportIssueModal} transparent animationType="slide" onRequestClose={() => setReportIssueModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>Report Bug</Text><TouchableOpacity onPress={() => setReportIssueModal(false)}><Ionicons name="close" size={28} color="#FFFFFF" /></TouchableOpacity></View>
            <Text style={styles.inputLabel}>Issue Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {reportReasons.map((reason) => (
                <TouchableOpacity key={reason} style={[styles.reasonButton, reportType === reason && styles.reasonButtonActive]} onPress={() => setReportType(reason)}>
                  <Text style={[styles.reasonButtonText, reportType === reason && styles.reasonButtonTextActive]}>{reason}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.inputLabel}>Description</Text>
            <TextInput style={[styles.input, styles.messageInput]} placeholder="Describe the issue in detail" placeholderTextColor="#666666" value={reportDescription} onChangeText={setReportDescription} multiline numberOfLines={6} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setReportIssueModal(false)} disabled={reportLoading}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.sendButton, reportLoading && { opacity: 0.6 }]} onPress={submitIssueReport} disabled={reportLoading}>
                {reportLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.sendButtonText}>Submit</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <View style={styles.faqItem}>
      <TouchableOpacity style={styles.faqQuestion} onPress={() => setExpanded(!expanded)}>
        <View style={styles.faqQuestionContent}>
          <Ionicons name={expanded ? "chevron-down" : "chevron-forward"} size={24} color="#2196F3" />
          <Text style={styles.faqQuestionText}>{question}</Text>
        </View>
      </TouchableOpacity>
      {expanded && <View style={styles.faqAnswer}><Text style={styles.faqAnswerText}>{answer}</Text></View>}
    </View>
  )
}

function ContactOption({ icon, title, desc, action }: { icon: string; title: string; desc: string; action: () => void }) {
  return (
    <TouchableOpacity style={styles.contactOption} onPress={action}>
      <View style={styles.contactOptionIcon}><Ionicons name={icon as any} size={24} color="#2196F3" /></View>
      <View style={styles.contactOptionText}><Text style={styles.contactOptionTitle}>{title}</Text><Text style={styles.contactOptionDescription}>{desc}</Text></View>
      <Ionicons name="chevron-forward" size={24} color="#666666" />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212" },
  tabContainer: { flexDirection: "row", backgroundColor: "#1E1E1E", borderBottomWidth: 1, borderBottomColor: "#333" },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: "transparent" },
  activeTab: { borderBottomColor: "#2196F3" },
  tabText: { marginLeft: 8, fontSize: 14, fontWeight: "600", color: "#666666" },
  activeTabText: { color: "#2196F3" },
  content: { flex: 1 },
  tabContent: { padding: 16 },
  sectionTitle: { fontSize: 22, fontWeight: "bold", color: "#FFFFFF", marginBottom: 8 },
  sectionSubtitle: { fontSize: 14, color: "#999999", marginBottom: 20 },
  faqItem: { backgroundColor: "#1E1E1E", borderRadius: 8, marginBottom: 12, overflow: "hidden" },
  faqQuestion: { padding: 16 },
  faqQuestionContent: { flexDirection: "row", alignItems: "center" },
  faqQuestionText: { flex: 1, fontSize: 15, fontWeight: "600", color: "#FFFFFF", marginLeft: 12 },
  faqAnswer: { backgroundColor: "#252525", padding: 16, borderTopWidth: 1, borderTopColor: "#333" },
  faqAnswerText: { fontSize: 14, color: "#CCCCCC", lineHeight: 22 },
  contactOption: { flexDirection: "row", alignItems: "center", backgroundColor: "#1E1E1E", padding: 16, borderRadius: 8, marginBottom: 12 },
  contactOptionIcon: { width: 50, height: 50, borderRadius: 8, backgroundColor: "#252525", justifyContent: "center", alignItems: "center", marginRight: 12 },
  contactOptionText: { flex: 1 },
  contactOptionTitle: { fontSize: 16, fontWeight: "600", color: "#FFFFFF", marginBottom: 4 },
  contactOptionDescription: { fontSize: 13, color: "#999999" },
  sendMessageButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#2196F3", padding: 16, borderRadius: 8, marginTop: 20, marginBottom: 20, gap: 8 },
  sendMessageButtonText: { fontSize: 16, fontWeight: "bold", color: "#FFFFFF" },
  supportEmailContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#1E1E1E", padding: 16, borderRadius: 8, marginBottom: 20, gap: 12 },
  supportEmailText: { fontSize: 14, color: "#FFFFFF", flex: 1 },
  reportContainer: { backgroundColor: "#1E1E1E", borderRadius: 8, padding: 20 },
  reportDescription: { fontSize: 14, color: "#CCCCCC", marginBottom: 20, lineHeight: 22 },
  reportButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#FF3B30", padding: 16, borderRadius: 8, marginBottom: 20, gap: 8 },
  reportButtonText: { fontSize: 16, fontWeight: "bold", color: "#FFFFFF" },
  reportInfo: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#252525", padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: "#4CAF50", gap: 12 },
  reportInfoText: { fontSize: 13, color: "#CCCCCC", flex: 1, lineHeight: 20 },
  modalContainer: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" },
  modalContent: { backgroundColor: "#1E1E1E", borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 32, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#FFFFFF" },
  inputLabel: { fontSize: 14, fontWeight: "600", color: "#FFFFFF", marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: "#121212", borderWidth: 1, borderColor: "#333", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: "#FFFFFF", marginBottom: 12 },
  messageInput: { textAlignVertical: "top", paddingTop: 12, minHeight: 120 },
  reasonButton: { backgroundColor: "#121212", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#333", marginRight: 8 },
  reasonButtonActive: { borderColor: "#2196F3", backgroundColor: "#2196F3" },
  reasonButtonText: { fontSize: 12, color: "#999999", fontWeight: "500" },
  reasonButtonTextActive: { color: "#FFFFFF" },
  modalButtons: { flexDirection: "row", justifyContent: "space-between", marginTop: 20, gap: 16 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  cancelButton: { backgroundColor: "#333" },
  cancelButtonText: { color: "#FFFFFF", fontWeight: "bold" },
  sendButton: { backgroundColor: "#2196F3" },
  sendButtonText: { color: "#FFFFFF", fontWeight: "bold" },
})
