import { SCORING_MODEL_VERSION, type ForecastDataset, type RawForecastHour, type SpotForecast, type SpotProfile } from '../domain/forecast'
import { scoreForecastHour } from '../domain/scoreEngine'

type OpenMeteoSeries = {
  time: string[]
  [key: string]: Array<number | null> | string[]
}

type OpenMeteoResponse = {
  hourly: OpenMeteoSeries
}

const MARINE_VARIABLES = [
  'wave_height', 'wave_direction', 'wave_period',
  'swell_wave_height', 'swell_wave_direction', 'swell_wave_period',
  'wind_wave_height', 'wind_wave_direction', 'wind_wave_period',
  'secondary_swell_wave_height', 'secondary_swell_wave_direction', 'secondary_swell_wave_period',
  'tertiary_swell_wave_height', 'tertiary_swell_wave_direction', 'tertiary_swell_wave_period',
  'sea_level_height_msl', 'sea_surface_temperature',
]

const WEATHER_VARIABLES = [
  'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
  'weather_code', 'temperature_2m', 'apparent_temperature',
  'precipitation_probability', 'precipitation', 'cloud_cover',
]

const OPEN_METEO_MAX_LOCATIONS = 12

function numeric(series: OpenMeteoSeries, key: string, index: number) {
  const values = series[key]
  if (!Array.isArray(values)) return null
  const value = values[index]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asLocations(response: OpenMeteoResponse | OpenMeteoResponse[]) {
  return Array.isArray(response) ? response : [response]
}

function normalizedTides(series: OpenMeteoSeries) {
  const raw = series.sea_level_height_msl
  const values = Array.isArray(raw)
    ? raw.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    : []
  const minimum = values.length ? Math.min(...values) : 0
  const maximum = values.length ? Math.max(...values) : 0
  const range = maximum - minimum
  return { minimum, range }
}

function normalizeLocation(
  spot: SpotProfile,
  marine: OpenMeteoResponse,
  weather: OpenMeteoResponse,
  generatedAt: string,
): SpotForecast {
  const weatherIndex = new Map(weather.hourly.time.map((time, index) => [time, index]))
  const tide = normalizedTides(marine.hourly)

  const hours = marine.hourly.time.map((time, marineIndex) => {
    const weatherHourIndex = weatherIndex.get(time) ?? marineIndex
    const tideHeight = numeric(marine.hourly, 'sea_level_height_msl', marineIndex)
    const raw: RawForecastHour = {
      time: `${time}Z`,
      waveHeightM: numeric(marine.hourly, 'wave_height', marineIndex),
      waveDirectionDeg: numeric(marine.hourly, 'wave_direction', marineIndex),
      wavePeriodS: numeric(marine.hourly, 'wave_period', marineIndex),
      swellHeightM: numeric(marine.hourly, 'swell_wave_height', marineIndex),
      swellDirectionDeg: numeric(marine.hourly, 'swell_wave_direction', marineIndex),
      swellPeriodS: numeric(marine.hourly, 'swell_wave_period', marineIndex),
      windWaveHeightM: numeric(marine.hourly, 'wind_wave_height', marineIndex),
      windWaveDirectionDeg: numeric(marine.hourly, 'wind_wave_direction', marineIndex),
      windWavePeriodS: numeric(marine.hourly, 'wind_wave_period', marineIndex),
      secondarySwellHeightM: numeric(marine.hourly, 'secondary_swell_wave_height', marineIndex),
      secondarySwellDirectionDeg: numeric(marine.hourly, 'secondary_swell_wave_direction', marineIndex),
      secondarySwellPeriodS: numeric(marine.hourly, 'secondary_swell_wave_period', marineIndex),
      tertiarySwellHeightM: numeric(marine.hourly, 'tertiary_swell_wave_height', marineIndex),
      tertiarySwellDirectionDeg: numeric(marine.hourly, 'tertiary_swell_wave_direction', marineIndex),
      tertiarySwellPeriodS: numeric(marine.hourly, 'tertiary_swell_wave_period', marineIndex),
      windSpeedKmh: numeric(weather.hourly, 'wind_speed_10m', weatherHourIndex),
      windDirectionDeg: numeric(weather.hourly, 'wind_direction_10m', weatherHourIndex),
      windGustKmh: numeric(weather.hourly, 'wind_gusts_10m', weatherHourIndex),
      tideHeightMslM: tideHeight,
      tideNormalized: tideHeight === null || tide.range < 0.01 ? null : (tideHeight - tide.minimum) / tide.range,
      seaTemperatureC: numeric(marine.hourly, 'sea_surface_temperature', marineIndex),
      airTemperatureC: numeric(weather.hourly, 'temperature_2m', weatherHourIndex),
      feelsLikeC: numeric(weather.hourly, 'apparent_temperature', weatherHourIndex),
      precipProbabilityPct: numeric(weather.hourly, 'precipitation_probability', weatherHourIndex),
      precipitationMm: numeric(weather.hourly, 'precipitation', weatherHourIndex),
      cloudCoverPct: numeric(weather.hourly, 'cloud_cover', weatherHourIndex),
      weatherCode: numeric(weather.hourly, 'weather_code', weatherHourIndex),
    }
    return scoreForecastHour(spot, raw, 'open-meteo', generatedAt)
  })

  return {
    spotSlug: spot.slug,
    source: 'open-meteo',
    generatedAt,
    model: `Open-Meteo partitions · Surfay coastal energy v${SCORING_MODEL_VERSION}`,
    hours,
  }
}

function chunkSpots<T>(spots: T[], size: number): [T[], number][] {
  const chunks: [T[], number][] = []
  for (let offset = 0; offset < spots.length; offset += size) {
    chunks.push([spots.slice(offset, offset + size), offset])
  }
  return chunks
}

async function fetchLocationBatch(
  spots: SpotProfile[],
  offset: number,
  generatedAt: string,
): Promise<[number, SpotForecast[]]> {
  const latitude = spots.map((spot) => spot.latitude).join(',')
  const longitude = spots.map((spot) => spot.longitude).join(',')

  const marineUrl = new URL('https://marine-api.open-meteo.com/v1/marine')
  marineUrl.searchParams.set('latitude', latitude)
  marineUrl.searchParams.set('longitude', longitude)
  marineUrl.searchParams.set('hourly', MARINE_VARIABLES.join(','))
  marineUrl.searchParams.set('timezone', 'UTC')
  marineUrl.searchParams.set('forecast_days', '7')
  marineUrl.searchParams.set('cell_selection', 'sea')

  const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast')
  weatherUrl.searchParams.set('latitude', latitude)
  weatherUrl.searchParams.set('longitude', longitude)
  weatherUrl.searchParams.set('hourly', WEATHER_VARIABLES.join(','))
  weatherUrl.searchParams.set('timezone', 'UTC')
  weatherUrl.searchParams.set('forecast_days', '7')
  weatherUrl.searchParams.set('wind_speed_unit', 'kmh')

  const [marineResponse, weatherResponse] = await Promise.all([
    fetch(marineUrl, { signal: AbortSignal.timeout(20_000) }),
    fetch(weatherUrl, { signal: AbortSignal.timeout(20_000) }),
  ])
  if (!marineResponse.ok || !weatherResponse.ok) {
    throw new Error(`Forecast provider returned ${marineResponse.status}/${weatherResponse.status}`)
  }

  const [marinePayload, weatherPayload] = await Promise.all([
    marineResponse.json() as Promise<OpenMeteoResponse | OpenMeteoResponse[]>,
    weatherResponse.json() as Promise<OpenMeteoResponse | OpenMeteoResponse[]>,
  ])
  const marineLocations = asLocations(marinePayload)
  const weatherLocations = asLocations(weatherPayload)
  if (marineLocations.length !== spots.length || weatherLocations.length !== spots.length) {
    throw new Error('Forecast provider returned an incomplete location set')
  }

  const forecasts = spots.map((spot, index) =>
    normalizeLocation(spot, marineLocations[index], weatherLocations[index], generatedAt),
  )
  return [offset, forecasts]
}

export async function fetchOpenMeteoForecast(surfSpots: SpotProfile[], catalogueVersion = 1): Promise<ForecastDataset> {
  if (!surfSpots.length) throw new Error('The published spot catalogue is empty')

  const generatedAt = new Date().toISOString()
  const batches = chunkSpots(surfSpots, OPEN_METEO_MAX_LOCATIONS)

  const results = await Promise.all(
    batches.map(([batch, offset]) => fetchLocationBatch(batch, offset, generatedAt)),
  )

  const spotForecasts = new Map<string, SpotForecast>()
  for (const [, forecasts] of results.sort(([a], [b]) => a - b)) {
    for (const forecast of forecasts) {
      spotForecasts.set(forecast.spotSlug, forecast)
    }
  }

  return {
    scoringModelVersion: SCORING_MODEL_VERSION,
    source: 'open-meteo',
    generatedAt,
    model: `Open-Meteo partitions · Surfay coastal energy v${SCORING_MODEL_VERSION}`,
    catalogueVersion,
    spots: surfSpots,
    forecasts: Object.fromEntries(spotForecasts),
  }
}

