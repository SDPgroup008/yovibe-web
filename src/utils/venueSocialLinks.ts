export type VenueSocialKey = "tiktokUrl" | "facebookUrl" | "instagramUrl" | "xUrl" | "youtubeUrl"

export type VenueSocialLinks = Record<VenueSocialKey, string | null | undefined>
export type VenueSocialErrors = Partial<Record<VenueSocialKey, string>>

const SOCIAL_HOSTS: Record<VenueSocialKey, string[]> = {
  tiktokUrl: ["tiktok.com"],
  facebookUrl: ["facebook.com", "fb.com"],
  instagramUrl: ["instagram.com"],
  xUrl: ["x.com", "twitter.com"],
  youtubeUrl: ["youtube.com", "youtu.be"],
}

const labels: Record<VenueSocialKey, string> = {
  tiktokUrl: "TikTok",
  facebookUrl: "Facebook",
  instagramUrl: "Instagram",
  xUrl: "X",
  youtubeUrl: "YouTube",
}

function matchesHost(hostname: string, allowedHosts: string[]): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "")
  return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}

export function normalizeVenueSocialUrl(value: string | null | undefined, key: VenueSocialKey): string | null {
  const trimmed = value?.trim() || ""
  if (!trimmed) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error(`${labels[key]} link must be a complete URL.`)
  }

  if (parsed.protocol !== "https:") throw new Error(`${labels[key]} link must use https://.`)
  if (!matchesHost(parsed.hostname, SOCIAL_HOSTS[key])) throw new Error(`Enter a valid ${labels[key]} link.`)
  return parsed.toString()
}

export function validateVenueSocialLinks(values: VenueSocialLinks): VenueSocialErrors {
  const errors: VenueSocialErrors = {}
  ;(Object.keys(SOCIAL_HOSTS) as VenueSocialKey[]).forEach((key) => {
    try {
      normalizeVenueSocialUrl(values[key], key)
    } catch (error) {
      errors[key] = error instanceof Error ? error.message : `Enter a valid ${labels[key]} link.`
    }
  })
  return errors
}

export function isValidVenueSocialUrl(value: string | null | undefined, key: VenueSocialKey): boolean {
  if (!value?.trim()) return false
  try {
    normalizeVenueSocialUrl(value, key)
    return true
  } catch {
    return false
  }
}

export const venueSocialKeys: VenueSocialKey[] = ["tiktokUrl", "facebookUrl", "instagramUrl", "xUrl", "youtubeUrl"]
