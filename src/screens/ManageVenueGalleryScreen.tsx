"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useCompatNavigation } from "../utils/compatNavigation"
import { useRouter } from "../utils/URLRouter"
import { useAuth } from "../contexts/AuthContext"
import ImagePickerService from "../services/ImagePickerService"
import SupabaseService from "../services/SupabaseService"
import type { VenueGalleryItem } from "../models/VenueGalleryItem"

const ManageVenueGalleryScreen: React.FC = () => {
  const navigation = useCompatNavigation()
  const { currentPath } = useRouter()
  const { user } = useAuth()
  const venueSlug = currentPath.split("/").filter(Boolean)[1]
  const [items, setItems] = useState<VenueGalleryItem[]>([])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadGallery = async () => {
    if (!venueSlug) return
    try {
      setLoading(true)
      setError(null)
      const gallery = await SupabaseService.getVenueGallery(venueSlug)
      setItems(gallery)
    } catch (err: any) {
      console.error("[Gallery][Manage] load:error", { venueSlug, error: err })
      setError(err?.code === "42P01" ? "The venue gallery migration has not been applied yet." : "Unable to load this gallery.")
    } finally { setLoading(false) }
  }

  useEffect(() => { loadGallery() }, [venueSlug])

  const chooseImage = async () => {
    await ImagePickerService.requestMediaLibraryPermissionsAsync()
    const result = await ImagePickerService.launchImageLibraryAsync({ mediaTypes: "Images", allowsEditing: true, aspect: [4, 3], quality: 0.85 })
    if (!result.canceled && result.assets?.[0]) setImageUri(result.assets[0].uri)
  }

  const addItem = async () => {
    if (!user) { Alert.alert("Sign in required", "Only venue owners and administrators can manage a gallery."); return }
    if (!imageUri) { Alert.alert("Choose an image", "Select a photo before publishing this gallery item."); return }
    if (!title.trim()) { Alert.alert("Add a title", "Give this gallery image a short title."); return }
    try {
      setSaving(true)
      const imageUrl = await SupabaseService.uploadVenueGalleryImage(imageUri, venueSlug)
      await SupabaseService.addVenueGalleryItem({ venueSlug, imageUrl, title: title.trim(), description: description.trim() || undefined, displayOrder: items.length, createdBy: user.id })
      setTitle(""); setDescription(""); setImageUri(null)
      await loadGallery()
      Alert.alert("Published", "The gallery image is now visible on the venue page.")
    } catch (err) {
      console.error("[Gallery][Manage] save:error", { venueSlug, error: err })
      Alert.alert("Publish failed", "We could not add this image. Please try again.")
    } finally { setSaving(false) }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons name="images-outline" size={24} color="#D6A7FF" /></View>
        <Text style={styles.title}>Venue Gallery</Text>
        <Text style={styles.subtitle}>Curate the atmosphere, spaces and moments that make your venue memorable.</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.cardTitle}>Add gallery image</Text>
        <TouchableOpacity style={styles.imagePicker} onPress={chooseImage}>
          {imageUri ? <Image source={{ uri: imageUri }} style={styles.selectedImage} /> : <><Ionicons name="cloud-upload-outline" size={28} color="#D6A7FF" /><Text style={styles.imagePickerText}>Choose a photo</Text><Text style={styles.imagePickerHint}>JPG or PNG · keep it sharp and well lit</Text></>}
        </TouchableOpacity>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Image title" placeholderTextColor="#718096" maxLength={80} />
        <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} placeholder="Brief description (optional)" placeholderTextColor="#718096" multiline maxLength={240} />
        <TouchableOpacity style={[styles.publishButton, saving && styles.disabled]} onPress={addItem} disabled={saving}>
          {saving ? <ActivityIndicator color="#0A1020" /> : <><Ionicons name="add-circle-outline" size={20} color="#0A1020" /><Text style={styles.publishText}>Publish to gallery</Text></>}
        </TouchableOpacity>
      </View>

      {error && <View style={styles.notice}><Ionicons name="information-circle-outline" size={20} color="#FFD166" /><Text style={styles.noticeText}>{error} Run the migration before publishing gallery images.</Text></View>}
      <Text style={styles.sectionTitle}>Published images</Text>
      {loading ? <ActivityIndicator color="#D6A7FF" style={{ marginTop: 20 }} /> : items.length === 0 ? <Text style={styles.empty}>No gallery images yet. Add your first one above.</Text> : <View style={styles.grid}>{items.map((item) => <View key={item.id} style={styles.galleryCard}><Image source={{ uri: item.imageUrl }} style={styles.galleryImage} /><View style={styles.galleryText}><Text style={styles.galleryTitle}>{item.title}</Text>{item.description ? <Text style={styles.galleryDescription}>{item.description}</Text> : null}</View></View>)}</View>}

      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={18} color="#D6A7FF" /><Text style={styles.backText}>Back to venue</Text></TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A1020" },
  content: { padding: 20, paddingBottom: 44, maxWidth: 980, width: "100%", alignSelf: "center" },
  hero: { paddingVertical: 12, marginBottom: 18 },
  heroIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: "rgba(214,167,255,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title: { color: "#F8FAFC", fontSize: 30, fontWeight: "800" },
  subtitle: { color: "#9FB3C8", fontSize: 15, lineHeight: 22, marginTop: 7 },
  formCard: { backgroundColor: "#121D33", borderWidth: 1, borderColor: "#263755", borderRadius: 20, padding: 17 },
  cardTitle: { color: "#F8FAFC", fontSize: 18, fontWeight: "700", marginBottom: 13 },
  imagePicker: { height: 190, borderRadius: 15, borderWidth: 1, borderStyle: "dashed", borderColor: "#7251A3", backgroundColor: "#0C1629", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  selectedImage: { width: "100%", height: "100%" },
  imagePickerText: { color: "#D6A7FF", fontWeight: "700", marginTop: 8 },
  imagePickerHint: { color: "#718096", fontSize: 12, marginTop: 5 },
  input: { backgroundColor: "#0C1629", borderWidth: 1, borderColor: "#263755", borderRadius: 13, color: "#F8FAFC", paddingHorizontal: 13, paddingVertical: 12, fontSize: 15, marginTop: 12 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  publishButton: { backgroundColor: "#D6A7FF", borderRadius: 13, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", marginTop: 13 },
  publishText: { color: "#0A1020", fontSize: 15, fontWeight: "800", marginLeft: 8 },
  disabled: { opacity: 0.55 },
  notice: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,209,102,0.1)", borderRadius: 12, padding: 12, marginTop: 16 },
  noticeText: { flex: 1, color: "#FFD166", fontSize: 13, lineHeight: 19, marginLeft: 8 },
  sectionTitle: { color: "#F8FAFC", fontSize: 20, fontWeight: "800", marginTop: 24, marginBottom: 12 },
  empty: { color: "#718096", paddingVertical: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  galleryCard: { width: "31.8%", minWidth: 220, backgroundColor: "#121D33", borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#263755" },
  galleryImage: { width: "100%", height: 150, backgroundColor: "#0C1629" },
  galleryText: { padding: 12 },
  galleryTitle: { color: "#F8FAFC", fontSize: 15, fontWeight: "700" },
  galleryDescription: { color: "#9FB3C8", fontSize: 13, lineHeight: 18, marginTop: 5 },
  backButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginTop: 26, paddingVertical: 10 },
  backText: { color: "#D6A7FF", fontWeight: "700", marginLeft: 7 },
})

export default ManageVenueGalleryScreen
