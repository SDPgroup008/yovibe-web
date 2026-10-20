export type EventSharePlatform = 'android' | 'ios' | 'web' | string

type EventShareInput = {
  platform: EventSharePlatform
  title: string
  description: string
  url: string
  isDevelopment?: boolean
}

/**
 * Android's native Share API ignores its separate URL field. Web and iOS do
 * support it, so keep their descriptive copy clean and let the receiving app
 * attach the one canonical URL itself.
 */
export function buildEventSharePayload({
  platform,
  title,
  description,
  url,
  isDevelopment = false,
}: EventShareInput) {
  const message = [
    title,
    description,
    ...(isDevelopment ? ['Rich previews require a public URL.'] : []),
  ].filter(Boolean).join('\n')

  if (platform === 'android') {
    return { title, message: `${message}\n\n${url}` }
  }

  return { title, message, url }
}
