"use client"




import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { VenuesStackParamList } from '../navigation/types'
import firebaseService from '../services/FirebaseService'
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../contexts/AuthContext"
import TicketService from "../services/TicketService"
import BiometricService from "../services/BiometricService"



type Props = NativeStackScreenProps<VenuesStackParamList, 'TicketScanner'>

const TicketScannerScreen = ({ route, navigation }: Props) => {
  const { user } = useAuth()
  const { eventId } = route.params
  const [scanning, setScanning] = useState(false)

  const [hasPermission, setHasPermission] = useState<boolean | null>(null)


  useEffect(() => {
    // Request camera permissions
    requestCameraPermissions()
  }, [])

  const requestCameraPermissions = async () => {
    try {



















      // For web, we'll simulate permission
      if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
        setHasPermission(true)
      } else {
        setHasPermission(false)
      }
    } catch (error) {



      console.error('Error requesting camera permissions:', error)
      setHasPermission(false)
    }
  }







  const handleScanTicket = async () => {
    try {

      setScanning(true)
      
      // For now, we'll simulate scanning with a prompt
      // In a real app, you'd integrate with a QR code scanner library
      const ticketId = prompt('Enter Ticket ID or QR Code:')
      
      if (!ticketId) {
        setScanning(false)
        return
      }

      // Validate the ticket
      const ticket = await firebaseService.getTicketById(ticketId)
      
      if (!ticket) {
        Alert.alert('Invalid Ticket', 'Ticket not found or invalid.')
        setScanning(false)
        return
      }

      if (ticket.status !== 'active') {
        Alert.alert('Invalid Ticket', `Ticket status: ${ticket.status}`)
        setScanning(false)
        return
      }

      // Get current user (should be venue staff)
      const currentUser = await firebaseService.getCurrentUser()
      if (!currentUser) {
        Alert.alert('Error', 'Please sign in to validate tickets')
        setScanning(false)
        return
      }

      // Create validation record
      const validation = {
        id: `validation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ticketId: ticket.id,
        eventId: eventId,
        userId: currentUser.id,
        timestamp: new Date().toISOString(),
        status: 'pending',
      }

      // Capture biometric data for verification
      Alert.alert(
        "Biometric Verification",
        "Please ask the ticket holder to look at the camera for biometric verification.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Scan Biometric",
            onPress: async () => {
              try {
                const biometricData = await BiometricService.captureBiometric()

                const result = await TicketService.validateTicket(ticketId, biometricData, user.id, "Event Entrance")

                if (result.success) {
                  Alert.alert("✅ Entry Granted", "Ticket validated successfully. Entry granted.", [{ text: "OK" }])
                } else {
                  Alert.alert("❌ Entry Denied", `Validation failed: ${result.reason}`, [{ text: "OK" }])
                }
              } catch (error) {
                Alert.alert("Error", "Failed to capture biometric data")
              }
            },
          },
        ],
      )
    } catch (error) {

      Alert.alert("Error", "Failed to scan ticket")
    } finally {

      setScanning(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ticket Scanner</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.scannerArea}>
          <Ionicons name="qr-code" size={120} color="#2196F3" />
          <Text style={styles.scannerText}>Scan ticket QR code or enter ticket ID manually</Text>
        </View>

        <View style={styles.instructions}>
          <Text style={styles.instructionTitle}>Validation Process:</Text>
          <Text style={styles.instructionText}>
            1. Scan the ticket QR code{"\n"}
            2. Ask ticket holder for biometric verification{"\n"}
            3. Grant or deny entry based on validation result
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.scanButton, (scanning || validating) && styles.scanButtonDisabled]}
          onPress={handleScanTicket}
          disabled={scanning || validating}
        >
          {scanning || validating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="scan" size={24} color="#FFFFFF" />
              <Text style={styles.scanButtonText}>Scan Ticket</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.statusSection}>
          <Text style={styles.statusTitle}>Scanner Status</Text>
          <View style={styles.statusItem}>
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            <Text style={styles.statusText}>Camera Ready</Text>
          </View>
          <View style={styles.statusItem}>
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            <Text style={styles.statusText}>Biometric Scanner Ready</Text>
          </View>
          <View style={styles.statusItem}>
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            <Text style={styles.statusText}>Network Connected</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    paddingTop: 50,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginLeft: 16,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  scannerArea: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 40,
    marginBottom: 24,
  },
  scannerText: {
    fontSize: 16,
    color: "#DDDDDD",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 24,
  },
  instructions: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  instructionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  instructionText: {
    fontSize: 14,
    color: "#DDDDDD",
    lineHeight: 20,
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  scanButtonDisabled: {
    backgroundColor: "#666666",
  },
  scanButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 8,
  },
  statusSection: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 16,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  statusText: {
    fontSize: 14,
    color: "#DDDDDD",
    marginLeft: 8,
  },
})

export default TicketScannerScreen
