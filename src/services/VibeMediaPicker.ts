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

export type VibeVideoTrimCandidate = {
  file: File
  source: VibeMediaSource
  fileName: string
  previewUrl: string
  durationSeconds: number
  width: number
  height: number
  requiresConversion: boolean
}

export type VibeMediaSelection =
  | { kind: "prepared"; media: PreparedVibeMedia }
  | { kind: "trim"; candidate: VibeVideoTrimCandidate }

function unavailable(source: VibeMediaSource): never {
  const host = typeof window === "undefined" ? "" : window.location.hostname.toLowerCase()
  const diagnosticsEnabled = host === "localhost" || host === "127.0.0.1" || host.includes("staging") || host.includes("stagging")
  const error = new Error("Vibe Update media publishing is available in the web app.") as Error & { vibeMediaStage?: string; userMessage?: string }
  if (diagnosticsEnabled) {
    error.vibeMediaStage = "non-web-picker-resolved"
    error.userMessage = "The web media picker was not loaded (diagnostic step: non-web-picker-resolved). Send this step to support."
    console.error("[VibeMediaPicker]", { stage: error.vibeMediaStage, source })
  }
  throw error
}

export async function selectVibeMedia(source: VibeMediaSource, _onTrimProgress?: (progress: number) => void): Promise<VibeMediaSelection | null> {
  return unavailable(source)
}

export async function prepareVibeVideoClip(candidate: VibeVideoTrimCandidate, _startSeconds: number, _durationSeconds: number, _onTrimProgress?: (progress: number) => void): Promise<PreparedVibeMedia> {
  return unavailable(candidate.source)
}
