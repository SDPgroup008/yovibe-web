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
    width: number
    height: number
    type?: string
    base64?: string
  }>
}

export class ImagePickerService {
  static async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === "web") {
        return true
      }

      const { status: mediaLibraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync()

      return mediaLibraryStatus === "granted" && cameraStatus === "granted"
    } catch (error) {
      console.error("Error requesting permissions:", error)
      return false
    }
  }

  static async pickImage(options: ImagePickerOptions = {}): Promise<ImagePickerResult> {
    try {
      console.log("ImagePickerService: Starting image selection")

      const hasPermissions = await this.requestPermissions()
      if (!hasPermissions) {
        console.warn("ImagePickerService: Permissions not granted")
        return { canceled: true }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes:
          options.mediaTypes === "Images" ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.All,
        allowsEditing: options.allowsEditing ?? true,
        aspect: options.aspect ?? [16, 9],
        quality: options.quality ?? 0.8,
        base64: options.base64 ?? false,
      })

      console.log("ImagePickerService: Image selection result:", result)

      if (result.canceled) {
        return { canceled: true }
      }

      return {
        canceled: false,
        assets: result.assets?.map((asset) => ({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          type: asset.type,
          base64: asset.base64,
        })),
      }
    } catch (error) {
      console.error("ImagePickerService: Error picking image:", error)
      return { canceled: true }
    }
  }

  static async takePhoto(options: ImagePickerOptions = {}): Promise<ImagePickerResult> {
    try {
      console.log("ImagePickerService: Starting camera capture")

      const hasPermissions = await this.requestPermissions()
      if (!hasPermissions) {
        console.warn("ImagePickerService: Camera permissions not granted")
        return { canceled: true }
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes:
          options.mediaTypes === "Images" ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.All,
        allowsEditing: options.allowsEditing ?? true,
        aspect: options.aspect ?? [16, 9],
        quality: options.quality ?? 0.8,
        base64: options.base64 ?? false,
      })

      console.log("ImagePickerService: Camera capture result:", result)

      if (result.canceled) {
        return { canceled: true }
      }

      return {
        canceled: false,
        assets: result.assets?.map((asset) => ({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          type: asset.type,
          base64: asset.base64,
        })),
      }
    } catch (error) {
      console.error("ImagePickerService: Error taking photo:", error)
      return { canceled: true }
    }
  }

  static async showImagePicker(options: ImagePickerOptions = {}): Promise<ImagePickerResult> {
    // For now, default to image library
    // In a real implementation, you might show an action sheet to choose between camera and library
    return this.pickImage(options)
  }
}
