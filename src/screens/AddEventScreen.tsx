"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useNavigation } from "@react-navigation/native"
import { useAuth } from "../contexts/AuthContext"
import firebaseService from "../services/FirebaseService"
import ImagePickerService from "../services/ImagePickerService.web"
import type { Event, ContactPhone } from "../models/Event"
import type { Venue } from "../models/Venue"
import { ScrollView, View, TouchableOpacity, Text } from "react-native"
import Ionicons from "react-native-vector-icons/Ionicons"

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

  const [contactPhones, setContactPhones] = useState<ContactPhone[]>([])
  const [showAddContact, setShowAddContact] = useState(false)
  const [newContact, setNewContact] = useState<ContactPhone>({
    number: "",
    name: "",
    isWhatsApp: false,
    isPrimary: false,
  })

  useEffect(() => {
    loadVenues()
  }, [])

  useEffect(() => {
    // Update ticket prices when base price changes
    const price = Number.parseFloat(basePrice) || 0
    // Placeholder for ticket types update logic
  }, [basePrice])

  const loadVenues = async () => {
    try {
      const venuesList = await firebaseService.getVenues()
      setVenues(venuesList)
    } catch (error) {
      console.error("Error loading venues:", error)
      alert("Failed to load venues")
    }
  }

  const handleImagePicker = async () => {
    try {
      console.log("AddEventScreen: Starting image picker")

      const result = await ImagePickerService.launchImageLibraryAsync({
        mediaTypes: "Images",
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      })

      console.log("AddEventScreen: Image picker result:", result)

      if (result && !result.canceled && result.assets?.[0]) {
        setPosterImage(result.assets[0].uri)
        console.log("AddEventScreen: Poster image set:", result.assets[0].uri)
      }
    } catch (error) {
      console.error("AddEventScreen: Error picking image:", error)
      alert("Failed to pick image. Please try again.")
    }
  }

  const addContactPhone = () => {
    if (!newContact.number || !newContact.name) {
      alert("Please fill in all contact details")
      return
    }

    // Validate phone number format (basic validation)
    if (!/^[0-9+\-\s()]+$/.test(newContact.number)) {
      alert("Invalid phone number format")
      return
    }

    // If this is the first contact or marked as primary, make it primary
    const updatedContact = { ...newContact }
    if (contactPhones.length === 0 || newContact.isPrimary) {
      // Remove primary from other contacts if this one is primary
      const updatedContacts = contactPhones.map((contact) => ({ ...contact, isPrimary: false }))
      setContactPhones([...updatedContacts, { ...updatedContact, isPrimary: true }])
    } else {
      setContactPhones([...contactPhones, updatedContact])
    }

    setNewContact({
      number: "",
      name: "",
      isWhatsApp: false,
      isPrimary: false,
    })
    setShowAddContact(false)
  }

  const removeContactPhone = (index: number) => {
    const updatedContacts = contactPhones.filter((_, i) => i !== index)
    // If we removed the primary contact, make the first one primary
    if (contactPhones[index].isPrimary && updatedContacts.length > 0) {
      updatedContacts[0].isPrimary = true
    }
    setContactPhones(updatedContacts)
  }

  const togglePrimary = (index: number) => {
    const updatedContacts = contactPhones.map((contact, i) => ({
      ...contact,
      isPrimary: i === index,
    }))
    setContactPhones(updatedContacts)
  }

  const handleSubmit = async () => {
    if (!eventName.trim()) {
      alert("Please enter event name")
      return
    }

    if (!selectedVenue) {
      alert("Please select a venue")
      return
    }

    if (!date || !time) {
      alert("Please select date and time")
      return
    }

    if (!posterImage) {
      alert("Please select a poster image")
      return
    }

    if (contactPhones.length === 0) {
      alert("Please add at least one contact phone number for ticket inquiries")
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
        contactPhones,
      }

      await firebaseService.addEvent(eventData)

      alert("Event created successfully!")
      navigation.goBack()
    } catch (error) {
      console.error("Error creating event:", error)
      alert("Failed to create event. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Event</Text>
        <TouchableOpacity onPress={handleSubmit} style={styles.submitButton} disabled={loading}>
          <Text style={styles.submitButtonText}>{loading ? "Creating..." : "Create"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        {/* Basic Event Information */}
        <div style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Event Details</h2>

          <input
            style={inputStyle}
            type="text"
            placeholder="Event Name"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
          />

          <textarea
            style={{ ...inputStyle, minHeight: "100px", fontFamily: "inherit" }}
            placeholder="Event Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />

          <input
            style={inputStyle}
            type="text"
            placeholder="Artists (comma separated)"
            value={artists}
            onChange={(e) => setArtists(e.target.value)}
          />

          <div style={rowStyle}>
            <div style={dateTimeContainerStyle}>
              <div style={dateTimeInputContainerStyle}>
                <span style={iconStyle}>📅</span>
                <input
                  style={dateTimeInputStyle}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
            </div>

            <div style={dateTimeContainerStyle}>
              <div style={dateTimeInputContainerStyle}>
                <span style={iconStyle}>🕐</span>
                <input style={dateTimeInputStyle} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
          </div>

          <input
            style={inputStyle}
            type="number"
            placeholder="Base Ticket Price (UGX)"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
          />

          <div style={switchRowStyle}>
            <span style={switchLabelStyle}>Featured Event</span>
            <label style={switchStyle}>
              <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
              <span style={sliderStyle}></span>
            </label>
          </div>
        </div>

        {/* Venue Selection */}
        <div style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Venue</h2>
          <div style={dropdownContainerStyle}>
            <button style={dropdownStyle} onClick={() => setShowVenueDropdown(!showVenueDropdown)}>
              <span style={selectedVenue ? dropdownTextStyle : dropdownPlaceholderStyle}>
                {selectedVenue ? selectedVenue.name : "Select Venue"}
              </span>
              <span style={dropdownArrowStyle}>{showVenueDropdown ? "▲" : "▼"}</span>
            </button>

            {showVenueDropdown && (
              <div style={dropdownListStyle}>
                {venues.map((venue) => (
                  <div
                    key={venue.id}
                    style={dropdownItemStyle}
                    onClick={() => {
                      setSelectedVenue(venue)
                      setShowVenueDropdown(false)
                    }}
                  >
                    <div style={dropdownItemTextStyle}>{venue.name}</div>
                    <div style={dropdownItemSubtextStyle}>{venue.location}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Poster Image */}
        <div style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Event Poster</h2>
          <div style={imageButtonStyle} onClick={handleImagePicker}>
            {posterImage ? (
              <div style={imageContainerStyle}>
                <img src={posterImage || "/placeholder.svg"} style={posterPreviewStyle} alt="Event poster" />
                <div style={imageOverlayStyle}>
                  <span style={cameraIconStyle}>📷</span>
                  <div style={imageOverlayTextStyle}>Tap to change</div>
                </div>
              </div>
            ) : (
              <div style={imagePlaceholderStyle}>
                <span style={imageIconStyle}>🖼️</span>
                <div style={imagePlaceholderTextStyle}>Tap to select poster image</div>
                <div style={imagePlaceholderSubtextStyle}>Recommended: 16:9 aspect ratio</div>
              </div>
            )}
          </div>
        </div>

        {/* Contact Numbers for Ticket Inquiries */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>Contact Numbers for Ticket Inquiries</h2>
            <button style={addButtonStyle} onClick={() => setShowAddContact(true)}>
              <span style={addIconStyle}>+</span>
              Add Contact
            </button>
          </div>

          {contactPhones.map((contact, index) => (
            <div key={index} style={contactCardStyle}>
              <div style={contactHeaderStyle}>
                <div style={contactInfoStyle}>
                  <span style={contactIconStyle}>{contact.isWhatsApp ? "💬" : "📞"}</span>
                  <div>
                    <span style={contactNameStyle}>{contact.name}</span>
                    {contact.isPrimary && <span style={primaryBadgeStyle}>PRIMARY</span>}
                  </div>
                </div>
                <button
                  style={{ backgroundColor: "#6366f1", borderRadius: "6px", padding: "6px" }}
                  onClick={() => removeContactPhone(index)}
                >
                  ×
                </button>
              </div>
              <div style={contactNumberStyle}>{contact.number}</div>
              <div style={contactActionsStyle}>
                <button
                  style={contact.isPrimary ? primaryButtonActiveStyle : primaryButtonStyle}
                  onClick={() => togglePrimary(index)}
                >
                  {contact.isPrimary ? "Primary Contact" : "Make Primary"}
                </button>
              </div>
            </div>
          ))}

          {showAddContact && (
            <div style={addContactFormStyle}>
              <h3 style={formTitleStyle}>Add Contact Number</h3>

              <input
                style={inputStyle}
                type="tel"
                placeholder="Phone Number (e.g., +256 777 123456)"
                value={newContact.number}
                onChange={(e) => setNewContact({ ...newContact, number: e.target.value })}
              />

              <input
                style={inputStyle}
                type="text"
                placeholder="Contact Name"
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
              />

              <div style={switchRowStyle}>
                <span style={switchLabelStyle}>WhatsApp Available</span>
                <label style={switchStyle}>
                  <input
                    type="checkbox"
                    checked={newContact.isWhatsApp}
                    onChange={(e) => setNewContact({ ...newContact, isWhatsApp: e.target.checked })}
                  />
                  <span style={sliderStyle}></span>
                </label>
              </div>

              <div style={switchRowStyle}>
                <span style={switchLabelStyle}>Primary Contact</span>
                <label style={switchStyle}>
                  <input
                    type="checkbox"
                    checked={newContact.isPrimary}
                    onChange={(e) => setNewContact({ ...newContact, isPrimary: e.target.checked })}
                  />
                  <span style={sliderStyle}></span>
                </label>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  style={{
                    backgroundColor: "#6366f1",
                    borderRadius: "6px",
                    padding: "6px",
                    color: "#fff",
                    fontSize: "14px",
                    fontWeight: "500",
                    cursor: "pointer",
                  }}
                  onClick={() => setShowAddContact(false)}
                >
                  Cancel
                </button>
                <button style={addButtonStyle} onClick={addContactPhone}>
                  Add Contact
                </button>
              </div>
            </div>
          )}
        </div>
      </View>
    </ScrollView>
  )
}

// CSS-in-JS styles (avoiding border and margin)
const styles = {
  container: {
    flex: 1,
    backgroundColor: "#000",
    minHeight: "100vh",
    overflow: "auto",
  },
  header: {
    padding: "20px",
    maxWidth: "800px",
    marginLeft: "auto",
    marginRight: "auto",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backButton: {
    backgroundColor: "#6366f1",
    borderRadius: "6px",
    padding: "6px",
  },
  headerTitle: {
    fontSize: "24px",
    fontWeight: "bold",
    color: "#fff",
  },
  submitButton: {
    backgroundColor: "#6366f1",
    borderRadius: "6px",
    padding: "6px",
  },
  submitButtonText: {
    color: "#fff",
    fontSize: "16px",
    fontWeight: "600",
  },
  form: {
    padding: "20px",
    maxWidth: "800px",
    marginLeft: "auto",
    marginRight: "auto",
  },
}

const sectionStyle: React.CSSProperties = {
  marginBottom: "24px",
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: "600",
  color: "#fff",
  marginBottom: "12px",
}

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "12px",
}

const inputStyle: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  borderRadius: "8px",
  padding: "12px",
  color: "#fff",
  marginBottom: "12px",
  outline: "1px solid #333",
  fontSize: "16px",
  width: "100%",
  boxSizing: "border-box",
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "row",
  gap: "12px",
}

const dateTimeContainerStyle: React.CSSProperties = {
  flex: 1,
}

const dateTimeInputContainerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  backgroundColor: "#1a1a1a",
  borderRadius: "8px",
  padding: "12px",
  outline: "1px solid #333",
  marginBottom: "12px",
  gap: "8px",
}

const dateTimeInputStyle: React.CSSProperties = {
  backgroundColor: "transparent",
  color: "#fff",
  fontSize: "16px",
  flex: 1,
  outline: "none",
}

const iconStyle: React.CSSProperties = {
  fontSize: "20px",
}

const switchRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingTop: "8px",
  paddingBottom: "8px",
}

const switchLabelStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: "16px",
}

const switchStyle: React.CSSProperties = {
  position: "relative",
  display: "inline-block",
  width: "60px",
  height: "34px",
}

const sliderStyle: React.CSSProperties = {
  position: "absolute",
  cursor: "pointer",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "#767577",
  transition: "0.4s",
  borderRadius: "34px",
}

const dropdownContainerStyle: React.CSSProperties = {
  position: "relative",
}

const dropdownStyle: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  borderRadius: "8px",
  padding: "12px",
  outline: "1px solid #333",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
  cursor: "pointer",
  fontSize: "16px",
}

const dropdownTextStyle: React.CSSProperties = {
  color: "#fff",
}

const dropdownPlaceholderStyle: React.CSSProperties = {
  color: "#666",
}

const dropdownArrowStyle: React.CSSProperties = {
  color: "#666",
}

const dropdownListStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  backgroundColor: "#1a1a1a",
  borderRadius: "8px",
  marginTop: "4px",
  outline: "1px solid #333",
  zIndex: 1000,
  maxHeight: "200px",
  overflow: "auto",
}

