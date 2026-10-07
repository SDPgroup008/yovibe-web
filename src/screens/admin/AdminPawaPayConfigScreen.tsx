import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { supabase } from "../../config/supabase"
import { useAuth } from "../../contexts/AuthContext"
import { COLORS, useDeviceType } from "../../utils/ResponsiveDesign"
import type { AdminPawaPayConfigScreenProps } from "../../navigation/types"

type Operation = {
  type: string
  status: string | null
  minTransactionLimit: string | number | null
  maxTransactionLimit: string | number | null
  decimalsInAmount: string | null
  authType: string | null
  pinPrompt: string | null
  pinPromptRevivable: boolean | null
}

type Configuration = {
  companyName: string | null
  signedRequestsOnly: boolean
  signedCallbacks: boolean
  countries: Array<{
    country: string
    displayName: string | null
    prefix: string | null
    providers: Array<{
      provider: string
      displayName: string | null
      currencies: Array<{ currency: string; operations: Operation[] }>
    }>
  }>
}

const formatLimit = (value: string | number | null) => {
  if (value === null || value === undefined || value === "") return "—"
  return String(value)
}

const statusColor = (status: string | null) => {
  const normalized = String(status || "").toUpperCase()
  if (normalized === "OPERATIONAL") return "#22C55E"
  if (normalized === "DELAYED") return "#F59E0B"
  if (normalized === "CLOSED") return "#EF4444"
  return "#94A3B8"
}

