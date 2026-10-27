import AsyncStorage from "@react-native-async-storage/async-storage"
import { supabase } from "../config/supabase"
import type { Venue } from "../models/Venue"
import type { VibeUpdate, VibeUpdateMediaType, VibeUpdateVenue } from "../models/VibeUpdate"

const SEEN_STORAGE_KEY = "yovibe_vibe_update_seen_v1"
const FUNCTIONS_BASE_URL =
  process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL ||
  process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL ||
  process.env.EXPO_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL || ""

const NORMALIZED_FUNCTIONS_BASE_URL = FUNCTIONS_BASE_URL.replace(/\/$/, "").replace(/\/\.netlify\/functions$/, "")
const functionUrl = (name: string) => `${NORMALIZED_FUNCTIONS_BASE_URL}/.netlify/functions/${name}`.replace(/^\/.netlify/, "/.netlify")

const toUpdate = (row: any): VibeUpdate => ({
  id: row.id,
  venueSlug: row.venue_slug,
  authorId: row.author_id,
  mediaType: row.media_type,
  mediaUrl: row.media_url,
  mediaKey: row.media_key,
  caption: row.caption || "",
  createdAt: new Date(row.created_at),
  expiresAt: new Date(row.expires_at),
})

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  if (!data.session?.access_token) throw new Error("Please sign in to publish a Vibe Update")
  return data.session.access_token
}

export const VibeUpdateService = {
  async getActiveUpdates(venues: Venue[]): Promise<VibeUpdateVenue[]> {
    const now = new Date().toISOString()
    const { data, error } = await supabase.from("vibe_updates").select("*")
      .is("deleted_at", null).gt("expires_at", now).order("created_at", { ascending: true })
    if (error) throw error
    const updatesByVenue = new Map<string, VibeUpdate[]>()
    for (const row of data || []) {
      const update = toUpdate(row)
      const list = updatesByVenue.get(update.venueSlug) || []
      list.push(update)
      updatesByVenue.set(update.venueSlug, list)
    }
    return venues
      .filter((venue) => updatesByVenue.has(venue.slug || venue.id))
      .map((venue) => ({
        venueSlug: venue.slug || venue.id,
        venueName: venue.name,
        posterUrl: venue.backgroundImageUrl,
        ownerId: venue.ownerId,
        updates: updatesByVenue.get(venue.slug || venue.id) || [],
      }))
      .sort((left, right) => right.updates[right.updates.length - 1].createdAt.getTime() - left.updates[left.updates.length - 1].createdAt.getTime())
  },

  async publish(input: { venueSlug: string; authorId: string; file: Blob; fileName: string; contentType: string; durationSeconds?: number; caption: string }): Promise<VibeUpdate> {
    const mediaType: VibeUpdateMediaType = input.contentType.startsWith("video/") ? "video" : "image"
    if (!["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"].includes(input.contentType)) throw new Error("Choose a JPG, PNG, WebP, MP4, or WebM file")
    if (input.file.size > (mediaType === "video" ? 50 : 10) * 1024 * 1024) throw new Error(`${mediaType === "video" ? "Videos" : "Images"} exceed the allowed size`)
    if (mediaType === "video" && (!input.durationSeconds || input.durationSeconds > 60)) throw new Error("Videos must be 60 seconds or shorter")
    const token = await accessToken()
    const prepare = await fetch(functionUrl("create-vibe-update-upload"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ venueSlug: input.venueSlug, fileName: input.fileName, contentType: input.contentType, size: input.file.size, durationSeconds: input.durationSeconds }),
    })
    const upload = await prepare.json()
    if (!prepare.ok) throw new Error(upload.error || "Unable to prepare Vibe Update upload")
    const put = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": input.contentType }, body: input.file })
    if (!put.ok) throw new Error("Media upload failed. Please try again.")
    const { data, error } = await supabase.from("vibe_updates").insert({
      venue_slug: input.venueSlug,
      author_id: input.authorId,
      media_type: upload.mediaType,
      media_url: upload.mediaUrl,
      media_key: upload.key,
      caption: input.caption.trim(),
    }).select("*").single()
    if (error) throw error
    return toUpdate(data)
  },

  async delete(updateId: string, actorId: string): Promise<void> {
    const { error } = await supabase.from("vibe_updates").update({ deleted_at: new Date().toISOString(), deleted_by: actorId }).eq("id", updateId)
    if (error) throw error
  },

  async getSeen(): Promise<Record<string, number>> {
    try { return JSON.parse((await AsyncStorage.getItem(SEEN_STORAGE_KEY)) || "{}") } catch { return {} }
  },

  async markSeen(updateId: string): Promise<void> {
    const seen = await this.getSeen()
    seen[updateId] = Date.now()
    await AsyncStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(seen))
  },

  async pruneSeen(activeUpdates: VibeUpdate[]): Promise<Record<string, number>> {
    const activeIds = new Set(activeUpdates.map((update) => update.id))
    const seen = await this.getSeen()
    const pruned = Object.fromEntries(Object.entries(seen).filter(([id]) => activeIds.has(id))) as Record<string, number>
    if (Object.keys(pruned).length !== Object.keys(seen).length) await AsyncStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(pruned))
    return pruned
  },
}

export default VibeUpdateService
