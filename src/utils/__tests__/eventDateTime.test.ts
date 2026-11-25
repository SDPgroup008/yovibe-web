import { eventDateKey, eventTimeZone, formatEventDateRange } from '../eventDateTime'

describe('eventDateTime', () => {
  it('uses the venue country rather than the device timezone for calendar keys', () => {
    expect(eventDateKey(new Date('2026-12-27T00:30:00+01:00'), 'BJ')).toBe('2026-12-27')
    expect(eventDateKey(new Date('2026-12-27T00:30:00+01:00'), 'CI')).toBe('2026-12-26')
    expect(eventDateKey(new Date('2026-12-27T00:30:00+01:00'), 'KE')).toBe('2026-12-27')
  })

  it('renders a multi-day range in the venue timezone', () => {
    expect(formatEventDateRange(
      new Date('2026-12-27T15:00:00+00:00'),
      new Date('2026-12-28T22:00:00+00:00'),
      'CI',
    )).toBe('SUN, DEC 27 – MON, DEC 28')
  })

  it('has a deterministic timezone for every new scraper market', () => {
    expect(eventTimeZone('BJ')).toBe('Africa/Porto-Novo')
    expect(eventTimeZone('CM')).toBe('Africa/Douala')
    expect(eventTimeZone('ZM')).toBe('Africa/Lusaka')
  })
})