const dropdownItemStyle: React.CSSProperties = {
  padding: "12px",
  cursor: "pointer",
}

const dropdownItemTextStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: "16px",
}

const dropdownItemSubtextStyle: React.CSSProperties = {
  color: "#666",
  fontSize: "14px",
  marginTop: "2px",
}

const imageButtonStyle: React.CSSProperties = {
  borderRadius: "8px",
  overflow: "hidden",
  cursor: "pointer",
}

const imageContainerStyle: React.CSSProperties = {
  position: "relative",
}

const posterPreviewStyle: React.CSSProperties = {
  width: "100%",
  height: "200px",
  objectFit: "cover",
}

const imageOverlayStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0,0,0,0.5)",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  opacity: 0.8,
}

const cameraIconStyle: React.CSSProperties = {
  fontSize: "24px",
}

const imageOverlayTextStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: "14px",
  marginTop: "4px",
}

const imagePlaceholderStyle: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  height: "200px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  outline: "2px dashed #333",
}

const imageIconStyle: React.CSSProperties = {
  fontSize: "48px",
}

const imagePlaceholderTextStyle: React.CSSProperties = {
  color: "#666",
  fontSize: "16px",
  marginTop: "8px",
}

const imagePlaceholderSubtextStyle: React.CSSProperties = {
  color: "#555",
  fontSize: "12px",
  marginTop: "4px",
}

