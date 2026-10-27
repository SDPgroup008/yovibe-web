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
const CAMERA_VIDEO_TYPES = new Set(["video/quicktime"])
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

function extensionFor(contentType: string) {
  return contentType === "video/webm" ? "webm" : contentType === "video/mp4" ? "mp4" : contentType === "video/quicktime" ? "mov" : contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg"
}

function chooseFile(source: VibeMediaSource): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    let settled = false
    const finish = (selected: File | null) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(selected)
    }
    input.type = "file"
    input.accept = source === "camera-photo" ? "image/jpeg,image/png,image/webp" : source === "camera-video" ? "video/mp4,video/webm,video/quicktime" : "image/jpeg,image/png,image/webp,video/mp4,video/webm"
    if (source !== "gallery") input.setAttribute("capture", "environment")
    input.style.display = "none"
    input.onchange = () => finish(input.files?.[0] || null)
    input.addEventListener("cancel", () => finish(null), { once: true })
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

type BrowserFfmpeg = {
  load: (options: { coreURL: string; wasmURL: string }) => Promise<void>
  on: (event: "progress", listener: (event: { progress: number }) => void) => void
  off: (event: "progress", listener: (event: { progress: number }) => void) => void
  writeFile: (name: string, data: Uint8Array) => Promise<void>
  exec: (args: string[]) => Promise<number>
  readFile: (name: string) => Promise<Uint8Array | string>
  deleteFile: (name: string) => Promise<void>
}

type FfmpegWindow = Window & typeof globalThis & {
  FFmpegWASM?: { FFmpeg: new () => BrowserFfmpeg }
}

const FFMPEG_VERSION = "0.12.15"
const FFMPEG_CORE_VERSION = "0.12.10"
const FFMPEG_CDN = "https://unpkg.com"
const FFMPEG_WRAPPER_PATH = "/vibe-ffmpeg/ffmpeg.js"

type TrimDebugContext = Record<string, string | number | boolean | undefined>
type StagedMediaError = Error & { vibeMediaStage?: string; userMessage?: string }

function trimDebugEnabled() {
  const host = window.location.hostname.toLowerCase()
  return host === "localhost" || host === "127.0.0.1" || host.includes("staging") || host.includes("stagging")
}

function trimLog(stage: string, context: TrimDebugContext = {}) {
  // Mobile browser consoles commonly hide info-level output. Warnings remain
  // visible in remote debugging without exposing diagnostics in production.
  if (trimDebugEnabled()) console.warn("[VibeMediaTrim]", { stage, ...context })
}

function trimError(stage: string, error: unknown, context: TrimDebugContext = {}): StagedMediaError {
  const source = error instanceof Error ? error : new Error(String(error || "Unknown media preparation error"))
  const staged = new Error(source.message) as StagedMediaError
  staged.vibeMediaStage = stage
  staged.userMessage = trimDebugEnabled()
    ? `We could not prepare this media (diagnostic step: ${stage}). Try another file or send this step to support.`
    : "We could not prepare this media. Choose another photo or video."
  if (trimDebugEnabled()) console.error("[VibeMediaTrim]", {
    stage,
    errorName: source.name || "Error",
    errorMessage: source.message || "Unknown media preparation error",
    ...context,
  })
  return staged
}

function mediaDebugContext(source: VibeMediaSource, file: Blob, durationSeconds?: number): TrimDebugContext {
  return {
    source,
    mimeType: file.type || "unknown",
    sizeMb: Math.round((file.size / (1024 * 1024)) * 10) / 10,
    ...(durationSeconds === undefined ? {} : { durationSeconds: Math.round(durationSeconds * 10) / 10 }),
  }
}

async function toBlobUrl(asset: string, url: string, contentType: string) {
  trimLog("ffmpeg-asset-download-start", { asset })
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = new Blob([await response.arrayBuffer()], { type: contentType })
    trimLog("ffmpeg-asset-download-complete", { asset, sizeKb: Math.round(blob.size / 1024) })
    return URL.createObjectURL(blob)
  } catch (error) {
    throw trimError(`ffmpeg-asset:${asset}`, error, { asset })
  }
}

