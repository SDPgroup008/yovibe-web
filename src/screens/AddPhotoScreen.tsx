import React, { useState, useEffect } from "react"
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, SafeAreaView, StyleSheet, Platform } from "react-native"
import { useNavigation } from "../utils/URLRouter"
import { supabase } from "../config/supabase"
import { uploadBuyerPhoto } from "../services/R2Service"
import * as ImagePicker from "expo-image-picker"
import type { Ticket } from "../models/Ticket"

type ScreenState = "loading" | "valid" | "invalid" | "expired" | "uploading" | "done"

function getQueryParam(param: string): string | null {
  if (typeof window === "undefined") return null
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get(param)
}

export default function AddPhotoScreen() {
  const navigation = useNavigation()
  const [state, setState] = useState<ScreenState>("loading")
  const [ticket, setTicket] = useState<Ticket | null>(null)

  const ticketId = getQueryParam("ticket")
  const token = getQueryParam("token")

  useEffect(() => {
    if (!ticketId || !token) {
      setState("invalid")
      return
    }
    validateToken()
  }, [ticketId, token])

  const validateToken = async () => {
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, buyer_email, event_start_time, photo_upload_token, photo_upload_token_expires_at, buyer_photo_url")
        .eq("id", ticketId)
        .single()

      if (error || !data) {
        setState("invalid")
        return
      }

      if (data.buyer_photo_url) {
        setState("done")
        return
      }

      const tokenValid = data.photo_upload_token === token
      const notExpired = !data.photo_upload_token_expires_at || new Date(data.photo_upload_token_expires_at) > new Date()

      if (!tokenValid) {
        setState("invalid")
        return
      }

      if (!notExpired) {
        setState("expired")
        return
      }

      setTicket(data as any)
      setState("valid")
    } catch (error) {
      console.error("Token validation error:", error)
      setState("invalid")
    }
  }

  const handleCapturePhoto = async () => {
    if (!ticket) return

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== "granted") {
        Alert.alert("Permission Required", "Camera permission is needed to capture your photo for verification.")
        return
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      })

      if (result.canceled || !result.assets?.[0]) {
        return
      }

      setState("uploading")
      const photoUri = result.assets[0].uri

      const result2 = await uploadBuyerPhoto(photoUri, ticket.id)

      const { data, error } = await supabase.rpc("add_ticket_security_photo", {
        p_ticket_id: ticket.id,
        p_token: token,
        p_photo_url: result2.url,
      })

      if (error) {
        Alert.alert("Error", error.message)
        setState("valid")
        return
      }

      if (data) {
        setState("done")
        Alert.alert("Success", "Security photo added successfully!")
      } else {
        setState("invalid")
        Alert.alert("Error", "Failed to add security photo")
      }
    } catch (error) {
      console.error("Photo upload error:", error)
      Alert.alert("Error", "Failed to upload photo")
      setState("valid")
    }
  }

  const renderContent = () => {
    switch (state) {
      case "loading":
        return (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#00D4FF" />
            <Text style={styles.loadingText}>Validating ticket...</Text>
          </View>
        )

      case "valid":
        return (
          <View style={styles.container}>
            <Text style={styles.title}>Add Security Photo</Text>
            <Text style={styles.subtitle}>
              This photo helps staff verify your identity at the gate. It's optional but recommended.
            </Text>
            <TouchableOpacity style={styles.captureButton} onPress={handleCapturePhoto}>
              <Text style={styles.captureButtonText}>Capture Photo</Text>
            </TouchableOpacity>
            <Text style={styles.note}>You'll be prompted to take a photo with your camera</Text>
          </View>
        )

      case "invalid":
        return (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Invalid Link</Text>
            <Text style={styles.errorText}>
              This link is invalid or has expired. Please check your ticket details or contact support.
            </Text>
          </View>
        )

      case "expired":
        return (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Link Expired</Text>
            <Text style={styles.errorText}>
              The event has already started, so security photos are no longer being accepted for this ticket.
            </Text>
          </View>
        )

      case "uploading":
        return (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#00D4FF" />
            <Text style={styles.loadingText}>Uploading photo...</Text>
          </View>
        )

      case "done":
        return (
          <View style={styles.center}>
            <Text style={styles.successTitle}>Complete!</Text>
            <Text style={styles.successText}>
              Your security photo has been added to your ticket. You're all set for the event!
            </Text>
            <TouchableOpacity style={styles.doneButton} onPress={() => navigation.navigate("/profile/my-tickets")}>
              <Text style={styles.doneButtonText}>View My Tickets</Text>
            </TouchableOpacity>
          </View>
        )
    }
  }

  return <SafeAreaView style={styles.safeArea}>{renderContent()}</SafeAreaView>
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#000000",
  },
  container: {
    flex: 1,
    backgroundColor: "#000000",
    padding: 20,
    justifyContent: "center",
  },
  center: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  subtitle: {
    color: "#CCCCCC",
    fontSize: 16,
    marginBottom: 32,
    textAlign: "center",
    lineHeight: 22,
  },
  captureButton: {
    backgroundColor: "#00D4FF",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 20,
  },
  captureButtonText: {
    color: "#000000",
    fontSize: 18,
    fontWeight: "bold",
  },
  note: {
    color: "#888888",
    fontSize: 14,
    textAlign: "center",
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 16,
    marginTop: 16,
  },
  errorTitle: {
    color: "#FF4444",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  errorText: {
    color: "#CCCCCC",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 22,
  },
  successTitle: {
    color: "#00FF9F",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  successText: {
    color: "#CCCCCC",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  doneButton: {
    backgroundColor: "#00D4FF",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  doneButtonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "bold",
  },
})