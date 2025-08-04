"use client"

import type React from "react"
import { useState, useEffect } from "react"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  StyleSheet,
  Switch,
  Platform,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import { useAuth } from "../contexts/AuthContext"
import firebaseService from "../services/FirebaseService"
import ImagePickerService from "../services/ImagePickerService"
import type { Event, TicketType, PaymentAccount } from "../models/Event"
import type { Venue } from "../models/Venue"
import type { PaymentMethod } from "../models/Ticket"

const AddEventScreen: React.FC = () => {
  const navigation = useNavigation()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [venues, setVenues] = useState<Venue[]>([])
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [showVenueDropdown, setShowVenueDropdown] = useState(false)

  // Event form state
  const [eventName, setEventName] = useState("")
  const [description, setDescription] = useState("")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [artists, setArtists] = useState("")
  const [posterImage, setPosterImage] = useState<string | null>(null)
  const [isFeatured, setIsFeatured] = useState(false)
  const [basePrice, setBasePrice] = useState("")

  // Ticket types state
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([
    {
      id: "regular",
      name: "Regular",
      price: 0,
      description: "Standard entry ticket",
      isAvailable: true,
    },
    {
      id: "secure",
      name: "Secure",
      price: 0,
      description: "Entry with photo verification",
      isAvailable: true,
    },
  ])

  // Payment accounts state
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([])
  const [showAddPaymentAccount, setShowAddPaymentAccount] = useState(false)
  const [newPaymentAccount, setNewPaymentAccount] = useState<PaymentAccount>({
    type: "mtn",
    accountNumber: "",
    accountName: "",
    isActive: true,
  })

  useEffect(() => {
    loadVenues()
  }, [])

  useEffect(() => {
    // Update ticket prices when base price changes
    const price = Number.parseFloat(basePrice) || 0
    setTicketTypes((prev) =>
      prev.map((ticket) => ({
        ...ticket,
        price: ticket.id === "regular" || ticket.id === "secure" ? price : ticket.price,
      })),
    )
  }, [basePrice])

  const loadVenues = async () => {
    try {
      const venuesList = await firebaseService.getVenues()
      setVenues(venuesList)
    } catch (error) {
      console.error("Error loading venues:", error)
      Alert.alert("Error", "Failed to load venues")
    }
  }

  const handleImagePicker = async () => {
    try {
      console.log("Opening image picker...")
      const result = await ImagePickerService.pickImage({
        mediaTypes: "Images",
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      })

      console.log("Image picker result:", result)

      if (result && !result.canceled && result.assets?.[0]) {
        setPosterImage(result.assets[0].uri)
        console.log("Poster image set:", result.assets[0].uri)
      }
    } catch (error) {
      console.error("Error picking image:", error)
      Alert.alert("Error", "Failed to pick image")
    }
  }

  const handleDatePress = () => {
    // For web, we'll use a simple prompt. In a real app, you'd use a proper date picker
    if (Platform.OS === "web") {
      const dateInput = prompt("Enter date (YYYY-MM-DD):", date)
      if (dateInput) {
        setDate(dateInput)
      }
    } else {
      // For mobile, you would integrate with a date picker library like @react-native-community/datetimepicker
      Alert.alert("Date Picker", "Date picker integration needed for mobile")
    }
  }

  const handleTimePress = () => {
    // For web, we'll use a simple prompt. In a real app, you'd use a proper time picker
    if (Platform.OS === "web") {
      const timeInput = prompt("Enter time (HH:MM):", time)
      if (timeInput) {
        setTime(timeInput)
      }
    } else {
      // For mobile, you would integrate with a time picker
      Alert.alert("Time Picker", "Time picker integration needed for mobile")
    }
  }

  const addTicketType = () => {
    const newTicketType: TicketType = {
      id: `custom_${Date.now()}`,
      name: "",
      price: 0,
      description: "",
      isAvailable: true,
    }
    setTicketTypes([...ticketTypes, newTicketType])
  }

  const updateTicketType = (index: number, field: keyof TicketType, value: any) => {
    const updated = [...ticketTypes]
    updated[index] = { ...updated[index], [field]: value }
    setTicketTypes(updated)
  }

  const removeTicketType = (index: number) => {
    if (ticketTypes.length > 2) {
      // Keep at least Regular and Secure
      setTicketTypes(ticketTypes.filter((_, i) => i !== index))
    }
  }

  const addPaymentAccount = () => {
    if (!newPaymentAccount.accountNumber || !newPaymentAccount.accountName) {
      Alert.alert("Error", "Please fill in all payment account details")
      return
    }

    // Validate account number format
    if (!validateAccountNumber(newPaymentAccount.type, newPaymentAccount.accountNumber)) {
      Alert.alert("Error", "Invalid account number format")
      return
    }

    setPaymentAccounts([...paymentAccounts, { ...newPaymentAccount }])
    setNewPaymentAccount({
      type: "mtn",
      accountNumber: "",
      accountName: "",
      isActive: true,
    })
    setShowAddPaymentAccount(false)
  }

  const validateAccountNumber = (type: PaymentMethod, accountNumber: string): boolean => {
    switch (type) {
      case "mtn":
        return /^(256)?(76|77|78|79)\d{7}$/.test(accountNumber.replace(/\s/g, ""))
      case "airtel":
        return /^(256)?(70|74|75)\d{7}$/.test(accountNumber.replace(/\s/g, ""))
      case "card":
        return accountNumber.length >= 10 && accountNumber.length <= 20
      default:
        return false
    }
  }

  const removePaymentAccount = (index: number) => {
    setPaymentAccounts(paymentAccounts.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!eventName.trim()) {
      Alert.alert("Error", "Please enter event name")
      return
    }

    if (!selectedVenue) {
      Alert.alert("Error", "Please select a venue")
      return
    }

    if (!date || !time) {
      Alert.alert("Error", "Please select date and time")
      return
    }

    if (!posterImage) {
      Alert.alert("Error", "Please select a poster image")
      return
    }

    if (paymentAccounts.length === 0) {
      Alert.alert("Error", "Please add at least one payment account")
      return
    }

    // Validate ticket types
    const validTicketTypes = ticketTypes.filter((ticket) => ticket.name.trim() && ticket.price > 0)

    if (validTicketTypes.length === 0) {
      Alert.alert("Error", "Please configure at least one ticket type")
      return
    }

    setLoading(true)

    try {
      // Upload poster image
      const posterUrl = await firebaseService.uploadEventImage(posterImage)

      // Create event date
      const eventDateTime = new Date(`${date}T${time}`)

      const eventData: Omit<Event, "id"> = {
        name: eventName.trim(),
        venueId: selectedVenue.id,
        venueName: selectedVenue.name,
        description: description.trim(),
        date: eventDateTime,
        posterImageUrl: posterUrl,
        artists: artists
          .split(",")
          .map((artist) => artist.trim())
          .filter(Boolean),
        isFeatured,
        location: selectedVenue.location,
        priceIndicator: Math.ceil((Number.parseFloat(basePrice) || 0) / 10000), // 1-3 based on price
        entryFee: `UGX ${Number.parseFloat(basePrice) || 0}`,
        attendees: [],
        ticketTypes: validTicketTypes,
        paymentAccounts: paymentAccounts.filter((account) => account.isActive),
        totalRevenue: 0,
        appCommission: 0,
        netRevenue: 0,
        createdAt: new Date(),
        createdBy: user?.id,
        createdByType: user?.userType,
      }

      await firebaseService.addEvent(eventData)

      Alert.alert("Success", "Event created successfully!", [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
        },
      ])
    } catch (error) {
      console.error("Error creating event:", error)
      Alert.alert("Error", "Failed to create event. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Create New Event</Text>

        {/* Basic Event Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Event Details</Text>

          <TextInput
            style={styles.input}
            placeholder="Event Name"
            value={eventName}
            onChangeText={setEventName}
            placeholderTextColor="#666"
          />

          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Event Description"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            placeholderTextColor="#666"
          />

          <TextInput
            style={styles.input}
            placeholder="Artists (comma separated)"
            value={artists}
            onChangeText={setArtists}
            placeholderTextColor="#666"
          />

          <View style={styles.row}>
            <TouchableOpacity style={[styles.input, styles.halfInput, styles.dateTimeInput]} onPress={handleDatePress}>
              <View style={styles.dateTimeContent}>
                <Ionicons name="calendar-outline" size={20} color="#666" />
                <Text style={[styles.dateTimeText, !date && styles.placeholderText]}>{date || "Select Date"}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.input, styles.halfInput, styles.dateTimeInput]} onPress={handleTimePress}>
              <View style={styles.dateTimeContent}>
                <Ionicons name="time-outline" size={20} color="#666" />
                <Text style={[styles.dateTimeText, !time && styles.placeholderText]}>{time || "Select Time"}</Text>
              </View>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Base Ticket Price (UGX)"
            value={basePrice}
            onChangeText={setBasePrice}
            keyboardType="numeric"
            placeholderTextColor="#666"
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Featured Event</Text>
            <Switch
              value={isFeatured}
              onValueChange={setIsFeatured}
              trackColor={{ false: "#767577", true: "#6366f1" }}
              thumbColor={isFeatured ? "#f4f3f4" : "#f4f3f4"}
            />
          </View>
        </View>

        {/* Venue Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Venue</Text>
          <TouchableOpacity style={styles.dropdown} onPress={() => setShowVenueDropdown(!showVenueDropdown)}>
            <Text style={selectedVenue ? styles.dropdownText : styles.dropdownPlaceholder}>
              {selectedVenue ? selectedVenue.name : "Select Venue"}
            </Text>
            <Ionicons name={showVenueDropdown ? "chevron-up" : "chevron-down"} size={20} color="#666" />
          </TouchableOpacity>

          {showVenueDropdown && (
            <View style={styles.dropdownList}>
              {venues.map((venue) => (
                <TouchableOpacity
                  key={venue.id}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setSelectedVenue(venue)
                    setShowVenueDropdown(false)
                  }}
                >
                  <Text style={styles.dropdownItemText}>{venue.name}</Text>
                  <Text style={styles.dropdownItemSubtext}>{venue.location}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Poster Image */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Event Poster</Text>
          <TouchableOpacity style={styles.imageButton} onPress={handleImagePicker}>
            {posterImage ? (
              <Image source={{ uri: posterImage }} style={styles.posterPreview} resizeMode="cover" />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="image-outline" size={48} color="#666" />
                <Text style={styles.imagePlaceholderText}>Tap to select poster image</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Ticket Types */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Ticket Types</Text>
            <TouchableOpacity style={styles.addButton} onPress={addTicketType}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.addButtonText}>Add Type</Text>
            </TouchableOpacity>
          </View>

          {ticketTypes.map((ticket, index) => (
            <View key={ticket.id} style={styles.ticketTypeCard}>
              <View style={styles.ticketTypeHeader}>
                <TextInput
                  style={styles.ticketNameInput}
                  placeholder="Ticket Name"
                  value={ticket.name}
                  onChangeText={(value) => updateTicketType(index, "name", value)}
                  placeholderTextColor="#666"
                />
                {index > 1 && ( // Don't allow removing Regular and Secure tickets
                  <TouchableOpacity style={styles.removeButton} onPress={() => removeTicketType(index)}>
                    <Ionicons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>

              <TextInput
                style={styles.ticketDescInput}
                placeholder="Description"
                value={ticket.description}
                onChangeText={(value) => updateTicketType(index, "description", value)}
                placeholderTextColor="#666"
              />

              <View style={styles.ticketRow}>
                <TextInput
                  style={styles.priceInput}
                  placeholder="Price (UGX)"
                  value={ticket.price.toString()}
                  onChangeText={(value) => updateTicketType(index, "price", Number.parseFloat(value) || 0)}
                  keyboardType="numeric"
                  placeholderTextColor="#666"
                  editable={ticket.id !== "regular" && ticket.id !== "secure"} // Base price controls these
                />
                <View style={styles.switchContainer}>
                  <Text style={styles.availableLabel}>Available</Text>
                  <Switch
                    value={ticket.isAvailable}
                    onValueChange={(value) => updateTicketType(index, "isAvailable", value)}
                    trackColor={{ false: "#767577", true: "#6366f1" }}
                    thumbColor={ticket.isAvailable ? "#f4f3f4" : "#f4f3f4"}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Payment Accounts */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Payment Accounts</Text>
            <TouchableOpacity style={styles.addButton} onPress={() => setShowAddPaymentAccount(true)}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.addButtonText}>Add Account</Text>
            </TouchableOpacity>
          </View>

          {paymentAccounts.map((account, index) => (
            <View key={index} style={styles.paymentAccountCard}>
              <View style={styles.paymentAccountHeader}>
                <View style={styles.paymentAccountInfo}>
                  <Ionicons
                    name={
                      account.type === "mtn" ? "phone-portrait" : account.type === "airtel" ? "phone-portrait" : "card"
                    }
                    size={20}
                    color="#2196F3"
                  />
                  <Text style={styles.paymentAccountType}>
                    {account.type.toUpperCase()} - {account.accountName}
                  </Text>
                </View>
                <TouchableOpacity style={styles.removeButton} onPress={() => removePaymentAccount(index)}>
                  <Ionicons name="close" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
              <Text style={styles.paymentAccountNumber}>{account.accountNumber}</Text>
            </View>
          ))}

          {showAddPaymentAccount && (
            <View style={styles.addPaymentForm}>
              <Text style={styles.formTitle}>Add Payment Account</Text>

              <View style={styles.paymentTypeButtons}>
                {(["mtn", "airtel", "card"] as PaymentMethod[]).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.paymentTypeButton,
                      newPaymentAccount.type === type && styles.paymentTypeButtonActive,
                    ]}
                    onPress={() => setNewPaymentAccount({ ...newPaymentAccount, type })}
                  >
                    <Text
                      style={[
                        styles.paymentTypeButtonText,
                        newPaymentAccount.type === type && styles.paymentTypeButtonTextActive,
                      ]}
                    >
                      {type.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.input}
                placeholder={newPaymentAccount.type === "card" ? "Card Number" : "Phone Number"}
                value={newPaymentAccount.accountNumber}
                onChangeText={(value) => setNewPaymentAccount({ ...newPaymentAccount, accountNumber: value })}
                keyboardType={newPaymentAccount.type === "card" ? "default" : "phone-pad"}
                placeholderTextColor="#666"
              />

              <TextInput
                style={styles.input}
                placeholder="Account Name"
                value={newPaymentAccount.accountName}
                onChangeText={(value) => setNewPaymentAccount({ ...newPaymentAccount, accountName: value })}
                placeholderTextColor="#666"
              />

              <View style={styles.formButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAddPaymentAccount(false)}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={addPaymentAccount}>
                  <Text style={styles.saveButtonText}>Add Account</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.submitButtonText}>{loading ? "Creating Event..." : "Create Event"}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    color: "#fff",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  dateTimeInput: {
    justifyContent: "center",
  },
  dateTimeContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateTimeText: {
    color: "#fff",
    fontSize: 16,
  },
  placeholderText: {
    color: "#666",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  switchLabel: {
    color: "#fff",
    fontSize: 16,
  },
  dropdown: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#333",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dropdownText: {
    color: "#fff",
  },
  dropdownPlaceholder: {
    color: "#666",
  },
  dropdownList: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#333",
    maxHeight: 200,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  dropdownItemText: {
    color: "#fff",
    fontSize: 16,
  },
  dropdownItemSubtext: {
    color: "#666",
    fontSize: 14,
    marginTop: 2,
  },
  imageButton: {
    borderRadius: 8,
    overflow: "hidden",
  },
  posterPreview: {
    width: "100%",
    height: 200,
  },
  imagePlaceholder: {
    backgroundColor: "#1a1a1a",
    height: 200,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#333",
    borderStyle: "dashed",
    borderRadius: 8,
  },
  imagePlaceholderText: {
    color: "#666",
    fontSize: 16,
    marginTop: 8,
  },
  addButton: {
    backgroundColor: "#6366f1",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  ticketTypeCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  ticketTypeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ticketNameInput: {
    flex: 1,
    backgroundColor: "#000",
    borderRadius: 6,
    padding: 8,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#444",
  },
  ticketDescInput: {
    backgroundColor: "#000",
    borderRadius: 6,
    padding: 8,
    color: "#fff",
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "#444",
  },
  ticketRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  priceInput: {
    flex: 1,
    backgroundColor: "#000",
    borderRadius: 6,
    padding: 8,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#444",
  },
  switchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  availableLabel: {
    color: "#fff",
    fontSize: 14,
  },
  removeButton: {
    backgroundColor: "#ef4444",
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  paymentAccountCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  paymentAccountHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  paymentAccountInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  paymentAccountType: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },
  paymentAccountNumber: {
    color: "#666",
    fontSize: 14,
    marginTop: 4,
    marginLeft: 28,
  },
  addPaymentForm: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  formTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 12,
  },
  paymentTypeButtons: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  paymentTypeButton: {
    flex: 1,
    backgroundColor: "#000",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#444",
    alignItems: "center",
  },
  paymentTypeButtonActive: {
    backgroundColor: "#6366f1",
    borderColor: "#6366f1",
  },
  paymentTypeButtonText: {
    color: "#666",
    fontSize: 14,
    fontWeight: "500",
  },
  paymentTypeButtonTextActive: {
    color: "#fff",
  },
  formButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#333",
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  saveButton: {
    flex: 1,
    backgroundColor: "#6366f1",
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  submitButton: {
    backgroundColor: "#6366f1",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
  },
  submitButtonDisabled: {
    backgroundColor: "#333",
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
})

export default AddEventScreen
