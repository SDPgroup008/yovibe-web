import * as ImagePicker from "expo-image-picker"

export interface ImagePickerOptions {
  mediaTypes: "Images" | "Videos" | "All"
  allowsEditing?: boolean
  aspect?: [number, number]
  quality?: number
  allowsMultipleSelection?: boolean
}

export interface ImagePickerAsset {
  uri: string
  width?: number
  height?: number
  base64?: string
}

export interface ImagePickerResult {
  canceled: boolean
  assets?: ImagePickerAsset[]
}

class ImagePickerService {
  async requestMediaLibraryPermissionsAsync(): Promise<ImagePicker.MediaLibraryPermissionResponse> {
    return await ImagePicker.requestMediaLibraryPermissionsAsync()
  }

  async requestCameraPermissionsAsync(): Promise<ImagePicker.CameraPermissionResponse> {
    return await ImagePicker.requestCameraPermissionsAsync()
  }

  async pickImage(options: ImagePickerOptions = { mediaTypes: "Images" }): Promise<ImagePickerResult> {
    try {
      console.log("ImagePickerService: Requesting media library permissions...")

      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync()

      if (permissionResult.granted === false) {
        console.log("ImagePickerService: Permission denied")
        return { canceled: true }
      }

      console.log("ImagePickerService: Launching image library...")

      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes:
          options.mediaTypes === "Images"
            ? ImagePicker.MediaTypeOptions.Images
            : options.mediaTypes === "Videos"
              ? ImagePicker.MediaTypeOptions.Videos
              : ImagePicker.MediaTypeOptions.All,
        allowsEditing: options.allowsEditing ?? true,
        aspect: options.aspect,
        quality: options.quality ?? 1,
        allowsMultipleSelection: options.allowsMultipleSelection ?? false,
      }

      const result = await ImagePicker.launchImageLibraryAsync(pickerOptions)

      console.log("ImagePickerService: Image picker result:", result)

      if (result.canceled) {
        return { canceled: true }
      }

      // Convert the result to our interface
      const assets: ImagePickerAsset[] =
        result.assets?.map((asset) => ({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          base64: asset.base64 || undefined,
        })) || []

      return {
        canceled: false,
        assets,
      }
    } catch (error) {
      console.error("ImagePickerService: Error picking image:", error)
      return { canceled: true }
    }
  }

  async launchImageLibraryAsync(options?: ImagePicker.ImagePickerOptions): Promise<ImagePickerResult> {
    try {
      const result = await ImagePicker.launchImageLibraryAsync(options)

      if (result.canceled) {
        return { canceled: true }
      }

      // Convert the result to our interface
      const assets: ImagePickerAsset[] =
        result.assets?.map((asset) => ({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          base64: asset.base64 || undefined,
        })) || []

      return {
        canceled: false,
        assets,
      }
    } catch (error) {
      console.error("ImagePickerService: Error launching image library:", error)
      return { canceled: true }
    }
  }

  async takePhoto(options: ImagePickerOptions = { mediaTypes: "Images" }): Promise<ImagePickerResult> {
    try {
      console.log("ImagePickerService: Requesting camera permissions...")

      const permissionResult = await ImagePicker.requestCameraPermissionsAsync()

      if (permissionResult.granted === false) {
        console.log("ImagePickerService: Camera permission denied")
        return { canceled: true }
      }

      console.log("ImagePickerService: Launching camera...")

      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes:
          options.mediaTypes === "Images"
            ? ImagePicker.MediaTypeOptions.Images
            : options.mediaTypes === "Videos"
              ? ImagePicker.MediaTypeOptions.Videos
              : ImagePicker.MediaTypeOptions.All,
        allowsEditing: options.allowsEditing ?? true,
        aspect: options.aspect,
        quality: options.quality ?? 1,
      }

      const result = await ImagePicker.launchCameraAsync(pickerOptions)

      console.log("ImagePickerService: Camera result:", result)

      if (result.canceled) {
        return { canceled: true }
      }

      // Convert the result to our interface
      const assets: ImagePickerAsset[] =
        result.assets?.map((asset) => ({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          base64: asset.base64 || undefined,
        })) || []

      return {
        canceled: false,
        assets,
      }
    } catch (error) {
      console.error("ImagePickerService: Error taking photo:", error)
      return { canceled: true }
    }
  }
}

// Create and export a single instance
const imagePickerService = new ImagePickerService()
export default imagePickerService

// Also export the class for named imports if needed
export { ImagePickerService }
