const COUNTRY_TIME_ZONES: Record<string, string> = {
  BF: 'Africa/Ouagadougou',
  BJ: 'Africa/Porto-Novo',
  CD: 'Africa/Kinshasa',
  CG: 'Africa/Brazzaville',
  CI: 'Africa/Abidjan',
  CM: 'Africa/Douala',
  GA: 'Africa/Libreville',
  GN: 'Africa/Conakry',
  KE: 'Africa/Nairobi',
  ML: 'Africa/Bamako',
  RW: 'Africa/Kigali',
  SL: 'Africa/Freetown',
  SN: 'Africa/Dakar',
  TG: 'Africa/Lome',
  UG: 'Africa/Kampala',
  ZM: 'Africa/Lusaka',
}

export const eventTimeZone = (countryCode?: string): string =>
  COUNTRY_TIME_ZONES[String(countryCode || 'UG').toUpperCase()] || 'Africa/Kampala'

const asDate = (value: Date | string): Date => value instanceof Date ? value : new Date(value)

const localParts = (value: Date | string, countryCode?: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: eventTimeZone(countryCode),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(asDate(value))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return { year: values.year, month: values.month, day: values.day }
}

/** Stable calendar key for an event's venue country, independent of device time. */
export const eventDateKey = (value: Date | string, countryCode?: string): string => {
  const { year, month, day } = localParts(value, countryCode)
  return `${year}-${month}-${day}`
}

export const formatEventDate = (
  value: Date | string,
  countryCode?: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' },
): string => new Intl.DateTimeFormat('en-US', { ...options, timeZone: eventTimeZone(countryCode) }).format(asDate(value))

export const formatEventTime = (value: Date | string, countryCode?: string): string =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: eventTimeZone(countryCode),
    hour: 'numeric',
    minute: '2-digit',
  }).format(asDate(value))

export const formatEventDateRange = (start: Date | string, end?: Date | string, countryCode?: string): string => {
  const startLabel = formatEventDate(start, countryCode, { weekday: 'short', month: 'short', day: 'numeric' })
  if (!end || eventDateKey(start, countryCode) === eventDateKey(end, countryCode)) return startLabel.toUpperCase()
  const endLabel = formatEventDate(end, countryCode, { weekday: 'short', month: 'short', day: 'numeric' })
  return `${startLabel} – ${endLabel}`.toUpperCase()
}
