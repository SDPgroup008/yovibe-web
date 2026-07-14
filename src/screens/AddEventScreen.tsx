"use client"

import React, { useState, useEffect } from "react"
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
  Platform,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useCompatNavigation } from "../utils/compatNavigation"
import ImagePickerService from "../services/ImagePickerService"
import SupabaseService from "../services/SupabaseService"
import LocationService from "../services/LocationService"
import { uploadToR2 } from "../services/R2Service"
import { useAuth } from "../contexts/AuthContext"
import { getTemplatesByOrientation, type TicketTemplateConfig } from "../constants/ticketTemplates"
import { generateEditorHTML, generatePreviewHTML, defaultLayout, type TicketLayout } from "../services/TicketPDFService"

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

type EntryFee = { name: string; amount: string; isTable?: boolean; tableSize?: number; maxTickets?: number; seatMap?: { type: "none" | "numbered" | "cinema"; rows?: number; cols?: number }; ticketDesign?: { enabled: boolean; orientation: "portrait" | "landscape"; source: "template" | "upload"; template_id: string | null; background_url: string | null; qr_position?: "top" | "bottom" | "center" | "left" | "right"; dimensions: { width: number; height: number } } }

// ─── Interactive ticket editor (web only) ────────────────────────────────────
const TicketEditor: React.FC<{
  templateId: string | null
  orientation: "portrait" | "landscape"
  uploadedBgUrl?: string | null
  widthCm?: number
  heightCm?: number
  eventName?: string
  venueName?: string
  posterUrl?: string | null
  layout: TicketLayout
  onLayoutChange: (l: TicketLayout) => void
}> = ({ templateId, orientation, uploadedBgUrl, widthCm, heightCm, eventName, venueName, posterUrl, layout, onLayoutChange }) => {
  if (Platform.OS !== "web") return null

  const ref = React.useRef<any>(null)

  const CM_TO_PX = 96 / 2.54
  const srcW = widthCm ? Math.round(widthCm * CM_TO_PX) : (orientation === "landscape" ? 900 : 600)
  const srcH = heightCm ? Math.round(heightCm * CM_TO_PX) : (orientation === "landscape" ? 500 : 900)
  const maxW = 360
  const zoom = maxW / srcW
  const previewW = maxW
  const previewH = Math.round(srcH * zoom)

  const html = generateEditorHTML(templateId, orientation, uploadedBgUrl, posterUrl, { eventName, venueName }, layout, widthCm, heightCm)

  // Listen for layout updates from iframe
  React.useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "LAYOUT_UPDATE") onLayoutChange(e.data.layout)
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [onLayoutChange])

  // When layout changes externally (e.g. reset), push it into iframe
  const prevLayout = React.useRef(layout)
  React.useEffect(() => {
    if (ref.current?.contentWindow && prevLayout.current !== layout) {
      ref.current.contentWindow.postMessage({ type: "SET_LAYOUT", layout }, "*")
      prevLayout.current = layout
    }
  }, [layout])

  const sendBg = (type: string, extra: object) =>
    ref.current?.contentWindow?.postMessage({ type, ...extra }, "*")

  const isUpload = !!uploadedBgUrl

  return (
    <View style={{ marginTop: 12, marginBottom: 8 }}>
      <Text style={{ color: "#888", fontSize: 11, marginBottom: 6, textAlign: "center" }}>Live Editor — drag blocks to reposition</Text>

      {/* Ticket iframe */}
      <View style={{ alignItems: "center" }}>
        <View style={{
          width: previewW, height: previewH,
          borderRadius: 8, overflow: "hidden",
          borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
        }}>
          {/* @ts-ignore */}
          <iframe
            ref={ref}
            srcDoc={html}
            style={{ width: srcW, height: srcH, border: "none", zoom, display: "block" }}
            sandbox="allow-scripts allow-same-origin"
          />
        </View>
      </View>

      {/* Block resize controls */}
      <View style={styles.bgControls}>
        <Text style={styles.bgControlsLabel}>Resize Blocks</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {(["poster", "title", "info", "qr"] as const).map(id => (
            <View key={id} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ color: "#aaa", fontSize: 10, width: 32 }}>{id}</Text>
              <TouchableOpacity style={styles.bgBtn} onPress={() => ref.current?.contentWindow?.postMessage({ type: "BLOCK_RESIZE", id, delta: -0.1 }, "*")}>
                <Ionicons name="remove" size={14} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.bgBtn} onPress={() => ref.current?.contentWindow?.postMessage({ type: "BLOCK_RESIZE", id, delta: 0.1 }, "*")}>
                <Ionicons name="add" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>

      {/* Background pan/zoom controls — only for upload mode */}
      {isUpload && (
        <View style={styles.bgControls}>
          <Text style={styles.bgControlsLabel}>Background</Text>
          <View style={styles.bgControlsRow}>
            {/* Pan arrows */}
            <TouchableOpacity style={styles.bgBtn} onPress={() => sendBg("BG_PAN", { dx: 0, dy: -20 })}>
              <Ionicons name="arrow-up" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.bgBtn} onPress={() => sendBg("BG_PAN", { dx: 0, dy: 20 })}>
              <Ionicons name="arrow-down" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.bgBtn} onPress={() => sendBg("BG_PAN", { dx: -20, dy: 0 })}>
              <Ionicons name="arrow-back" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.bgBtn} onPress={() => sendBg("BG_PAN", { dx: 20, dy: 0 })}>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
            {/* Zoom */}
            <TouchableOpacity style={styles.bgBtn} onPress={() => sendBg("BG_ZOOM", { delta: 0.1 })}>
              <Ionicons name="add" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.bgBtn} onPress={() => sendBg("BG_ZOOM", { delta: -0.1 })}>
              <Ionicons name="remove" size={16} color="#fff" />
            </TouchableOpacity>
            {/* Reset */}
            <TouchableOpacity style={[styles.bgBtn, { paddingHorizontal: 10 }]} onPress={() => sendBg("BG_RESET", {})}>
              <Text style={{ color: "#fff", fontSize: 11 }}>Reset</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Reset layout button */}
      <TouchableOpacity
        style={styles.resetLayoutBtn}
        onPress={() => {
          const fresh = defaultLayout(orientation, !!posterUrl)
          onLayoutChange(fresh)
          ref.current?.contentWindow?.postMessage({ type: "SET_LAYOUT", layout: fresh }, "*")
        }}
      >
        <Ionicons name="refresh" size={14} color="#888" />
        <Text style={{ color: "#888", fontSize: 11, marginLeft: 4 }}>Reset layout</Text>
      </TouchableOpacity>
    </View>
  )
}

