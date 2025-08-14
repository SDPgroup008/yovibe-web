"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useNavigation } from "@react-navigation/native"
import { useAuth } from "../contexts/AuthContext"
import firebaseService from "../services/FirebaseService"
import ImagePickerService from "../services/ImagePickerService.web"
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
      alert("Please fill in all payment account details")
      return
    }

    // Validate account number format
    if (!validateAccountNumber(newPaymentAccount.type, newPaymentAccount.accountNumber)) {
      alert("Invalid account number format")
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
        return /^(077|078|076)\d{7}$/.test(accountNumber)
      case "airtel":
        return /^(070|075)\d{7}$/.test(accountNumber)
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

    if (paymentAccounts.length === 0) {
      alert("Please add at least one payment account")
      return
    }

    // Validate ticket types
    const validTicketTypes = ticketTypes.filter((ticket) => ticket.name.trim() && ticket.price > 0)

    if (validTicketTypes.length === 0) {
      alert("Please configure at least one ticket type")
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
    <div style={containerStyle}>
      <div style={contentStyle}>
        <h1 style={titleStyle}>Create New Event</h1>

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

        {/* Ticket Types */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>Ticket Types</h2>
            <button style={addButtonStyle} onClick={addTicketType}>
              <span style={addIconStyle}>+</span>
              Add Type
            </button>
          </div>

          {ticketTypes.map((ticket, index) => (
            <div key={ticket.id} style={ticketTypeCardStyle}>
              <div style={ticketTypeHeaderStyle}>
                <input
                  style={ticketNameInputStyle}
                  type="text"
                  placeholder="Ticket Name"
                  value={ticket.name}
                  onChange={(e) => updateTicketType(index, "name", e.target.value)}
                />
                {index > 1 && ( // Don't allow removing Regular and Secure tickets
                  <button style={removeButtonStyle} onClick={() => removeTicketType(index)}>
                    ×
                  </button>
                )}
              </div>

              <input
                style={ticketDescInputStyle}
                type="text"
                placeholder="Description"
                value={ticket.description}
                onChange={(e) => updateTicketType(index, "description", e.target.value)}
              />

              <div style={ticketRowStyle}>
                <input
                  style={priceInputStyle}
                  type="number"
                  placeholder="Price (UGX)"
                  value={ticket.price.toString()}
                  onChange={(e) => updateTicketType(index, "price", Number.parseFloat(e.target.value) || 0)}
                  disabled={ticket.id === "regular" || ticket.id === "secure"} // Base price controls these
                />
                <div style={switchContainerStyle}>
                  <span style={availableLabelStyle}>Available</span>
                  <label style={switchStyle}>
                    <input
                      type="checkbox"
                      checked={ticket.isAvailable}
                      onChange={(e) => updateTicketType(index, "isAvailable", e.target.checked)}
                    />
                    <span style={sliderStyle}></span>
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Payment Accounts */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>Payment Accounts</h2>
            <button style={addButtonStyle} onClick={() => setShowAddPaymentAccount(true)}>
              <span style={addIconStyle}>+</span>
              Add Account
            </button>
          </div>

          {paymentAccounts.map((account, index) => (
            <div key={index} style={paymentAccountCardStyle}>
              <div style={paymentAccountHeaderStyle}>
                <div style={paymentAccountInfoStyle}>
                  <span style={paymentIconStyle}>
                    {account.type === "mtn" ? "📱" : account.type === "airtel" ? "📱" : "💳"}
                  </span>
                  <span style={paymentAccountTypeStyle}>
                    {account.type.toUpperCase()} - {account.accountName}
                  </span>
                </div>
                <button style={removeButtonStyle} onClick={() => removePaymentAccount(index)}>
                  ×
                </button>
              </div>
              <div style={paymentAccountNumberStyle}>{account.accountNumber}</div>
            </div>
          ))}

          {showAddPaymentAccount && (
            <div style={addPaymentFormStyle}>
              <h3 style={formTitleStyle}>Add Payment Account</h3>

              <div style={paymentTypeButtonsStyle}>
                {(["mtn", "airtel", "card"] as const).map((type) => (
                  <button
                    key={type}
                    style={{
                      ...paymentTypeButtonStyle,
                      ...(newPaymentAccount.type === type ? paymentTypeButtonActiveStyle : {}),
                    }}
                    onClick={() => setNewPaymentAccount({ ...newPaymentAccount, type })}
                  >
                    <span style={paymentTypeIconStyle}>{type === "card" ? "💳" : "📱"}</span>
                    {type.toUpperCase()}
                  </button>
                ))}
              </div>

              <input
                style={inputStyle}
                type={newPaymentAccount.type === "card" ? "text" : "tel"}
                placeholder={newPaymentAccount.type === "card" ? "Account Number" : "Phone Number"}
                value={newPaymentAccount.accountNumber}
                onChange={(e) => setNewPaymentAccount({ ...newPaymentAccount, accountNumber: e.target.value })}
              />

              <input
                style={inputStyle}
                type="text"
                placeholder="Account Name"
                value={newPaymentAccount.accountName}
                onChange={(e) => setNewPaymentAccount({ ...newPaymentAccount, accountName: e.target.value })}
              />

              <div style={formButtonsStyle}>
                <button style={cancelButtonStyle} onClick={() => setShowAddPaymentAccount(false)}>
                  Cancel
                </button>
                <button style={saveButtonStyle} onClick={addPaymentAccount}>
                  Add Account
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <button
          style={{
            ...submitButtonStyle,
            ...(loading ? submitButtonDisabledStyle : {}),
          }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <div style={loadingContainerStyle}>
              <span>Creating Event...</span>
            </div>
          ) : (
            <div style={submitContainerStyle}>
              <span style={checkIconStyle}>✓</span>
              Create Event
            </div>
          )}
        </button>
      </div>
    </div>
  )
}

// CSS-in-JS styles (avoiding border and margin)
const containerStyle: React.CSSProperties = {
  flex: 1,
  backgroundColor: "#000",
  minHeight: "100vh",
  overflow: "auto",
}

const contentStyle: React.CSSProperties = {
  padding: "20px",
  maxWidth: "800px",
  marginLeft: "auto",
  marginRight: "auto",
}

const titleStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "bold",
  color: "#fff",
  marginBottom: "20px",
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

const ticketTypeCardStyle: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  borderRadius: "8px",
  padding: "12px",
  marginBottom: "12px",
  outline: "1px solid #333",
}

const ticketTypeHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
}

const ticketNameInputStyle: React.CSSProperties = {
  flex: 1,
  backgroundColor: "#000",
  borderRadius: "6px",
  padding: "8px",
  color: "#fff",
  outline: "1px solid #444",
  fontSize: "16px",
}

const ticketDescInputStyle: React.CSSProperties = {
  backgroundColor: "#000",
  borderRadius: "6px",
  padding: "8px",
  color: "#fff",
  marginTop: "8px",
  marginBottom: "8px",
  outline: "1px solid #444",
  width: "100%",
  boxSizing: "border-box",
  fontSize: "16px",
}

const ticketRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
}

const priceInputStyle: React.CSSProperties = {
  flex: 1,
  backgroundColor: "#000",
  borderRadius: "6px",
  padding: "8px",
  color: "#fff",
  outline: "1px solid #444",
  fontSize: "16px",
}

const switchContainerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
}

const availableLabelStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: "14px",
}