const addButtonStyle: React.CSSProperties = {
  backgroundColor: "#6366f1",
  paddingLeft: "12px",
  paddingRight: "12px",
  paddingTop: "6px",
  paddingBottom: "6px",
  borderRadius: "6px",
  display: "flex",
  alignItems: "center",
  gap: "4px",
  color: "#fff",
  fontSize: "14px",
  fontWeight: "500",
  cursor: "pointer",
}

const addIconStyle: React.CSSProperties = {
  fontSize: "16px",
}

const contactCardStyle = {
  backgroundColor: "#1E1E1E",
  borderRadius: "12px",
  padding: "16px",
  marginBottom: "12px",
  border: "1px solid #333333",
}

const contactHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "8px",
}

const contactInfoStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
}

const contactIconStyle = {
  fontSize: "20px",
}

const contactNameStyle = {
  color: "#FFFFFF",
  fontWeight: "600",
  fontSize: "16px",
  marginRight: "8px",
}

const primaryBadgeStyle = {
  backgroundColor: "#2196F3",
  color: "#FFFFFF",
  fontSize: "10px",
  padding: "2px 6px",
  borderRadius: "4px",
  fontWeight: "bold",
}

const contactNumberStyle = {
  color: "#BBBBBB",
  fontSize: "14px",
  marginBottom: "8px",
}

const contactActionsStyle = {
  display: "flex",
  gap: "8px",
}

const primaryButtonStyle = {
  backgroundColor: "transparent",
  border: "1px solid #2196F3",
  color: "#2196F3",
  padding: "4px 8px",
  borderRadius: "4px",
  fontSize: "12px",
  cursor: "pointer",
}

const primaryButtonActiveStyle = {
  ...primaryButtonStyle,
  backgroundColor: "#2196F3",
  color: "#FFFFFF",
}

const addContactFormStyle = {
  backgroundColor: "#2A2A2A",
  borderRadius: "12px",
  padding: "20px",
  marginTop: "16px",
}

const formTitleStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: "16px",
  fontWeight: "500",
  marginBottom: "12px",
}

export default AddEventScreen
