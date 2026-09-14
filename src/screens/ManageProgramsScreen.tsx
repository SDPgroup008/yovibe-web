"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useCompatNavigation } from "../utils/compatNavigation"
import { useRouter } from "../utils/URLRouter"

import SupabaseService from "../services/SupabaseService"

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

function normalizePrograms(value: unknown): Record<string, string> {
  let source = value
  if (typeof source === "string") {
    try {
      source = JSON.parse(source)
    } catch {
      source = {}
    }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) return {}

  return DAYS_OF_WEEK.reduce<Record<string, string>>((result, day) => {
    const valueForDay = (source as Record<string, unknown>)[day]
    if (typeof valueForDay === "string") result[day] = valueForDay
    return result
  }, {})
}

const ManageProgramsScreen: React.FC = () => {
  const navigation = useCompatNavigation()
  const { currentPath } = useRouter()

  // Extract venueId from current path: /venues/:venueId/programs
  const pathParts = currentPath.split('/').filter(Boolean)
  const venueId = pathParts[1] // venues/:venueId/programs
  const [programs, setPrograms] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [loadingPrograms, setLoadingPrograms] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    const loadPrograms = async () => {
      if (!venueId) {
        if (active) {
          setLoadError(true)
          setLoadingPrograms(false)
        }
        return
      }

      try {
        console.info("[Programs][Manage] load:start", { venueId })
        const venue = await SupabaseService.getVenueById(venueId)
        if (!venue) throw new Error("Venue not found")
        const normalized = normalizePrograms(venue.weeklyPrograms)
        console.info("[Programs][Manage] load:success", {
          venueId,
          weeklyPrograms: venue.weeklyPrograms || {},
          normalizedPrograms: normalized,
        })
        if (active) setPrograms(normalized)
      } catch (error) {
        console.error("[Programs][Manage] load:error", { venueId, error })
        if (active) setLoadError(true)
      } finally {
        if (active) setLoadingPrograms(false)
      }
    }

    loadPrograms()
    return () => { active = false }
  }, [venueId])

  const handleProgramChange = (day: string, program: string) => {
    setPrograms((prev) => ({
      ...prev,
      [day]: program,
    }))
  }

  const handleSave = async () => {
    if (loadError) {
      Alert.alert("Unable to load programs", "Please return to the venue and try again.")
      return
    }

    // Blank days are optional. Persist only non-empty entries so the venue
    // details screen shows the days that actually have a program.
    const cleanedPrograms = DAYS_OF_WEEK.reduce<Record<string, string>>((result, day) => {
      const program = programs[day]?.trim()
      if (program) result[day] = program
      return result
    }, {})

    console.info("[Programs][Manage] save:attempt", { venueId, programs: cleanedPrograms })
    setLoading(true)
    try {
      await SupabaseService.updateVenuePrograms(venueId, cleanedPrograms)
      console.info("[Programs][Manage] save:success", { venueId, programs: cleanedPrograms })
      Alert.alert("Success", "Weekly programs updated successfully")
      navigation.goBack()
    } catch (error) {
      console.error("[Programs][Manage] save:error", { venueId, programs: cleanedPrograms, error })
      Alert.alert("Error", "Failed to update weekly programs")
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.headerTitle}>Manage Weekly Programs</Text>
          <Text style={styles.headerSubtitle}>Add or update your venue's weekly schedule</Text>
        </View>
      </View>

      {DAYS_OF_WEEK.map((day) => (
        <View key={day} style={styles.dayContainer}>
          <Text style={styles.dayLabel}>{day}</Text>
          <TextInput
            style={styles.programInput}
            value={programs[day] || ""}
            onChangeText={(text) => handleProgramChange(day, text)}
            placeholder={`What's happening on ${day}?`}
            placeholderTextColor="#999"
            multiline
          />
        </View>
      ))}

      <TouchableOpacity
        style={[styles.saveButton, loading && styles.disabledButton]}
        onPress={handleSave}
        disabled={loading || loadingPrograms}
      >
        {loading || loadingPrograms ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="save-outline" size={20} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>Save Programs</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  backButton: {
    marginRight: 12,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  titleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: "#BBBBBB",
  },
  dayContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  dayLabel: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  programInput: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    padding: 12,
    color: "#FFFFFF",
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  inputError: { borderColor: "#FF4444", borderWidth: 1.5 },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    margin: 16,
    padding: 16,
    borderRadius: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
})

export default ManageProgramsScreen
