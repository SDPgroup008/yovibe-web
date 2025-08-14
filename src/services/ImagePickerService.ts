export interface ImagePickerAsset {
  uri: string
  width: number
  height: number
  type?: string
  base64?: string
}

export interface ImagePickerResult {
  canceled: boolean
  assets?: ImagePickerAsset[]
}

export interface ImagePickerOptions {
  mediaTypes?: "Images" | "Videos" | "All"
  allowsEditing?: boolean
  aspect?: [number, number]
  quality?: number
}

class ImagePickerService {
  static async launchImageLibraryAsync(options: ImagePickerOptions = {}): Promise<ImagePickerResult> {
    return new Promise((resolve) => {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = "image/*"
      input.style.display = "none"

      input.onchange = (event) => {
        const file = (event.target as HTMLInputElement).files?.[0]
        if (file) {
          const reader = new FileReader()
          reader.onload = (e) => {
            const uri = e.target?.result as string
            resolve({
              canceled: false,
              assets: [
                {
                  uri,
                  width: 0,
                  height: 0,
                  type: file.type,
                  base64: uri.split(",")[1],
                },
              ],
            })
          }
          reader.readAsDataURL(file)
        } else {
          resolve({ canceled: true })
        }
        document.body.removeChild(input)
      }

      input.oncancel = () => {
        resolve({ canceled: true })
        document.body.removeChild(input)
      }

      document.body.appendChild(input)
      input.click()
    })
  }

  static async takePhoto(options: ImagePickerOptions = {}): Promise<ImagePickerResult> {
    // For web, we'll use the same file picker but with camera preference
    return this.launchImageLibraryAsync(options)
  }

  static async pickImage(options: ImagePickerOptions = {}): Promise<ImagePickerResult> {
    return this.launchImageLibraryAsync(options)
  }
}

export default ImagePickerService
