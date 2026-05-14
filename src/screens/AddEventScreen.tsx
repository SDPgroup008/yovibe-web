"use client"

import type React from "react"
import { useState, useEffect } from "react"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Dimensions,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { NativeStackScreenProps } from "@react-navigation/native-stack"
import ImagePickerService from "../services/ImagePickerService"
import FirebaseService from "../services/FirebaseService"
import LocationService from "../services/LocationService"
import { useAuth } from "../contexts/AuthContext"
import { VenuesStackParamList, EventsStackParamList } from "../navigation/types"

// Responsive breakpoints for add event screen
const { width } = Dimensions.get('window');
const isSmallDevice = width < 380;
const isTablet = width >= 768;
const isLargeScreen = width >= 1024;

console.log("[v0] AddEventScreen responsiveness initialized - Screen width:", width, "px | Device type:", isLargeScreen ? "Large/Desktop" : isTablet ? "Tablet" : "Mobile");

// Responsive helper function
const responsiveSize = (small: number, medium: number, large: number) => {
  if (isLargeScreen) return large;
  if (isTablet) return medium;
  return small;
};

type AddEventScreenProps =
  | NativeStackScreenProps<VenuesStackParamList, "AddEvent">
  | NativeStackScreenProps<EventsStackParamList, "AddEvent">

