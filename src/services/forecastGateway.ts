import type { ForecastSummary, SpotForecast } from '../domain/forecast'

function apiUrl(path: string) {
  const configuredUrl = import.meta.env.VITE_SURFAY_FORECAST_URL as string | undefined
  if (!configuredUrl) return path
  // Support both old (full endpoint URL) and new (base origin) patterns.
  // If the configured URL already ends with the target path, use it as-is.
  if (configuredUrl.endsWith(path)) return configuredUrl
  return `${configuredUrl}${path}`
}

export async function fetchForecastSummary() {
  const response = await fetch(apiUrl('/api/forecast/summary'), {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Surfay forecast gateway returned ${response.status}`)
  return response.json() as Promise<ForecastSummary>
}

export async function fetchSpotForecast(slug: string) {
  const response = await fetch(apiUrl(`/api/forecast/${encodeURIComponent(slug)}`), {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Surfay spot forecast returned ${response.status}`)
  return response.json() as Promise<SpotForecast>
}