const AddEventScreen: React.FC<any> = (props) => {
  const navigation = useCompatNavigation()
  const route = props?.route || {}
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
  const [venues, setVenues] = useState<Array<{ id: string; slug?: string; name: string }>>([])
  const [selectedVenueId, setSelectedVenueId] = useState(route.params?.venueId ?? "")
  const [selectedVenueName, setSelectedVenueName] = useState(route.params?.venueName ?? "")
  const [showVenueSelector, setShowVenueSelector] = useState(false)
  const [useCustomVenue, setUseCustomVenue] = useState(false)
  const [venueSearch, setVenueSearch] = useState("")
  const [customVenueName, setCustomVenueName] = useState("")
  const [customVenueAddress, setCustomVenueAddress] = useState("")
  const [latitude, setLatitude] = useState("0")
  const [longitude, setLongitude] = useState("0")
  const [location, setLocation] = useState("")
  const [isFreeEntry, setIsFreeEntry] = useState(false)
  const [showFeeForm, setShowFeeForm] = useState(false)
  const [newFeeCustomDesign, setNewFeeCustomDesign] = useState(false)
  const [newFeeDesignOrientation, setNewFeeDesignOrientation] = useState<"portrait" | "landscape">("portrait")
  const [newFeeSelectedTemplate, setNewFeeSelectedTemplate] = useState<string | null>(null)
  const [newFeeDesignSource, setNewFeeDesignSource] = useState<"template" | "upload">("template")
  const [newFeeUploadedBackgroundUrl, setNewFeeUploadedBackgroundUrl] = useState<string | null>(null)
  const [newFeeWidthCm, setNewFeeWidthCm] = useState("21")
  const [newFeeHeightCm, setNewFeeHeightCm] = useState("29.7")
  const [newFeeQrPosition, setNewFeeQrPosition] = useState<"top" | "bottom" | "center" | "left" | "right">("center")
  const [newFeeLayout, setNewFeeLayout] = useState<TicketLayout>(() => defaultLayout("portrait", false))
  // Capacity & seat map
  const [newFeeMaxTickets, setNewFeeMaxTickets] = useState("")
  const [newFeeSeatMapType, setNewFeeSeatMapType] = useState<"none" | "numbered" | "cinema">("none")
  const [newFeeSeatRows, setNewFeeSeatRows] = useState("")
  const [newFeeSeatCols, setNewFeeSeatCols] = useState("")
  const [entryFees, setEntryFees] = useState<EntryFee[]>([])
  const [newFeeName, setNewFeeName] = useState("")
  const [newFeeAmount, setNewFeeAmount] = useState("")
  const [newFeeIsTable, setNewFeeIsTable] = useState(false)
  const [newTableSize, setNewTableSize] = useState("")
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
  const [newFeeBackgroundFile, setNewFeeBackgroundFile] = useState<any>(null)
  
  // Global event-level ticket design
  const [customTicketDesign, setCustomTicketDesign] = useState(false)
  const [ticketOrientation, setTicketOrientation] = useState<"portrait" | "landscape">("portrait")
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [uploadedBackgroundUrl, setUploadedBackgroundUrl] = useState<string | null>(null)
  const [designSource, setDesignSource] = useState<"template" | "upload">("template")
  const [eventBackgroundFile, setEventBackgroundFile] = useState<any>(null)

  // Load venues and auto-select for club owners
  useEffect(() => {
    const loadAndSelectVenue = async () => {
      // If route params include venue info, use them directly
      if (route.params?.venueId && route.params?.venueName) {
        setSelectedVenueId(route.params.venueId)
        setSelectedVenueName(route.params.venueName)
        return
      }
      
      // For club_owners, fetch their venue by owner ID
      if (user?.userType === "club_owner") {
        try {
          const ownedVenues = await SupabaseService.getVenuesByOwner(user.id)
          if (ownedVenues.length > 0) {
            const venue = ownedVenues[0]
            setSelectedVenueId(venue.slug || venue.id)
            setSelectedVenueName(venue.name)
            return
          }
        } catch (error) {
          console.error("Error fetching owned venues:", error)
        }
      }
      
      // Otherwise load all venues for selection
      loadVenues()
    }
    loadAndSelectVenue()
  }, [user, route.params?.venueId, route.params?.venueName])

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
      const venuesList = await SupabaseService.getVenues()
      setVenues(venuesList.map((venue) => ({ id: venue.id, slug: venue.slug, name: venue.name })))
      // Set default venue if provided in route params
      if (route.params?.venueId) {
        const selectedVenue = venuesList.find((venue) => venue.id === route.params?.venueId)
        if (selectedVenue) {
          setSelectedVenueName(selectedVenue.name)
        }
      }
    } catch (error) {
      console.error("Error loading venues:", error)
    }
  }

  const uploadPosterWithTimeout = async (posterSource: string | Blob, timeoutMs = 45000) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    try {
      return await Promise.race([
        SupabaseService.uploadEventImage(posterSource),
        new Promise<string>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error("Poster upload timed out"))
          }, timeoutMs)
        }),
      ])
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  const uploadFeeBackgroundsToR2 = async (fees: EntryFee[], eventId: string): Promise<EntryFee[]> => {
    const updatedFees = await Promise.all(fees.map(async (fee) => {
      if (fee.ticketDesign?.enabled && fee.ticketDesign.source === "upload" && fee.ticketDesign.background_url) {
        const bgUrl = fee.ticketDesign.background_url
        
        if (!bgUrl) return fee
        
        const isR2Url = bgUrl.includes('.r2.') || bgUrl.includes('/ticket-designs/')
        if (isR2Url) {
          console.log(`Fee background for ${fee.name} already has R2 URL`)
          return fee
        }
        
        try {
          console.log(`Uploading fee background for ${fee.name} to R2...`)
          const contentTypeMatch = bgUrl.match(/^data:(image\/[a-z]+)/i)
          const contentType = contentTypeMatch ? contentTypeMatch[1] : 'image/png'
          
          const ext = contentType.split('/')[1] || 'png'
          const filename = `${eventId}_${fee.name.replace(/[^a-z0-9]/gi, '_')}_bg.${ext}`
          
          const result = await uploadToR2({
            path: 'ticket-designs',
            filename,
            contentType,
            body: bgUrl,
          })
          
          console.log(`Fee background uploaded: ${result.url}`)
          return {
            ...fee,
            ticketDesign: {
              ...fee.ticketDesign,
              background_url: result.url,
            }
          }
        } catch (error) {
          console.error(`Error uploading fee background for ${fee.name}:`, error)
          return fee
        }
      }
      return fee
    }))
    return updatedFees
  }

  const uploadEventDesignBackgroundToR2 = async (eventId: string): Promise<string | null> => {
    if (!customTicketDesign || designSource !== "upload" || !uploadedBackgroundUrl) {
      return null
    }
    
    const bgUrl = uploadedBackgroundUrl
    const isR2Url = bgUrl.includes('.r2.') || bgUrl.includes('/ticket-designs/')
    if (isR2Url) {
      console.log("Event design background already has R2 URL")
      return bgUrl
    }
    
    try {
      console.log("Uploading event ticket design background to R2...")
      const contentTypeMatch = bgUrl.match(/^data:(image\/[a-z]+)/i)
      const contentType = contentTypeMatch ? contentTypeMatch[1] : 'image/png'
      
      const ext = contentType.split('/')[1] || 'png'
      const filename = `${eventId}_event_bg.${ext}`
      
      const result = await uploadToR2({
        path: 'ticket-designs',
        filename,
        contentType,
        body: bgUrl,
      })
      
      console.log("Event design background uploaded:", result.url)
      return result.url
    } catch (error) {
      console.error("Error uploading event design background:", error)
      return null
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
    setVenueSearch("")
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
    if (newFeeCustomDesign && newFeeDesignSource === "template" && !newFeeSelectedTemplate) {
      Alert.alert("Error", "Please select a ticket design template")
      return
    }
    if (newFeeCustomDesign && newFeeDesignSource === "upload" && !newFeeUploadedBackgroundUrl) {
      Alert.alert("Error", "Please upload a background image for the ticket design")
      return
    }
    const fee: EntryFee = {
      name: newFeeName,
      amount: newFeeAmount,
    }
    if (newFeeIsTable) {
      const size = parseInt(newTableSize)
      if (isNaN(size) || size < 1) {
        Alert.alert("Error", "Please enter a valid number of people for the table")
        return
      }
      fee.isTable = true
      fee.tableSize = size
    }
    // Capacity
    const maxT = parseInt(newFeeMaxTickets)
    if (!isNaN(maxT) && maxT > 0) {
      fee.maxTickets = maxT
      if (newFeeSeatMapType !== "none") {
        const rows = parseInt(newFeeSeatRows)
        const cols = parseInt(newFeeSeatCols)
        fee.seatMap = {
          type: newFeeSeatMapType,
          rows: newFeeSeatMapType === "cinema" && !isNaN(rows) && rows > 0 ? rows : undefined,
          cols: newFeeSeatMapType === "cinema" && !isNaN(cols) && cols > 0 ? cols : undefined,
        }
      }
    }
    if (newFeeCustomDesign) {
      const CM_TO_PX = 96 / 2.54
      const uploadW = Math.round((parseFloat(newFeeWidthCm) || 21) * CM_TO_PX)
      const uploadH = Math.round((parseFloat(newFeeHeightCm) || 29.7) * CM_TO_PX)
      const tplW = newFeeDesignOrientation === "landscape" ? 900 : 600
      const tplH = newFeeDesignOrientation === "landscape" ? 500 : 900
      fee.ticketDesign = {
        enabled: true,
        orientation: newFeeDesignOrientation,
        source: newFeeDesignSource,
        template_id: newFeeDesignSource === "template" ? newFeeSelectedTemplate : null,
        background_url: newFeeDesignSource === "upload" ? newFeeUploadedBackgroundUrl : null,
        qr_position: newFeeQrPosition,
        dimensions: newFeeDesignSource === "upload"
          ? { width: uploadW, height: uploadH }
          : { width: tplW, height: tplH },
      } as any
    }
    setEntryFees([...entryFees, fee])
    setNewFeeName("")
    setNewFeeAmount("")
    setNewFeeIsTable(false)
    setNewTableSize("")
    setNewFeeCustomDesign(false)
    setNewFeeDesignSource("template")
    setNewFeeDesignOrientation("portrait")
    setNewFeeSelectedTemplate(null)
    setNewFeeUploadedBackgroundUrl(null)
    setNewFeeWidthCm("21")
    setNewFeeHeightCm("29.7")
    setNewFeeQrPosition("center")
    setNewFeeLayout(defaultLayout("portrait", false))
    setNewFeeMaxTickets("")
    setNewFeeSeatMapType("none")
    setNewFeeSeatRows("")
    setNewFeeSeatCols("")
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

  const pickFeeBackgroundImage = async () => {
    try {
      const result = await ImagePickerService.launchImageLibraryAsync({
        mediaTypes: "Images",
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.8,
      })

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedImage = result.assets[0]
        console.log("Fee background image selected:", selectedImage.uri.substring(0, 50) + "...")
        setNewFeeBackgroundFile(selectedImage)
        
        if (selectedImage.uri.startsWith('data:')) {
          setNewFeeUploadedBackgroundUrl(selectedImage.uri)
        } else {
          try {
            console.log("Uploading fee background to R2...")
            const response = await fetch(selectedImage.uri)
            const blob = await response.blob()
            const reader = new FileReader()
            const dataUrl = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string)
              reader.onerror = () => reject(new Error('Failed to read image'))
              reader.readAsDataURL(blob)
            })
            
            const uploaded = await uploadToR2({
              path: 'ticket-designs',
              filename: `fee-bg-${Date.now()}.png`,
              contentType: 'image/png',
              body: dataUrl,
            })
            console.log("Fee background uploaded to R2:", uploaded.url)
            setNewFeeUploadedBackgroundUrl(uploaded.url)
          } catch (uploadError) {
            console.warn("Failed to upload fee background to R2, storing data URL:", uploadError)
            try {
              const response = await fetch(selectedImage.uri)
              const blob = await response.blob()
              const reader = new FileReader()
              reader.onload = () => {
                setNewFeeUploadedBackgroundUrl(reader.result as string)
              }
              reader.readAsDataURL(blob)
            } catch (e) {
              console.error("Failed to convert image to data URL:", e)
              Alert.alert("Error", "Failed to process image. Please try again.")
            }
          }
        }
      }
    } catch (error) {
      console.error("Error picking fee background image:", error)
      Alert.alert("Error", "Failed to pick image")
    }
  }

  const pickEventBackgroundImage = async () => {
    try {
      const result = await ImagePickerService.launchImageLibraryAsync({
        mediaTypes: "Images",
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.8,
      })

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedImage = result.assets[0]
        console.log("Event background image selected:", selectedImage.uri.substring(0, 50) + "...")
        setEventBackgroundFile(selectedImage)
        
        if (selectedImage.uri.startsWith('data:')) {
          setUploadedBackgroundUrl(selectedImage.uri)
        } else {
          try {
            console.log("Uploading event background to R2...")
            const response = await fetch(selectedImage.uri)
            const blob = await response.blob()
            const reader = new FileReader()
            const dataUrl = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string)
              reader.onerror = () => reject(new Error('Failed to read image'))
              reader.readAsDataURL(blob)
            })
            
            const uploaded = await uploadToR2({
              path: 'ticket-designs',
              filename: `event-bg-${Date.now()}.png`,
              contentType: 'image/png',
              body: dataUrl,
            })
            console.log("Event background uploaded to R2:", uploaded.url)
            setUploadedBackgroundUrl(uploaded.url)
          } catch (uploadError) {
            console.warn("Failed to upload event background to R2, storing data URL:", uploadError)
            try {
              const response = await fetch(selectedImage.uri)
              const blob = await response.blob()
              const reader = new FileReader()
              reader.onload = () => {
                setUploadedBackgroundUrl(reader.result as string)
              }
              reader.readAsDataURL(blob)
            } catch (e) {
              console.error("Failed to convert image to data URL:", e)
              Alert.alert("Error", "Failed to process image. Please try again.")
            }
          }
        }
      }
    } catch (error) {
      console.error("Error picking event background image:", error)
      Alert.alert("Error", "Failed to pick image")
    }
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
    entryFees.forEach((fee, idx) => {
      if (fee.ticketDesign?.enabled) {
        if (fee.ticketDesign.source === "template" && !fee.ticketDesign.template_id) {
          newErrors.entryFees = `Please select a ticket design template for "${fee.name}"`
        }
      }
    })
    if (customTicketDesign && designSource === "template" && !selectedTemplateId) {
      newErrors.entryFees = "Please select a ticket design template for the event"
    }
    if (customTicketDesign && designSource === "upload" && !uploadedBackgroundUrl) {
      newErrors.entryFees = "Please upload a background image for the event ticket design"
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

        venueId = await SupabaseService.addVenue(customVenue)
        venueName = customVenueName
      }

      let imageUrl = image || ""
      if (imageFile) {
        try {
          console.log("Uploading event poster image...")
          const posterSource = imageFile.file || image
          if (posterSource) {
            imageUrl = await uploadPosterWithTimeout(posterSource)
            console.log("Image uploaded successfully:", imageUrl?.substring(0, 50) + "...")
          } else {
            console.warn("imageFile is true but image URI is null; skipping upload")
          }
        } catch (error) {
          console.error("Error uploading image:", error)
          Alert.alert("Warning", "There was an issue uploading the image, but we'll continue creating the event.")
          imageUrl = ""
        }
      }

      let processedEntryFees = entryFees
      let processedEventDesignBg: string | null = null

      if (entryFees.length > 0) {
        console.log("Processing entry fees and uploading backgrounds...")
        try {
          processedEntryFees = await uploadFeeBackgroundsToR2(entryFees, `event-${Date.now()}`)
        } catch (error) {
          console.error("Error processing fee backgrounds:", error)
          Alert.alert("Warning", "Some ticket design backgrounds could not be uploaded")
        }
      }

      if (customTicketDesign && designSource === "upload" && uploadedBackgroundUrl) {
        console.log("Processing event ticket design background...")
        try {
          processedEventDesignBg = await uploadEventDesignBackgroundToR2(`event-${Date.now()}`)
        } catch (error) {
          console.error("Error processing event design background:", error)
        }
      }

      const eventData = {
        name,
        description,
        date,
        time: `${new Date(`2000-01-01T${startTime}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(`2000-01-01T${endTime}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        artists: artists.split(",").map((artist) => artist.trim()),
        venueSlug: venueId,
        venueName,
        posterImageUrl: imageUrl || "",
        isFeatured: paymentMethods.mobileMoney.length > 0 || paymentMethods.bankAccounts.length > 0,
        location: location.toUpperCase(),
        ticketContacts,
        paymentMethods,
        entryFees: isFreeEntry ? [] : processedEntryFees,
        attendees: [],
        createdBy: user.id,
        createdByType: user.userType,
        priceIndicator: processedEntryFees.length > 0 ? Math.min(...processedEntryFees.map((fee) => parseFloat(fee.amount))) : 0,
        isFreeEntry,
        ticket_design: customTicketDesign ? {
          enabled: true,
          orientation: ticketOrientation,
          source: designSource,
          template_id: designSource === "template" ? selectedTemplateId : null,
          background_url: processedEventDesignBg || (designSource === "upload" ? uploadedBackgroundUrl : null),
          dimensions: ticketOrientation === "portrait"
            ? { width: 1080, height: 1920 }
            : { width: 1920, height: 1080 },
        } : null,
        createdAt: new Date(),
      }

      await SupabaseService.addEvent(eventData)

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
              paddingTop: "12px",
              paddingBottom: "12px",
              paddingLeft: "12px",
              paddingRight: "12px",
              borderRadius: "8px",
              border: "1px solid #333",
              width: "93%",
              fontSize: 16,
              colorScheme: "dark",
            }}
          />
        </View>

        {/* Start & End Time Pickers */}
        <Text style={styles.label}>Event Time *</Text>
        <View style={{ flexDirection: "row", gap: 16, marginBottom: 16, width: "93%" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#999", fontSize: 14, marginBottom: 8 }}>Start Time</Text>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={{
                backgroundColor: "#1E1E1E",
                color: "#FFFFFF",
                paddingTop: "12px",
                paddingBottom: "12px",
                paddingLeft: "12px",
                paddingRight: "12px",
                borderRadius: "8px",
                border: "1px solid #333",
                width: "100%",
                fontSize: 16,
                colorScheme: "dark",
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
                paddingTop: "12px",
                paddingBottom: "12px",
                paddingLeft: "12px",
                paddingRight: "12px",
                borderRadius: "8px",
                border: "1px solid #333",
                width: "100%",
                fontSize: 16,
                colorScheme: "dark",
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
                    <TextInput
                      style={{
                        backgroundColor: "#2A2A2A",
                        color: "#FFFFFF",
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: "#444",
                        fontSize: 14,
                        marginBottom: 8,
                      }}
                      value={venueSearch}
                      onChangeText={setVenueSearch}
                      placeholder="Search venues..."
                      placeholderTextColor="#666"
                      autoFocus
                    />
                    <ScrollView style={styles.venueList} nestedScrollEnabled>
                      {venues
                        .filter((v) =>
                          v.name.toLowerCase().includes(venueSearch.toLowerCase())
                        )
                        .map((venue) => (
                          <TouchableOpacity
                            key={venue.id}
                            style={styles.venueItem}
                            onPress={() => handleVenueSelect(venue.slug || venue.id, venue.name)}
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
            <Text style={styles.checkboxLabel}>Feature this event manually</Text>
          </View>
        )}

        {/* Event-level custom ticket design */}
        <View style={styles.checkboxContainer}>
          <TouchableOpacity style={styles.checkbox} onPress={() => setCustomTicketDesign(!customTicketDesign)}>
            {customTicketDesign ? (
              <Ionicons name="checkbox" size={24} color="#2196F3" />
            ) : (
              <Ionicons name="square-outline" size={24} color="#FFFFFF" />
            )}
          </TouchableOpacity>
          <Text style={styles.checkboxLabel}>Custom Ticket Design</Text>
        </View>

        {customTicketDesign && (
          <View style={styles.customDesignContainer}>
            <Text style={styles.designLabel}>Ticket Orientation</Text>
            <View style={styles.orientationToggle}>
              <TouchableOpacity
                style={[styles.orientationButton, ticketOrientation === "portrait" && styles.orientationButtonActive]}
                onPress={() => setTicketOrientation("portrait")}
              >
                <Text style={[styles.orientationButtonText, ticketOrientation === "portrait" && styles.orientationButtonTextActive]}>Portrait</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.orientationButton, ticketOrientation === "landscape" && styles.orientationButtonActive]}
                onPress={() => setTicketOrientation("landscape")}
              >
                <Text style={[styles.orientationButtonText, ticketOrientation === "landscape" && styles.orientationButtonTextActive]}>Landscape</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.designLabel}>Design Source</Text>
            <View style={styles.orientationToggle}>
              <TouchableOpacity
                style={[styles.orientationButton, designSource === "template" && styles.orientationButtonActive]}
                onPress={() => setDesignSource("template")}
              >
                <Text style={[styles.orientationButtonText, designSource === "template" && styles.orientationButtonTextActive]}>Template</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.orientationButton, designSource === "upload" && styles.orientationButtonActive]}
                onPress={() => setDesignSource("upload")}
              >
                <Text style={[styles.orientationButtonText, designSource === "upload" && styles.orientationButtonTextActive]}>Upload Custom</Text>
              </TouchableOpacity>
            </View>
            {designSource === "template" ? (
              <>
                <Text style={styles.designLabel}>Select Template</Text>
                <ScrollView horizontal style={styles.templateGallery} showsHorizontalScrollIndicator={false}>
                  {getTemplatesByOrientation(ticketOrientation).map((template) => (
                    <TouchableOpacity
                      key={template.id}
                      style={[styles.templateCard, selectedTemplateId === template.id && styles.templateCardSelected]}
                      onPress={() => setSelectedTemplateId(template.id)}
                    >
                      <Image source={{ uri: template.thumbnailSvg }} style={styles.templateThumbnail} />
                      <Text style={styles.templateLabel}>{template.label}</Text>
                      {selectedTemplateId === template.id && (
                        <View style={styles.selectedOverlay}>
                          <Ionicons name="checkmark-circle" size={24} color="#2196F3" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : (
              <>
                <Text style={styles.designLabel}>Upload Background Image</Text>
                <TouchableOpacity
                  style={styles.uploadButton}
                  onPress={pickEventBackgroundImage}
                >
                  <Ionicons name="image-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.uploadButtonText}>Choose Image</Text>
                </TouchableOpacity>
                {uploadedBackgroundUrl && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ color: "#888", fontSize: 12 }}>Image selected: {uploadedBackgroundUrl.substring(0, 50)}...</Text>
                  </View>
                )}
              </>
            )}
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
                  placeholder="Fee name (e.g. VIP, Table 1)"
                  placeholderTextColor="#999"
                />
                <TextInput
                  style={[styles.input, styles.feeAmountInput]}
                  value={newFeeAmount}
                  onChangeText={setNewFeeAmount}
                  placeholder="Amount (e.g. 20,000 UGX)"
                  placeholderTextColor="#999"
                />
                <View style={styles.checkboxRow}>
                  <View style={styles.checkboxContainer}>
                    <TouchableOpacity style={styles.checkbox} onPress={() => setNewFeeIsTable(!newFeeIsTable)}>
                      {newFeeIsTable ? (
                        <Ionicons name="checkbox" size={24} color="#2196F3" />
                      ) : (
                        <Ionicons name="square-outline" size={24} color="#FFFFFF" />
                      )}
                    </TouchableOpacity>
                    <Text style={styles.checkboxLabel}>Table Entry</Text>
                  </View>
                  <View style={styles.checkboxContainer}>
                    <TouchableOpacity style={styles.checkbox} onPress={() => setNewFeeCustomDesign(!newFeeCustomDesign)}>
                      {newFeeCustomDesign ? (
                        <Ionicons name="checkbox" size={24} color="#2196F3" />
                      ) : (
                        <Ionicons name="square-outline" size={24} color="#FFFFFF" />
                      )}
                    </TouchableOpacity>
                    <Text style={styles.checkboxLabel}>Custom Design</Text>
                  </View>
                </View>
                {newFeeCustomDesign && (
                  <View style={styles.customDesignContainer}>
                    <Text style={styles.designLabel}>Ticket Orientation</Text>
                    <View style={styles.orientationToggle}>
                      <TouchableOpacity
                        style={[styles.orientationButton, newFeeDesignOrientation === "portrait" && styles.orientationButtonActive]}
                        onPress={() => { setNewFeeDesignOrientation("portrait"); setNewFeeQrPosition("center"); setNewFeeLayout(defaultLayout("portrait", !!newFeeUploadedBackgroundUrl)) }}
                      >
                        <Text style={[styles.orientationButtonText, newFeeDesignOrientation === "portrait" && styles.orientationButtonTextActive]}>Portrait</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.orientationButton, newFeeDesignOrientation === "landscape" && styles.orientationButtonActive]}
                        onPress={() => { setNewFeeDesignOrientation("landscape"); setNewFeeQrPosition("right"); setNewFeeLayout(defaultLayout("landscape", !!newFeeUploadedBackgroundUrl)) }}
                      >
                        <Text style={[styles.orientationButtonText, newFeeDesignOrientation === "landscape" && styles.orientationButtonTextActive]}>Landscape</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.designLabel}>Design Source</Text>
                    <View style={styles.orientationToggle}>
                      <TouchableOpacity
                        style={[styles.orientationButton, newFeeDesignSource === "template" && styles.orientationButtonActive]}
                        onPress={() => {
                          setNewFeeDesignSource("template")
                          setNewFeeUploadedBackgroundUrl(null)
                          setNewFeeBackgroundFile(null)
                        }}
                      >
                        <Text style={[styles.orientationButtonText, newFeeDesignSource === "template" && styles.orientationButtonTextActive]}>Template</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.orientationButton, newFeeDesignSource === "upload" && styles.orientationButtonActive]}
                        onPress={() => {
                          setNewFeeDesignSource("upload")
                          setNewFeeSelectedTemplate(null)
                        }}
                      >
                        <Text style={[styles.orientationButtonText, newFeeDesignSource === "upload" && styles.orientationButtonTextActive]}>Upload Custom</Text>
                      </TouchableOpacity>
                    </View>
                    {newFeeDesignSource === "template" ? (
                      <>
                        <Text style={styles.designLabel}>Select Template</Text>
                        <ScrollView horizontal style={styles.templateGallery} showsHorizontalScrollIndicator={false}>
                          {getTemplatesByOrientation(newFeeDesignOrientation).map((template) => (
                            <TouchableOpacity
                              key={template.id}
                              style={[styles.templateCard, newFeeSelectedTemplate === template.id && styles.templateCardSelected]}
                              onPress={() => { setNewFeeSelectedTemplate(template.id); setNewFeeLayout(defaultLayout(newFeeDesignOrientation, !!image)) }}
                            >
                              <Image source={{ uri: template.thumbnailSvg }} style={styles.templateThumbnail} />
                              <Text style={styles.templateLabel}>{template.label}</Text>
                              {newFeeSelectedTemplate === template.id && (
                                <View style={styles.selectedOverlay}>
                                  <Ionicons name="checkmark-circle" size={24} color="#2196F3" />
                                </View>
                              )}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>

                        {newFeeSelectedTemplate && (
                          <>
                            {/* QR position selector */}
                            <Text style={[styles.designLabel, { marginTop: 10 }]}>QR Code Position</Text>
                            <View style={styles.orientationToggle}>
                              {(newFeeDesignOrientation === "portrait"
                                ? (["top", "center", "bottom"] as const)
                                : (["left", "right"] as const)
                              ).map(pos => (
                                <TouchableOpacity
                                  key={pos}
                                  style={[styles.orientationButton, newFeeQrPosition === pos && styles.orientationButtonActive]}
                                  onPress={() => setNewFeeQrPosition(pos)}
                                >
                                  <Text style={[styles.orientationButtonText, newFeeQrPosition === pos && styles.orientationButtonTextActive]}>
                                    {pos.charAt(0).toUpperCase() + pos.slice(1)}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                            {/* Static preview */}
                            {Platform.OS === "web" && (() => {
                              const srcW = newFeeDesignOrientation === "landscape" ? 900 : 600
                              const srcH = newFeeDesignOrientation === "landscape" ? 500 : 900
                              const zoom = 360 / srcW
                              const html = generatePreviewHTML(newFeeSelectedTemplate, newFeeDesignOrientation, null, { eventName: name || undefined, venueName: selectedVenueName || undefined, qrPosition: newFeeQrPosition })
                              return (
                                <View style={{ marginTop: 10, alignItems: "center" }}>
                                  <Text style={{ color: "#888", fontSize: 11, marginBottom: 6 }}>Preview</Text>
                                  <View style={{ width: 360, height: Math.round(srcH * zoom), borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" }}>
                                    {/* @ts-ignore */}
                                    <iframe srcDoc={html} style={{ width: srcW, height: srcH, border: "none", zoom, display: "block", pointerEvents: "none" }} sandbox="allow-same-origin" />
                                  </View>
                                </View>
                              )
                            })()}
                          </>
                        )}

                        {!newFeeSelectedTemplate && (
                          <Text style={styles.designError}>Please select a ticket design template.</Text>
                        )}
                      </>
                    ) : (
                      <>
                        <Text style={styles.designLabel}>Upload Background Image</Text>
                        <TouchableOpacity
                          style={styles.uploadButton}
                          onPress={() => pickFeeBackgroundImage()}
                        >
                          <Ionicons name="image-outline" size={20} color="#FFFFFF" />
                          <Text style={styles.uploadButtonText}>Choose Image</Text>
                        </TouchableOpacity>
                        {newFeeUploadedBackgroundUrl && (
                          <View style={styles.uploadedImagePreview}>
                            <Image source={{ uri: newFeeUploadedBackgroundUrl }} style={styles.uploadedImageThumb} />
                            <TouchableOpacity
                              style={styles.removeUploadButton}
                              onPress={() => {
                                setNewFeeUploadedBackgroundUrl(null)
                                setNewFeeBackgroundFile(null)
                              }}
                            >
                              <Ionicons name="close-circle" size={20} color="#FF3B30" />
                            </TouchableOpacity>
                          </View>
                        )}
                        <View style={styles.dimensionRow}>
                          <View style={styles.dimensionField}>
                            <Text style={styles.dimensionLabel}>Width (cm)</Text>
                            <TextInput
                              style={styles.dimensionInput}
                              value={newFeeWidthCm}
                              onChangeText={setNewFeeWidthCm}
                              placeholder="21"
                              placeholderTextColor="#666"
                              keyboardType="decimal-pad"
                            />
                          </View>
                          <View style={styles.dimensionField}>
                            <Text style={styles.dimensionLabel}>Height (cm)</Text>
                            <TextInput
                              style={styles.dimensionInput}
                              value={newFeeHeightCm}
                              onChangeText={setNewFeeHeightCm}
                              placeholder="29.7"
                              placeholderTextColor="#666"
                              keyboardType="decimal-pad"
                            />
                          </View>
                        </View>
                        <Text style={styles.dimensionHint}>
                          {newFeeWidthCm && newFeeHeightCm
                            ? `${newFeeWidthCm} × ${newFeeHeightCm} cm → ${Math.round((parseFloat(newFeeWidthCm)||21)*(96/2.54))} × ${Math.round((parseFloat(newFeeHeightCm)||29.7)*(96/2.54))} px`
                            : "Enter dimensions in centimetres"}
                        </Text>
                        {newFeeUploadedBackgroundUrl && (
                          <TicketEditor
                            templateId={null}
                            orientation={newFeeDesignOrientation}
                            uploadedBgUrl={newFeeUploadedBackgroundUrl}
                            widthCm={parseFloat(newFeeWidthCm) || 21}
                            heightCm={parseFloat(newFeeHeightCm) || 29.7}
                            posterUrl={image || null}
                            eventName={name || undefined}
                            venueName={selectedVenueName || undefined}
                            layout={newFeeLayout}
                            onLayoutChange={setNewFeeLayout}
                          />
                        )}
                      </>
                    )}
                  </View>
                )}
                {newFeeIsTable && (
                  <TextInput
                    style={styles.input}
                    value={newTableSize}
                    onChangeText={setNewTableSize}
                    placeholder="Number of people at table (e.g. 5)"
                    placeholderTextColor="#999"
                    keyboardType="numeric"
                  />
                )}

                {/* ── Capacity & Seat Map ── */}
                <View style={styles.customDesignContainer}>
                  <Text style={styles.designLabel}>Capacity (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={newFeeMaxTickets}
                    onChangeText={setNewFeeMaxTickets}
                    placeholder="Max tickets available (blank = unlimited)"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                  />
                  {newFeeMaxTickets !== "" && parseInt(newFeeMaxTickets) > 0 && (
                    <>
                      <Text style={styles.designLabel}>Seat Map Type</Text>
                      <View style={styles.orientationToggle}>
                        {(["none", "numbered", "cinema"] as const).map(t => (
                          <TouchableOpacity
                            key={t}
                            style={[styles.orientationButton, newFeeSeatMapType === t && styles.orientationButtonActive]}
                            onPress={() => setNewFeeSeatMapType(t)}
                          >
                            <Text style={[styles.orientationButtonText, newFeeSeatMapType === t && styles.orientationButtonTextActive]}>
                              {t === "none" ? "None" : t === "numbered" ? "Numbered" : "Cinema"}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {newFeeSeatMapType === "none" && (
                        <Text style={{ color: "#666", fontSize: 11, marginBottom: 4 }}>No seat selection -- tickets sold on first-come basis up to the max</Text>
                      )}
                      {newFeeSeatMapType === "numbered" && (
                        <Text style={{ color: "#666", fontSize: 11, marginBottom: 4 }}>Buyers pick a number 1 to {newFeeMaxTickets} from a grid</Text>
                      )}
                      {newFeeSeatMapType === "cinema" && (
                        <>
                          <Text style={{ color: "#666", fontSize: 11, marginBottom: 8 }}>Buyers pick a seat from a rows x columns grid (e.g. A1, B3)</Text>
                          <View style={styles.dimensionRow}>
                            <View style={styles.dimensionField}>
                              <Text style={styles.dimensionLabel}>Rows</Text>
                              <TextInput style={styles.dimensionInput} value={newFeeSeatRows} onChangeText={setNewFeeSeatRows} placeholder="e.g. 5" placeholderTextColor="#666" keyboardType="numeric" />
                            </View>
                            <View style={styles.dimensionField}>
                              <Text style={styles.dimensionLabel}>Cols per row</Text>
                              <TextInput style={styles.dimensionInput} value={newFeeSeatCols} onChangeText={setNewFeeSeatCols} placeholder="e.g. 10" placeholderTextColor="#666" keyboardType="numeric" />
                            </View>
                          </View>
                          {newFeeSeatRows && newFeeSeatCols && (
                            <Text style={styles.dimensionHint}>{parseInt(newFeeSeatRows) * parseInt(newFeeSeatCols)} total seats (rows A-{String.fromCharCode(64 + parseInt(newFeeSeatRows))}, cols 1-{newFeeSeatCols})</Text>
                          )}
                        </>
                      )}
                    </>
                  )}
                </View>
                <TouchableOpacity style={styles.addButton} onPress={addFee}>
                  <Ionicons name="add" size={20} color="#FFFFFF" />
                  <Text style={styles.addButtonText}>Submit</Text>
                </TouchableOpacity>
              </View>
            )}
            {entryFees.map((fee, index) => (
              <View key={index} style={styles.feeItem}>
                <View>
                  <Text style={styles.feeText}>
                    {fee.name}{fee.isTable ? ` (Table: ${fee.tableSize} pax)` : ""}
                  </Text>
                  <Text style={styles.feeAmountText}>UGX {fee.amount}</Text>
                </View>
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
  header: {
    padding: responsiveSize(12, 16, 24),
    paddingBottom: responsiveSize(8, 12, 16),
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: responsiveSize(8, 10, 12),
    paddingHorizontal: responsiveSize(12, 16, 20),
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: responsiveSize(8, 10, 12),
    alignSelf: "flex-start",
  },
  backButtonText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(14, 15, 16),
    marginLeft: responsiveSize(6, 8, 10),
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
  checkboxRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: responsiveSize(14, 16, 18),
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
  feeAmountText: {
    color: "#888888",
    fontSize: 12,
    marginTop: 2,
  },
  tableCheckboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0, 212, 255, 0.05)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.2)",
  },
  tableLabel: {
    color: "#00D4FF",
    fontSize: 14,
    fontWeight: "600",
  },
  customDesignContainer: {
    backgroundColor: "#1E1E1E",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.2)",
  },
  designLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  orientationToggle: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  orientationButton: {
    flex: 1,
    padding: 8,
    alignItems: "center",
    backgroundColor: "#2A2A2A",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  orientationButtonActive: {
    backgroundColor: "#2196F3",
    borderColor: "#2196F3",
  },
  orientationButtonText: {
    color: "#888888",
    fontSize: 14,
    fontWeight: "600",
  },
  orientationButtonTextActive: {
    color: "#FFFFFF",
  },
  templateGallery: {
    marginBottom: 8,
  },
  templateCard: {
    alignItems: "center",
    marginRight: 12,
  },
  templateCardSelected: {
    borderWidth: 2,
    borderColor: "#2196F3",
    borderRadius: 6,
  },
  templateThumbnail: {
    width: 120,
    height: 200,
    borderRadius: 6,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  templateLabel: {
    color: "#FFFFFF",
    fontSize: 12,
    textAlign: "center",
  },
  selectedOverlay: {
    position: "absolute",
    top: -8,
    right: -8,
  },
  designError: {
    color: "#FF3B30",
    fontSize: 12,
    marginTop: 4,
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  uploadButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 6,
  },
  uploadedImagePreview: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  uploadedImageThumb: {
    width: 60,
    height: 100,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  dimensionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  dimensionField: {
    flex: 1,
  },
  dimensionLabel: {
    color: "#888",
    fontSize: 11,
    marginBottom: 4,
  },
  dimensionInput: {
    backgroundColor: "#2A2A2A",
    color: "#FFFFFF",
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    fontSize: 14,
    marginBottom: 0,
  },
  dimensionHint: {
    color: "#555",
    fontSize: 10,
    marginBottom: 10,
    fontFamily: "monospace",
  },
  removeUploadButton: {
    marginLeft: 8,
  },
  bgControls: {
    marginTop: 10,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  bgControlsLabel: {
    color: "#888",
    fontSize: 11,
    marginBottom: 6,
  },
  bgControlsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  bgBtn: {
    backgroundColor: "#2a2a2a",
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 36,
  },
  resetLayoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    padding: 6,
  },
})

export default AddEventScreen
