import { Platform } from "react-native"
import * as ImagePicker from "expo-image-picker"

export interface ImageCaptureOptions {
  quality?: number
  allowsEditing?: boolean
  aspect?: [number, number]
  base64?: boolean
}

export interface ImageCaptureResult {
  success: boolean
  imageUri?: string
  base64?: string
  error?: string
}

export default class ImageCaptureService {
  static async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === "web") {
        // Web doesn't need explicit permissions for file input
        return true
      }

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      const cameraStatus = await ImagePicker.requestCameraPermissionsAsync()

      return status === "granted" && cameraStatus.status === "granted"
    } catch (error) {
      console.error("ImageCaptureService: Error requesting permissions:", error)
      return false
    }
  }

  static async captureOrSelectImage(options: ImageCaptureOptions = {}): Promise<ImageCaptureResult> {
    try {
      console.log("ImageCaptureService: Starting image capture/selection")

      // Request permissions first
      const hasPermissions = await this.requestPermissions()
      if (!hasPermissions) {
        return {
          success: false,
          error: "Camera and media library permissions are required",
        }
      }

      // Show action sheet to choose between camera and library
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: options.allowsEditing ?? true,
        aspect: options.aspect ?? [1, 1],
        quality: options.quality ?? 0.8,
        base64: options.base64 ?? false,
      })

      if (result.canceled) {
        return {
          success: false,
          error: "Image selection was cancelled",
        }
      }

      const asset = result.assets[0]
      if (!asset) {
        return {
          success: false,
          error: "No image selected",
        }
      }

      console.log("ImageCaptureService: Image captured successfully")
      return {
        success: true,
        imageUri: asset.uri,
        base64: asset.base64 || undefined,
      }
    } catch (error) {
      console.error("ImageCaptureService: Error capturing image:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to capture image",
      }
    }
  }

  static async captureFromCamera(options: ImageCaptureOptions = {}): Promise<ImageCaptureResult> {
    try {
      console.log("ImageCaptureService: Starting camera capture")

      const hasPermissions = await this.requestPermissions()
      if (!hasPermissions) {
        return {
          success: false,
          error: "Camera permission is required",
        }
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: options.allowsEditing ?? true,
        aspect: options.aspect ?? [1, 1],
        quality: options.quality ?? 0.8,
        base64: options.base64 ?? false,
      })

      if (result.canceled) {
        return {
          success: false,
          error: "Camera capture was cancelled",
        }
      }

      const asset = result.assets[0]
      if (!asset) {
        return {
          success: false,
          error: "No image captured",
        }
      }

      console.log("ImageCaptureService: Camera capture successful")
      return {
        success: true,
        imageUri: asset.uri,
        base64: asset.base64 || undefined,
      }
    } catch (error) {
      console.error("ImageCaptureService: Error capturing from camera:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to capture from camera",
      }
    }
  }

  static async selectFromLibrary(options: ImageCaptureOptions = {}): Promise<ImageCaptureResult> {
    try {
      console.log("ImageCaptureService: Starting library selection")

      const hasPermissions = await this.requestPermissions()
      if (!hasPermissions) {
        return {
          success: false,
          error: "Media library permission is required",
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: options.allowsEditing ?? true,
        aspect: options.aspect ?? [1, 1],
        quality: options.quality ?? 0.8,
        base64: options.base64 ?? false,
      })

      if (result.canceled) {
        return {
          success: false,
          error: "Library selection was cancelled",
        }
      }

      const asset = result.assets[0]
      if (!asset) {
        return {
          success: false,
          error: "No image selected",
        }
      }

      console.log("ImageCaptureService: Library selection successful")
      return {
        success: true,
        imageUri: asset.uri,
        base64: asset.base64 || undefined,
      }
    } catch (error) {
      console.error("ImageCaptureService: Error selecting from library:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to select from library",
      }
    }
  }

  static async captureImage(): Promise<string | null> {
    try {
      const result = await this.captureOrSelectImage()
      return result.success ? result.imageUri || null : null
    } catch (error) {
      console.error("ImageCaptureService: Error in captureImage:", error)
      return null
    }
  }
}
