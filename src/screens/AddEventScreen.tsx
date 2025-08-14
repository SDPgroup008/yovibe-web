"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { StyleSheet } from "react-native"
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
      case "bank":
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
    <div style={styles.container}>
      <div style={styles.content}>
        <h1 style={styles.title}>Create New Event</h1>

        {/* Basic Event Information */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Event Details</h2>

          <input
            style={styles.input}
            type="text"
            placeholder="Event Name"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
          />

          <textarea
            style={{ ...styles.input, ...styles.textArea }}
            placeholder="Event Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />

          <input
            style={styles.input}
            type="text"
            placeholder="Artists (comma separated)"
            value={artists}
            onChange={(e) => setArtists(e.target.value)}
          />

          <div style={styles.row}>
            <div style={styles.dateTimeContainer}>
              <div style={styles.dateTimeInputContainer}>
                <span style={styles.icon}>📅</span>
                <input
                  style={styles.dateTimeInput}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
            </div>

            <div style={styles.dateTimeContainer}>
              <div style={styles.dateTimeInputContainer}>
                <span style={styles.icon}>🕐</span>
                <input
                  style={styles.dateTimeInput}
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>
          </div>

          <input
            style={styles.input}
            type="number"
            placeholder="Base Ticket Price (UGX)"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
          />

          <div style={styles.switchRow}>
            <span style={styles.switchLabel}>Featured Event</span>
            <label style={styles.switch}>
              <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
              <span style={styles.slider}></span>
            </label>
          </div>
        </div>

        {/* Venue Selection */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Venue</h2>
          <div style={styles.dropdownContainer}>
            <button style={styles.dropdown} onClick={() => setShowVenueDropdown(!showVenueDropdown)}>
              <span style={selectedVenue ? styles.dropdownText : styles.dropdownPlaceholder}>
                {selectedVenue ? selectedVenue.name : "Select Venue"}
              </span>
              <span style={styles.dropdownArrow}>{showVenueDropdown ? "▲" : "▼"}</span>
            </button>

            {showVenueDropdown && (
              <div style={styles.dropdownList}>
                {venues.map((venue) => (
                  <div
                    key={venue.id}
                    style={styles.dropdownItem}
                    onClick={() => {
                      setSelectedVenue(venue)
                      setShowVenueDropdown(false)
                    }}
                  >
                    <div style={styles.dropdownItemText}>{venue.name}</div>
                    <div style={styles.dropdownItemSubtext}>{venue.location}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Poster Image */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Event Poster</h2>
          <div style={styles.imageButton} onClick={handleImagePicker}>
            {posterImage ? (
              <div style={styles.imageContainer}>
                <img src={posterImage || "/placeholder.svg"} style={styles.posterPreview} alt="Event poster" />
                <div style={styles.imageOverlay}>
                  <span style={styles.cameraIcon}>📷</span>
                  <div style={styles.imageOverlayText}>Tap to change</div>
                </div>
              </div>
            ) : (
              <div style={styles.imagePlaceholder}>
                <span style={styles.imageIcon}>🖼️</span>
                <div style={styles.imagePlaceholderText}>Tap to select poster image</div>
                <div style={styles.imagePlaceholderSubtext}>Recommended: 16:9 aspect ratio</div>
              </div>
            )}
          </div>
        </div>

        {/* Ticket Types */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Ticket Types</h2>
            <button style={styles.addButton} onClick={addTicketType}>
              <span style={styles.addIcon}>+</span>
              Add Type
            </button>
          </div>

          {ticketTypes.map((ticket, index) => (
            <div key={ticket.id} style={styles.ticketTypeCard}>
              <div style={styles.ticketTypeHeader}>
                <input
                  style={styles.ticketNameInput}
                  type="text"
                  placeholder="Ticket Name"
                  value={ticket.name}
                  onChange={(e) => updateTicketType(index, "name", e.target.value)}
                />
                {index > 1 && ( // Don't allow removing Regular and Secure tickets
                  <button style={styles.removeButton} onClick={() => removeTicketType(index)}>
                    ×
                  </button>
                )}
              </div>

              <input
                style={styles.ticketDescInput}
                type="text"
                placeholder="Description"
                value={ticket.description}
                onChange={(e) => updateTicketType(index, "description", e.target.value)}
              />

              <div style={styles.ticketRow}>
                <input
                  style={styles.priceInput}
                  type="number"
                  placeholder="Price (UGX)"
                  value={ticket.price.toString()}
                  onChange={(e) => updateTicketType(index, "price", Number.parseFloat(e.target.value) || 0)}
                  disabled={ticket.id === "regular" || ticket.id === "secure"} // Base price controls these
                />
                <div style={styles.switchContainer}>
                  <span style={styles.availableLabel}>Available</span>
                  <label style={styles.switch}>
                    <input
                      type="checkbox"
                      checked={ticket.isAvailable}
                      onChange={(e) => updateTicketType(index, "isAvailable", e.target.checked)}
                    />
                    <span style={styles.slider}></span>
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Payment Accounts */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Payment Accounts</h2>
            <button style={styles.addButton} onClick={() => setShowAddPaymentAccount(true)}>
              <span style={styles.addIcon}>+</span>
              Add Account
            </button>
          </div>

          {paymentAccounts.map((account, index) => (
            <div key={index} style={styles.paymentAccountCard}>
              <div style={styles.paymentAccountHeader}>
                <div style={styles.paymentAccountInfo}>
                  <span style={styles.paymentIcon}>
                    {account.type === "mtn" ? "📱" : account.type === "airtel" ? "📱" : "💳"}
                  </span>
                  <span style={styles.paymentAccountType}>
                    {account.type.toUpperCase()} - {account.accountName}
                  </span>
                </div>
                <button style={styles.removeButton} onClick={() => removePaymentAccount(index)}>
                  ×
                </button>
              </div>
              <div style={styles.paymentAccountNumber}>{account.accountNumber}</div>
            </div>
          ))}

          {showAddPaymentAccount && (
            <div style={styles.addPaymentForm}>
              <h3 style={styles.formTitle}>Add Payment Account</h3>

              <div style={styles.paymentTypeButtons}>
                {(["mtn", "airtel", "bank"] as PaymentMethod[]).map((type) => (
                  <button
                    key={type}
                    style={{
                      ...styles.paymentTypeButton,
                      ...(newPaymentAccount.type === type ? styles.paymentTypeButtonActive : {}),
                    }}
                    onClick={() => setNewPaymentAccount({ ...newPaymentAccount, type })}
                  >
                    <span style={styles.paymentTypeIcon}>{type === "bank" ? "💳" : "📱"}</span>
                    {type.toUpperCase()}
                  </button>
                ))}
              </div>

              <input
                style={styles.input}
                type={newPaymentAccount.type === "bank" ? "text" : "tel"}
                placeholder={newPaymentAccount.type === "bank" ? "Account Number" : "Phone Number"}
                value={newPaymentAccount.accountNumber}
                onChange={(e) => setNewPaymentAccount({ ...newPaymentAccount, accountNumber: e.target.value })}
              />

              <input
                style={styles.input}
                type="text"
                placeholder="Account Name"
                value={newPaymentAccount.accountName}
                onChange={(e) => setNewPaymentAccount({ ...newPaymentAccount, accountName: e.target.value })}
              />

              <div style={styles.formButtons}>
                <button style={styles.cancelButton} onClick={() => setShowAddPaymentAccount(false)}>
                  Cancel
                </button>
                <button style={styles.saveButton} onClick={addPaymentAccount}>
                  Add Account
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <button
          style={{
            ...styles.submitButton,
            ...(loading ? styles.submitButtonDisabled : {}),
          }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <div style={styles.loadingContainer}>
              <span>Creating Event...</span>
            </div>
          ) : (
            <div style={styles.submitContainer}>
              <span style={styles.checkIcon}>✓</span>
              Create Event
            </div>
          )}
        </button>
      </div>
    </div>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    minHeight: "100vh",
    overflow: "auto",
  },
  content: {
    padding: 20,
    maxWidth: 800,
    margin: "0 auto",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 20,
    margin: 0,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
    margin: "0 0 12px 0",
  },
  sectionHeader: {
    display: "flex",
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
    border: "1px solid #333",
    fontSize: 16,
    width: "100%",
    boxSizing: "border-box",
  },
  textArea: {
    minHeight: 100,
    resize: "vertical",
    fontFamily: "inherit",
  },
  row: {
    display: "flex",
    flexDirection: "row",
    gap: 12,
  },
  dateTimeContainer: {
    flex: 1,
  },
  dateTimeInputContainer: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    border: "1px solid #333",
    marginBottom: 12,
    gap: 8,
  },
  dateTimeInput: {
    backgroundColor: "transparent",
    border: "none",
    color: "#fff",
    fontSize: 16,
    flex: 1,
    outline: "none",
  },
  icon: {
    fontSize: 20,
  },
  switchRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  switchLabel: {
    color: "#fff",
    fontSize: 16,
  },
  switch: {
    position: "relative",
    display: "inline-block",
    width: 60,
    height: 34,
  },
  slider: {
    position: "absolute",
    cursor: "pointer",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#767577",
    transition: "0.4s",
    borderRadius: 34,
  },
  dropdownContainer: {
    position: "relative",
  },
  dropdown: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    border: "1px solid #333",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    cursor: "pointer",
    fontSize: 16,
  },
  dropdownText: {
    color: "#fff",
  },
  dropdownPlaceholder: {
    color: "#666",
  },
  dropdownArrow: {
    color: "#666",
  },
  dropdownList: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    marginTop: 4,
    border: "1px solid #333",
    zIndex: 1000,
    maxHeight: 200,
    overflow: "auto",
  },
  dropdownItem: {
    padding: 12,
    borderBottom: "1px solid #333",
    cursor: "pointer",
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
    cursor: "pointer",
  },
  imageContainer: {
    position: "relative",
  },
  posterPreview: {
    width: "100%",
    height: 200,
    objectFit: "cover",
  },
  imageOverlay: {
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
  },
  cameraIcon: {
    fontSize: 24,
  },
  imageOverlayText: {
    color: "#fff",
    fontSize: 14,
    marginTop: 4,
  },
  imagePlaceholder: {
    backgroundColor: "#1a1a1a",
    height: 200,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    border: "2px dashed #333",
  },
  imageIcon: {
    fontSize: 48,
  },
  imagePlaceholderText: {
    color: "#666",
    fontSize: 16,
    marginTop: 8,
  },
  imagePlaceholderSubtext: {
    color: "#555",
    fontSize: 12,
    marginTop: 4,
  },
  addButton: {
    backgroundColor: "#6366f1",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    gap: 4,
    border: "none",
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
    cursor: "pointer",
  },
  addIcon: {
    fontSize: 16,
  },
  ticketTypeCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    border: "1px solid #333",
  },
  ticketTypeHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  ticketNameInput: {
    flex: 1,
    backgroundColor: "#000",
    borderRadius: 6,
    padding: 8,
    color: "#fff",
    border: "1px solid #444",
    fontSize: 16,
  },
  ticketDescInput: {
    backgroundColor: "#000",
    borderRadius: 6,
    padding: 8,
    color: "#fff",
    marginVertical: 8,
    border: "1px solid #444",
    width: "100%",
    boxSizing: "border-box",
    fontSize: 16,
  },
  ticketRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  priceInput: {
    flex: 1,
    backgroundColor: "#000",
    borderRadius: 6,
    padding: 8,
    color: "#fff",
    border: "1px solid #444",
    fontSize: 16,
  },
  switchContainer: {
    display: "flex",
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
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    border: "none",
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    cursor: "pointer",
  },
  paymentAccountCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    border: "1px solid #333",
  },
  paymentAccountHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  paymentAccountInfo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  paymentIcon: {
    fontSize: 20,
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
    border: "1px solid #333",
  },
  formTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 12,
    margin: "0 0 12px 0",
  },
  paymentTypeButtons: {
    display: "flex",
    gap: 8,
    marginBottom: 12,
  },
  paymentTypeButton: {
    flex: 1,
    backgroundColor: "#000",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    border: "1px solid #444",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    color: "#666",
    fontSize: 14,
    fontWeight: "500",
    cursor: "pointer",
  },
  paymentTypeButtonActive: {
    backgroundColor: "#6366f1",
    borderColor: "#6366f1",
    color: "#fff",
  },
  paymentTypeIcon: {
    fontSize: 16,
  },
  formButtons: {
    display: "flex",
    gap: 12,
    marginTop: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#333",
    paddingVertical: 10,
    borderRadius: 6,
    border: "none",
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
    cursor: "pointer",
  },
  saveButton: {
    flex: 1,
    backgroundColor: "#6366f1",
    paddingVertical: 10,
    borderRadius: 6,
    border: "none",
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
    cursor: "pointer",
  },
  submitButton: {
    backgroundColor: "#6366f1",
    paddingVertical: 16,
    borderRadius: 8,
    border: "none",
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    cursor: "pointer",
    width: "100%",
    marginTop: 20,
  },
  submitButtonDisabled: {
    backgroundColor: "#333",
    cursor: "not-allowed",
  },
  loadingContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  submitContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  checkIcon: {
    fontSize: 20,
  },
})

export default AddEventScreen
