import { surfSpots } from '../data/spots'
import { SCORING_MODEL_VERSION, type ForecastDataset, type RawForecastHour, type SpotProfile } from '../domain/forecast'
import { normalizeDegrees, scoreForecastHour } from '../domain/scoreEngine'

export function buildDemoForecast(spots: SpotProfile[] = surfSpots): ForecastDataset {
  const start = new Date()
  start.setMinutes(0, 0, 0)
  const generatedAt = start.toISOString()
  const forecasts = Object.fromEntries(spots.map((spot, spotIndex) => {
    const hours = Array.from({ length: 168 }, (_, hourIndex) => {
      const date = new Date(start.getTime() + hourIndex * 3_600_000)
      const tideCycle = (Math.sin(hourIndex / 12.42 * Math.PI * 2 + spotIndex * 0.15) + 1) / 2
      const swellPulse = Math.sin(hourIndex / 23 + spotIndex * 0.34)
      const daylightWind = Math.max(0, Math.sin((date.getHours() - 8) / 12 * Math.PI))
      const swellHeight = Math.max(0.35, 1.15 + swellPulse * 0.55 + spotIndex * 0.015)
      const raw: RawForecastHour = {
        time: date.toISOString(),
        waveHeightM: swellHeight + 0.18,
        waveDirectionDeg: normalizeDegrees(315 + Math.sin(hourIndex / 15) * 24),
        wavePeriodS: 10.5 + Math.sin(hourIndex / 19) * 2.2,
        swellHeightM: swellHeight,
        swellDirectionDeg: normalizeDegrees(315 + Math.sin(hourIndex / 15) * 24),
        swellPeriodS: 11.2 + Math.sin(hourIndex / 19) * 2.4,
        windWaveHeightM: 0.34,
        windWaveDirectionDeg: normalizeDegrees(300 + daylightWind * 25),
        windWavePeriodS: 5.8,
        secondarySwellHeightM: 0.28 + Math.max(0, Math.sin(hourIndex / 11)) * 0.22,
        secondarySwellDirectionDeg: 270,
        secondarySwellPeriodS: 7.5,
        tertiarySwellHeightM: null,
        tertiarySwellDirectionDeg: null,
        tertiarySwellPeriodS: null,
        windSpeedKmh: 5 + daylightWind * 14 + Math.max(0, Math.sin(hourIndex / 8)) * 5,
        windDirectionDeg: normalizeDegrees(145 + daylightWind * 155 + spotIndex * 4),
        windGustKmh: 10 + daylightWind * 20,
        tideHeightMslM: -1.4 + tideCycle * 3.1,
        tideNormalized: tideCycle,
        seaTemperatureC: 17.4,
        airTemperatureC: 18 + daylightWind * 5,
        feelsLikeC: 17.5 + daylightWind * 5.5,
        precipProbabilityPct: daylightWind > 0.7 ? 5 : 20,
        precipitationMm: 0,
        cloudCoverPct: daylightWind > 0.7 ? 18 : 46,
        weatherCode: daylightWind > 0.7 ? 1 : 2,
      }
      return scoreForecastHour(spot, raw, 'demo', generatedAt)
    })
    return [spot.slug, {
      spotSlug: spot.slug,
      source: 'demo' as const,
      generatedAt,
      model: 'Deterministic demo fallback',
      hours,
    }]
  }))

  return {
    scoringModelVersion: SCORING_MODEL_VERSION,
    source: 'demo',
    generatedAt,
    model: 'Demo fallback',
    catalogueVersion: 0,
    spots,
    forecasts,
  }
}

