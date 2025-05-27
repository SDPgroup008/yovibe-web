"use client";

import type { ManageProgramsScreenProps } from "../navigation/types";
import { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import FirebaseService from "../services/FirebaseService";

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const ManageProgramsScreen: React.FC<ManageProgramsScreenProps> = ({ navigation, route }) => {
  const { venueId, weeklyPrograms } = route.params;
  const [programs, setPrograms] = useState<Record<string, string>>(weeklyPrograms || {});
  const [loading, setLoading] = useState(false);

  const handleProgramChange = (day: string, program: string) => {
    setPrograms((prev) => ({
      ...prev,
      [day]: program,
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await FirebaseService.updateVenuePrograms(venueId, programs);
      Alert.alert("Success", "Weekly programs updated successfully");
      navigation.goBack();
    } catch (error) {
      console.error("Error updating programs:", error);
      Alert.alert("Error", "Failed to update weekly programs");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Manage Weekly Programs</Text>
        <Text style={styles.headerSubtitle}>Add or update your venue's weekly schedule</Text>
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
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212" },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#333" },
  headerTitle: { fontSize: 24, fontWeight: "bold", color: "#FFFFFF", marginBottom: 8 },
  headerSubtitle: { fontSize: 16, color: "#BBBBBB" },
  dayContainer: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#333" },
  dayLabel: { fontSize: 18, fontWeight: "bold", color: "#FFFFFF", marginBottom: 8 },
  programInput: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    padding: 12,
    color: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#333",
    minHeight: 80,
    textAlignVertical: "top",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    margin: 16,
    padding: 16,
    borderRadius: 8,
  },
  disabledButton: { opacity: 0.6 },
  saveButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "bold", marginLeft: 8 },
});

export default ManageProgramsScreen;