const removeButtonStyle: React.CSSProperties = {
  backgroundColor: "#ef4444",
  width: "24px",
  height: "24px",
  borderRadius: "12px",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "bold",
  cursor: "pointer",
}

const paymentAccountCardStyle: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  borderRadius: "8px",
  padding: "12px",
  marginBottom: "8px",
  outline: "1px solid #333",
}

const paymentAccountHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
}

const paymentAccountInfoStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
}

const paymentIconStyle: React.CSSProperties = {
  fontSize: "20px",
}

const paymentAccountTypeStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: "16px",
  fontWeight: "500",
}

const paymentAccountNumberStyle: React.CSSProperties = {
  color: "#666",
  fontSize: "14px",
  marginTop: "4px",
  marginLeft: "28px",
}

const addPaymentFormStyle: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  borderRadius: "8px",
  padding: "16px",
  outline: "1px solid #333",
}

const formTitleStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: "16px",
  fontWeight: "500",
  marginBottom: "12px",
}

const paymentTypeButtonsStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  marginBottom: "12px",
}

const paymentTypeButtonStyle: React.CSSProperties = {
  flex: 1,
  backgroundColor: "#000",
  paddingTop: "8px",
  paddingBottom: "8px",
  paddingLeft: "12px",
  paddingRight: "12px",
  borderRadius: "6px",
  outline: "1px solid #444",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "4px",
  color: "#666",
  fontSize: "14px",
  fontWeight: "500",
  cursor: "pointer",
}

const paymentTypeButtonActiveStyle: React.CSSProperties = {
  backgroundColor: "#6366f1",
  color: "#fff",
}

const paymentTypeIconStyle: React.CSSProperties = {
  fontSize: "16px",
}

const formButtonsStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  marginTop: "12px",
}

const cancelButtonStyle: React.CSSProperties = {
  flex: 1,
  backgroundColor: "#333",
  paddingTop: "10px",
  paddingBottom: "10px",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "14px",
  fontWeight: "500",
  cursor: "pointer",
}

const saveButtonStyle: React.CSSProperties = {
  flex: 1,
  backgroundColor: "#6366f1",
  paddingTop: "10px",
  paddingBottom: "10px",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "14px",
  fontWeight: "500",
  cursor: "pointer",
}

const submitButtonStyle: React.CSSProperties = {
  backgroundColor: "#6366f1",
  paddingTop: "16px",
  paddingBottom: "16px",
  borderRadius: "8px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "600",
  cursor: "pointer",
  width: "100%",
  marginTop: "20px",
}

const submitButtonDisabledStyle: React.CSSProperties = {
  backgroundColor: "#333",
  cursor: "not-allowed",
}

const loadingContainerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}

const submitContainerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
}

const checkIconStyle: React.CSSProperties = {
  fontSize: "20px",
}

export default AddEventScreen
