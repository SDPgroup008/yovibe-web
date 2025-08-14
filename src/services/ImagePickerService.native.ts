// Native-specific implementation of ImagePickerService
import * as ExpoImagePicker from "expo-image-picker"

export interface ImagePickerResult {
  canceled: boolean
  assets?: Array<{
    uri: string
    type?: string
    name?: string
  }>
}

export interface ImagePickerOptions {
  mediaTypes: "Images" | "Videos" | "All"
  allowsEditing?: boolean
  aspect?: [number, number]
  quality?: number
}

/**
 * Native implementation of image picker using expo-image-picker
 */
class ImagePickerService {
  /**
   * Launch the device's image library and let the user select an image
   */
  async launchImageLibraryAsync(options: ImagePickerOptions): Promise<ImagePickerResult> {
    const result = await ExpoImagePicker.launchImageLibraryAsync({
      mediaTypes: ExpoImagePicker.MediaTypeOptions[options.mediaTypes],
      allowsEditing: options.allowsEditing,
      aspect: options.aspect,
      quality: options.quality,
    })

    return result
  }

  /**
   * Request permissions for accessing the media library
   */
  async requestMediaLibraryPermissionsAsync() {
    return await ExpoImagePicker.requestMediaLibraryPermissionsAsync()
  }
}

// Constants to match expo-image-picker API
export const MediaTypeOptions = ExpoImagePicker.MediaTypeOptions

export default new ImagePickerService()
