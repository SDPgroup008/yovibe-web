import type React from "react"
import { useState } from "react"
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, TextInput, ActivityIndicator, Modal } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { supabase } from "../config/supabase"
import SupabaseService from "../services/SupabaseService"
import { useAuth } from "../contexts/AuthContext"

export default function SettingsScreen() {
  const { user, signOut } = useAuth()

  // Change Password
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordLoading, setPasswordLoading] = useState(false)

  // Delete Account
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [deleteLoading, setDeleteLoading] = useState(false)

  const handleChangePassword = async () => {
    if (!currentPassword) { Alert.alert("Error", "Enter your current password"); return }
    if (!newPassword || newPassword.length < 6) { Alert.alert("Error", "New password must be at least 6 characters"); return }
    if (newPassword !== confirmPassword) { Alert.alert("Error", "New passwords don't match"); return }

    setPasswordLoading(true)
    try {
      // Verify current password by attempting re-auth
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: currentPassword,
      })
      if (signInError) {
        Alert.alert("Error", "Current password is incorrect")
        return
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      Alert.alert("Success", "Password changed successfully")
      setShowPasswordModal(false)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to change password")
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") { Alert.alert("Error", 'Type "DELETE" to confirm'); return }

    setDeleteLoading(true)
    try {
      await SupabaseService.deleteUser(user?.id || user?.uid || "")
      await signOut()
      Alert.alert("Account Deleted", "Your account has been permanently deleted.")
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to delete account")
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollView}>
        {/* Change Password */}
        <TouchableOpacity style={styles.menuItem} onPress={() => setShowPasswordModal(true)}>
          <View style={styles.iconWrap}>
            <Ionicons name="key" size={22} color="#2196F3" />
          </View>
          <Text style={styles.menuText}>Change Password</Text>
          <Ionicons name="chevron-forward" size={22} color="#666666" />
        </TouchableOpacity>

        {/* Delete Account */}
        <TouchableOpacity style={styles.menuItem} onPress={() => { setDeleteConfirmText(""); setShowDeleteModal(true) }}>
          <View style={styles.iconWrap}>
            <Ionicons name="trash" size={22} color="#FF3B30" />
          </View>
          <Text style={[styles.menuText, { color: "#FF3B30" }]}>Delete Account</Text>
          <Ionicons name="chevron-forward" size={22} color="#666666" />
        </TouchableOpacity>
      </ScrollView>

      {/* Change Password Modal */}
      <Modal visible={showPasswordModal} transparent animationType="slide" onRequestClose={() => setShowPasswordModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => setShowPasswordModal(false)}>
                <Ionicons name="close" size={28} color="#888" />
              </TouchableOpacity>
            </View>
            <TextInput style={styles.input} value={currentPassword} onChangeText={setCurrentPassword} placeholder="Current password" placeholderTextColor="#666" secureTextEntry />
            <TextInput style={styles.input} value={newPassword} onChangeText={setNewPassword} placeholder="New password (6+ characters)" placeholderTextColor="#666" secureTextEntry />
            <TextInput style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm new password" placeholderTextColor="#666" secureTextEntry />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={() => setShowPasswordModal(false)} disabled={passwordLoading}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary, passwordLoading && styles.btnDisabled]} onPress={handleChangePassword} disabled={passwordLoading}>
                {passwordLoading ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.btnPrimaryText}>Update</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Account Modal */}
      <Modal visible={showDeleteModal} transparent animationType="slide" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Delete Account</Text>
              <TouchableOpacity onPress={() => setShowDeleteModal(false)}>
                <Ionicons name="close" size={28} color="#888" />
              </TouchableOpacity>
            </View>
            <View style={{ backgroundColor: "rgba(255,59,48,0.1)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <Text style={{ color: "#FF6B6B", fontSize: 13, lineHeight: 20 }}>
                This action is permanent. All your data, tickets, and events will be deleted. You will be signed out immediately.
              </Text>
            </View>
            <Text style={{ color: "#FFF", fontSize: 14, marginBottom: 8, fontWeight: "600" }}>Type DELETE to confirm</Text>
            <TextInput style={styles.input} value={deleteConfirmText} onChangeText={setDeleteConfirmText} placeholder="DELETE" placeholderTextColor="#666" autoCapitalize="characters" />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={() => setShowDeleteModal(false)} disabled={deleteLoading}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { backgroundColor: "#FF3B30" }, (deleteConfirmText !== "DELETE" || deleteLoading) && styles.btnDisabled]} onPress={handleDeleteAccount} disabled={deleteConfirmText !== "DELETE" || deleteLoading}>
                {deleteLoading ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 14 }}>Delete</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212" },
  scrollView: { padding: 16 },
  menuItem: { flexDirection: "row", alignItems: "center", backgroundColor: "#1E1E1E", padding: 16, borderRadius: 10, marginBottom: 10 },
  iconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: "#252525", justifyContent: "center", alignItems: "center", marginRight: 12 },
  menuText: { flex: 1, fontSize: 15, fontWeight: "600", color: "#FFF" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalBox: { backgroundColor: "#1a1a2e", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: "#FFF" },
  input: { backgroundColor: "#0a0a0f", color: "#FFF", padding: 14, borderRadius: 10, fontSize: 14, marginBottom: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  btn: { flex: 1, padding: 14, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  btnCancel: { backgroundColor: "#222" },
  btnCancelText: { color: "#888", fontWeight: "600", fontSize: 14 },
  btnPrimary: { backgroundColor: "#2196F3" },
  btnPrimaryText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  btnDisabled: { opacity: 0.4 },
})
