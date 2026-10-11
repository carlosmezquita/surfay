import { SCORING_MODEL_VERSION, type ForecastDataset, type ForecastHourScore, type ForecastSummary, type SpotForecast, type SpotProfile } from '../src/domain/forecast'
import { fetchOpenMeteoForecast } from '../src/services/openMeteo'
import { catalogueVersion, loadPublishedCatalogue } from './catalogue'
import type { Env } from './env'
import { json } from './http'
import { decodeSpotForecast, encodeSpotForecast } from './forecastPayload'

export const FRESH_FOR_MS = 30 * 60 * 1000
export const STALE_FOR_MS = 8 * 60 * 60 * 1000
const MODEL = `Open-Meteo partitions · Surfay coastal energy v${SCORING_MODEL_VERSION}`

type SpotSnapshotRow = {
  id: string
  spot_slug: string
  source: SpotForecast['source']
  model: string
  payload_json: string
  catalogue_version: number
  created_at: number
}

function scoreFromHour(hour: SpotForecast['hours'][number]): ForecastHourScore {
  return {
    time: hour.time, score: hour.score, quality: hour.quality, confidence: hour.confidence,
    effectiveHeightM: hour.effectiveHeightM, effectiveDirectionDeg: hour.effectiveDirectionDeg,
    effectivePeriodS: hour.effectivePeriodS, windSpeedKmh: hour.windSpeedKmh,
    windDirectionDeg: hour.windDirectionDeg, windImpact: hour.windImpact,
    tideNormalized: hour.tideNormalized, weatherCode: hour.weatherCode,
    precipProbabilityPct: hour.precipProbabilityPct,
  }
}

function buildSummary(spots: SpotProfile[], forecasts: Record<string, SpotForecast>, generatedAt: string,
  source: ForecastSummary['source'], version: number): ForecastSummary {
  return {
    scoringModelVersion: SCORING_MODEL_VERSION, source, generatedAt, model: MODEL,
    catalogueVersion: version, spots,
    forecasts: Object.fromEntries(Object.entries(forecasts).map(([slug, forecast]) => [slug, {
      spotSlug: slug, hours: forecast.hours.map(scoreFromHour),
    }])),
  }
}

async function spotCompatible(row: SpotSnapshotRow | null): Promise<SpotForecast | null> {
  if (!row || row.model !== MODEL) return null
  try {
    const forecast = await decodeSpotForecast(row.payload_json)
    if (forecast.spotSlug !== row.spot_slug || !Array.isArray(forecast.hours) || !forecast.hours.length) return null
    return { ...forecast, snapshotId: row.id, catalogueVersion: row.catalogue_version, source: row.source }
  } catch {
    return null
  }
}

async function latestSpotSnapshot(env: Env, slug: string, version: number) {
  return env.DB.prepare(`SELECT * FROM forecast_spot_snapshot
    WHERE spot_slug = ? AND catalogue_version = ? AND model = ? AND created_at >= ?
    ORDER BY created_at DESC LIMIT 1`).bind(slug, version, MODEL, Date.now() - STALE_FOR_MS).first<SpotSnapshotRow>()
}

async function loadCompleteGroup(env: Env, spots: SpotProfile[], version: number, fresh: boolean) {
  const rows = await env.DB.prepare(`SELECT * FROM forecast_spot_snapshot
    WHERE catalogue_version = ? AND model = ? AND created_at >= ?
    ORDER BY created_at DESC, spot_slug`).bind(version, MODEL, Date.now() - (fresh ? FRESH_FOR_MS : STALE_FOR_MS))
    .all<SpotSnapshotRow>()
  const groups = new Map<number, SpotSnapshotRow[]>()
  for (const row of rows.results) groups.set(row.created_at, [...(groups.get(row.created_at) ?? []), row])
  for (const group of groups.values()) {
    const forecasts: Record<string, SpotForecast> = {}
    for (const row of group) {
      const forecast = await spotCompatible(row)
      if (forecast) forecasts[row.spot_slug] = forecast
    }
    if (spots.length && spots.every((spot) => forecasts[spot.slug])) {
      return { forecasts, generatedAt: forecasts[spots[0].slug].generatedAt }
    }
  }
  return null
}

