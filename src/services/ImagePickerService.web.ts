// Web-specific implementation of ImagePickerService

export interface ImagePickerResult {
  canceled: boolean
  assets?: Array<{
    uri: string
    type?: string
    name?: string
    file?: File // Web-specific, contains the actual File object
  }>
}

export interface ImagePickerOptions {
  mediaTypes: "Images" | "Videos" | "All"
  allowsEditing?: boolean
  aspect?: [number, number]
  quality?: number
}

/**
 * Web implementation of image picker using HTML file input
 */
class ImagePickerService {
  /**
   * Launch the device's image library and let the user select an image
   */
  async launchImageLibraryAsync(options: ImagePickerOptions): Promise<ImagePickerResult> {
    return new Promise((resolve) => {
      // Create a file input element
      const input = document.createElement("input")
      input.type = "file"
      input.accept = "image/*"
      input.style.display = "none"

      // Handle file selection
      input.onchange = (event) => {
        const target = event.target as HTMLInputElement
        const files = target.files

        if (!files || files.length === 0) {
          resolve({ canceled: true })
          document.body.removeChild(input)
          return
        }

        const file = files[0]
        const reader = new FileReader()

        reader.onload = (e) => {
          const uri = e.target?.result as string
          resolve({
            canceled: false,
            assets: [
              {
                uri,
                type: file.type,
                name: file.name,
                file, // Store the actual File object for later upload
              },
            ],
          })
          document.body.removeChild(input)
        }

        reader.onerror = () => {
          resolve({ canceled: true })
          document.body.removeChild(input)
        }

        // Read the file as a data URL
        reader.readAsDataURL(file)
      }

      // Add to DOM and trigger click
      document.body.appendChild(input)
      input.click()
    })
  }

  /**
   * Request permissions - not needed for web
   */
  async requestMediaLibraryPermissionsAsync() {
    return { status: "granted" }
  }
}

// Constants to match expo-image-picker API
export const MediaTypeOptions = {
  Images: "Images",
  Videos: "Videos",
  All: "All",
}

export default new ImagePickerService()
