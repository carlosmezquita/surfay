import { performance } from 'node:perf_hooks'
import { compiledWorker, SMOKE_ORIGIN } from '../test/compiled-worker'
import type { ForecastSummary, SpotForecast } from '../src/domain/forecast'

const samples = Number(process.argv[2] ?? 20)
if (!Number.isInteger(samples) || samples < 5 || samples > 100) throw new Error('Use 5–100 sequential samples')
const runtime = await compiledWorker()
async function measured(path: string) {
  const start = performance.now()
  const response = await runtime.mf.dispatchFetch(`${SMOKE_ORIGIN}${path}`)
  const body = await response.arrayBuffer()
  const ms = performance.now() - start
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return { ms, bytes: body.byteLength, json: JSON.parse(new TextDecoder().decode(body)) }
}
const rounded = (n: number) => Math.round(n * 100) / 100
function distribution(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b)
  return { samples: sorted.length, p50Ms: rounded(sorted[Math.ceil(sorted.length * 0.5) - 1]), p95Ms: rounded(sorted[Math.ceil(sorted.length * 0.95) - 1]) }
}
try {
  const cold = await measured('/api/forecast/summary')
  const summary = cold.json as ForecastSummary
  const providerCalls = runtime.providerCalls()
  if (!providerCalls || !summary.spots.length) throw new Error('Cold request did not generate a forecast catalogue')
  const slug = summary.spots[0].slug
  const summaryTimes: number[] = [], spotTimes: number[] = []
  let spotBytes = 0, hours = 0
  for (let i = 0; i < samples; i++) {
    summaryTimes.push((await measured('/api/forecast/summary')).ms)
    const spot = await measured(`/api/forecast/${slug}`)
    const forecast = spot.json as SpotForecast
    if (!forecast.snapshotId || !forecast.hours.length) throw new Error('Cached spot is missing its snapshot or hours')
    spotTimes.push(spot.ms); spotBytes = spot.bytes; hours = forecast.hours.length
  }
  if (runtime.providerCalls() !== providerCalls) throw new Error('Cached reads unexpectedly called the provider')
  console.log(JSON.stringify({
    measuredAt: new Date().toISOString(),
    scope: 'Local production Worker + ephemeral Miniflare D1; synthetic provider replies; no network/edge latency or process startup',
    runtime: { node: process.version, bun: process.versions.bun ?? null, platform: process.platform, architecture: process.arch },
    scoringModelVersion: summary.scoringModelVersion, spots: summary.spots.length, hoursPerSpot: hours,
    coldRefreshMs: rounded(cold.ms), fixtureProviderCalls: providerCalls,
    cachedSummary: { ...distribution(summaryTimes), responseBytes: cold.bytes },
    cachedSpot: { slug, ...distribution(spotTimes), responseBytes: spotBytes },
  }, null, 2))
} finally { await runtime.dispose() }
