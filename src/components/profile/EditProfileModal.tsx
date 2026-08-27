import type React from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, COLORS, SHADOWS } from "../../utils/ResponsiveDesign";

interface EditProfileModalProps {
  visible: boolean;
  photoURL?: string;
  displayName: string;
  fieldErrors: Record<string, string>;
  loading: boolean;
  onPhotoPress: () => void;
  onDisplayNameChange: (text: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

const EditProfileModal: React.FC<EditProfileModalProps> = ({
  visible,
  photoURL,
  displayName,
  fieldErrors,
  loading,
  onPhotoPress,
  onDisplayNameChange,
  onCancel,
  onSave,
}) => {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.dialogHeader}>
            <Text style={styles.title}>Edit Profile</Text>
            <TouchableOpacity
              onPress={onCancel}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.avatarWrap} onPress={onPhotoPress} activeOpacity={0.8}>
            {photoURL ? (
              <Image source={{ uri: photoURL }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={52} color={COLORS.textTertiary} />
              </View>
            )}
            <View style={styles.avatarBadge}>
              <Ionicons name="camera" size={18} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={[styles.input, fieldErrors.displayName && styles.inputError]}
            value={displayName}
            onChangeText={onDisplayNameChange}
            placeholder="Enter your name"
            placeholderTextColor={COLORS.textTertiary}
          />
          {fieldErrors.displayName ? (
            <Text style={styles.fieldError}>{fieldErrors.displayName}</Text>
          ) : null}

          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              disabled={loading}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.saveButton, loading && styles.disabled]}
              onPress={onSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.background} />
              ) : (
                <Text style={styles.saveText}>Save</Text>
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
  dialogHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.text,
  },
  avatarWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.gradientStart,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 24,
    position: "relative",
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  label: {
    alignSelf: "flex-start",
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    width: "100%",
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: 14,
    color: COLORS.text,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: 15,
  },
  inputError: {
    borderColor: COLORS.danger,
    borderWidth: 1.5,
  },
  fieldError: {
    color: COLORS.danger,
    fontSize: 12,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 8,
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
  saveButton: {
    backgroundColor: COLORS.primary,
  },
  saveText: {
    color: COLORS.background,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.6,
  },
});

export default EditProfileModal;
