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
import FirebaseService from "../services/FirebaseService"
import LocationService from "../services/LocationService"
import { useAuth } from "../contexts/AuthContext"
import ImagePickerService from "../services/ImagePickerService"
import { Ionicons } from "@expo/vector-icons"

interface AddVenueScreenProps {
  navigation: any
}

const AddVenueScreen: React.FC<AddVenueScreenProps> = ({ navigation }) => {
  const { user } = useAuth()
  const [name, setName] = useState("")
  const [location, setLocation] = useState("")
  const [description, setDescription] = useState("")
  const [categories, setCategories] = useState("")
  const [latitude, setLatitude] = useState("0")
  const [longitude, setLongitude] = useState("0")
  const [image, setImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [locationPermission, setLocationPermission] = useState(false)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)

  useEffect(() => {
    ;(async () => {
      // Use our custom LocationService
      const hasPermission = await LocationService.requestPermissions()
      setLocationPermission(hasPermission)

      if (hasPermission) {
        const location = await LocationService.getCurrentPosition()
        const { latitude, longitude } = location
        setUserLocation({ latitude, longitude })
        setLatitude(latitude.toString())
        setLongitude(longitude.toString())
      }
    })()
  }, [])

  const pickImage = async () => {
    try {
      // Request permissions first
      await ImagePickerService.requestMediaLibraryPermissionsAsync()

      // Launch image picker
      const result = await ImagePickerService.launchImageLibraryAsync({
        mediaTypes: "Images",
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      })

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri
        setImage(imageUri)
      }
    } catch (error) {
      console.error("Error picking image:", error)
      Alert.alert("Error", "Failed to pick image")
    }
  }

  const handleSubmit = async () => {
    if (!name || !location || !description || !categories) {
      Alert.alert("Error", "Please fill in all required fields")
      return
    }

    if (!image) {
      Alert.alert("Error", "Please select an image for the venue")
      return
    }

    if (!user) {
      Alert.alert("Error", "You must be logged in to add a venue")
      return
    }

    setLoading(true)

    try {
      // Upload image first
      const imageUrl = await FirebaseService.uploadVenueImage(image)

      // Create venue object
      const venueData = {
        name,
        location,
        description,
        categories: categories.split(",").map((cat) => cat.trim()),
        vibeRating: 4.0, // Default vibe rating
        backgroundImageUrl: imageUrl,
        latitude: Number.parseFloat(latitude) || 0,
        longitude: Number.parseFloat(longitude) || 0,
        ownerId: user.id,
        weeklyPrograms: {},
        todayImages: [],
        createdAt: new Date(),
      }

      // Add venue to database
      await FirebaseService.addVenue(venueData)

      Alert.alert("Success", "Venue created successfully")
      navigation.goBack()
    } catch (error) {
      Alert.alert("Error", "Failed to create venue")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.label}>Venue Name *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Enter venue name"
          placeholderTextColor="#999"
        />

        <Text style={styles.label}>Address *</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder="Enter venue address"
          placeholderTextColor="#999"
        />

        <Text style={styles.label}>Description *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Enter venue description"
          placeholderTextColor="#999"
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Categories *</Text>
        <TextInput
          style={styles.input}
          value={categories}
          onChangeText={setCategories}
          placeholder="Enter categories (comma separated)"
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

        <Text style={styles.label}>Venue Image *</Text>
        <TouchableOpacity style={styles.imagePickerButton} onPress={pickImage}>
          <Ionicons name="camera-outline" size={24} color="#FFFFFF" />
          <Text style={styles.imagePickerText}>{image ? "Change Image" : "Select Image"}</Text>
        </TouchableOpacity>

        {image && (
          <View style={styles.imagePreview}>
            <Image source={{ uri: image }} style={styles.previewImage} />
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>Create Venue</Text>}
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
  locationContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  locationField: {
    width: "48%",
  },
  imagePreview: {
    height: 200,
    marginBottom: 16,
    borderRadius: 8,
    overflow: "hidden",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  submitButton: {
    backgroundColor: "#2196F3",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  disabledButton: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  imagePickerButton: {
    backgroundColor: "#2196F3",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  imagePickerText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
})

export default AddVenueScreen
  