export async function prepareForecastSnapshots(env: Env, dataset: ForecastDataset, version: number, now = Date.now()) {
  const forecasts = Object.values(dataset.forecasts)
  if (!dataset.spots.length || dataset.spots.some((spot) => !dataset.forecasts[spot.slug])) {
    throw new Error('Cannot store an incomplete forecast catalogue')
  }
  const payloads = await Promise.all(forecasts.map(encodeSpotForecast))
  return forecasts.map((forecast, index) => env.DB.prepare(`INSERT INTO forecast_spot_snapshot
    (id, spot_slug, generated_at, source, model, payload_json, catalogue_version, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), forecast.spotSlug,
    dataset.generatedAt, dataset.source, dataset.model, payloads[index], version, now, now + FRESH_FOR_MS))
}

/** A database lease bounds refresh work across Worker isolates, not just one process. */
export async function refreshForecast(env: Env) {
  const token = crypto.randomUUID()
  const now = Date.now()
  const lease = await env.DB.prepare(`INSERT INTO forecast_refresh_lease (id, token, expires_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at
    WHERE forecast_refresh_lease.expires_at <= ?`).bind(token, now + 60_000, now).run()
  if (!lease.meta.changes) return false
  try {
    const { version, spots } = await loadPublishedCatalogue(env)
    const dataset = await fetchOpenMeteoForecast(spots, version)
    // A publication during the provider call invalidates these candidate inputs.
    if (await catalogueVersion(env) !== version) return false
    await env.DB.batch(await prepareForecastSnapshots(env, dataset, version))
    return true
  } finally {
    await env.DB.prepare('DELETE FROM forecast_refresh_lease WHERE id = 1 AND token = ?').bind(token).run()
  }
}

function backgroundRefresh(env: Env, ctx: ExecutionContext) {
  ctx.waitUntil(refreshForecast(env).catch((error) => {
    console.error('Background forecast refresh failed', error)
  }))
}

export async function getForecastSummary(env: Env, ctx?: ExecutionContext): Promise<ForecastSummary> {
  const { version, spots } = await loadPublishedCatalogue(env)
  const fresh = await loadCompleteGroup(env, spots, version, true)
  if (fresh) return buildSummary(spots, fresh.forecasts, fresh.generatedAt, 'open-meteo', version)
  const stale = await loadCompleteGroup(env, spots, version, false)
  if (stale && ctx) {
    backgroundRefresh(env, ctx)
    return buildSummary(spots, stale.forecasts, stale.generatedAt, 'cache', version)
  }
  try {
    await refreshForecast(env)
  } catch (error) {
    if (!stale) throw error
  }
  const updated = await loadCompleteGroup(env, spots, version, true)
  if (updated) return buildSummary(spots, updated.forecasts, updated.generatedAt, 'open-meteo', version)
  if (stale) return buildSummary(spots, stale.forecasts, stale.generatedAt, 'cache', version)
  throw new Error('Forecast refresh in progress or unavailable')
}

export async function getSpotForecast(env: Env, slug: string, ctx?: ExecutionContext): Promise<SpotForecast | null> {
  const { version, spots } = await loadPublishedCatalogue(env)
  if (!spots.some((spot) => spot.slug === slug)) return null
  const row = await latestSpotSnapshot(env, slug, version)
  const forecast = await spotCompatible(row)
  if (forecast && row) {
    if (row.created_at >= Date.now() - FRESH_FOR_MS) return forecast
    if (ctx) backgroundRefresh(env, ctx)
    return { ...forecast, source: 'cache' }
  }
  await refreshForecast(env)
  const updated = await spotCompatible(await latestSpotSnapshot(env, slug, version))
  if (!updated) throw new Error('Forecast refresh in progress or unavailable')
  return updated
}

const cacheHeaders = (source: SpotForecast['source']) => ({
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=300',
  'X-Surfay-Cache': source === 'open-meteo' ? 'hit' : source === 'cache' ? 'stale' : 'demo',
})

export async function forecastSummaryResponse(env: Env, ctx?: ExecutionContext) {
  try {
    const summary = await getForecastSummary(env, ctx)
    return json(summary, { headers: cacheHeaders(summary.source) })
  } catch (error) {
    console.error('Forecast summary failed', error)
    return json({ error: 'Forecast data is temporarily unavailable' }, { status: 503, headers: { 'Retry-After': '30' } })
  }
}

export async function spotForecastResponse(env: Env, slug: string, ctx?: ExecutionContext) {
  try {
    const forecast = await getSpotForecast(env, slug, ctx)
    if (!forecast) return json({ error: 'Unknown published spot' }, { status: 404 })
    return json(forecast, { headers: cacheHeaders(forecast.source) })
  } catch (error) {
    console.error('Spot forecast failed', error)
    return json({ error: 'Forecast data is temporarily unavailable' }, { status: 503, headers: { 'Retry-After': '30' } })
  }
}

export { decodeForecastDataset } from './forecastPayload'

export async function pruneForecasts(env: Env) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM forecast_spot_snapshot WHERE created_at < ?').bind(Date.now() - 48 * 60 * 60 * 1000),
    env.DB.prepare('DELETE FROM forecast_snapshot WHERE created_at < ?').bind(Date.now() - 48 * 60 * 60 * 1000),
  ])
}
