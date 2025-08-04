import { Platform } from "react-native"
import * as ImagePicker from "expo-image-picker"

export interface ImagePickerOptions {
  mediaTypes?: "Images" | "Videos" | "All"
  allowsEditing?: boolean
  aspect?: [number, number]
  quality?: number
  base64?: boolean
}

export interface ImagePickerResult {
  canceled: boolean
  assets?: Array<{
    uri: string
    width?: number
    height?: number
    base64?: string
  }>
}

class ImagePickerService {
  private static instance: ImagePickerService

  private constructor() {}

  static getInstance(): ImagePickerService {
    if (!ImagePickerService.instance) {
      ImagePickerService.instance = new ImagePickerService()
    }
    return ImagePickerService.instance
  }

  async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === "web") {
        // Web doesn't need explicit permissions for file input
        return true
      }

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      return status === "granted"
    } catch (error) {
      console.error("ImagePickerService: Error requesting permissions:", error)
      return false
    }
  }

  async pickImage(options: ImagePickerOptions = {}): Promise<ImagePickerResult> {
    try {
      console.log("ImagePickerService: Starting image picker")

      // Request permissions first
      const hasPermissions = await this.requestPermissions()
      if (!hasPermissions) {
        console.error("ImagePickerService: Permissions not granted")
        return { canceled: true }
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: options.allowsEditing ?? true,
        aspect: options.aspect ?? [1, 1],
        quality: options.quality ?? 0.8,
        base64: options.base64 ?? false,
      })

      console.log("ImagePickerService: Image picker result:", result)
      return result
    } catch (error) {
      console.error("ImagePickerService: Error picking image:", error)
      return { canceled: true }
    }
  }

  async launchCamera(options: ImagePickerOptions = {}): Promise<ImagePickerResult> {
    try {
      console.log("ImagePickerService: Starting camera")

      // Request camera permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== "granted") {
        console.error("ImagePickerService: Camera permissions not granted")
        return { canceled: true }
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: options.allowsEditing ?? true,
        aspect: options.aspect ?? [1, 1],
        quality: options.quality ?? 0.8,
        base64: options.base64 ?? false,
      })

      console.log("ImagePickerService: Camera result:", result)
      return result
    } catch (error) {
      console.error("ImagePickerService: Error launching camera:", error)
      return { canceled: true }
    }
  }
}

// Export singleton instance as default
const imagePickerService = ImagePickerService.getInstance()
export default imagePickerService

// Also export the class for named imports
export { ImagePickerService }