function loadScript(url: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = url
    script.async = true
    script.onload = () => { script.remove(); resolve() }
    script.onerror = () => { script.remove(); reject(new Error("The video preparation component could not be loaded.")) }
    document.head.appendChild(script)
  })
}

async function loadFfmpegConstructor() {
  const runtime = window as FfmpegWindow
  if (runtime.FFmpegWASM?.FFmpeg) {
    trimLog("ffmpeg-wrapper-cache-hit")
    return runtime.FFmpegWASM.FFmpeg
  }

  const wrapperUrl = new URL(FFMPEG_WRAPPER_PATH, window.location.origin).toString()
  try {
    trimLog("ffmpeg-wrapper-execute-start")
    await loadScript(wrapperUrl)
    trimLog("ffmpeg-wrapper-execute-complete")
  } catch (error) {
    throw trimError("ffmpeg-wrapper-execute", error)
  }
  if (!runtime.FFmpegWASM?.FFmpeg) throw trimError("ffmpeg-wrapper-export", new Error("The video preparation component is unavailable."))
  return runtime.FFmpegWASM.FFmpeg
}

let ffmpegLoader: Promise<{ trim: (file: File, onProgress?: (progress: number) => void) => Promise<Blob> }> | null = null

async function getTrimmer() {
  if (ffmpegLoader) {
    trimLog("ffmpeg-loader-cache-hit")
    return ffmpegLoader
  }
  const loader = (async () => {
    const [FFmpeg, coreURL, wasmURL] = await Promise.all([
      loadFfmpegConstructor(),
      toBlobUrl("core-js", `${FFMPEG_CDN}/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd/ffmpeg-core.js`, "text/javascript"),
      toBlobUrl("core-wasm", `${FFMPEG_CDN}/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd/ffmpeg-core.wasm`, "application/wasm"),
    ])
    trimLog("ffmpeg-assets-ready")
    const ffmpeg = new FFmpeg()
    let loaded = false

    return {
      async trim(file: File, onProgress?: (progress: number) => void) {
        if (!loaded) {
          trimLog("ffmpeg-worker-initialize-start")
          try {
            await ffmpeg.load({ coreURL, wasmURL })
          } catch (error) {
            throw trimError("ffmpeg-worker-initialize", error)
          }
          trimLog("ffmpeg-worker-initialize-complete")
          loaded = true
        }
        const suffix = extensionFor(file.type)
        const inputName = `source-${Date.now()}.${suffix}`
        const outputName = `vibe-pulse-${Date.now()}.mp4`
        let lastReportedPercent = -1
        const onFfmpegProgress = ({ progress }: { progress: number }) => {
          const normalized = Math.max(0, Math.min(1, progress))
          const percent = Math.floor(normalized * 100 / 25) * 25
          if (percent !== lastReportedPercent) { lastReportedPercent = percent; trimLog("ffmpeg-transcode-progress", { percent }) }
          onProgress?.(normalized)
        }
        ffmpeg.on("progress", onFfmpegProgress)
        try {
          trimLog("ffmpeg-input-write-start", { sizeMb: Math.round((file.size / (1024 * 1024)) * 10) / 10 })
          try { await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer())) }
          catch (error) { throw trimError("ffmpeg-input-write", error) }
          trimLog("ffmpeg-input-write-complete")
          trimLog("ffmpeg-transcode-start")
          let result: number
          try { result = await ffmpeg.exec(["-i", inputName, "-t", "60", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-c:a", "aac", "-movflags", "+faststart", outputName]) }
          catch (error) { throw trimError("ffmpeg-transcode", error) }
          if (result !== 0) throw trimError("ffmpeg-transcode-exit", new Error(`FFmpeg exited with code ${result}`), { exitCode: result })
          trimLog("ffmpeg-transcode-complete")
          let output: Uint8Array | string
          try { output = await ffmpeg.readFile(outputName) }
          catch (error) { throw trimError("ffmpeg-output-read", error) }
          if (typeof output === "string") throw trimError("ffmpeg-output-read", new Error("FFmpeg returned text instead of binary media."))
          const bytes = new Uint8Array(output.length)
          bytes.set(output)
          const prepared = new Blob([bytes.buffer], { type: "video/mp4" })
          trimLog("ffmpeg-output-read-complete", { sizeMb: Math.round((prepared.size / (1024 * 1024)) * 10) / 10 })
          return prepared
        } finally {
          ffmpeg.off("progress", onFfmpegProgress)
          await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)])
        }
      },
    }
  })()
  ffmpegLoader = loader
  void loader.catch(() => { if (ffmpegLoader === loader) ffmpegLoader = null })
  return loader
}

