import { describe, expect, it } from 'vitest'
import { formatClock, formatDay, nearestHour } from './forecastSelectors'
import { forecastDateKey, forecastMinutesOfDay } from './forecastTime'

describe('Galicia forecast times', () => {
  it('selects absolute instants and formats Madrid wall time regardless of viewer timezone', () => {
    const hours = [{ time: '2026-10-10T10:00:00Z' }, { time: '2026-10-10T11:00:00Z' }]
    expect(nearestHour(hours, new Date('2026-10-10T11:05:00Z'))).toEqual(hours[1])
    expect(formatClock(hours[0].time, 'en-GB')).toBe('12:00')
    expect(forecastMinutesOfDay(hours[0].time)).toBe(720)
    expect(forecastDateKey('2026-10-10T23:00:00Z')).toBe('2026-10-11')
    expect(formatDay('2026-10-11', 'en-GB', true)).toContain('11')
  })

  it('handles the spring clock jump and repeated autumn hour', () => {
    expect(formatClock('2026-03-29T00:00:00Z', 'en-GB')).toBe('01:00')
    expect(formatClock('2026-03-29T01:00:00Z', 'en-GB')).toBe('03:00')
    expect(formatClock('2026-10-25T00:00:00Z', 'en-GB')).toBe('02:00')
    expect(formatClock('2026-10-25T01:00:00Z', 'en-GB')).toBe('02:00')
  })
})
