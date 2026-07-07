"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
} from "react-native"
import { useCompatNavigation, useCompatRoute } from "../../utils/compatNavigation"
import { useRouter } from "../../utils/URLRouter"
import { Ionicons } from "@expo/vector-icons"
import StaffTokenService from "../../services/StaffTokenService"
import TicketScannerScreen from "../TicketScannerScreen"

const { width: screenWidth } = Dimensions.get('window')

interface TokenScannerScreenProps {
  token?: string
}

const TokenScannerScreen: React.FC<TokenScannerScreenProps> = (props) => {
  const navigation = useCompatNavigation()
  const route = useCompatRoute()
  const { params } = useRouter()

  const token = props.token || (route.params?.token as string) || (params?.token as string)
  console.log("[TokenScannerScreen] resolved token:", token)

  const [loading, setLoading] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)
  const [eventId, setEventId] = useState<string | undefined>(undefined)
  const [eventName, setEventName] = useState<string>("")
  const [error, setError] = useState<string | null>(null)

  const validateToken = useCallback(async () => {
    if (!token) {
      setError("No token provided")
      setLoading(false)
      return
    }

    setLoading(true)
    const result = await StaffTokenService.validateToken(token)

    if (!result.valid) {
      setError(result.error || "Invalid token")
      setLoading(false)
      return
    }

    setEventId(result.eventId || result.eventSlug)
    setEventName(result.eventName || "Event")
    setTokenValid(true)
    setLoading(false)
  }, [token])

  useEffect(() => {
    validateToken()
  }, [validateToken])

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#00D4FF" />
          <Text style={styles.loadingText}>Validating scanner link...</Text>
        </View>
      </View>
    )
  }

  if (error || !tokenValid) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="close-circle-outline" size={64} color="#FF6B6B" />
          <Text style={styles.errorTitle}>Link Invalid or Expired</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.navigate("Events")}
          >
            <Text style={styles.backButtonText}>Browse Events</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  if (tokenValid && eventId) {
    return (
      <TicketScannerScreen
        eventId={eventId}
        eventName={eventName}
        isTokenAuth={true}
      />
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.errorText}>Unable to load scanner</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    color: "#888",
    fontSize: 16,
    marginTop: 16,
  },
  errorTitle: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  errorText: {
    color: "#888",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    marginBottom: 24,
    paddingHorizontal: 32,
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "#00D4FF",
    borderRadius: 8,
  },
  backButtonText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
})

export default TokenScannerScreen