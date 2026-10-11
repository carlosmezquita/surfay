import { describe, expect, it } from 'vitest'
import { SCORING_MODEL_VERSION, type ForecastDataset, type SpotForecast } from '../src/domain/forecast'
import { decodeForecastDataset, decodeSpotForecast, encodeForecastDataset, encodeSpotForecast } from './forecastPayload'

describe('forecast snapshot payload', () => {
  it('round-trips compressed datasets and remains backward compatible with JSON', async () => {
    const dataset: ForecastDataset = {
      scoringModelVersion: SCORING_MODEL_VERSION,
      source: 'demo',
      generatedAt: '2026-07-22T00:00:00.000Z',
      model: 'test',
      catalogueVersion: 1,
      spots: [],
      forecasts: {},
    }
    const encoded = await encodeForecastDataset(dataset)

    expect(encoded).toMatch(/^gzip-base64:/)
    await expect(decodeForecastDataset(encoded)).resolves.toEqual(dataset)
    await expect(decodeForecastDataset(JSON.stringify(dataset))).resolves.toEqual(dataset)
  })

  it('round-trips single spot forecasts with gzip and plain JSON fallback', async () => {
    const forecast: SpotForecast = {
      spotSlug: 'pantin',
      source: 'open-meteo',
      generatedAt: '2026-07-22T00:00:00.000Z',
      model: 'test v5',
      hours: [],
    }
    const encoded = await encodeSpotForecast(forecast)

    expect(encoded).toMatch(/^gzip-base64:/)
    await expect(decodeSpotForecast(encoded)).resolves.toEqual(forecast)
    await expect(decodeSpotForecast(JSON.stringify(forecast))).resolves.toEqual(forecast)
  })
})