const AddEventScreen: React.FC<AddEventScreenProps> = ({ navigation, route }) => {
  const { user } = useAuth()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [date, setDate] = useState(new Date())
  const [dateString, setDateString] = useState(new Date().toISOString().split("T")[0])
  const [artists, setArtists] = useState("")
  const [image, setImage] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<any>(null)
  const [isFeatured, setIsFeatured] = useState(false)
  const [loading, setLoading] = useState(false)
  const [venues, setVenues] = useState<Array<{ id: string; name: string }>>([])
  const [selectedVenueId, setSelectedVenueId] = useState(route.params?.venueId ?? "")
  const [selectedVenueName, setSelectedVenueName] = useState(route.params?.venueName ?? "")
  const [showVenueSelector, setShowVenueSelector] = useState(false)
  const [useCustomVenue, setUseCustomVenue] = useState(false)
  const [customVenueName, setCustomVenueName] = useState("")
  const [customVenueAddress, setCustomVenueAddress] = useState("")
  const [latitude, setLatitude] = useState("0")
  const [longitude, setLongitude] = useState("0")
  const [location, setLocation] = useState("")
  const [isFreeEntry, setIsFreeEntry] = useState(false)
  const [showFeeForm, setShowFeeForm] = useState(false)
  const [entryFees, setEntryFees] = useState<Array<{ name: string; amount: string }>>([])
  const [newFeeName, setNewFeeName] = useState("")
  const [newFeeAmount, setNewFeeAmount] = useState("")
  const [showContactForm, setShowContactForm] = useState(false)
  const [ticketContacts, setTicketContacts] = useState<Array<{ number: string; type: "call" | "whatsapp" }>>([])
  const [newContactNumber, setNewContactNumber] = useState("")
  const [newContactType, setNewContactType] = useState<"call" | "whatsapp">("call")
  
  // Payment reception details (optional)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [paymentMethods, setPaymentMethods] = useState<{
    mobileMoney: Array<{ provider: "mtn" | "airtel"; number: string; name: string }>
    bankAccounts: Array<{ bankName: string; accountNumber: string; accountName: string }>
  }>({ mobileMoney: [], bankAccounts: [] })
  const [newMobileMoneyProvider, setNewMobileMoneyProvider] = useState<"mtn" | "airtel">("mtn")
  const [newMobileMoneyNumber, setNewMobileMoneyNumber] = useState("")
  const [newMobileMoneyName, setNewMobileMoneyName] = useState("")
  const [newBankName, setNewBankName] = useState("")
  const [newAccountNumber, setNewAccountNumber] = useState("")
  const [newAccountName, setNewAccountName] = useState("")
  const [locationPermission, setLocationPermission] = useState(false)
  const [startTime, setStartTime] = useState("21:00")  // Default: 9:00 PM
  const [endTime, setEndTime] = useState("05:00")      // Default: 5:00 AM (next day)
  const [errors, setErrors] = useState<{
    name?: string
    description?: string
    artists?: string
    image?: string
    venue?: string
    customVenueName?: string
    customVenueAddress?: string
    location?: string
    ticketContacts?: string
    entryFees?: string
  }>({})

  useEffect(() => {
    if (user && user.userType !== "club_owner") {
      loadVenues()
    } else if (user && user.userType === "club_owner") {
      // Fetch venue name for club owner
      const fetchVenueName = async () => {
        try {
          const venue = await FirebaseService.getVenueById(route.params?.venueId ?? "")
          if (venue) {
            setSelectedVenueName(venue.name)
          }
        } catch (error) {
          console.error("Error fetching venue name:", error)
        }
      }
      fetchVenueName()
    }
  }, [user, route.params?.venueId])

  useEffect(() => {
    if (useCustomVenue) {
      ;(async () => {
        const hasPermission = await LocationService.requestPermissions()
        setLocationPermission(hasPermission)
        if (hasPermission) {
          const location = await LocationService.getCurrentPosition()
          // Preserve full precision (no rounding)
          setLatitude(location.latitude.toString())
          setLongitude(location.longitude.toString())
        }
      })()
    }
  }, [useCustomVenue])

  const loadVenues = async () => {
    try {
      const venuesList = await FirebaseService.getVenues()
      setVenues(venuesList.map((venue) => ({ id: venue.id, name: venue.name })))
      // Set default venue if provided in route params
      if (route.params?.venueId) {
        const selectedVenue = venuesList.find((venue) => venue.id === route.params.venueId)
        if (selectedVenue) {
          setSelectedVenueName(selectedVenue.name)
        }
      }
    } catch (error) {
      console.error("Error loading venues:", error)
    }
  }

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(e.target.value)
    setDate(newDate)
    setDateString(e.target.value)
  }

  const handleVenueSelect = (venueId: string, venueName: string) => {
    setSelectedVenueId(venueId)
    setSelectedVenueName(venueName)
    setShowVenueSelector(false)
    setUseCustomVenue(false)
  }

  const toggleCustomVenue = () => {
    setUseCustomVenue(!useCustomVenue)
    if (!useCustomVenue) {
      setSelectedVenueId("")
      setSelectedVenueName("")
    } else {
      setCustomVenueName("")
      setCustomVenueAddress("")
      setLatitude("0")
      setLongitude("0")
    }
  }

  const toggleFreeEntry = () => {
    setIsFreeEntry(!isFreeEntry)
    if (!isFreeEntry) {
      setEntryFees([])
      setShowFeeForm(false)
    }
  }

  const toggleFeeForm = () => {
    setShowFeeForm(!showFeeForm)
    setNewFeeName("")
    setNewFeeAmount("")
  }

  const addFee = () => {
    if (!newFeeName.trim() || !newFeeAmount.trim()) {
      Alert.alert("Error", "Please enter both a fee name and amount")
      return
    }
    setEntryFees([...entryFees, { name: newFeeName, amount: newFeeAmount }])
    setNewFeeName("")
    setNewFeeAmount("")
    setShowFeeForm(false)
  }

  const removeFee = (index: number) => {
    setEntryFees(entryFees.filter((_, i) => i !== index))
  }

  const toggleContactForm = () => {
    setShowContactForm(!showContactForm)
    setNewContactNumber("")
    setNewContactType("call")
  }

  const addContact = () => {
    if (!newContactNumber.trim()) {
      Alert.alert("Error", "Please enter a valid phone number")
      return
    }
    if (!/^\+?\d+$/.test(newContactNumber)) {
      Alert.alert("Error", "Phone number must contain only digits and an optional country code (+)")
      return
    }
    setTicketContacts([...ticketContacts, { number: newContactNumber, type: newContactType }])
    setNewContactNumber("")
    setNewContactType("call")
    setShowContactForm(false)
  }

  const removeContact = (index: number) => {
    setTicketContacts(ticketContacts.filter((_, i) => i !== index))
  }

  // Payment method handlers
  const addMobileMoney = () => {
    if (!newMobileMoneyNumber.trim()) {
      Alert.alert("Error", "Please enter a mobile money number")
      return
    }
    if (!newMobileMoneyName.trim()) {
      Alert.alert("Error", "Please enter the account holder's name")
      return
    }
    if (!/^\+?\d{9,15}$/.test(newMobileMoneyNumber)) {
      Alert.alert("Error", "Please enter a valid mobile money number")
      return
    }
    setPaymentMethods({
      ...paymentMethods,
      mobileMoney: [...paymentMethods.mobileMoney, { provider: newMobileMoneyProvider, number: newMobileMoneyNumber, name: newMobileMoneyName }]
    })
    setNewMobileMoneyNumber("")
    setNewMobileMoneyName("")
    setNewMobileMoneyProvider("mtn")
  }

  const removeMobileMoney = (index: number) => {
    setPaymentMethods({
      ...paymentMethods,
      mobileMoney: paymentMethods.mobileMoney.filter((_, i) => i !== index)
    })
  }

  const addBankAccount = () => {
    if (!newBankName.trim() || !newAccountNumber.trim() || !newAccountName.trim()) {
      Alert.alert("Error", "Please fill in all bank account details")
      return
    }
    if (!/^\d{6,20}$/.test(newAccountNumber)) {
      Alert.alert("Error", "Please enter a valid account number")
      return
    }
    setPaymentMethods({
      ...paymentMethods,
      bankAccounts: [...paymentMethods.bankAccounts, { bankName: newBankName, accountNumber: newAccountNumber, accountName: newAccountName }]
    })
    setNewBankName("")
    setNewAccountNumber("")
    setNewAccountName("")
  }

  const removeBankAccount = (index: number) => {
    setPaymentMethods({
      ...paymentMethods,
      bankAccounts: paymentMethods.bankAccounts.filter((_, i) => i !== index)
    })
  }

  const pickImage = async () => {
    try {
      const result = await ImagePickerService.launchImageLibraryAsync({
        mediaTypes: "Images",
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.8,
      })

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedImage = result.assets[0]
        console.log("Image selected:", selectedImage.uri.substring(0, 50) + "...")
        setImage(selectedImage.uri)
        setImageFile(selectedImage)
      }
    } catch (error) {
      console.error("Error picking image:", error)
      Alert.alert("Error", "Failed to pick image")
    }
  }

  const handleImageUrlInput = () => {
    Alert.alert(
      "Image URL",
      "Please enter the URL of the image:",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "OK",
          onPress: (url) => {
            if (url) {
              setImage(url)
            }
          },
        },
      ],
      {
        userInterfaceStyle: "dark",
        onDismiss: () => {},
      }
    )
  }

  const handleSubmit = async () => {
    // Reset errors
    const newErrors: {
      name?: string
      description?: string
      artists?: string
      image?: string
      venue?: string
      customVenueName?: string
      customVenueAddress?: string
      location?: string
      ticketContacts?: string
      entryFees?: string
    } = {}

    // Validate fields
    if (!name.trim()) {
      newErrors.name = "Event Name is required"
    }
    if (!description.trim()) {
      newErrors.description = "Description is required"
    }
    if (!artists.trim()) {
      newErrors.artists = "Artists is required"
    }
    if (!image) {
      newErrors.image = "Event Poster image is required"
    }
    if (!user) {
      Alert.alert("Error", "You must be logged in to add an event")
      return
    }
    if (!useCustomVenue && !selectedVenueId) {
      newErrors.venue = "Please select a venue for this event"
    }
    if (useCustomVenue && !customVenueName.trim()) {
      newErrors.customVenueName = "Custom Venue Name is required"
    }
    if (useCustomVenue && !customVenueAddress.trim()) {
      newErrors.customVenueAddress = "Custom Venue Address is required"
    }
    if (!location.trim()) {
      newErrors.location = "Location (City) is required"
    }
    if (ticketContacts.length === 0) {
      newErrors.ticketContacts = "At least one ticket contact number is required"
    }
    if (!isFreeEntry && entryFees.length === 0) {
      newErrors.entryFees = "At least one entry fee is required or select Free Entry"
    }

    // If there are errors, display them and highlight fields
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      const errorMessages = Object.values(newErrors).join("\n")
      Alert.alert("Form Errors", errorMessages)
      return
    }

    // Clear errors if validation passes
    setErrors({})
    setLoading(true)

    try {
      let venueId = selectedVenueId
      let venueName = selectedVenueName

      if (useCustomVenue) {
        const customVenue = {
          name: customVenueName,
          location: customVenueAddress,
          description: `Custom venue for event: ${name}`,
          categories: ["Other"],
          vibeRating: 4.0,
          backgroundImageUrl: image || "",
          // Full precision preserved
          latitude: Number.parseFloat(latitude) || 0,
          longitude: Number.parseFloat(longitude) || 0,
          ownerId: user.id,
          createdAt: new Date(),
          // Narrow the literal so it matches the Venue type ("nightlife" | "recreation")
          venueType: "nightlife" as "nightlife",
          todayImages: [] as any[],
          weeklyPrograms: {} as Record<string, any>,
        }

        venueId = await FirebaseService.addVenue(customVenue)
        venueName = customVenueName
      }

      let imageUrl = image || ""
      if (imageFile) {
        try {
          console.log("Uploading event poster image...")
          // Ensure image is non-null before calling uploadEventImage
          if (image) {
            imageUrl = await FirebaseService.uploadEventImage(image)
            console.log("Image uploaded successfully:", imageUrl?.substring(0, 50) + "...")
          } else {
            console.warn("imageFile is true but image URI is null; skipping upload")
          }
        } catch (error) {
          console.error("Error uploading image:", error)
          Alert.alert("Warning", "There was an issue uploading the image, but we'll continue creating the event.")
        }
      }

      const eventData = {
        name,
        description,
        date,
        time: `${new Date(`2000-01-01T${startTime}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(`2000-01-01T${endTime}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        artists: artists.split(",").map((artist) => artist.trim()),
        venueId,
        venueName,
        posterImageUrl: imageUrl || "",
        isFeatured,
        location: location.toUpperCase(),
        ticketContacts,
        paymentMethods,
        entryFees: isFreeEntry ? [] : entryFees,
        attendees: [],
        createdBy: user.id,
        createdByType: user.userType,
        priceIndicator: entryFees.length > 0 ? Math.min(...entryFees.map((fee) => parseFloat(fee.amount))) : 0,
        isFreeEntry,
        createdAt: new Date(),
      }

      await FirebaseService.addEvent(eventData)

      Alert.alert("Success", "Event created successfully")
      navigation.goBack()
    } catch (error) {
      Alert.alert("Error", "Failed to create event")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.form}>
        <View style={styles.labelContainer}>
          <Text style={styles.label}>Event Name *</Text>
          {errors.name && <Text style={styles.errorStar}>*</Text>}
        </View>
        <TextInput
          style={[styles.input, errors.name && styles.errorInput]}
          value={name}
          onChangeText={setName}
          placeholder="Enter event name"
          placeholderTextColor="#999"
        />
        {errors.name && <Text style={styles.errorText}>Please enter an event name</Text>}

        <View style={styles.labelContainer}>
          <Text style={styles.label}>Description *</Text>
          {errors.description && <Text style={styles.errorStar}>*</Text>}
        </View>
        <TextInput
          style={[styles.input, styles.textArea, errors.description && styles.errorInput]}
          value={description}
          onChangeText={setDescription}
          placeholder="Enter event description"
          placeholderTextColor="#999"
          multiline
          numberOfLines={4}
        />
        {errors.description && <Text style={styles.errorText}>Please enter an event description</Text>}

                {/* Date Picker */}
        <Text style={styles.label}>Event Date *</Text>
        <View style={styles.datePickerContainer}>
          <input
            type="date"
            value={dateString}
            onChange={handleDateChange}
            min={new Date().toISOString().split("T")[0]}
            style={{
              backgroundColor: "#1E1E1E",
              color: "#FFFFFF",
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #333",
              width: "100%",
              fontSize: 16,
            }}
          />
        </View>

        {/* Start & End Time Pickers */}
        <Text style={styles.label}>Event Time *</Text>
        <View style={{ flexDirection: "row", gap: 16, marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#999", fontSize: 14, marginBottom: 8 }}>Start Time</Text>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={{
                backgroundColor: "#1E1E1E",
                color: "#FFFFFF",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #333",
                width: "100%",
                fontSize: 16,
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#999", fontSize: 14, marginBottom: 8 }}>End Time</Text>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              style={{
                backgroundColor: "#1E1E1E",
                color: "#FFFFFF",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #333",
                width: "100%",
                fontSize: 16,
              }}
            />
          </View>
        </View>

        {/* Optional: Show formatted time string (e.g. "09:00 PM - 05:00 AM") */}
        <View style={{ marginBottom: 16, padding: 12, backgroundColor: "#1E1E1E", borderRadius: 8 }}>
          <Text style={{ color: "#00D4FF", fontWeight: "600" }}>
            Time: {new Date(`2000-01-01T${startTime}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{" "}
            {new Date(`2000-01-01T${endTime}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>

        <View style={styles.labelContainer}>
          <Text style={styles.label}>Artists *</Text>
          {errors.artists && <Text style={styles.errorStar}>*</Text>}
        </View>
        <TextInput
          style={[styles.input, errors.artists && styles.errorInput]}
          value={artists}
          onChangeText={setArtists}
          placeholder="Enter artists (comma separated)"
          placeholderTextColor="#999"
        />
        {errors.artists && <Text style={styles.errorText}>Please enter at least one artist</Text>}

        {(!user?.userType || user?.userType !== "club_owner") && (
          <>
            <View style={styles.venueToggleContainer}>
              <TouchableOpacity
                style={[styles.venueToggleButton, !useCustomVenue && styles.venueToggleButtonActive]}
                onPress={() => setUseCustomVenue(false)}
              >
                <Text style={styles.venueToggleText}>Select Existing Venue</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.venueToggleButton, useCustomVenue && styles.venueToggleButtonActive]}
                onPress={() => setUseCustomVenue(true)}
              >
                <Text style={styles.venueToggleText}>Add Custom Venue</Text>
              </TouchableOpacity>
            </View>

            {!useCustomVenue ? (
              <>
                <View style={styles.labelContainer}>
                  <Text style={styles.label}>Venue *</Text>
                  {errors.venue && <Text style={styles.errorStar}>*</Text>}
                </View>
                <TouchableOpacity
                  style={[styles.venueSelector, errors.venue && styles.errorInput]}
                  onPress={() => setShowVenueSelector(!showVenueSelector)}
                >
                  <Text style={styles.venueSelectorText}>{selectedVenueName || "Select a venue"}</Text>
                  <Ionicons name={showVenueSelector ? "chevron-up" : "chevron-down"} size={24} color="#FFFFFF" />
                </TouchableOpacity>
                {errors.venue && <Text style={styles.errorText}>Please select a venue</Text>}

                {showVenueSelector && (
                  <View style={styles.venueDropdown}>
                    <ScrollView style={styles.venueList} nestedScrollEnabled>
                      {venues.map((venue) => (
                        <TouchableOpacity
                          key={venue.id}
                          style={styles.venueItem}
                          onPress={() => handleVenueSelect(venue.id, venue.name)}
                        >
                          <Text style={styles.venueItemText}>{venue.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </>
            ) : (
              <>
                <View style={styles.labelContainer}>
                  <Text style={styles.label}>Custom Venue Name *</Text>
                  {errors.customVenueName && <Text style={styles.errorStar}>*</Text>}
                </View>
                <TextInput
                  style={[styles.input, errors.customVenueName && styles.errorInput]}
                  value={customVenueName}
                  onChangeText={setCustomVenueName}
                  placeholder="Enter venue name"
                  placeholderTextColor="#999"
                />
                {errors.customVenueName && <Text style={styles.errorText}>Please enter a custom venue name</Text>}

                <View style={styles.labelContainer}>
                  <Text style={styles.label}>Custom Venue Address *</Text>
                  {errors.customVenueAddress && <Text style={styles.errorStar}>*</Text>}
                </View>
                <TextInput
                  style={[styles.input, errors.customVenueAddress && styles.errorInput]}
                  value={customVenueAddress}
                  onChangeText={setCustomVenueAddress}
                  placeholder="Enter venue address"
                  placeholderTextColor="#999"
                />
                {errors.customVenueAddress && <Text style={styles.errorText}>Please enter a custom venue address</Text>}

                <View style={styles.locationContainer}>
                  <View style={styles.locationField}>
                    <Text style={styles.label}>Latitude</Text>
                    <TextInput
                      style={styles.input}
                      value={latitude}
                      onChangeText={setLatitude}
                      placeholder="Latitude"
                      placeholderTextColor="#999"
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.locationField}>
                    <Text style={styles.label}>Longitude</Text>
                    <TextInput
                      style={styles.input}
                      value={longitude}
                      onChangeText={setLongitude}
                      placeholder="Longitude"
                      placeholderTextColor="#999"
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </>
            )}
          </>
        )}

        {user?.userType === "club_owner" && (
          <>
            <Text style={styles.label}>Venue</Text>
            <View style={styles.venueInfo}>
              <Text style={styles.venueText}>{selectedVenueName || "No venue selected"}</Text>
            </View>
          </>
        )}

        {user?.userType === "admin" && (
          <View style={styles.checkboxContainer}>
            <TouchableOpacity style={styles.checkbox} onPress={() => setIsFeatured(!isFeatured)}>
              {isFeatured ? (
                <Ionicons name="checkbox" size={24} color="#2196F3" />
              ) : (
                <Ionicons name="square-outline" size={24} color="#FFFFFF" />
              )}
            </TouchableOpacity>
            <Text style={styles.checkboxLabel}>Feature this event</Text>
          </View>
        )}

        <View style={styles.labelContainer}>
          <Text style={styles.label}>Location (City) *</Text>
          {errors.location && <Text style={styles.errorStar}>*</Text>}
        </View>
        <TextInput
          style={[styles.input, errors.location && styles.errorInput]}
          value={location}
          onChangeText={setLocation}
          placeholder="Enter event location (e.g. KAMPALA)"
          placeholderTextColor="#999"
        />
        {errors.location && <Text style={styles.errorText}>Please enter the city location</Text>}

        <View style={styles.labelContainer}>
          <Text style={styles.label}>Entry Fees *</Text>
          {errors.entryFees && <Text style={styles.errorStar}>*</Text>}
        </View>
        <View style={styles.checkboxContainer}>
          <TouchableOpacity style={styles.checkbox} onPress={toggleFreeEntry}>
            {isFreeEntry ? (
              <Ionicons name="checkbox" size={24} color="#2196F3" />
            ) : (
              <Ionicons name="square-outline" size={24} color="#FFFFFF" />
            )}
          </TouchableOpacity>
          <Text style={styles.checkboxLabel}>Free Entry</Text>
        </View>
        {!isFreeEntry && (
          <>
            <TouchableOpacity
              style={[styles.addButton, errors.entryFees && styles.errorInput]}
              onPress={toggleFeeForm}
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add Fee</Text>
            </TouchableOpacity>
            {errors.entryFees && (
              <Text style={styles.errorText}>Please add at least one entry fee or select Free Entry</Text>
            )}
            {showFeeForm && (
              <View style={styles.feeContainer}>
                <TextInput
                  style={[styles.input, styles.feeNameInput]}
                  value={newFeeName}
                  onChangeText={setNewFeeName}
                  placeholder="Fee name (e.g. VIP, Regular)"
                  placeholderTextColor="#999"
                />
                <TextInput
                  style={[styles.input, styles.feeAmountInput]}
                  value={newFeeAmount}
                  onChangeText={setNewFeeAmount}
                  placeholder="Amount (e.g. 20,000 UGX)"
                  placeholderTextColor="#999"
                />
                <TouchableOpacity style={styles.addButton} onPress={addFee}>
                  <Ionicons name="add" size={20} color="#FFFFFF" />
                  <Text style={styles.addButtonText}>Submit</Text>
                </TouchableOpacity>
              </View>
            )}
            {entryFees.map((fee, index) => (
              <View key={index} style={styles.feeItem}>
                <Text style={styles.feeText}>
                  {fee.name}: {fee.amount}
                </Text>
                <TouchableOpacity onPress={() => removeFee(index)}>
                  <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        <View style={styles.labelContainer}>
          <Text style={styles.label}>Ticket Contact Numbers *</Text>
          {errors.ticketContacts && <Text style={styles.errorStar}>*</Text>}
        </View>
        <TouchableOpacity
          style={[styles.addButton, errors.ticketContacts && styles.errorInput]}
          onPress={toggleContactForm}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add Contact</Text>
        </TouchableOpacity>
        {errors.ticketContacts && (
          <Text style={styles.errorText}>Please add at least one ticket contact number</Text>
        )}
        {showContactForm && (
          <View style={styles.contactContainer}>
            <TextInput
              style={[styles.input, styles.contactInput]}
              value={newContactNumber}
              onChangeText={setNewContactNumber}
              placeholder="Enter phone number (e.g. +256123456789)"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
            />
            <View style={styles.contactTypeContainer}>
              <TouchableOpacity
                style={[styles.contactTypeButton, newContactType === "call" && styles.selectedContactTypeButton]}
                onPress={() => setNewContactType("call")}
              >
                <Ionicons name="call-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.contactTypeButton, newContactType === "whatsapp" && styles.selectedContactTypeButton]}
                onPress={() => setNewContactType("whatsapp")}
              >
                <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.addButton} onPress={addContact}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Submit</Text>
            </TouchableOpacity>
          </View>
        )}
        {ticketContacts.map((contact, index) => (
          <View key={index} style={styles.contactItem}>
            <Text style={styles.contactText}>
              {contact.number} ({contact.type === "call" ? "Call" : "WhatsApp"})
            </Text>
            <TouchableOpacity onPress={() => removeContact(index)}>
              <Ionicons name="trash-outline" size={20} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        ))}

        {/* Sell Tickets - Payment Reception Details */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowPaymentForm(!showPaymentForm)}
        >
          <Ionicons name="wallet-outline" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Sell Tickets (Optional)</Text>
        </TouchableOpacity>

        {showPaymentForm && (
          <View style={styles.paymentFormContainer}>
            {/* Mobile Money Section */}
            <Text style={styles.paymentSectionTitle}>Mobile Money</Text>
            <View style={styles.providerButtons}>
              <TouchableOpacity
                style={[styles.providerButton, newMobileMoneyProvider === "mtn" && styles.providerButtonActive]}
                onPress={() => setNewMobileMoneyProvider("mtn")}
              >
                <Text style={[styles.providerButtonText, newMobileMoneyProvider === "mtn" && styles.providerButtonTextActive]}>MTN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.providerButton, newMobileMoneyProvider === "airtel" && styles.providerButtonActive]}
                onPress={() => setNewMobileMoneyProvider("airtel")}
              >
                <Text style={[styles.providerButtonText, newMobileMoneyProvider === "airtel" && styles.providerButtonTextActive]}>Airtel</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={newMobileMoneyNumber}
              onChangeText={setNewMobileMoneyNumber}
              placeholder="Enter mobile money number"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              value={newMobileMoneyName}
              onChangeText={setNewMobileMoneyName}
              placeholder="Account holder name"
              placeholderTextColor="#999"
            />
            <TouchableOpacity style={styles.addButton} onPress={addMobileMoney}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add Mobile Money</Text>
            </TouchableOpacity>
            {paymentMethods.mobileMoney.map((mm, index) => (
              <View key={index} style={styles.paymentItem}>
                <Text style={styles.paymentText}>
                  {mm.provider.toUpperCase()}: {mm.number} ({mm.name})
                </Text>
                <TouchableOpacity onPress={() => removeMobileMoney(index)}>
                  <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            ))}

            {/* Bank Account Section */}
            <Text style={styles.paymentSectionTitle}>Bank Account</Text>
            <TextInput
              style={styles.input}
              value={newBankName}
              onChangeText={setNewBankName}
              placeholder="Bank name (e.g. Stanbic)"
              placeholderTextColor="#999"
            />
            <TextInput
              style={styles.input}
              value={newAccountNumber}
              onChangeText={setNewAccountNumber}
              placeholder="Account number"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              value={newAccountName}
              onChangeText={setNewAccountName}
              placeholder="Account name"
              placeholderTextColor="#999"
            />
            <TouchableOpacity style={styles.addButton} onPress={addBankAccount}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add Bank Account</Text>
            </TouchableOpacity>
            {paymentMethods.bankAccounts.map((bank, index) => (
              <View key={index} style={styles.paymentItem}>
                <Text style={styles.paymentText}>
                  {bank.bankName}: {bank.accountNumber} ({bank.accountName})
                </Text>
                <TouchableOpacity onPress={() => removeBankAccount(index)}>
                  <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={styles.labelContainer}>
          <Text style={styles.label}>Event Poster *</Text>
          {errors.image && <Text style={styles.errorStar}>*</Text>}
        </View>
        <View style={styles.imageOptions}>
          <TouchableOpacity
            style={[styles.imageButton, errors.image && styles.errorInput]}
            onPress={pickImage}
          >
            <Ionicons name="image" size={20} color="#FFFFFF" />
            <Text style={styles.imageButtonText}>Pick from Device</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.imageButton, errors.image && styles.errorInput]}
            onPress={handleImageUrlInput}
          >
            <Ionicons name="link" size={20} color="#FFFFFF" />
            <Text style={styles.imageButtonText}>Enter URL</Text>
          </TouchableOpacity>
        </View>
        {errors.image && <Text style={styles.errorText}>Please select an image for the event poster</Text>}

        {image && (
          <View style={styles.imagePreview}>
            <Image source={{ uri: image }} style={styles.previewImage} />
            <TouchableOpacity
              style={styles.removeImageButton}
              onPress={() => {
                setImage(null)
                setImageFile(null)
              }}
            >
              <Ionicons name="close-circle" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
              <Text style={styles.submitButtonText}>Create Event</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  form: {
    padding: responsiveSize(12, 16, 24),
    maxWidth: isLargeScreen ? 900 : "100%",
    alignSelf: "center",
    width: "100%",
    paddingBottom: responsiveSize(24, 32, 48),
  },
  labelContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: responsiveSize(6, 8, 10),
  },
  label: {
    fontSize: responsiveSize(14, 15, 16),
    color: "#FFFFFF",
    fontWeight: "500",
  },
  errorStar: {
    fontSize: responsiveSize(14, 15, 16),
    color: "#FF3B30",
    marginLeft: 4,
  },
  errorText: {
    fontSize: responsiveSize(11, 12, 13),
    color: "#FF3B30",
    marginBottom: responsiveSize(12, 14, 16),
  },
  input: {
    backgroundColor: "#1E1E1E",
    borderRadius: responsiveSize(6, 8, 10),
    padding: responsiveSize(10, 12, 14),
    color: "#FFFFFF",
    marginBottom: responsiveSize(14, 16, 18),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    fontSize: responsiveSize(14, 15, 16),
  },
  errorInput: {
    borderColor: "#FF3B30",
    backgroundColor: "rgba(255, 59, 48, 0.1)",
  },
  textArea: {
    height: responsiveSize(80, 100, 120),
    textAlignVertical: "top",
  },
  datePickerContainer: {
    marginBottom: responsiveSize(14, 16, 18),
  },
  venueToggleContainer: {
    flexDirection: "row",
    marginBottom: responsiveSize(14, 16, 18),
    gap: responsiveSize(8, 10, 12),
  },
  venueToggleButton: {
    flex: 1,
    padding: responsiveSize(8, 10, 12),
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    backgroundColor: "#1E1E1E",
    borderRadius: responsiveSize(6, 8, 10),
  },
  venueToggleButtonActive: {
    backgroundColor: "#2196F3",
    borderColor: "#2196F3",
  },
  venueToggleText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(12, 13, 14),
  },
  venueSelector: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1E1E1E",
    borderRadius: responsiveSize(6, 8, 10),
    padding: responsiveSize(10, 12, 14),
    marginBottom: responsiveSize(8, 10, 12),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  venueSelectorText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(14, 15, 16),
  },
  venueDropdown: {
    backgroundColor: "#1E1E1E",
    borderRadius: responsiveSize(6, 8, 10),
    marginBottom: responsiveSize(14, 16, 18),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    maxHeight: responsiveSize(120, 150, 200),
  },
  venueList: {
    padding: responsiveSize(6, 8, 10),
  },
  venueItem: {
    padding: responsiveSize(10, 12, 14),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  venueItemText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(13, 14, 15),
  },
  venueInfo: {
    backgroundColor: "#1E1E1E",
    borderRadius: responsiveSize(6, 8, 10),
    padding: responsiveSize(10, 12, 14),
    marginBottom: responsiveSize(14, 16, 18),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  venueText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(13, 14, 15),
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: responsiveSize(14, 16, 18),
  },
  checkbox: {
    marginRight: responsiveSize(8, 10, 12),
  },
  checkboxLabel: {
    color: "#FFFFFF",
    fontSize: responsiveSize(13, 14, 15),
  },
  imageOptions: {
    flexDirection: isSmallDevice ? "column" : "row",
    marginBottom: responsiveSize(14, 16, 18),
    gap: responsiveSize(8, 10, 12),
  },
  imageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    padding: responsiveSize(10, 12, 14),
    borderRadius: responsiveSize(6, 8, 10),
    flex: 1,
    marginRight: isSmallDevice ? 0 : 0,
    height: responsiveSize(44, 48, 52),
  },
  imageButtonText: {
    color: "#FFFFFF",
    marginLeft: responsiveSize(8, 10, 12),
    fontSize: responsiveSize(13, 14, 15),
  },
  imagePreview: {
    height: responsiveSize(160, 200, 240),
    marginBottom: responsiveSize(14, 16, 18),
    borderRadius: responsiveSize(8, 10, 12),
    overflow: "hidden",
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  removeImageButton: {
    position: "absolute",
    top: responsiveSize(6, 8, 10),
    right: responsiveSize(6, 8, 10),
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: responsiveSize(12, 15, 18),
    padding: responsiveSize(4, 6, 8),
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    borderRadius: responsiveSize(6, 8, 10),
    padding: responsiveSize(14, 16, 18),
    marginTop: responsiveSize(8, 10, 12),
    marginBottom: responsiveSize(24, 32, 40),
    height: responsiveSize(48, 52, 56),
  },
  disabledButton: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(14, 15, 16),
    fontWeight: "bold",
    marginLeft: responsiveSize(8, 10, 12),
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    padding: responsiveSize(10, 12, 14),
    borderRadius: responsiveSize(6, 8, 10),
    marginBottom: responsiveSize(14, 16, 18),
    height: responsiveSize(44, 48, 52),
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(13, 14, 15),
    marginLeft: responsiveSize(8, 10, 12),
  },
  feeContainer: {
    marginBottom: responsiveSize(14, 16, 18),
  },
  feeNameInput: {
    flex: 1,
    marginBottom: responsiveSize(8, 10, 12),
  },
  feeAmountInput: {
    flex: 1,
    marginBottom: responsiveSize(8, 10, 12),
  },
  feeItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1E1E1E",
    padding: responsiveSize(10, 12, 14),
    borderRadius: responsiveSize(6, 8, 10),
    marginBottom: responsiveSize(8, 10, 12),
  },
  feeText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(13, 14, 15),
  },
  contactContainer: {
    marginBottom: responsiveSize(14, 16, 18),
  },
  contactInput: {
    flex: 1,
    marginBottom: responsiveSize(8, 10, 12),
  },
  contactTypeContainer: {
    flexDirection: (isSmallDevice ? "column" : "row") as "column" | "row",
    justifyContent: "space-between",
    marginBottom: responsiveSize(8, 10, 12),
    gap: responsiveSize(8, 10, 12),
  },
  contactTypeButton: {
    flex: 1,
    padding: responsiveSize(10, 12, 14),
    alignItems: "center",
    backgroundColor: "#1E1E1E",
    marginRight: 0,
    borderRadius: responsiveSize(6, 8, 10),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    height: responsiveSize(44, 48, 52),
    justifyContent: "center",
  },
  selectedContactTypeButton: {
    backgroundColor: "#2196F3",
    borderColor: "#2196F3",
  },
  contactItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1E1E1E",
    padding: responsiveSize(10, 12, 14),
    borderRadius: responsiveSize(6, 8, 10),
    marginBottom: responsiveSize(8, 10, 12),
  },
  contactText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(13, 14, 15),
  },
  // Payment form styles
  paymentFormContainer: {
    backgroundColor: "#1A1A1A",
    padding: responsiveSize(14, 16, 18),
    borderRadius: responsiveSize(8, 10, 12),
    marginBottom: responsiveSize(14, 16, 18),
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.2)",
  },
  paymentSectionTitle: {
    fontSize: responsiveSize(14, 15, 16),
    fontWeight: "bold",
    color: "#00D4FF",
    marginBottom: responsiveSize(10, 12, 14),
    marginTop: responsiveSize(8, 10, 12),
  },
  providerButtons: {
    flexDirection: "row",
    gap: responsiveSize(8, 10, 12),
    marginBottom: responsiveSize(10, 12, 14),
  },
  providerButton: {
    flex: 1,
    padding: responsiveSize(10, 12, 14),
    alignItems: "center",
    backgroundColor: "#1E1E1E",
    borderRadius: responsiveSize(6, 8, 10),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  providerButtonActive: {
    backgroundColor: "#2196F3",
    borderColor: "#2196F3",
  },
  providerButtonText: {
    color: "#888888",
    fontSize: responsiveSize(13, 14, 15),
    fontWeight: "600",
  },
  providerButtonTextActive: {
    color: "#FFFFFF",
  },
  paymentItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1E1E1E",
    padding: responsiveSize(10, 12, 14),
    borderRadius: responsiveSize(6, 8, 10),
    marginBottom: responsiveSize(8, 10, 12),
  },
  paymentText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(13, 14, 15),
    flex: 1,
  },
  locationContainer: {
    flexDirection: (isSmallDevice ? "column" : "row") as "column" | "row",
    justifyContent: "space-between",
    gap: responsiveSize(10, 12, 14),
    marginBottom: responsiveSize(14, 16, 18),
  },
  locationField: {
    width: isSmallDevice ? "100%" : "48%",
  },
})

export default AddEventScreen
