"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Platform } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../services/FirebaseService"
import type { Event } from "../models/Event"

interface TicketContactScreenProps {
  route: {
    params: {
      eventId: string
    }
  }
  navigation: any
}

const TicketContactScreen: React.FC<TicketContactScreenProps> = ({ route, navigation }) => {
  const { eventId } = route.params
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadEvent = async () => {
      try {
        const eventData = await FirebaseService.getEventById(eventId)
        if (!eventData) {
          Alert.alert("Error", "Event not found")
          navigation.goBack()
          return
        }
        setEvent(eventData)
      } catch (error) {
        console.error("Error loading event:", error)
        Alert.alert("Error", "Failed to load event details")
        navigation.goBack()
      } finally {
        setLoading(false)
      }
    }

    loadEvent()
  }, [eventId, navigation])

  const handleCall = async (phoneNumber: string) => {
    try {
      const url = `tel:${phoneNumber}`
      const supported = await Linking.canOpenURL(url)

      if (supported) {
        await Linking.openURL(url)
      } else {
        Alert.alert("Error", "Phone calls are not supported on this device")
      }
    } catch (error) {
      console.error("Error making phone call:", error)
      Alert.alert("Error", "Failed to make phone call")
    }
  }

  const handleWhatsApp = async (phoneNumber: string, contactName: string) => {
    try {
      // Format phone number for WhatsApp (remove spaces, dashes, etc.)
      const cleanNumber = phoneNumber.replace(/[^\d+]/g, "")
      const message = `Hi ${contactName}, I'm interested in purchasing tickets for ${event?.name}. Could you please provide me with the details?`
      const url = `whatsapp://send?phone=${cleanNumber}&text=${encodeURIComponent(message)}`

      const supported = await Linking.canOpenURL(url)

      if (supported) {
        await Linking.openURL(url)
      } else {
        Alert.alert("WhatsApp Not Available", "WhatsApp is not installed on this device")
      }
    } catch (error) {
      console.error("Error opening WhatsApp:", error)
      Alert.alert("Error", "Failed to open WhatsApp")
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading contact information...</Text>
      </View>
    )
  }

  if (!event) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Event not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const primaryContact = event.contactPhones.find((contact) => contact.isPrimary)
  const otherContacts = event.contactPhones.filter((contact) => !contact.isPrimary)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contact for Tickets</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.eventInfo}>
          <Text style={styles.eventName}>{event.name}</Text>
          <Text style={styles.eventDetails}>
            {event.venueName} • {event.date.toDateString()}
          </Text>
          <Text style={styles.eventPrice}>{event.entryFee || "Free"}</Text>
        </View>

        <Text style={styles.sectionTitle}>Contact the organizers to purchase tickets:</Text>

        {primaryContact && (
          <View style={styles.contactSection}>
            <Text style={styles.primaryLabel}>Primary Contact</Text>
            <View style={styles.contactCard}>
              <View style={styles.contactHeader}>
                <View style={styles.contactInfo}>
                  <Ionicons
                    name={primaryContact.isWhatsApp ? "logo-whatsapp" : "call"}
                    size={24}
                    color={primaryContact.isWhatsApp ? "#25D366" : "#2196F3"}
                  />
                  <View style={styles.contactDetails}>
                    <Text style={styles.contactName}>{primaryContact.name}</Text>
                    <Text style={styles.contactNumber}>{primaryContact.number}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.contactActions}>
                <TouchableOpacity style={styles.callButton} onPress={() => handleCall(primaryContact.number)}>
                  <Ionicons name="call" size={20} color="#FFFFFF" />
                  <Text style={styles.buttonText}>Call</Text>
                </TouchableOpacity>

                {primaryContact.isWhatsApp && (
                  <TouchableOpacity
                    style={styles.whatsappButton}
                    onPress={() => handleWhatsApp(primaryContact.number, primaryContact.name)}
                  >
                    <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>WhatsApp</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}

        {otherContacts.length > 0 && (
          <View style={styles.contactSection}>
            <Text style={styles.sectionSubtitle}>Other Contacts</Text>
            {otherContacts.map((contact, index) => (
              <View key={index} style={styles.contactCard}>
                <View style={styles.contactHeader}>
                  <View style={styles.contactInfo}>
                    <Ionicons
                      name={contact.isWhatsApp ? "logo-whatsapp" : "call"}
                      size={24}
                      color={contact.isWhatsApp ? "#25D366" : "#2196F3"}
                    />
                    <View style={styles.contactDetails}>
                      <Text style={styles.contactName}>{contact.name}</Text>
                      <Text style={styles.contactNumber}>{contact.number}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.contactActions}>
                  <TouchableOpacity style={styles.callButton} onPress={() => handleCall(contact.number)}>
                    <Ionicons name="call" size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Call</Text>
                  </TouchableOpacity>

                  {contact.isWhatsApp && (
                    <TouchableOpacity
                      style={styles.whatsappButton}
                      onPress={() => handleWhatsApp(contact.number, contact.name)}
                    >
                      <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
                      <Text style={styles.buttonText}>WhatsApp</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={24} color="#2196F3" />
          <Text style={styles.infoText}>
            Contact the organizers directly to inquire about ticket availability, pricing, and purchase options.
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 16,
  },
  backButton: {
    backgroundColor: "#2196F3",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 20,
  },
  backButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    paddingTop: Platform.OS === "ios" ? 50 : 16,
    backgroundColor: "#1E1E1E",
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  headerBackButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  eventInfo: {
    backgroundColor: "#1E1E1E",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  eventName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  eventDetails: {
    fontSize: 16,
    color: "#BBBBBB",
    marginBottom: 8,
  },
  eventPrice: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFD700",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  contactSection: {
    marginBottom: 24,
  },
  primaryLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2196F3",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  contactCard: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  contactHeader: {
    marginBottom: 16,
  },
  contactInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  contactDetails: {
    marginLeft: 12,
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  contactNumber: {
    fontSize: 14,
    color: "#BBBBBB",
  },
  contactActions: {
    flexDirection: "row",
    gap: 12,
  },
  callButton: {
    backgroundColor: "#2196F3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
  },
  whatsappButton: {
    backgroundColor: "#25D366",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  infoBox: {
    backgroundColor: "#1E1E1E",
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 24,
  },
  infoText: {
    color: "#BBBBBB",
    fontSize: 14,
    lineHeight: 20,
    marginLeft: 12,
    flex: 1,
  },
})

export default TicketContactScreen
