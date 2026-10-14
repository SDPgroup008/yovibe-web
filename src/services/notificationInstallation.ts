const INSTALLATION_STORAGE_KEY = "yovibe_notification_installation_v1"

export type NotificationInstallation = {
  id: string
  secret: string
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ""
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function createInstallation(): NotificationInstallation | null {
  if (typeof window === "undefined" || !window.crypto || !window.localStorage) return null
  const bytes = new Uint8Array(32)
  window.crypto.getRandomValues(bytes)
  const uuidBytes = new Uint8Array(bytes.slice(0, 16))
  uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x40
  uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80
  const uuidFallback = Array.from(uuidBytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  const uuid = `${uuidFallback.slice(0, 8)}-${uuidFallback.slice(8, 12)}-${uuidFallback.slice(12, 16)}-${uuidFallback.slice(16, 20)}-${uuidFallback.slice(20)}`
  return {
    id: typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : uuid,
    secret: bytesToBase64Url(bytes),
  }
}

export function getNotificationInstallation(): NotificationInstallation | null {
  if (typeof window === "undefined" || !window.localStorage) return null
  try {
    const raw = window.localStorage.getItem(INSTALLATION_STORAGE_KEY)
    const value = raw ? JSON.parse(raw) : null
    if (
      value
      && typeof value.id === "string"
      && typeof value.secret === "string"
      && value.id.length >= 20
      && value.secret.length >= 32
    ) {
      return { id: value.id, secret: value.secret }
    }
  } catch {
    // The next successful subscription can safely establish a new installation.
  }
  return null
}

export function getOrCreateNotificationInstallation(): NotificationInstallation | null {
  const existing = getNotificationInstallation()
  if (existing) return existing
  const created = createInstallation()
  if (!created || typeof window === "undefined" || !window.localStorage) return created
  try {
    window.localStorage.setItem(INSTALLATION_STORAGE_KEY, JSON.stringify(created))
  } catch {
    return null
  }
  return created
}

export function hasNotificationInstallation(): boolean {
  return getNotificationInstallation() !== null
}
