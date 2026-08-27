import type React from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, COLORS, SHADOWS } from "../../utils/ResponsiveDesign";

interface UpgradeConfirmModalProps {
  visible: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const UpgradeConfirmModal: React.FC<UpgradeConfirmModalProps> = ({
  visible,
  loading,
  onCancel,
  onConfirm,
}) => {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.iconBanner}>
            <Ionicons name="business-outline" size={28} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Become an Organizer</Text>
          <Text style={styles.description}>
            By upgrading to Club Owner, you&apos;ll be able to create and manage events, venues,
            and organize ticket sales. You&apos;ll be responsible for event coordination and guest
            management.
          </Text>
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              disabled={loading}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.confirmButton, loading && styles.disabled]}
              onPress={onConfirm}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmText}>Confirm Upgrade</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 20,
  },
  dialog: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.xl,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.heavy,
  },
  iconBanner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(0, 212, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.3)",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: 12,
  },
  description: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 24,
    textAlign: "center",
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  button: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: BORDER_RADIUS.md,
    alignItems: "center",
    marginHorizontal: 8,
  },
  cancelButton: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  cancelText: {
    color: COLORS.text,
    fontWeight: "600",
  },
  confirmButton: {
    backgroundColor: COLORS.accent,
  },
  confirmText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.6,
  },
});

export default UpgradeConfirmModal;
