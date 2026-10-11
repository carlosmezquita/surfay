import { describe, expect, it, vi } from 'vitest'
import type { SpotForecast } from '../domain/forecast'
import { SpotForecastCache } from './spotForecastCache'

const forecast = (id: string): SpotForecast => ({ spotSlug: 'pantin', snapshotId: id,
  generatedAt: '2026-10-10T10:00:00Z', source: 'open-meteo', model: 'test', hours: [] })
const summary = { catalogueVersion: 1, scoringModelVersion: 8, generatedAt: '2026-10-10T10:00:00Z' }

describe('spot detail cache', () => {
  it('shares concurrent requests, expires entries and invalidates a new forecast or catalogue', async () => {
    let now = 0
    const fetch = vi.fn(async () => forecast(String(now)))
    const cache = new SpotForecastCache(fetch, () => now)
    cache.acceptSummary(summary)
    await Promise.all([cache.get('pantin'), cache.get('pantin')])
    expect(fetch).toHaveBeenCalledTimes(1)
    await cache.get('pantin')
    expect(fetch).toHaveBeenCalledTimes(1)
    now = 30 * 60 * 1000
    await cache.get('pantin')
    expect(fetch).toHaveBeenCalledTimes(2)
    cache.acceptSummary({ ...summary, generatedAt: '2026-10-10T10:30:00Z' })
    expect(cache.getSnapshot().size).toBe(0)
    await cache.get('pantin')
    cache.acceptSummary({ ...summary, catalogueVersion: 2 })
    expect(cache.getSnapshot().size).toBe(0)
  })

  it('does not let an old in-flight response repopulate a new generation', async () => {
    let resolve!: (value: SpotForecast) => void
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<SpotForecast>((done) => { resolve = done }))
      .mockResolvedValue(forecast('new'))
    const cache = new SpotForecastCache(fetch)
    cache.acceptSummary(summary)
    const old = cache.get('pantin')
    cache.acceptSummary({ ...summary, catalogueVersion: 2 })
    resolve(forecast('old'))
    expect((await old).snapshotId).toBe('new')
    expect(cache.getSnapshot().get('pantin')?.snapshotId).toBe('new')
  })

  it('allows retries after a rejected request', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(forecast('retry'))
    const cache = new SpotForecastCache(fetch)
    await expect(cache.get('pantin')).rejects.toThrow('offline')
    expect((await cache.get('pantin')).snapshotId).toBe('retry')
  })
})
