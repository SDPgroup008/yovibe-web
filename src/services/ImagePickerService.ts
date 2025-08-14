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

export default class ImagePickerService {
  static async requestPermissions(): Promise<boolean> {
    // Web doesn't need explicit permissions for file selection
    return true
  }

  static async launchImageLibraryAsync(options: ImagePickerOptions = {}): Promise<ImagePickerResult> {
    try {
      console.log("ImagePickerService.web: Starting image selection")

      return new Promise((resolve) => {
        const input = document.createElement("input")
        input.type = "file"
        input.accept = "image/*"
        input.multiple = false

        input.onchange = async (event) => {
          const target = event.target as HTMLInputElement
          const file = target.files?.[0]

          if (!file) {
            resolve({ canceled: true })
            return
          }

          try {
            // Create object URL for the file
            const uri = URL.createObjectURL(file)

            // Get image dimensions
            const img = new Image()
            img.onload = () => {
              const result: ImagePickerResult = {
                canceled: false,
                assets: [
                  {
                    uri,
                    width: img.width,
                    height: img.height,
                    type: file.type,
                  },
                ],
              }

              console.log("ImagePickerService.web: Image selected successfully:", result)
              resolve(result)
            }

            img.onerror = () => {
              console.error("ImagePickerService.web: Failed to load image")
              resolve({ canceled: true })
            }

            img.src = uri
          } catch (error) {
            console.error("ImagePickerService.web: Error processing file:", error)
            resolve({ canceled: true })
          }
        }

        input.oncancel = () => {
          resolve({ canceled: true })
        }

        // Trigger file selection
        input.click()
      })
    } catch (error) {
      console.error("ImagePickerService.web: Error launching image library:", error)
      return { canceled: true }
    }
  }

  static async launchCameraAsync(options: ImagePickerOptions = {}): Promise<ImagePickerResult> {
    try {
      console.log("ImagePickerService.web: Starting camera capture")

      return new Promise((resolve) => {
        const input = document.createElement("input")
        input.type = "file"
        input.accept = "image/*"
        input.capture = "environment" // Use rear camera if available

        input.onchange = async (event) => {
          const target = event.target as HTMLInputElement
          const file = target.files?.[0]

          if (!file) {
            resolve({ canceled: true })
            return
          }

          try {
            const uri = URL.createObjectURL(file)

            const img = new Image()
            img.onload = () => {
              const result: ImagePickerResult = {
                canceled: false,
                assets: [
                  {
                    uri,
                    width: img.width,
                    height: img.height,
                    type: file.type,
                  },
                ],
              }

              console.log("ImagePickerService.web: Camera capture successful:", result)
              resolve(result)
            }

            img.onerror = () => {
              console.error("ImagePickerService.web: Failed to load captured image")
              resolve({ canceled: true })
            }

            img.src = uri
          } catch (error) {
            console.error("ImagePickerService.web: Error processing captured file:", error)
            resolve({ canceled: true })
          }
        }

        input.oncancel = () => {
          resolve({ canceled: true })
        }

        input.click()
      })
    } catch (error) {
      console.error("ImagePickerService.web: Error launching camera:", error)
      return { canceled: true }
    }
  }

  static async pickImage(options: ImagePickerOptions = {}): Promise<ImagePickerResult> {
    return this.launchImageLibraryAsync(options)
  }

  static async takePhoto(options: ImagePickerOptions = {}): Promise<ImagePickerResult> {
    return this.launchCameraAsync(options)
  }

  static async showImagePicker(options: ImagePickerOptions = {}): Promise<ImagePickerResult> {
    // For web, we'll default to image library
    // In a real implementation, you might show a modal to choose between camera and library
    return this.launchImageLibraryAsync(options)
  }
}