const AdminPawaPayConfigScreen: React.FC<AdminPawaPayConfigScreenProps> = ({ navigation }) => {
  const { user } = useAuth()
  const { isLargeScreen } = useDeviceType()
  const [configuration, setConfiguration] = useState<Configuration | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [countryQuery, setCountryQuery] = useState("")

  const filteredCountries = useMemo(() => {
    const query = countryQuery.trim().toLowerCase()
    if (!configuration || !query) return []
    return configuration.countries.filter((country) =>
      [country.displayName, country.country]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    )
  }, [configuration, countryQuery])

  const loadConfiguration = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.")

      const response = await fetch("/.netlify/functions/pawapay-active-config", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || `Unable to load active configuration (${response.status})`)
      setConfiguration(payload as Configuration)
    } catch (loadError: any) {
      const message = loadError?.message || "Unable to load pawaPay active configuration"
      setError(message)
      if (!isRefresh) Alert.alert("Unable to load configuration", message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (user?.userType !== "admin") {
      Alert.alert("Access Denied", "You don't have permission to access this page")
      navigation.goBack()
      return
    }
    loadConfiguration()
  }, [loadConfiguration, navigation, user?.userType])

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, isLargeScreen && styles.desktopContent]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadConfiguration(true)} tintColor={COLORS.primary} />}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>pawaPay Active Configuration</Text>
          <Text style={styles.subtitle}>Provider limits and supported payment operations currently configured for YoVibe.</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={() => loadConfiguration(true)} disabled={refreshing}>
          <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorCard}>
          <Ionicons name="warning-outline" size={20} color="#FCA5A5" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {configuration && (
        <>
          <View style={styles.accountCard}>
            <Text style={styles.sectionTitle}>Account configuration</Text>
            <Text style={styles.companyName}>{configuration.companyName || "Company name not provided"}</Text>
            <View style={styles.badgeRow}>
              <Text style={styles.badge}>{configuration.signedRequestsOnly ? "Signed requests only" : "Unsigned requests allowed"}</Text>
              <Text style={styles.badge}>{configuration.signedCallbacks ? "Signed callbacks enabled" : "Unsigned callbacks"}</Text>
            </View>
          </View>

          <View style={styles.searchCard}>
            <Text style={styles.sectionTitle}>Find a country</Text>
            <TextInput
              value={countryQuery}
              onChangeText={setCountryQuery}
              placeholder="Type a country name or ISO code"
              placeholderTextColor="#64748B"
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="search"
              style={styles.searchInput}
              accessibilityLabel="Search pawaPay countries"
            />
            <Text style={styles.searchHint}>
              {configuration.countries.length === 0
                ? "No active countries or providers were returned."
                : countryQuery.trim()
                  ? `${filteredCountries.length} matching country${filteredCountries.length === 1 ? "" : "ies"}`
                  : "Enter a country to view its providers, currencies, and limits."}
            </Text>
          </View>

          {configuration.countries.length === 0 ? null : !countryQuery.trim() ? (
            <View style={styles.emptyCard}><Text style={styles.muted}>Country results will appear here after you search.</Text></View>
          ) : filteredCountries.length === 0 ? (
            <View style={styles.emptyCard}><Text style={styles.muted}>No country matched “{countryQuery.trim()}”. Try the country name or three-letter ISO code.</Text></View>
          ) : filteredCountries.map((country) => (
            <View key={country.country} style={styles.countryCard}>
              <View style={styles.countryHeader}>
                <Text style={styles.countryTitle}>{country.displayName || country.country}</Text>
                <Text style={styles.countryCode}>{country.country}{country.prefix ? ` · +${country.prefix}` : ""}</Text>
              </View>
              {country.providers.map((provider) => (
                <View key={`${country.country}-${provider.provider}`} style={styles.providerBlock}>
                  <Text style={styles.providerTitle}>{provider.displayName || provider.provider}</Text>
                  <Text style={styles.providerCode}>{provider.provider}</Text>
                  {provider.currencies.map((currency) => (
                    <View key={`${provider.provider}-${currency.currency}`} style={styles.currencyBlock}>
                      <Text style={styles.currencyTitle}>{currency.currency}</Text>
                      {currency.operations.map((operation) => (
                        <View key={`${currency.currency}-${operation.type}`} style={styles.operationRow}>
                          <View style={styles.operationHeading}>
                            <Text style={styles.operationType}>{operation.type.replaceAll("_", " ")}</Text>
                            <Text style={[styles.status, { color: statusColor(operation.status) }]}>{operation.status || "UNKNOWN"}</Text>
                          </View>
                          <View style={styles.limitGrid}>
                            <View style={styles.limitItem}><Text style={styles.limitLabel}>Minimum</Text><Text style={styles.limitValue}>{formatLimit(operation.minTransactionLimit)}</Text></View>
                            <View style={styles.limitItem}><Text style={styles.limitLabel}>Maximum</Text><Text style={styles.limitValue}>{formatLimit(operation.maxTransactionLimit)}</Text></View>
                            <View style={styles.limitItem}><Text style={styles.limitLabel}>Decimals</Text><Text style={styles.limitValue}>{operation.decimalsInAmount || "—"}</Text></View>
                          </View>
                          {(operation.authType || operation.pinPrompt) && (
                            <Text style={styles.operationMeta}>Authorization: {operation.authType || "—"}{operation.pinPrompt ? ` · PIN prompt: ${operation.pinPrompt}` : ""}</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#07111F" },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  desktopContent: { maxWidth: 1180, width: "100%", alignSelf: "center", padding: 28 },
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center", backgroundColor: "#07111F" },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  headerCopy: { flex: 1 },
  title: { color: "#FFFFFF", fontSize: 24, fontWeight: "800" },
  subtitle: { color: "#94A3B8", marginTop: 6, lineHeight: 20 },
  refreshButton: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  refreshText: { color: "#FFFFFF", fontWeight: "700" },
  errorCard: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: "#451A1A", borderColor: "#7F1D1D", borderWidth: 1, borderRadius: 10, padding: 12 },
  errorText: { color: "#FCA5A5", flex: 1 },
  accountCard: { backgroundColor: "#0F2035", borderColor: "#1E3A56", borderWidth: 1, borderRadius: 12, padding: 16 },
  searchCard: { backgroundColor: "#0F2035", borderColor: "#1E3A56", borderWidth: 1, borderRadius: 12, padding: 16 },
  sectionTitle: { color: "#CBD5E1", fontSize: 13, textTransform: "uppercase", letterSpacing: 1, fontWeight: "700" },
  companyName: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", marginTop: 8 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  badge: { color: "#BAE6FD", backgroundColor: "#164E63", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, fontSize: 12 },
  searchInput: { marginTop: 10, borderWidth: 1, borderColor: "#2E4B68", borderRadius: 9, backgroundColor: "#081525", color: "#FFFFFF", paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  searchHint: { color: "#94A3B8", marginTop: 8, fontSize: 12 },
  countryCard: { backgroundColor: "#0B1728", borderColor: "#20344D", borderWidth: 1, borderRadius: 12, padding: 16 },
  countryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomColor: "#20344D", borderBottomWidth: 1, paddingBottom: 10, marginBottom: 10 },
  countryTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  countryCode: { color: "#7DD3FC", fontSize: 12, fontWeight: "700" },
  providerBlock: { marginTop: 8 },
  providerTitle: { color: "#E2E8F0", fontSize: 15, fontWeight: "700" },
  providerCode: { color: "#64748B", fontSize: 11, marginTop: 2 },
  currencyBlock: { marginTop: 10, backgroundColor: "#111F33", borderRadius: 9, padding: 10 },
  currencyTitle: { color: "#67E8F9", fontWeight: "800", marginBottom: 6 },
  operationRow: { borderTopColor: "#263B55", borderTopWidth: 1, paddingVertical: 10 },
  operationHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  operationType: { color: "#FFFFFF", fontWeight: "700", textTransform: "capitalize" },
  status: { fontSize: 12, fontWeight: "800" },
  limitGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  limitItem: { backgroundColor: "#172941", borderRadius: 7, padding: 8, minWidth: 92 },
  limitLabel: { color: "#94A3B8", fontSize: 11 },
  limitValue: { color: "#FFFFFF", fontWeight: "800", marginTop: 3 },
  operationMeta: { color: "#94A3B8", fontSize: 12, marginTop: 8 },
  emptyCard: { backgroundColor: "#0F2035", borderRadius: 10, padding: 16 },
  muted: { color: "#94A3B8" },
})

export default AdminPawaPayConfigScreen
