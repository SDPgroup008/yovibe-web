"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useCompatNavigation } from "../utils/compatNavigation"
import { useRouter } from "../utils/URLRouter"
import ImagePickerService from "../services/ImagePickerService"
import SupabaseService from "../services/SupabaseService"
import type { WeeklyProgramDetails, WeeklyProgramValue } from "../models/Venue"

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
type ProgramDraft = WeeklyProgramDetails

function normalizePrograms(value: unknown): Record<string, ProgramDraft> {
  let source = value
  if (typeof source === "string") { try { source = JSON.parse(source) } catch { source = {} } }
  if (!source || typeof source !== "object" || Array.isArray(source)) return {}
  const entries = Object.entries(source as Record<string, unknown>)
  return DAYS_OF_WEEK.reduce<Record<string, ProgramDraft>>((result, day) => {
    const raw = entries.find(([key]) => key.trim().toLowerCase() === day.toLowerCase())?.[1]
    if (typeof raw === "string") result[day] = { description: raw }
    else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const item = raw as Record<string, unknown>
      result[day] = { description: typeof item.description === "string" ? item.description : typeof item.program === "string" ? item.program : "", posterUrl: typeof item.posterUrl === "string" ? item.posterUrl : typeof item.poster_url === "string" ? item.poster_url : undefined }
    }
    return result
  }, {})
}

function serializePrograms(programs: Record<string, ProgramDraft>): Record<string, WeeklyProgramValue> {
  return DAYS_OF_WEEK.reduce<Record<string, WeeklyProgramValue>>((result, day) => {
    const draft = programs[day]
    const description = draft?.description?.trim() || ""
    const posterUrl = draft?.posterUrl?.trim()
    if (!description && !posterUrl) return result
    result[day] = posterUrl ? { description, posterUrl } : description
    return result
  }, {})
}

