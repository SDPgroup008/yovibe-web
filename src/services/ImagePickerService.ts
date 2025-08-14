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
  type?: string
  fileSize?: number
  fileName?: string
}

export interface ImagePickerResult {
  canceled: boolean
  assets?: ImagePickerAsset[]
}

export default class ImagePickerService {
  // Launch image library for web
  static async launchImageLibraryAsync(options: ImagePickerOptions): Promise<ImagePickerResult> {
    return new Promise((resolve) => {
      try {
        console.log("ImagePickerService: Launching image picker with options:", options)

        // Create file input element
        const input = document.createElement("input")
        input.type = "file"
        input.accept = this.getAcceptString(options.mediaTypes)
        input.multiple = options.allowsMultipleSelection || false
        input.style.display = "none"

        // Handle file selection
        input.onchange = async (event) => {
          const target = event.target as HTMLInputElement
          const files = target.files

          if (!files || files.length === 0) {
            resolve({ canceled: true })
            return
          }

          try {
            const assets: ImagePickerAsset[] = []

            for (let i = 0; i < files.length; i++) {
              const file = files[i]
              const asset = await this.processFile(file, options)
              if (asset) {
                assets.push(asset)
              }
            }

            if (assets.length === 0) {
              resolve({ canceled: true })
              return
            }

            console.log("ImagePickerService: Successfully processed files:", assets.length)
            resolve({
              canceled: false,
              assets,
            })
          } catch (error) {
            console.error("ImagePickerService: Error processing files:", error)
            resolve({ canceled: true })
          } finally {
            // Clean up
            document.body.removeChild(input)
          }
        }

        // Handle cancellation
        input.oncancel = () => {
          console.log("ImagePickerService: User canceled file selection")
          document.body.removeChild(input)
          resolve({ canceled: true })
        }

        // Add to DOM and trigger click
        document.body.appendChild(input)
        input.click()
      } catch (error) {
        console.error("ImagePickerService: Error launching image picker:", error)
        resolve({ canceled: true })
      }
    })
  }

  // Launch camera (not available in web, fallback to image library)
  static async launchCameraAsync(options: ImagePickerOptions): Promise<ImagePickerResult> {
    console.log("ImagePickerService: Camera not available in web, using image library")
    return this.launchImageLibraryAsync(options)
  }

  // Process selected file
  private static async processFile(file: File, options: ImagePickerOptions): Promise<ImagePickerAsset | null> {
    try {
      console.log("ImagePickerService: Processing file:", file.name, file.type, file.size)

      // Validate file type
      if (options.mediaTypes === "Images" && !file.type.startsWith("image/")) {
        console.warn("ImagePickerService: File is not an image:", file.type)
        return null
      }

      // Create object URL
      const uri = URL.createObjectURL(file)

      // Get image dimensions if it's an image
      let width: number | undefined
      let height: number | undefined

      if (file.type.startsWith("image/")) {
        const dimensions = await this.getImageDimensions(uri)
        width = dimensions.width
        height = dimensions.height
      }

      const asset: ImagePickerAsset = {
        uri,
        width,
        height,
        type: file.type,
        fileSize: file.size,
        fileName: file.name,
      }

      // Apply editing if requested
      if (options.allowsEditing && file.type.startsWith("image/")) {
        const editedAsset = await this.editImage(asset, options)
        return editedAsset || asset
      }

      return asset
    } catch (error) {
      console.error("ImagePickerService: Error processing file:", error)
      return null
    }
  }

  // Get image dimensions
  private static getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight,
        })
      }
      img.onerror = reject
      img.src = uri
    })
  }

  // Simple image editing (resize/crop)
  private static async editImage(
    asset: ImagePickerAsset,
    options: ImagePickerOptions,
  ): Promise<ImagePickerAsset | null> {
    try {
      if (!asset.width || !asset.height) {
        return asset
      }

      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        return asset
      }

      const img = new Image()

      return new Promise((resolve) => {
        img.onload = () => {
          try {
            const { width, height } = asset
            let sourceX = 0
            let sourceY = 0
            let sourceWidth = width!
            let sourceHeight = height!

            // Apply aspect ratio if specified
            if (options.aspect) {
              const [aspectWidth, aspectHeight] = options.aspect
              const aspectRatio = aspectWidth / aspectHeight
              const imageRatio = width! / height!

              if (imageRatio > aspectRatio) {
                // Image is wider, crop width
                sourceWidth = height! * aspectRatio
                sourceX = (width! - sourceWidth) / 2
              } else {
                // Image is taller, crop height
                sourceHeight = width! / aspectRatio
                sourceY = (height! - sourceHeight) / 2
              }
            }

            // Set canvas size (max 800px for performance)
            const maxSize = 800
            const scale = Math.min(maxSize / sourceWidth, maxSize / sourceHeight, 1)
            canvas.width = sourceWidth * scale
            canvas.height = sourceHeight * scale

            // Draw cropped/resized image
            ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height)

            // Convert to blob and create new URI
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  const editedUri = URL.createObjectURL(blob)
                  resolve({
                    ...asset,
                    uri: editedUri,
                    width: canvas.width,
                    height: canvas.height,
                    fileSize: blob.size,
                  })
                } else {
                  resolve(asset)
                }
              },
              "image/jpeg",
              options.quality || 0.8,
            )
          } catch (error) {
            console.error("ImagePickerService: Error editing image:", error)
            resolve(asset)
          }
        }

        img.onerror = () => resolve(asset)
        img.src = asset.uri
      })
    } catch (error) {
      console.error("ImagePickerService: Error in editImage:", error)
      return asset
    }
  }

  // Get accept string for file input
  private static getAcceptString(mediaTypes: "Images" | "Videos" | "All"): string {
    switch (mediaTypes) {
      case "Images":
        return "image/*"
      case "Videos":
        return "video/*"
      case "All":
        return "image/*,video/*"
      default:
        return "image/*"
    }
  }

  // Request permissions (not needed for web)
  static async requestMediaLibraryPermissionsAsync(): Promise<{ status: string }> {
    return { status: "granted" }
  }

  static async requestCameraPermissionsAsync(): Promise<{ status: string }> {
    return { status: "granted" }
  }

  // Get permissions (not needed for web)
  static async getMediaLibraryPermissionsAsync(): Promise<{ status: string }> {
    return { status: "granted" }
  }

  static async getCameraPermissionsAsync(): Promise<{ status: string }> {
    return { status: "granted" }
  }
}
