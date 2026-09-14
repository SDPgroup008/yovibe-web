import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import GuestRefundService from '../services/GuestRefundService'
import { useRouter } from '../utils/URLRouter'

export default function GuestRefundScreen() {
  const { navigate } = useRouter()
  const token = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('token') || ''
  }, [])
  const [ticketRef, setTicketRef] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [reference, setReference] = useState('')

  useEffect(() => {
    // Keep the bearer token out of browser history, referrers, screenshots,
    // and copied URLs after this page has captured it in memory.
    if (token && typeof window !== 'undefined') window.history.replaceState(null, '', '/refund-request')
  }, [token])

  const requestAccess = async () => {
    if (!ticketRef.trim() || !email.trim()) {
      setError('Enter the ticket reference and purchase email.')
      return
    }
    setLoading(true); setError(''); setMessage('')
    try {
      const result = await GuestRefundService.requestAccess(ticketRef.trim(), email.trim())
      setMessage(result.message)
    } catch (requestError: any) {
      setError(requestError.message || 'Unable to request a refund link.')
    } finally {
      setLoading(false)
    }
  }

  const submitRequest = async () => {
    setLoading(true); setError(''); setMessage('')
    try {
      const result = await GuestRefundService.submit(token, note)
      setMessage(result.message)
      setReference(result.reference || '')
    } catch (submitError: any) {
      setError(submitError.message || 'Unable to submit the refund request.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <View style={styles.iconCircle}><Ionicons name="return-down-back" size={28} color="#FFFFFF" /></View>
        <Text style={styles.title}>Request a refund</Text>
        <Text style={styles.subtitle}>
          Refunds are available only when an event is cancelled or postponed. Every request is reviewed by an administrator.
        </Text>

        {reference ? (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={28} color="#4ADE80" />
            <Text style={styles.successTitle}>Request received</Text>
            <Text style={styles.infoText}>{message}</Text>
            <Text style={styles.reference}>Reference: {reference}</Text>
          </View>
        ) : token ? (
          <>
            <View style={styles.infoBox}>
              <Ionicons name="shield-checkmark" size={22} color="#60A5FA" />
              <Text style={styles.infoText}>Your order email has been verified. Confirm the request below.</Text>
            </View>
            <Text style={styles.label}>Optional note</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add information for the refund reviewer"
              placeholderTextColor="#737373"
              style={[styles.input, styles.note]}
              multiline
              maxLength={1000}
              editable={!loading}
            />
            <TouchableOpacity style={[styles.primaryButton, loading && styles.disabled]} onPress={submitRequest} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Submit for admin review</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.label}>Ticket reference</Text>
            <TextInput
              value={ticketRef}
              onChangeText={setTicketRef}
              placeholder="For example, YV-ABC123"
              placeholderTextColor="#737373"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={64}
              style={styles.input}
              editable={!loading}
            />
            <Text style={styles.label}>Purchase email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email used for the order"
              placeholderTextColor="#737373"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              maxLength={254}
              style={styles.input}
              editable={!loading}
            />
            <TouchableOpacity style={[styles.primaryButton, loading && styles.disabled]} onPress={requestAccess} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Email secure refund link</Text>}
            </TouchableOpacity>
          </>
        )}

        {!!message && !reference && <View style={styles.successBox}><Text style={styles.infoText}>{message}</Text></View>}
        {!!error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

        <Text style={styles.securityText}>
          For your security, the link is sent only to the email stored on the order and expires after 15 minutes. We never confirm whether an order exists on this page.
        </Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigate('/login')}>
          <Text style={styles.secondaryText}>Have an account? Sign in</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101010' },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 560, backgroundColor: '#1B1B1B', borderRadius: 18, borderWidth: 1, borderColor: '#303030', padding: 24 },
  iconCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#B8B8B8', fontSize: 15, lineHeight: 22, marginBottom: 24 },
  label: { color: '#E5E5E5', fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: { color: '#FFFFFF', backgroundColor: '#111111', borderWidth: 1, borderColor: '#3A3A3A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 17 },
  note: { minHeight: 110, textAlignVertical: 'top' },
  primaryButton: { minHeight: 50, borderRadius: 10, backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  disabled: { opacity: 0.55 },
  infoBox: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#172033', borderRadius: 10, padding: 14, marginBottom: 20 },
  successBox: { backgroundColor: '#153320', borderRadius: 10, padding: 14, marginTop: 18 },
  successTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 18, marginTop: 8, marginBottom: 4 },
  infoText: { color: '#D4D4D4', fontSize: 14, lineHeight: 20, flexShrink: 1 },
  reference: { color: '#86EFAC', fontFamily: 'monospace', marginTop: 10, fontWeight: '700' },
  errorBox: { backgroundColor: '#3A1717', borderRadius: 10, padding: 14, marginTop: 18 },
  errorText: { color: '#FCA5A5', fontSize: 14 },
  securityText: { color: '#858585', fontSize: 12, lineHeight: 18, marginTop: 22 },
  secondaryButton: { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
  secondaryText: { color: '#60A5FA', fontWeight: '700' },
})
