"use client"

import { supabase } from "../config/supabase"

export interface StaffToken {
  id: string
  event_id: string
  token: string
  label?: string
  created_at: string
  expires_at: string
  created_by?: string
}

export interface StaffTokenRow {
  id: string
  event_id: string
  token: string
  label?: string
  created_at: string
  expires_at: string
  created_by?: string
}

const StaffTokenService = {
  async getActiveTokensForEvent(eventSlug: string): Promise<StaffToken[]> {
    const { data, error } = await supabase
      .from<StaffTokenRow[]>("event_staff_tokens")
      .select("*")
      .eq("event_id", eventSlug)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching active staff tokens:", error)
      return []
    }

    return data || []
  },

  async generateToken(
    eventSlug: string,
    label?: string
  ): Promise<{ token: string; tokenId: string } | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    const { data, error } = await supabase
      .from("event_staff_tokens")
      .insert({
        event_id: eventSlug,
        label: label || null,
        expires_at: expiresAt.toISOString(),
        created_by: user.id,
      })
      .select("id, token")
      .single()

    if (error) {
      console.error("Error generating staff token:", error)
      return null
    }

    return {
      token: data.token,
      tokenId: data.id,
    }
  },

  async revokeToken(tokenId: string): Promise<boolean> {
    const { error } = await supabase
      .from("event_staff_tokens")
      .delete()
      .eq("id", tokenId)

    if (error) {
      console.error("Error revoking staff token:", error)
      return false
    }

    return true
  },

  async validateToken(token: string): Promise<{
    valid: boolean
    eventId?: string
    eventName?: string
    eventSlug?: string
    error?: string
  }> {
    const { data, error } = await supabase
      .from("event_staff_tokens")
      .select("event_id, events(name, id, slug)")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .single()

    if (error || !data) {
      return {
        valid: false,
        error: "This link has expired or is invalid. Please ask the event organiser for a new scanning link.",
      }
    }

    return {
      valid: true,
      eventId: data.event_id,
      eventName: data.events?.name,
      eventSlug: data.events?.slug,
    }
  },

  async updateTokenLabel(tokenId: string, label: string): Promise<boolean> {
    const { error } = await supabase
      .from("event_staff_tokens")
      .update({ label })
      .eq("id", tokenId)

    if (error) {
      console.error("Error updating token label:", error)
      return false
    }

    return true
  },

  async countActiveTokensForEvent(eventSlug: string): Promise<number> {
    const { count, error } = await supabase
      .from("event_staff_tokens")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventSlug)
      .gt("expires_at", new Date().toISOString())

    if (error) {
      console.error("Error counting active staff tokens:", error)
      return 0
    }

    return count || 0
  },
}

export default StaffTokenService