const ManageProgramsScreen: React.FC = () => {
  const navigation = useCompatNavigation()
  const { currentPath } = useRouter()
  const venueId = currentPath.split("/").filter(Boolean)[1]
  const [programs, setPrograms] = useState<Record<string, ProgramDraft>>({})
  const [loading, setLoading] = useState(false)
  const [loadingPrograms, setLoadingPrograms] = useState(true)
  const [uploadingDay, setUploadingDay] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    const loadPrograms = async () => {
      if (!venueId) { setLoadError(true); setLoadingPrograms(false); return }
      try {
        console.info("[Programs][Manage] load:start", { venueId })
        const venue = await SupabaseService.getVenueById(venueId)
        if (!venue) throw new Error("Venue not found")
        const normalized = normalizePrograms(venue.weeklyPrograms)
        console.info("[Programs][Manage] load:success", { venueId, weeklyPrograms: venue.weeklyPrograms || {}, normalizedPrograms: normalized })
        if (active) setPrograms(normalized)
      } catch (error) {
        console.error("[Programs][Manage] load:error", { venueId, error })
        if (active) setLoadError(true)
      } finally { if (active) setLoadingPrograms(false) }
    }
    loadPrograms()
    return () => { active = false }
  }, [venueId])

  const updateDraft = (day: string, changes: Partial<ProgramDraft>) => {
    setPrograms((prev) => ({ ...prev, [day]: { ...(prev[day] || { description: "" }), ...changes } }))
  }

  const handlePosterPick = async (day: string) => {
    try {
      await ImagePickerService.requestMediaLibraryPermissionsAsync()
      const result = await ImagePickerService.launchImageLibraryAsync({ mediaTypes: "Images", allowsEditing: true, aspect: [16, 9], quality: 0.85 })
      const asset = result.assets?.[0]
      if (result.canceled || !asset) return
      setUploadingDay(day)
      const posterUrl = await SupabaseService.uploadProgramPoster(asset.uri, venueId)
      updateDraft(day, { posterUrl })
    } catch (error) {
      console.error("[Programs][Manage] poster:upload:error", { venueId, day, error })
      Alert.alert("Poster upload failed", "Please try another image.")
    } finally { setUploadingDay(null) }
  }

  const handleSave = async () => {
    if (loadError) { Alert.alert("Unable to load programs", "Please return to the venue and try again."); return }
    const cleanedPrograms = serializePrograms(programs)
    console.info("[Programs][Manage] save:attempt", { venueId, programs: cleanedPrograms })
    setLoading(true)
    try {
      await SupabaseService.updateVenuePrograms(venueId, cleanedPrograms)
      console.info("[Programs][Manage] save:success", { venueId, programs: cleanedPrograms })
      Alert.alert("Programs saved", "Your weekly program is now live on the venue page.")
      navigation.goBack()
    } catch (error) {
      console.error("[Programs][Manage] save:error", { venueId, programs: cleanedPrograms, error })
      Alert.alert("Save failed", "We could not update the weekly program. Please try again.")
    } finally { setLoading(false) }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons name="sparkles-outline" size={24} color="#74F7FF" /></View>
        <Text style={styles.title}>Weekly Program</Text>
        <Text style={styles.subtitle}>Shape the rhythm of your venue. Add a description and an optional poster for each day.</Text>
      </View>
      {DAYS_OF_WEEK.map((day, index) => {
        const draft = programs[day] || { description: "" }
        const hasContent = Boolean(draft.description?.trim() || draft.posterUrl)
        return (
          <View key={day} style={[styles.dayCard, hasContent && styles.dayCardActive]}>
            <View style={styles.dayHeader}>
              <View style={styles.dayBadge}><Text style={styles.dayNumber}>{String(index + 1).padStart(2, "0")}</Text></View>
              <View style={styles.dayHeading}><Text style={styles.dayLabel}>{day}</Text><Text style={styles.dayHint}>{hasContent ? "Program configured" : "Optional"}</Text></View>
              {hasContent && <Ionicons name="checkmark-circle" size={22} color="#74F7FF" />}
            </View>
            <TextInput style={styles.programInput} value={draft.description || ""} onChangeText={(text) => updateDraft(day, { description: text })} placeholder={`What's happening on ${day}?`} placeholderTextColor="#718096" multiline />
            {draft.posterUrl ? (
              <View style={styles.posterPreviewWrap}>
                <Image source={{ uri: draft.posterUrl }} style={styles.posterPreview} />
                <TouchableOpacity style={styles.removePoster} onPress={() => updateDraft(day, { posterUrl: undefined })} accessibilityLabel={`Remove ${day} poster`}><Ionicons name="close" size={18} color="#FFFFFF" /></TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.posterButton} onPress={() => handlePosterPick(day)} disabled={uploadingDay === day}>
                {uploadingDay === day ? <ActivityIndicator size="small" color="#74F7FF" /> : <Ionicons name="image-outline" size={19} color="#74F7FF" />}
                <Text style={styles.posterButtonText}>{uploadingDay === day ? "Uploading poster…" : "Add optional poster"}</Text>
              </TouchableOpacity>
            )}
          </View>
        )
      })}
      <TouchableOpacity style={[styles.saveButton, (loading || loadingPrograms) && styles.disabledButton]} onPress={handleSave} disabled={loading || loadingPrograms}>
        {loading || loadingPrograms ? <ActivityIndicator color="#07111F" /> : <><Ionicons name="cloud-upload-outline" size={20} color="#07111F" /><Text style={styles.saveButtonText}>Publish Program</Text></>}
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#07111F" },
  content: { padding: 20, paddingBottom: 44, maxWidth: 900, width: "100%", alignSelf: "center" },
  hero: { paddingVertical: 12, marginBottom: 18 },
  heroIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: "rgba(116,247,255,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title: { fontSize: 30, fontWeight: "800", color: "#F7FAFC", letterSpacing: 0.2 },
  subtitle: { color: "#9FB3C8", fontSize: 15, lineHeight: 22, marginTop: 7, maxWidth: 680 },
  dayCard: { backgroundColor: "#101D2E", borderRadius: 20, padding: 17, marginBottom: 14, borderWidth: 1, borderColor: "#1D3048" },
  dayCardActive: { borderColor: "rgba(116,247,255,0.5)", shadowColor: "#74F7FF", shadowOpacity: 0.08, shadowRadius: 18, elevation: 3 },
  dayHeader: { flexDirection: "row", alignItems: "center", marginBottom: 13 },
  dayBadge: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#192D46", alignItems: "center", justifyContent: "center", marginRight: 11 },
  dayNumber: { color: "#74F7FF", fontWeight: "800", fontSize: 12 },
  dayHeading: { flex: 1 },
  dayLabel: { color: "#F7FAFC", fontSize: 18, fontWeight: "700" },
  dayHint: { color: "#718096", fontSize: 12, marginTop: 2 },
  programInput: { backgroundColor: "#0A1626", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, color: "#F7FAFC", fontSize: 15, minHeight: 74, textAlignVertical: "top", borderWidth: 1, borderColor: "#203752" },
  posterButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginTop: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "rgba(116,247,255,0.08)" },
  posterButtonText: { color: "#74F7FF", fontSize: 13, fontWeight: "700", marginLeft: 7 },
  posterPreviewWrap: { marginTop: 12, borderRadius: 14, overflow: "hidden", position: "relative" },
  posterPreview: { width: "100%", height: 150, backgroundColor: "#0A1626" },
  removePoster: { position: "absolute", top: 9, right: 9, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(7,17,31,0.78)" },
  saveButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#74F7FF", borderRadius: 15, paddingVertical: 16, marginTop: 8 },
  disabledButton: { opacity: 0.55 },
  saveButtonText: { color: "#07111F", fontSize: 16, fontWeight: "800", marginLeft: 8 },
})

export default ManageProgramsScreen
