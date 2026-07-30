"use client"

import type React from "react"
import { useState } from "react"
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useCompatNavigation } from "../utils/compatNavigation"
import { useRouter } from "../utils/URLRouter"

import SupabaseService from "../services/SupabaseService"

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

const ManageProgramsScreen: React.FC = () => {
  const navigation = useCompatNavigation()
  const { currentPath } = useRouter()

  // Extract venueId from current path: /venues/:venueId/programs
  const pathParts = currentPath.split('/').filter(Boolean)
  const venueId = pathParts[1] // venues/:venueId/programs
  const weeklyPrograms = {} // We'll need to fetch this from the venue data
  const [programs, setPrograms] = useState<Record<string, string>>(weeklyPrograms)
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const handleProgramChange = (day: string, program: string) => {
    setPrograms((prev) => ({
      ...prev,
      [day]: program,
    }))
  }

  const handleSave = async () => {
    setFieldErrors({})
    const emptyDays = DAYS_OF_WEEK.filter(day => !programs[day]?.trim())
    if (emptyDays.length > 0) {
      const errs: Record<string, string> = {}
      emptyDays.forEach(day => { errs[day] = "Please enter a program for this day" })
      setFieldErrors(errs)
      Alert.alert("Missing Programs", `Please fill in programs for ${emptyDays.length} day(s): ${emptyDays.join(", ")}`)
      return
    }
    setLoading(true)
    try {
      await SupabaseService.updateVenuePrograms(venueId, programs)
      Alert.alert("Success", "Weekly programs updated successfully")
      navigation.goBack()
    } catch (error) {
      console.error("Error updating programs:", error)
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
            style={[styles.programInput, fieldErrors[day] && styles.inputError]}
            value={programs[day] || ""}
            onChangeText={(text) => { handleProgramChange(day, text); if (fieldErrors[day]) setFieldErrors(prev => { const n = {...prev}; delete n[day]; return n }) }}
            placeholder={`What's happening on ${day}?`}
            placeholderTextColor="#999"
            multiline
          />
          {fieldErrors[day] && <Text style={{ color: "#FF4444", fontSize: 12, marginBottom: 4 }}>{fieldErrors[day]}</Text>}
        </View>
      ))}

      <TouchableOpacity
        style={[styles.saveButton, loading && styles.disabledButton]}
        onPress={handleSave}
        disabled={loading}
      >
        {loading ? (
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