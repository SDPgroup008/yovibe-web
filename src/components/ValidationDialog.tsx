import React from "react"
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native"
import { Ionicons } from "@expo/vector-icons"

interface ValidationDialogProps {
  visible: boolean
  title?: string
  missingFields: string[]
  onDismiss: () => void
}

/**
 * A cross-platform dialog that lists all missing/invalid fields on a form.
 * Works on web, iOS, and Android (uses React Native Modal, not native Alert).
 */
export const ValidationDialog: React.FC<ValidationDialogProps> = ({
  visible,
  title = "Missing Information",
  missingFields,
  onDismiss,
}) => (
  <Modal transparent visible={visible} animationType="fade" onRequestClose={onDismiss}>
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <Ionicons name="alert-circle" size={22} color="#FF5252" />
          <Text style={styles.title}>{title}</Text>
        </View>
        <Text style={styles.subtitle}>
          {missingFields.length === 0
            ? "Please review the form."
            : `Please complete the following field${missingFields.length === 1 ? "" : "s"}:`}
        </Text>
        {missingFields.length > 0 && (
          <ScrollView style={styles.list} bounces={false}>
            {missingFields.map((field, i) => (
              <View key={i} style={styles.itemRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.item}>{field}</Text>
              </View>
            ))}
          </ScrollView>
        )}
        <TouchableOpacity style={styles.button} onPress={onDismiss}>
          <Text style={styles.buttonText}>OK</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
)

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#1E1E2E",
    borderRadius: 14,
    padding: 20,
    maxHeight: "70%",
    borderWidth: 1,
    borderColor: "#E53935",
  },
  title: {
    color: "#FF5252",
    fontSize: 18,
    fontWeight: "800",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  subtitle: {
    color: "#B0B0C0",
    fontSize: 13,
    marginBottom: 12,
  },
  list: {
    marginBottom: 16,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  bullet: {
    color: "#FF5252",
    fontSize: 14,
    marginRight: 8,
  },
  item: {
    color: "#E0E0F0",
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  button: {
    backgroundColor: "#E53935",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
})