export async function selectVibeMedia(source: VibeMediaSource, onTrimProgress?: (progress: number) => void): Promise<PreparedVibeMedia | null> {
  let stage = "file-selection"
  let selected: File | null = null
  try {
    selected = await chooseFile(source)
    if (!selected) { trimLog("file-selection-cancelled", { source }); return null }
    trimLog("file-selected", mediaDebugContext(source, selected))

    const isCameraQuickTime = source === "camera-video" && CAMERA_VIDEO_TYPES.has(selected.type)
    if (!IMAGE_TYPES.has(selected.type) && !VIDEO_TYPES.has(selected.type) && !isCameraQuickTime) throw new Error("Choose a JPG, PNG, WebP, MP4, or WebM file.")

    const isVideo = VIDEO_TYPES.has(selected.type) || isCameraQuickTime
    if (!isVideo) {
      if (selected.size > MAX_IMAGE_BYTES) throw new Error("Images may not exceed 10 MB.")
      stage = "image-metadata"
      const { width, height } = await getImageMetadata(selected)
      trimLog("image-metadata-complete", { ...mediaDebugContext(source, selected), width, height })
      return { file: selected, fileName: selected.name || `vibe-image.${extensionFor(selected.type)}`, contentType: selected.type, previewUrl: URL.createObjectURL(selected), width, height, wasTrimmed: false }
    }

    if (selected.size > MAX_SOURCE_VIDEO_BYTES) throw new Error("Choose a video no larger than 200 MB so it can be safely prepared in this browser.")
    stage = "source-metadata"
    const sourceMetadata = await getVideoMetadata(selected)
    trimLog("source-metadata-complete", { ...mediaDebugContext(source, selected, sourceMetadata.duration), width: sourceMetadata.width, height: sourceMetadata.height })
    let file: Blob = selected
    let contentType = selected.type
    let durationSeconds = sourceMetadata.duration
    let width = sourceMetadata.width
    let height = sourceMetadata.height
    let wasTrimmed = false
    if (durationSeconds > 60 || isCameraQuickTime) {
      stage = "ffmpeg-loader"
      const trimmer = await getTrimmer()
      stage = "ffmpeg-trim"
      file = await trimmer.trim(selected, onTrimProgress)
      contentType = "video/mp4"
      stage = "prepared-metadata"
      const preparedMetadata = await getVideoMetadata(file)
      durationSeconds = preparedMetadata.duration
      width = preparedMetadata.width
      height = preparedMetadata.height
      wasTrimmed = sourceMetadata.duration > 60
      trimLog("prepared-metadata-complete", { ...mediaDebugContext(source, file, durationSeconds), width, height, wasTrimmed })
    }
    stage = "output-validation"
    if (file.size > MAX_VIDEO_BYTES) throw new Error("The prepared video is larger than 50 MB. Choose a shorter or lower-resolution video.")
    if (durationSeconds > 60.25) throw new Error("The prepared video is longer than 60 seconds.")
    trimLog("media-preparation-complete", { ...mediaDebugContext(source, file, durationSeconds), wasTrimmed })
    return { file, fileName: wasTrimmed ? `vibe-pulse-${Date.now()}.mp4` : selected.name || `vibe-video.${extensionFor(contentType)}`, contentType, previewUrl: URL.createObjectURL(file), durationSeconds: Math.min(durationSeconds, 60), width, height, wasTrimmed }
  } catch (error) {
    const stagedError = error as StagedMediaError
    const failedStage = stagedError.vibeMediaStage || stage
    if (stagedError.vibeMediaStage) {
      trimLog("media-preparation-failed", { stage: failedStage, ...(selected ? mediaDebugContext(source, selected) : { source }) })
      throw stagedError
    }
    throw trimError(failedStage, error, selected ? mediaDebugContext(source, selected) : { source })
  }
}
