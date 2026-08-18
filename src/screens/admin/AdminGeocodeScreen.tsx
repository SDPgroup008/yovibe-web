"use client"

import React, { useCallback, useEffect, useState } from "react"
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Switch,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { supabase } from "../../config/supabase"
import { useAuth } from "../../contexts/AuthContext"
import type { AdminGeocodeScreenProps } from "../../navigation/types"

const FUNC_URL = "/.netlify/functions/geocode-venues"
const BACKGROUND_LIMIT = 500

interface GeocodeStats {
  total: number
  missing: number
  withCoords: number
}

interface MissingVenue {
  id: string
  name: string
  location: string
}

interface ResultSummary {
  ok?: boolean
  dryRun?: boolean
  mode?: string
  limit?: number
  scanned?: number
  missing?: number
  attempted?: number
  geocoded?: number
  failed?: string[]
  remaining?: number
  tip?: string
  error?: string
}

const AdminGeocodeScreen: React.FC<AdminGeocodeScreenProps> = ({ navigation }) => {
  const { user } = useAuth()
  const [stats, setStats] = useState<GeocodeStats | null>(null)
  const [missingVenues, setMissingVenues] = useState<MissingVenue[]>([])
  const [loadingStats, setLoadingStats] = useState(true)
  const [running, setRunning] = useState(false)
  const [mode, setMode] = useState<"sync" | "background" | null>(null)
  const [dryRun, setDryRun] = useState(false)
  const [limit, setLimit] = useState("8")
  const [result, setResult] = useState<ResultSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    try {
      setLoadingStats(true)
      setError(null)
      // GET with only columns known to exist on `venues`. Avoids HEAD/count
      // and PostgREST `.or()` filters, which were returning 400s.
      const { data, error } = await supabase
        .from("venues")
        .select("slug,name,location,latitude,longitude")
        .eq("is_deleted", false)
        .order("name", { ascending: true })
        .limit(5000)
      if (error) throw error

      const list = (data || []) as Array<{
        slug?: string | null
        name?: string | null
        location?: string | null
        latitude?: number | null
        longitude?: number | null
      }>
      const missing = list.filter(
        (v) => !v.latitude || !v.longitude || Number(v.latitude) === 0 || Number(v.longitude) === 0,
      )

      setStats({ total: list.length, missing: missing.length, withCoords: list.length - missing.length })
      setMissingVenues(
        missing
          .map((v) => ({ id: v.slug || "", name: v.name || "Unknown venue", location: v.location || "" }))
          .slice(0, 100),
      )
    } catch (e: any) {
      console.error("[AdminGeocode] loadStats failed:", e)
      setError(e?.message || "Failed to load stats")
    } finally {
      setLoadingStats(false)
    }
  }, [])

  useEffect(() => {
    if (user?.userType !== "admin") {
      Alert.alert("Access Denied", "You don't have permission to access this page")
      navigation.goBack()
      return
    }
    loadStats()
  }, [user, navigation, loadStats])

  const parsedLimit = Math.max(1, Math.min(20, Number(limit) || 8))

  const runSync = async () => {
    setRunning(true)
    setMode("sync")
    setError(null)
    try {
      const params = new URLSearchParams({ limit: String(parsedLimit) })
      if (dryRun) params.set("dryRun", "1")
      const res = await fetch(`${FUNC_URL}?${params.toString()}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`)
      setResult(body as ResultSummary)
      loadStats()
    } catch (e: any) {
      setError(e?.message || "Geocoding request failed")
    } finally {
      setRunning(false)
      setMode(null)
    }
  }

  const runBackground = async () => {
    setRunning(true)
    setMode("background")
    setError(null)
    try {
      const params = new URLSearchParams({ limit: String(BACKGROUND_LIMIT) })
      if (dryRun) params.set("dryRun", "1")
      const res = await fetch(`${FUNC_URL}?${params.toString()}`, {
        headers: { "x-nf-async": "true" },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok && res.status !== 202) throw new Error(body?.error || `Request failed (${res.status})`)
      setResult({
        ok: true,
        mode: "background",
        limit: BACKGROUND_LIMIT,
        ...(body as ResultSummary),
      })
    } catch (e: any) {
      setError(e?.message || "Background geocoding failed to start")
    } finally {
      setRunning(false)
      setMode(null)
    }
  }

  const isLoading = loadingStats || running

  return (
    <View style={st.container}>
      <ScrollView contentContainerStyle={st.content}>
        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={st.header}>
          <View>
            <Text style={st.headerTitle}>Venue Geocoding</Text>
            <Text style={st.headerSub}>
              Geocode venue addresses to lat/lng via OpenStreetMap (free), saved straight into Supabase.
            </Text>
          </View>
          <TouchableOpacity onPress={loadStats} style={st.refreshBtn} disabled={isLoading}>
            <Ionicons name="refresh" size={22} color="#00D4FF" />
          </TouchableOpacity>
        </View>

        {error && (
          <View style={st.errorBanner}>
            <Ionicons name="alert-circle" size={18} color="#FF6B6B" />
            <Text style={st.errorText}>{error}</Text>
          </View>
        )}

        {/* ── Stats ─────────────────────────────────────────────── */}
        <View style={st.card}>
          <View style={st.cardHeader}>
            <Ionicons name="stats-chart" size={20} color="#00D4FF" />
            <Text style={st.cardTitle}>Coordinate Coverage</Text>
          </View>
          {loadingStats ? (
            <ActivityIndicator color="#00D4FF" style={{ marginVertical: 20 }} />
          ) : (
            <View style={st.metricGrid}>
              <View style={[st.metricCard, { borderColor: "rgba(0,212,255,0.4)" }]}>
                <Text style={st.metricValue}>{stats?.total ?? 0}</Text>
                <Text style={st.metricLabel}>Total Venues</Text>
              </View>
              <View style={[st.metricCard, { borderColor: "rgba(76,175,80,0.4)" }]}>
                <Text style={[st.metricValue, { color: "#4CAF50" }]}>{stats?.withCoords ?? 0}</Text>
                <Text style={st.metricLabel}>With Coords</Text>
              </View>
              <View style={[st.metricCard, { borderColor: stats && stats.missing > 0 ? "rgba(255,107,107,0.5)" : "rgba(76,175,80,0.4)" }]}>
                <Text style={[st.metricValue, { color: stats && stats.missing > 0 ? "#FF6B6B" : "#4CAF50" }]}>
                  {stats?.missing ?? 0}
                </Text>
                <Text style={st.metricLabel}>Need Coords</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Controls ──────────────────────────────────────────── */}
        <View style={st.card}>
          <View style={st.cardHeader}>
            <Ionicons name="locate" size={20} color="#00D4FF" />
            <Text style={st.cardTitle}>Run Geocoding</Text>
          </View>

          <View style={st.row}>
            <Text style={st.label}>Dry run (no writes)</Text>
            <Switch value={dryRun} onValueChange={setDryRun} trackColor={{ false: "#333", true: "rgba(0,212,255,0.5)" }} thumbColor={dryRun ? "#00D4FF" : "#888"} />
          </View>

          <View style={st.row}>
            <Text style={st.label}>Batch size (sync)</Text>
            <TextInput
              style={st.input}
              value={limit}
              onChangeText={setLimit}
              keyboardType="numeric"
              editable={!running}
            />
          </View>

          <View style={st.buttonRow}>
            <TouchableOpacity
              style={[st.btn, running && st.btnDisabled]}
              onPress={runSync}
              disabled={running}
            >
              {running && mode === "sync" ? (
                <ActivityIndicator size="small" color="#03121a" />
              ) : (
                <Ionicons name="play" size={16} color="#03121a" />
              )}
              <Text style={st.btnText}>Geocode batch</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[st.btnSecondary, running && st.btnDisabled]}
              onPress={runBackground}
              disabled={running}
            >
              {running && mode === "background" ? (
                <ActivityIndicator size="small" color="#00D4FF" />
              ) : (
                <Ionicons name="flash" size={16} color="#00D4FF" />
              )}
              <Text style={st.btnSecondaryText}>Geocode all (background)</Text>
            </TouchableOpacity>
          </View>

          <Text style={st.hint}>
            Sync mode: keeps each run inside Netlify's ~10s timeout. Background mode fires a detached run
            (up to 15 min) that handles everything — refresh stats after ~2 minutes.
          </Text>
        </View>

        {/* ── Last run result ───────────────────────────────────── */}
        {result && (
          <View style={st.card}>
            <View style={st.cardHeader}>
              <Ionicons name={result.ok ? "checkmark-circle" : "alert-circle"} size={20} color={result.ok ? "#4CAF50" : "#FF6B6B"} />
              <Text style={st.cardTitle}>Last run {result.mode === "background" ? "(background)" : ""}</Text>
            </View>
            <View style={st.metricGrid}>
              <View style={st.metricCard}>
                <Text style={st.metricValue}>{result.attempted ?? 0}</Text>
                <Text style={st.metricLabel}>Attempted</Text>
              </View>
              <View style={st.metricCard}>
                <Text style={[st.metricValue, { color: "#4CAF50" }]}>{result.geocoded ?? 0}</Text>
                <Text style={st.metricLabel}>Geocoded</Text>
              </View>
              <View style={st.metricCard}>
                <Text style={[st.metricValue, { color: result.remaining ? "#FF6B6B" : "#4CAF50" }]}>
                  {result.remaining ?? 0}
                </Text>
                <Text style={st.metricLabel}>Remaining</Text>
              </View>
            </View>
            {result.failed && result.failed.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={st.failedText}>{result.failed.length} venue(s) failed to geocode</Text>
                {result.failed.slice(0, 10).map((f, i) => (
                  <Text key={i} numberOfLines={1} style={st.failedItem}>{f}</Text>
                ))}
              </View>
            )}
            {result.mode === "background" && (
              <Text style={st.hint}>Background run started — press refresh to see updated stats in a couple of minutes.</Text>
            )}
            {result.tip && <Text style={st.hint}>{result.tip}</Text>}
          </View>
        )}

        {/* ── Venues missing coordinates ────────────────────────── */}
        <View style={st.card}>
          <View style={st.cardHeader}>
            <Ionicons name="list" size={20} color="#00D4FF" />
            <Text style={st.cardTitle}>Venues needing coordinates</Text>
          </View>
          {loadingStats ? (
            <ActivityIndicator color="#00D4FF" style={{ marginVertical: 16 }} />
          ) : missingVenues.length === 0 ? (
            <View style={st.emptyBox}>
              <Ionicons name="checkmark-done" size={32} color="#4CAF50" />
              <Text style={st.emptyText}>All venues have coordinates</Text>
            </View>
          ) : (
            <>
              {missingVenues.map((venue, idx) => (
                <View key={venue.id || idx} style={st.venueRow}>
                  <Ionicons name="location-outline" size={16} color="#FF6B6B" />
                  <View style={{ flex: 1 }}>
                    <Text style={st.venueName}>{venue.name}</Text>
                    <Text style={st.venueLoc} numberOfLines={1}>{venue.location || "No address"}</Text>
                  </View>
                </View>
              ))}
              {stats && stats.missing > missingVenues.length && (
                <Text style={st.hint}>Showing first {missingVenues.length} of {stats.missing}</Text>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0f" },
  content: { padding: 16, paddingBottom: 48 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#FFF", letterSpacing: -0.5 },
  headerSub: { fontSize: 12, color: "#888", marginTop: 4, maxWidth: 300 },
  refreshBtn: { padding: 8 },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(255,107,107,0.1)", borderWidth: 1, borderColor: "rgba(255,107,107,0.35)",
    borderRadius: 10, padding: 12, marginBottom: 12,
  },
  errorText: { color: "#FF6B6B", fontSize: 12, flex: 1 },
  card: { backgroundColor: "#13131a", borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  cardTitle: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metricCard: {
    flex: 1, minWidth: 80, backgroundColor: "#1a1a2e", borderRadius: 10,
    padding: 12, alignItems: "center", gap: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.04)",
  },
  metricValue: { color: "#FFF", fontSize: 20, fontWeight: "800" },
  metricLabel: { color: "#888", fontSize: 11, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  label: { color: "#CCC", fontSize: 13 },
  input: {
    width: 80, height: 40, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "#0f0f16", color: "#FFF", fontSize: 14, textAlign: "center", paddingHorizontal: 8,
  },
  buttonRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  btn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#00D4FF", paddingVertical: 12, borderRadius: 10,
  },
  btnText: { color: "#03121a", fontSize: 13, fontWeight: "800" },
  btnSecondary: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "rgba(0,212,255,0.1)", borderWidth: 1, borderColor: "rgba(0,212,255,0.4)",
    paddingVertical: 12, borderRadius: 10,
  },
  btnSecondaryText: { color: "#00D4FF", fontSize: 13, fontWeight: "800" },
  btnDisabled: { opacity: 0.5 },
  hint: { color: "#777", fontSize: 11, lineHeight: 16, marginTop: 4 },
  failedText: { color: "#FF6B6B", fontSize: 12, marginTop: 8 },
  failedItem: { color: "#FF6B6B", fontSize: 11, marginTop: 2, opacity: 0.8 },
  emptyBox: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyText: { color: "#888", fontSize: 13 },
  venueRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)",
  },
  venueName: { color: "#FFF", fontSize: 13, fontWeight: "600" },
  venueLoc: { color: "#888", fontSize: 11, marginTop: 1 },
})

export default AdminGeocodeScreen
