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

interface AddVenueScreenProps {
  navigation: any
}

const AddVenueScreen: React.FC<AddVenueScreenProps> = ({ navigation }) => {
  const { user } = useAuth()
  const [name, setName] = useState("")
  const [location, setLocation] = useState("")
  const [description, setDescription] = useState("")
  const [categories, setCategories] = useState("")
  const [vibeRating, setVibeRating] = useState("4.5")
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

  // Web-specific image picker
  const pickImage = async () => {
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
        // @ts-ignore - This is a web-only feature
        prompt: {
          type: "plain-text",
          placeholder: "https://example.com/image.jpg",
        },
      },
    )
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
        vibeRating: Number.parseFloat(vibeRating) || 4.5,
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

        <Text style={styles.label}>Vibe Rating (1-5)</Text>
        <TextInput
          style={styles.input}
          value={vibeRating}
          onChangeText={setVibeRating}
          placeholder="Enter vibe rating (e.g. 4.5)"
          placeholderTextColor="#999"
          keyboardType="numeric"
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

        <Text style={styles.label}>Venue Image URL *</Text>
        <TextInput
          style={styles.input}
          value={image || ""}
          onChangeText={setImage}
          placeholder="Enter image URL"
          placeholderTextColor="#999"
        />

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
})

export default AddVenueScreen
