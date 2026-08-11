import React from "react"
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native"
import { Ionicons } from "@expo/vector-icons"

interface StatusDialogProps {
  visible: boolean
  type?: "error" | "success"
  message: string
  onDismiss: () => void
}

const COLORS = {
  error: { main: "#FF5252", bg: "#3A1C1C", border: "rgba(255,82,82,0.4)" },
  success: { main: "#2BD576", bg: "#153326", border: "rgba(43,213,118,0.4)" },
}

export const StatusDialog: React.FC<StatusDialogProps> = ({
  visible,
  type = "error",
  message,
  onDismiss,
}) => {
  const c = COLORS[type]
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={[styles.card, { borderColor: c.border }]}>
          <View style={styles.header}>
            <View style={[styles.iconWrap, { backgroundColor: c.bg }]}>
              <Ionicons
                name={type === "success" ? "checkmark-circle" : "alert-circle"}
                size={30}
                color={c.main}
              />
            </View>
          </View>
          <Text style={[styles.title, { color: c.main }]}>
            {type === "success" ? "Success" : "Payment Failed"}
          </Text>
          <Text style={styles.message}>{message}</Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: c.main }]}
            onPress={onDismiss}
          >
            <Text style={styles.buttonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#1E1E2E",
    borderRadius: 16,
    borderWidth: 1,
    padding: 22,
    alignItems: "center",
  },
  header: {
    marginBottom: 8,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    color: "#E0E0F0",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 20,
  },
  button: {
    alignSelf: "stretch",
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
