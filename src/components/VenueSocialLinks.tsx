import React from "react"
import { Alert, Linking, StyleSheet, TouchableOpacity, View } from "react-native"
import { FontAwesome6 } from "@expo/vector-icons"
import type { Venue } from "../models/Venue"
import { normalizeVenueSocialUrl } from "../utils/venueSocialLinks"

type SocialItem = { key: keyof Pick<Venue, "tiktokUrl" | "facebookUrl" | "instagramUrl" | "xUrl" | "youtubeUrl">; icon: string; label: string }

const SOCIAL_ITEMS: SocialItem[] = [
  { key: "tiktokUrl", icon: "tiktok", label: "TikTok" },
  { key: "facebookUrl", icon: "facebook", label: "Facebook" },
  { key: "instagramUrl", icon: "instagram", label: "Instagram" },
  { key: "xUrl", icon: "x-twitter", label: "X" },
  { key: "youtubeUrl", icon: "youtube", label: "YouTube" },
]

export default function VenueSocialLinks({ venue }: { venue: Venue }) {
  const available = SOCIAL_ITEMS.filter((item) => {
    const value = venue[item.key]
    if (!value?.trim()) return false
    try {
      normalizeVenueSocialUrl(value, item.key)
      return true
    } catch {
      return false
    }
  })
  if (!available.length) return null

  const openLink = async (url: string, label: string) => {
    try {
      if (!(await Linking.canOpenURL(url))) throw new Error("unsupported")
      await Linking.openURL(url)
    } catch {
      Alert.alert("Unable to open link", `The ${label} link could not be opened.`)
    }
  }

  return (
    <View style={styles.container} accessibilityLabel="Venue social links">
      {available.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={styles.button}
          onPress={() => { void openLink(venue[item.key] as string, item.label) }}
          accessibilityRole="button"
          accessibilityLabel={`Open venue ${item.label}`}
        >
          <FontAwesome6 name={item.icon as any} brand size={20} color="#FFFFFF" />
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10, marginBottom: 12 },
  button: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(34, 211, 238, 0.2)", borderWidth: 1, borderColor: "rgba(116, 247, 255, 0.55)" },
})
