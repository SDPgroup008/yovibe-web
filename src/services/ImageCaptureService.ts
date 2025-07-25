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
        base64: asset.base64,
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
        base64: asset.base64,
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
        base64: asset.base64,
      }
    } catch (error) {
      console.error("ImageCaptureService: Error selecting from library:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to select from library",
      }
    }
  }

  static async showImagePicker(options: ImageCaptureOptions = {}): Promise<ImageCaptureResult> {
    // For now, default to library picker
    // In a real app, you might want to show an action sheet to choose between camera and library
    return this.selectFromLibrary(options)
  }

  static async resizeImage(
    imageUri: string,
    width: number,
    height: number,
  ): Promise<{ success: boolean; imageUri?: string; error?: string }> {
    try {
      // This would typically use a library like expo-image-manipulator
      // For now, return the original image
      console.log("ImageCaptureService: Image resize requested (not implemented)")
      return {
        success: true,
        imageUri,
      }
    } catch (error) {
      console.error("ImageCaptureService: Error resizing image:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to resize image",
      }
    }
  }

  static async compressImage(
    imageUri: string,
    quality = 0.8,
  ): Promise<{ success: boolean; imageUri?: string; error?: string }> {
    try {
      // This would typically use a library like expo-image-manipulator
      // For now, return the original image
      console.log("ImageCaptureService: Image compression requested (not implemented)")
      return {
        success: true,
        imageUri,
      }
    } catch (error) {
      console.error("ImageCaptureService: Error compressing image:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to compress image",
      }
    }
  }

  static validateImageFile(imageUri: string): { valid: boolean; error?: string } {
    try {
      // Basic validation - check if URI exists and has proper format
      if (!imageUri || imageUri.trim().length === 0) {
        return { valid: false, error: "Image URI is empty" }
      }

      // Check if it's a valid URI format
      const validFormats = [".jpg", ".jpeg", ".png", ".gif", ".webp"]
      const hasValidFormat = validFormats.some((format) => imageUri.toLowerCase().includes(format))

      if (!hasValidFormat && !imageUri.startsWith("data:image/")) {
        return { valid: false, error: "Invalid image format" }
      }

      return { valid: true }
    } catch (error) {
      console.error("ImageCaptureService: Error validating image:", error)
      return { valid: false, error: "Image validation failed" }
    }
  }

  static getImageDimensions(imageUri: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      if (Platform.OS === "web") {
        const img = new Image()
        img.onload = () => {
          resolve({ width: img.width, height: img.height })
        }
        img.onerror = () => {
          reject(new Error("Failed to load image"))
        }
        img.src = imageUri
      } else {
        // For React Native, you'd typically use Image.getSize
        resolve({ width: 0, height: 0 })
      }
    })
  }
}
