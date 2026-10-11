/** Synthetic provider responses for browser tests and local benchmarks only. */
export function providerFixture(url: URL) {
  if (!['marine-api.open-meteo.com', 'api.open-meteo.com'].includes(url.hostname)) {
    throw new Error(`Unexpected outbound request: ${url.origin}`)
  }
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  const time = Array.from({ length: 168 }, (_, i) =>
    new Date(start.getTime() + i * 3_600_000).toISOString().slice(0, 16))
  const values: Record<string, (i: number) => number | null> = {
    wave_height: i => 1.6 + Math.sin(i / 23) * 0.4,
    wave_direction: () => 315, wave_period: () => 12,
    swell_wave_height: i => 1.4 + Math.sin(i / 23) * 0.4,
    swell_wave_direction: () => 315, swell_wave_period: () => 12,
    wind_wave_height: () => 0.3, wind_wave_direction: () => 300, wind_wave_period: () => 5,
    secondary_swell_wave_height: () => 0.2,
    secondary_swell_wave_direction: () => 270, secondary_swell_wave_period: () => 8,
    tertiary_swell_wave_height: () => null,
    tertiary_swell_wave_direction: () => null, tertiary_swell_wave_period: () => null,
    sea_level_height_msl: i => Math.sin(i / 12.42 * Math.PI * 2) * 1.5,
    sea_surface_temperature: () => 17,
    wind_speed_10m: i => 8 + Math.sin(i / 12) * 3,
    wind_direction_10m: () => 145, wind_gusts_10m: () => 15,
    weather_code: () => 2, temperature_2m: () => 19,
    apparent_temperature: () => 18, precipitation_probability: () => 20,
    precipitation: () => 0, cloud_cover: () => 40,
  }
  const variables = url.searchParams.get('hourly')?.split(',') ?? []
  const hourly = Object.fromEntries(variables.map(key => {
    if (!values[key]) throw new Error(`Missing fixture variable: ${key}`)
    return [key, time.map((_, i) => values[key](i))]
  }))
  const locations = url.searchParams.get('latitude')?.split(',').length ?? 1
  const response = { hourly: { time, ...hourly } }
  return locations === 1 ? response : Array.from({ length: locations }, () => response)
}
