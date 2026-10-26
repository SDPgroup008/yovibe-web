export type VibeMediaSource = "camera-photo" | "camera-video" | "gallery"

export type PreparedVibeMedia = {
  file: Blob
  fileName: string
  contentType: string
  previewUrl: string
  durationSeconds?: number
  width: number
  height: number
  wasTrimmed: boolean
}

export async function selectVibeMedia(_source: VibeMediaSource, _onTrimProgress?: (progress: number) => void): Promise<PreparedVibeMedia | null> {
  throw new Error("Vibe Update media publishing is available in the web app.")
}
