/**
 * WMO weather interpretation codes (as returned by Open-Meteo) mapped to a
 * small surfer-friendly vocabulary. `storm` flags anything thunder-related
 * so the UI can raise a leave-the-water badge.
 */
export type WeatherKind =
  | 'clear'
  | 'partly'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'showers'
  | 'snow'
  | 'thunder'

export type WeatherInfo = {
  kind: WeatherKind
  storm: boolean
}

export function weatherInfo(code: number | null): WeatherInfo | null {
  if (code === null) return null
  if (code === 0) return { kind: 'clear', storm: false }
  if (code === 1 || code === 2) return { kind: 'partly', storm: false }
  if (code === 3) return { kind: 'cloudy', storm: false }
  if (code === 45 || code === 48) return { kind: 'fog', storm: false }
  if (code >= 51 && code <= 57) return { kind: 'drizzle', storm: false }
  if ((code >= 61 && code <= 67) || code === 80 || code === 81) return { kind: code >= 80 ? 'showers' : 'rain', storm: false }
  if (code === 82) return { kind: 'showers', storm: false }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: 'snow', storm: false }
  if (code >= 95) return { kind: 'thunder', storm: true }
  return null
}
