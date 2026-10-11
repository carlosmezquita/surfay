import { describe, expect, it } from 'vitest'
import { sunTimes } from './sun'
import { weatherInfo } from './weatherCode'

describe('weatherInfo', () => {
  it('maps WMO codes to surf-friendly kinds and storm flags', () => {
    expect(weatherInfo(null)).toBeNull()
    expect(weatherInfo(0)).toEqual({ kind: 'clear', storm: false })
    expect(weatherInfo(2)).toEqual({ kind: 'partly', storm: false })
    expect(weatherInfo(3)?.kind).toBe('cloudy')
    expect(weatherInfo(45)?.kind).toBe('fog')
    expect(weatherInfo(53)?.kind).toBe('drizzle')
    expect(weatherInfo(63)?.kind).toBe('rain')
    expect(weatherInfo(81)?.kind).toBe('showers')
    expect(weatherInfo(73)?.kind).toBe('snow')
    expect(weatherInfo(95)).toEqual({ kind: 'thunder', storm: true })
    expect(weatherInfo(99)?.storm).toBe(true)
  })
})

describe('sunTimes', () => {
  it('computes A Coruña July daylight inside the expected almanac window', () => {
    // Mid-July at 43.37N 8.40W: sunrise ~05:10 UTC, sunset ~19:58 UTC.
    // A window catches sign/AM-PM/quadrant bugs without chasing sub-minute precision.
    const times = sunTimes(new Date(Date.UTC(2026, 6, 21, 12)), 43.37, -8.4)
    expect(times).not.toBeNull()
    const sunriseUtc = times!.sunrise.getUTCHours() * 60 + times!.sunrise.getUTCMinutes()
    const sunsetUtc = times!.sunset.getUTCHours() * 60 + times!.sunset.getUTCMinutes()
    expect(sunriseUtc).toBeGreaterThan(4 * 60 + 55)
    expect(sunriseUtc).toBeLessThan(5 * 60 + 30)
    expect(sunsetUtc).toBeGreaterThan(19 * 60 + 40)
    expect(sunsetUtc).toBeLessThan(20 * 60 + 15)
  })

  it('keeps sunrise before sunset', () => {
    const times = sunTimes(new Date(Date.UTC(2026, 0, 15, 12)), 43.37, -8.4)
    expect(times!.sunrise.getTime()).toBeLessThan(times!.sunset.getTime())
  })
})
