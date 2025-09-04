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
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { NativeStackScreenProps } from "@react-navigation/native-stack"
import ImagePickerService from "../services/ImagePickerService"
import FirebaseService from "../services/FirebaseService"
import LocationService from "../services/LocationService"
import { useAuth } from "../contexts/AuthContext"
import { VenuesStackParamList, EventsStackParamList } from "../navigation/types"

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
  const [locationPermission, setLocationPermission] = useState(false)

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
    if (!name || !description || !artists) {
      Alert.alert("Error", "Please fill in all required fields")
      return
    }

    if (!image) {
      Alert.alert("Error", "Please select an image for the event")
      return
    }

    if (!user) {
      Alert.alert("Error", "You must be logged in to add an event")
      return
    }

    if (!useCustomVenue && !selectedVenueId) {
      Alert.alert("Error", "Please select a venue for this event")
      return
    }

    if (useCustomVenue && (!customVenueName || !customVenueAddress)) {
      Alert.alert("Error", "Please enter both name and address for the custom venue")
      return
    }

    if (!location) {
      Alert.alert("Error", "Please enter the location of the event")
      return
    }

    if (ticketContacts.length === 0) {
      Alert.alert("Error", "Please add at least one ticket contact number")
      return
    }

    if (!isFreeEntry && entryFees.length === 0) {
      Alert.alert("Error", "Please add at least one entry fee or select Free Entry")
      return
    }

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
          backgroundImageUrl: image,
          latitude: Number.parseFloat(latitude) || 0,
          longitude: Number.parseFloat(longitude) || 0,
          ownerId: user.id,
          createdAt: new Date(),
          venueType: "nightlife",
          todayImages: [],
          weeklyPrograms: {},
        }

        venueId = await FirebaseService.addVenue(customVenue)
        venueName = customVenueName
      }

      let imageUrl = image
      if (imageFile) {
        try {
          console.log("Uploading event poster image...")
          imageUrl = await FirebaseService.uploadEventImage(image)
          console.log("Image uploaded successfully:", imageUrl?.substring(0, 50) + "...")
        } catch (error) {
          console.error("Error uploading image:", error)
          Alert.alert("Warning", "There was an issue uploading the image, but we'll continue creating the event.")
        }
      }

      const eventData = {
        name,
        description,
        date,
        artists: artists.split(",").map((artist) => artist.trim()),
        venueId,
        venueName,
        posterImageUrl: imageUrl || "",
        isFeatured,
        location: location.toUpperCase(),
        ticketContacts,
        entryFees: isFreeEntry ? [] : entryFees,
        attendees: [],
        createdBy: user.id,
        createdByType: user.userType,
        priceIndicator: entryFees.length > 0 ? Math.min(...entryFees.map(fee => parseFloat(fee.amount))) : 0,
        isFreeEntry,
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
        <Text style={styles.label}>Event Name *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Enter event name"
          placeholderTextColor="#999"
        />

        <Text style={styles.label}>Description *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Enter event description"
          placeholderTextColor="#999"
          multiline
          numberOfLines={4}
        />

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
              marginBottom: "16px",
            }}
          />
        </View>

        <Text style={styles.label}>Artists *</Text>
        <TextInput
          style={styles.input}
          value={artists}
          onChangeText={setArtists}
          placeholder="Enter artists (comma separated)"
          placeholderTextColor="#999"
        />

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
                <Text style={styles.label}>Venue *</Text>
                <TouchableOpacity style={styles.venueSelector} onPress={() => setShowVenueSelector(!showVenueSelector)}>
                  <Text style={styles.venueSelectorText}>{selectedVenueName || "Select a venue"}</Text>
                  <Ionicons name={showVenueSelector ? "chevron-up" : "chevron-down"} size={24} color="#FFFFFF" />
                </TouchableOpacity>

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
                <Text style={styles.label}>Custom Venue Name *</Text>
                <TextInput
                  style={styles.input}
                  value={customVenueName}
                  onChangeText={setCustomVenueName}
                  placeholder="Enter venue name"
                  placeholderTextColor="#999"
                />

                <Text style={styles.label}>Custom Venue Address *</Text>
                <TextInput
                  style={styles.input}
                  value={customVenueAddress}
                  onChangeText={setCustomVenueAddress}
                  placeholder="Enter venue address"
                  placeholderTextColor="#999"
                />

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

        <Text style={styles.label}>Location (City) *</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder="Enter event location (e.g. KAMPALA)"
          placeholderTextColor="#999"
        />

        <Text style={styles.label}>Entry Fees *</Text>
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
            <TouchableOpacity style={styles.addButton} onPress={toggleFeeForm}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add Fee</Text>
            </TouchableOpacity>
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
                  <Text style={styles.addButtonText}>Add</Text>
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

        <Text style={styles.label}>Ticket Contact Numbers *</Text>
        <TouchableOpacity style={styles.addButton} onPress={toggleContactForm}>
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add Contact</Text>
        </TouchableOpacity>
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
              <Text style={styles.addButtonText}>Add</Text>
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

        <Text style={styles.label}>Event Poster *</Text>
        <View style={styles.imageOptions}>
          <TouchableOpacity style={styles.imageButton} onPress={pickImage}>
            <Ionicons name="image" size={20} color="#FFFFFF" />
            <Text style={styles.imageButtonText}>Pick from Device</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.imageButton} onPress={handleImageUrlInput}>
            <Ionicons name="link" size={20} color="#FFFFFF" />
            <Text style={styles.imageButtonText}>Enter URL</Text>
          </TouchableOpacity>
        </View>

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
    padding: 16,
  },
  label: {
    fontSize: 16,
    color: "#FFFFFF",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    padding: 12,
    color: "#FFFFFF",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  datePickerContainer: {
    marginBottom: 16,
  },
  venueToggleContainer: {
    flexDirection: "row",
    marginBottom: 16,
  },
  venueToggleButton: {
    flex: 1,
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
    backgroundColor: "#1E1E1E",
  },
  venueToggleButtonActive: {
    backgroundColor: "#2196F3",
  },
  venueToggleText: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  venueSelector: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  venueSelectorText: {
    color: "#FFFFFF",
  },
  venueDropdown: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#333",
    maxHeight: 150,
  },
  venueList: {
    padding: 8,
  },
  venueItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  venueItemText: {
    color: "#FFFFFF",
  },
  venueInfo: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  venueText: {
    color: "#FFFFFF",
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  checkbox: {
    marginRight: 8,
  },
  checkboxLabel: {
    color: "#FFFFFF",
  },
  imageOptions: {
    flexDirection: "row",
    marginBottom: 16,
  },
  imageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    padding: 12,
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
  },
  imageButtonText: {
    color: "#FFFFFF",
    marginLeft: 8,
  },
  imagePreview: {
    height: 200,
    marginBottom: 16,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  removeImageButton: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 15,
    padding: 2,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    marginLeft: 8,
  },
  feeContainer: {
    marginBottom: 16,
  },
  feeNameInput: {
    flex: 1,
    marginBottom: 8,
  },
  feeAmountInput: {
    flex: 1,
    marginBottom: 8,
  },
  feeItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1E1E1E",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  feeText: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  contactContainer: {
    marginBottom: 16,
  },
  contactInput: {
    flex: 1,
    marginBottom: 8,
  },
  contactTypeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  contactTypeButton: {
    flex: 1,
    padding: 12,
    alignItems: "center",
    backgroundColor: "#1E1E1E",
    marginRight: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
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
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  contactText: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  locationContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  locationField: {
    width: "48%",
  },
})

export default AddEventScreen