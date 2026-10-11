import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SCORING_MODEL_VERSION } from '../src/domain/forecast'
import { buildDemoForecast } from '../src/services/demoForecast'
import { fetchOpenMeteoForecast } from '../src/services/openMeteo'
import { loadPublishedCatalogue } from './catalogue'
import type { Env } from './env'
import { getForecastSummary, getSpotForecast, prepareForecastSnapshots, refreshForecast } from './forecast'
import { testDatabase } from '../test/d1'

vi.mock('../src/services/openMeteo', () => ({ fetchOpenMeteoForecast: vi.fn() }))
let env: Env
let dispose: () => Promise<void>
beforeEach(async () => { vi.clearAllMocks(); ({ env, dispose } = await testDatabase()) })
afterEach(async () => { await dispose?.() })
async function dataset() {
  const { spots, version } = await loadPublishedCatalogue(env)
  const data = buildDemoForecast(spots)
  data.source = 'open-meteo'
  data.model = `Open-Meteo partitions · Surfay coastal energy v${SCORING_MODEL_VERSION}`
  data.catalogueVersion = version
  return data
}

describe('D1 forecast delivery', () => {
  it('returns unknown or archived spots without invoking the provider', async () => {
    expect(await getSpotForecast(env, 'made-up-slug')).toBeNull()
    await env.DB.prepare("UPDATE surf_spot SET status = 'archived' WHERE slug = 'pantin'").run()
    expect(await getSpotForecast(env, 'pantin')).toBeNull()
    expect(fetchOpenMeteoForecast).not.toHaveBeenCalled()
  })
  it('serves complete fresh groups and returns the snapshot identity for reports', async () => {
    const data = await dataset()
    await env.DB.batch(await prepareForecastSnapshots(env, data, data.catalogueVersion))
    const summary = await getForecastSummary(env)
    expect(Object.keys(summary.forecasts)).toHaveLength(data.spots.length)
    const forecast = await getSpotForecast(env, 'pantin')
    expect(forecast?.snapshotId).toMatch(/^[0-9a-f-]{36}$/)
    expect(forecast?.catalogueVersion).toBe(data.catalogueVersion)
    expect(fetchOpenMeteoForecast).not.toHaveBeenCalled()
  })
  it('does not serve an incomplete catalogue as a successful stale summary', async () => {
    const data = await dataset()
    const inserts = await prepareForecastSnapshots(env, data, data.catalogueVersion, Date.now() - 60 * 60 * 1000)
    await env.DB.batch(inserts.slice(0, 1))
    vi.mocked(fetchOpenMeteoForecast).mockRejectedValue(new Error('offline'))
    await expect(getForecastSummary(env)).rejects.toThrow('offline')
  })
  it('serves stale data even when a synchronous refresh fails', async () => {
    const data = await dataset()
    await env.DB.batch(await prepareForecastSnapshots(env, data, data.catalogueVersion, Date.now() - 60 * 60 * 1000))
    vi.mocked(fetchOpenMeteoForecast).mockRejectedValue(new Error('offline'))
    expect((await getForecastSummary(env)).source).toBe('cache')
  })
  it('takes only one distributed refresh lease under concurrent requests', async () => {
    const data = await dataset()
    let finish!: () => void
    vi.mocked(fetchOpenMeteoForecast).mockImplementation(() => new Promise((resolve) => {
      finish = () => resolve(data)
    }))
    const a = refreshForecast(env)
    // Wait until the first caller holds the lease and is inside the provider call.
    await vi.waitFor(() => { expect(fetchOpenMeteoForecast).toHaveBeenCalledTimes(1) })
    expect(await refreshForecast(env)).toBe(false)
    finish()
    expect(await a).toBe(true)
    expect(fetchOpenMeteoForecast).toHaveBeenCalledTimes(1)
  })
})
