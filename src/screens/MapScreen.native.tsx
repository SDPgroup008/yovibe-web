"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Alert, ActivityIndicator } from "react-native"
import MapView, { Marker, Callout, PROVIDER_GOOGLE, Polyline } from "react-native-maps"
import { Ionicons } from "@expo/vector-icons"
import LocationService from "../services/LocationService"
import FirebaseService from "../services/FirebaseService"
import type { Venue } from "../models/Venue"
import type { MapScreenProps } from "../navigation/types"

// Google Maps API key
const GOOGLE_MAPS_API_KEY = "YOUR_GOOGLE_MAPS_API_KEY" // Replace with your actual API key

const MapScreen: React.FC<MapScreenProps> = ({ navigation, route }) => {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [directions, setDirections] = useState<Array<{ latitude: number; longitude: number }>>([])
  const [showDirections, setShowDirections] = useState(false)
  const [loadingDirections, setLoadingDirections] = useState(false)
  const mapRef = useRef<MapView>(null)

  // Check if we need to show directions to a specific venue
  const destinationVenueId = route.params?.destinationVenueId

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadVenues()
      getUserLocation()
    })

    return unsubscribe
  }, [navigation])

  useEffect(() => {
    // If a destination venue ID is provided, show directions to it
    if (destinationVenueId && venues.length > 0 && userLocation) {
      const venue = venues.find((v) => v.id === destinationVenueId)
      if (venue) {
        setSelectedVenue(venue)
        getDirections(venue)
      }
    }
  }, [destinationVenueId, venues, userLocation])

  const getUserLocation = async () => {
    try {
      // Use our custom LocationService instead of expo-location directly
      const hasPermission = await LocationService.requestPermissions()

      if (!hasPermission) {
        Alert.alert("Permission Denied", "We need location permissions to show your position on the map")
        return
      }

      const location = await LocationService.getCurrentPosition()
      setUserLocation({
        latitude: location.latitude,
        longitude: location.longitude,
      })
    } catch (error) {
      console.error("Error getting user location:", error)
    }
  }

  const loadVenues = async () => {
    try {
      setLoading(true)
      const venuesList = await FirebaseService.getVenues()
      setVenues(venuesList)
    } catch (error) {
      console.error("Error loading venues for map:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleVenueSelect = (venue: Venue) => {
    setSelectedVenue(venue)

    if (userLocation) {
      getDirections(venue)
    }
  }

  // Updated getDirections function to use Google Maps Directions API
  const getDirections = async (venue: Venue) => {
    if (!userLocation) return

    try {
      setLoadingDirections(true)

      // Use Google Maps Directions API to get real directions
      const origin = `${userLocation.latitude},${userLocation.longitude}`
      const destination = `${venue.latitude},${venue.longitude}`
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&key=${GOOGLE_MAPS_API_KEY}`

      const response = await fetch(url)
      const data = await response.json()

      if (data.status !== "OK") {
        throw new Error(`Directions request failed: ${data.status}`)
      }

      // Decode the polyline
      const points = data.routes[0].overview_polyline.points
      const decodedPoints = decodePolyline(points)

      setDirections(decodedPoints)
      setShowDirections(true)

      // Fit the map to show the route
      if (mapRef.current && decodedPoints.length > 0) {
        const coordinates = [
          { latitude: userLocation.latitude, longitude: userLocation.longitude },
          { latitude: venue.latitude, longitude: venue.longitude },
        ]

        mapRef.current.fitToCoordinates(coordinates, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        })
      }
    } catch (error) {
      console.error("Error getting directions:", error)
      Alert.alert("Error", "Could not get directions to this venue. Using straight line instead.")

      // Fallback to straight line if API fails
      const start = userLocation
      const end = { latitude: venue.latitude, longitude: venue.longitude }
      setDirections([start, end])
      setShowDirections(true)
    } finally {
      setLoadingDirections(false)
    }
  }

  // Function to decode Google's encoded polyline
  const decodePolyline = (encoded: string): Array<{ latitude: number; longitude: number }> => {
    const poly: Array<{ latitude: number; longitude: number }> = []
    let index = 0,
      lat = 0,
      lng = 0

    while (index < encoded.length) {
      let b,
        shift = 0,
        result = 0

      do {
        b = encoded.charCodeAt(index++) - 63
        result |= (b & 0x1f) << shift
        shift += 5
      } while (b >= 0x20)

      const dlat = result & 1 ? ~(result >> 1) : result >> 1
      lat += dlat

      shift = 0
      result = 0

      do {
        b = encoded.charCodeAt(index++) - 63
        result |= (b & 0x1f) << shift
        shift += 5
      } while (b >= 0x20)

      const dlng = result & 1 ? ~(result >> 1) : result >> 1
      lng += dlng

      const point = {
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      }

      poly.push(point)
    }

    return poly
  }

  const handleZoomToFit = () => {
    if (mapRef.current && venues.length > 0) {
      const coordinates = venues.map((venue) => ({
        latitude: venue.latitude,
        longitude: venue.longitude,
      }))

      if (userLocation) {
        coordinates.push(userLocation)
      }

      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      })
    }
  }

  const clearDirections = () => {
    setShowDirections(false)
    setDirections([])
    setSelectedVenue(null)
  }

  const darkMapStyle = [
    {
      elementType: "geometry",
      stylers: [
        {
          color: "#212121",
        },
      ],
    },
    {
      elementType: "labels.icon",
      stylers: [
        {
          visibility: "off",
        },
      ],
    },
    {
      elementType: "labels.text.fill",
      stylers: [
        {
          color: "#757575",
        },
      ],
    },
    {
      elementType: "labels.text.stroke",
      stylers: [
        {
          color: "#212121",
        },
      ],
    },
    {
      featureType: "administrative",
      elementType: "geometry",
      stylers: [
        {
          color: "#757575",
        },
      ],
    },
    {
      featureType: "administrative.country",
      elementType: "labels.text.fill",
      stylers: [
        {
          color: "#9e9e9e",
        },
      ],
    },
    {
      featureType: "administrative.land_parcel",
      stylers: [
        {
          visibility: "off",
        },
      ],
    },
    {
      featureType: "administrative.locality",
      elementType: "labels.text.fill",
      stylers: [
        {
          color: "#bdbdbd",
        },
      ],
    },
    {
      featureType: "poi",
      elementType: "labels.text.fill",
      stylers: [
        {
          color: "#757575",
        },
      ],
    },
    {
      featureType: "poi.park",
      elementType: "geometry",
      stylers: [
        {
          color: "#181818",
        },
      ],
    },
    {
      featureType: "poi.park",
      elementType: "labels.text.fill",
      stylers: [
        {
          color: "#616161",
        },
      ],
    },
    {
      featureType: "poi.park",
      elementType: "labels.text.stroke",
      stylers: [
        {
          color: "#1b1b1b",
        },
      ],
    },
    {
      featureType: "road",
      elementType: "geometry.fill",
      stylers: [
        {
          color: "#2c2c2c",
        },
      ],
    },
    {
      featureType: "road",
      elementType: "labels.text.fill",
      stylers: [
        {
          color: "#8a8a8a",
        },
      ],
    },
    {
      featureType: "road.arterial",
      elementType: "geometry",
      stylers: [
        {
          color: "#373737",
        },
      ],
    },
    {
      featureType: "road.highway",
      elementType: "geometry",
      stylers: [
        {
          color: "#3c3c3c",
        },
      ],
    },
    {
      featureType: "road.highway.controlled_access",
      elementType: "geometry",
      stylers: [
        {
          color: "#4e4e4e",
        },
      ],
    },
    {
      featureType: "road.local",
      elementType: "labels.text.fill",
      stylers: [
        {
          color: "#616161",
        },
      ],
    },
    {
      featureType: "transit",
      elementType: "labels.text.fill",
      stylers: [
        {
          color: "#757575",
        },
      ],
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [
        {
          color: "#000000",
        },
      ],
    },
    {
      featureType: "water",
      elementType: "labels.text.fill",
      stylers: [
        {
          color: "#3d3d3d",
        },
      ],
    },
  ]

  return (
    <View style={styles.container}>
      {loading && !userLocation ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      ) : (
        <>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={
              userLocation
                ? {
                    latitude: userLocation.latitude,
                    longitude: userLocation.longitude,
                    latitudeDelta: 0.0922,
                    longitudeDelta: 0.0421,
                  }
                : undefined
            }
            provider={PROVIDER_GOOGLE}
            customMapStyle={darkMapStyle}
            showsUserLocation={true}
            showsMyLocationButton={true}
          >
            {venues.map((venue) => (
              <Marker
                key={venue.id}
                coordinate={{
                  latitude: venue.latitude,
                  longitude: venue.longitude,
                }}
                title={venue.name}
                description={venue.categories.join(", ")}
                pinColor={selectedVenue?.id === venue.id ? "#FF3B30" : "#2196F3"}
                onPress={() => handleVenueSelect(venue)}
              >
                <Callout onPress={() => navigation.navigate("VenueDetail", { venueId: venue.id })}>
                  <View style={styles.calloutContainer}>
                    <Text style={styles.calloutTitle}>{venue.name}</Text>
                    <Text style={styles.calloutSubtitle}>{venue.categories.join(", ")}</Text>
                    <Text style={styles.calloutAction}>Tap for details</Text>
                  </View>
                </Callout>
              </Marker>
            ))}

            {showDirections && directions.length > 0 && (
              <Polyline coordinates={directions} strokeWidth={4} strokeColor="#2196F3" lineDashPattern={[0]} />
            )}
          </MapView>

          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.mapButton} onPress={handleZoomToFit}>
              <Ionicons name="locate" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            {showDirections && (
              <TouchableOpacity style={styles.mapButton} onPress={clearDirections}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>

          {loadingDirections && (
            <View style={styles.loadingDirections}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.loadingDirectionsText}>Getting directions...</Text>
            </View>
          )}

          {selectedVenue && showDirections && (
            <View style={styles.directionsPanel}>
              <Text style={styles.directionsTitle}>Directions to {selectedVenue.name}</Text>
              <Text style={styles.directionsInfo}>
                Distance:{" "}
                {calculateDistance(userLocation, {
                  latitude: selectedVenue.latitude,
                  longitude: selectedVenue.longitude,
                }).toFixed(2)}{" "}
                km
              </Text>
              <TouchableOpacity
                style={styles.detailsButton}
                onPress={() => navigation.navigate("VenueDetail", { venueId: selectedVenue.id })}
              >
                <Text style={styles.detailsButtonText}>View Venue Details</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  )
}

// Helper function to calculate distance between two points
const calculateDistance = (
  point1: { latitude: number; longitude: number } | null,
  point2: { latitude: number; longitude: number },
): number => {
  if (!point1) return 0

  const toRad = (value: number) => (value * Math.PI) / 180
  const R = 6371 // Earth's radius in km

  const dLat = toRad(point2.latitude - point1.latitude)
  const dLon = toRad(point2.longitude - point1.longitude)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(point1.latitude)) * Math.cos(toRad(point2.latitude)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
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
  },
  loadingText: {
    color: "#FFFFFF",
    textAlign: "center",
    marginTop: 20,
  },
  map: {
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height,
  },
  calloutContainer: {
    width: 200,
    padding: 8,
  },
  calloutTitle: {
    fontWeight: "bold",
    fontSize: 16,
  },
  calloutSubtitle: {
    color: "#666",
    marginTop: 4,
  },
  calloutAction: {
    color: "#2196F3",
    marginTop: 8,
    fontStyle: "italic",
  },
  buttonContainer: {
    position: "absolute",
    bottom: 16,
    right: 16,
    flexDirection: "column",
  },
  mapButton: {
    backgroundColor: "#2196F3",
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    marginBottom: 10,
  },
  loadingDirections: {
    position: "absolute",
    top: 16,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 8,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingDirectionsText: {
    color: "#FFFFFF",
    marginLeft: 8,
  },
  directionsPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(30, 30, 30, 0.9)",
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  directionsTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  directionsInfo: {
    color: "#BBBBBB",
    fontSize: 14,
    marginBottom: 12,
  },
  detailsButton: {
    backgroundColor: "#2196F3",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  detailsButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
})

export default MapScreen
