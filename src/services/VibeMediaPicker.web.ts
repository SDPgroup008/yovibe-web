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

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_BYTES = 50 * 1024 * 1024
const MAX_SOURCE_VIDEO_BYTES = 200 * 1024 * 1024
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"])
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

function extensionFor(contentType: string) {
  return contentType === "video/webm" ? "webm" : contentType === "video/mp4" ? "mp4" : contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg"
}

function chooseFile(source: VibeMediaSource): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = source === "camera-photo" ? "image/jpeg,image/png,image/webp" : source === "camera-video" ? "video/mp4,video/webm" : "image/jpeg,image/png,image/webp,video/mp4,video/webm"
    if (source !== "gallery") input.setAttribute("capture", "environment")
    input.style.display = "none"
    input.onchange = () => {
      const selected = input.files?.[0] || null
      input.remove()
      resolve(selected)
    }
    document.body.appendChild(input)
    input.click()
  })
}

type VideoMetadata = { duration: number; width: number; height: number }

export function getVideoMetadata(file: Blob): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video")
    const url = URL.createObjectURL(file)
    video.preload = "metadata"
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) reject(new Error("We could not read this video’s metadata."))
      else resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight })
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("We could not read this video."))
    }
    video.src = url
  })
}

function getImageMetadata(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(url)
      if (!image.naturalWidth || !image.naturalHeight) reject(new Error("We could not read this image’s dimensions."))
      else resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("We could not read this image.")) }
    image.src = url
  })
}

let ffmpegLoader: Promise<{ trim: (file: File, onProgress?: (progress: number) => void) => Promise<Blob> }> | null = null

async function getTrimmer() {
  if (ffmpegLoader) return ffmpegLoader
  ffmpegLoader = (async () => {
    const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
      import("@ffmpeg/ffmpeg"),
      import("@ffmpeg/util"),
    ])
    const ffmpeg = new FFmpeg()
    const coreBase = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd"
    let loaded = false

    return {
      async trim(file: File, onProgress?: (progress: number) => void) {
        if (!loaded) {
          await ffmpeg.load({
            coreURL: await toBlobURL(`${coreBase}/ffmpeg-core.js`, "text/javascript"),
            wasmURL: await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, "application/wasm"),
          })
          loaded = true
        }
        const suffix = extensionFor(file.type)
        const inputName = `source-${Date.now()}.${suffix}`
        const outputName = `vibe-pulse-${Date.now()}.mp4`
        const onFfmpegProgress = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, progress)))
        ffmpeg.on("progress", onFfmpegProgress)
        try {
          await ffmpeg.writeFile(inputName, await fetchFile(file))
          const result = await ffmpeg.exec(["-i", inputName, "-t", "60", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-c:a", "aac", "-movflags", "+faststart", outputName])
          if (result !== 0) throw new Error("Video trimming could not be completed.")
          const output = await ffmpeg.readFile(outputName)
          if (typeof output === "string") throw new Error("Video trimming returned an invalid file.")
          const bytes = new Uint8Array(output.length)
          bytes.set(output)
          return new Blob([bytes.buffer], { type: "video/mp4" })
        } finally {
          ffmpeg.off("progress", onFfmpegProgress)
          await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)])
        }
      },
    }
  })()
  return ffmpegLoader
}

export async function selectVibeMedia(source: VibeMediaSource, onTrimProgress?: (progress: number) => void): Promise<PreparedVibeMedia | null> {
  const selected = await chooseFile(source)
  if (!selected) return null
  if (!IMAGE_TYPES.has(selected.type) && !VIDEO_TYPES.has(selected.type)) throw new Error("Choose a JPG, PNG, WebP, MP4, or WebM file.")

  const isVideo = VIDEO_TYPES.has(selected.type)
  if (!isVideo) {
    if (selected.size > MAX_IMAGE_BYTES) throw new Error("Images may not exceed 10 MB.")
    const { width, height } = await getImageMetadata(selected)
    return { file: selected, fileName: selected.name || `vibe-image.${extensionFor(selected.type)}`, contentType: selected.type, previewUrl: URL.createObjectURL(selected), width, height, wasTrimmed: false }
  }

  if (selected.size > MAX_SOURCE_VIDEO_BYTES) throw new Error("Choose a video no larger than 200 MB so it can be safely prepared in this browser.")
  const sourceMetadata = await getVideoMetadata(selected)
  let file: Blob = selected
  let contentType = selected.type
  let durationSeconds = sourceMetadata.duration
  let width = sourceMetadata.width
  let height = sourceMetadata.height
  let wasTrimmed = false
  if (durationSeconds > 60) {
    const trimmer = await getTrimmer()
    file = await trimmer.trim(selected, onTrimProgress)
    contentType = "video/mp4"
    const preparedMetadata = await getVideoMetadata(file)
    durationSeconds = preparedMetadata.duration
    width = preparedMetadata.width
    height = preparedMetadata.height
    wasTrimmed = true
  }
  if (file.size > MAX_VIDEO_BYTES) throw new Error("The prepared video is larger than 50 MB. Choose a shorter or lower-resolution video.")
  if (durationSeconds > 60.25) throw new Error("The prepared video is longer than 60 seconds.")
  return { file, fileName: wasTrimmed ? `vibe-pulse-${Date.now()}.mp4` : selected.name || `vibe-video.${extensionFor(contentType)}`, contentType, previewUrl: URL.createObjectURL(file), durationSeconds: Math.min(durationSeconds, 60), width, height, wasTrimmed }
}
