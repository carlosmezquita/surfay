import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SCORING_MODEL_VERSION } from '../src/domain/forecast'
import { buildDemoForecast } from '../src/services/demoForecast'
import { createAuth } from './auth'
import { loadPublishedCatalogue } from './catalogue'
import type { Env } from './env'
import { getSpotForecast, prepareForecastSnapshots } from './forecast'
import worker from './index'
import { createReport } from './reports'
import { testDatabase } from '../test/d1'

let env: Env
let dispose: () => Promise<void>
let cookie: string
let input: { snapshotId: string; spotSlug: string; forecastTime: string; observedScore: number; observedHeight: string; windMatched: null; note: string }
beforeEach(async () => {
  ({ env, dispose } = await testDatabase())
  const headers = new Headers({ Origin: env.BETTER_AUTH_URL })
  const auth = createAuth(env)
  const signup = await auth.api.signUpEmail({ body: { name: 'Reporter', email: 'reporter@example.com', password: 'test-password-123' }, headers })
  await env.DB.prepare("UPDATE user SET role = 'reporter' WHERE id = ?").bind(signup.user.id).run()
  const login = await auth.api.signInEmail({ body: { email: 'reporter@example.com', password: 'test-password-123' }, headers, returnHeaders: true })
  cookie = login.headers.get('set-cookie')!.split(';')[0]
  const { version, spots } = await loadPublishedCatalogue(env)
  const dataset = buildDemoForecast(spots)
  dataset.model = `Open-Meteo partitions · Surfay coastal energy v${SCORING_MODEL_VERSION}`
  dataset.source = 'open-meteo'
  await env.DB.batch(await prepareForecastSnapshots(env, dataset, version))
  const forecast = (await getSpotForecast(env, 'pantin'))!
  input = { snapshotId: forecast.snapshotId!, spotSlug: 'pantin', forecastTime: forecast.hours[0].time,
    observedScore: 3, observedHeight: 'matched', windMatched: null, note: 'Integration fixture' }
})
afterEach(async () => { await dispose?.() })
function request(body: unknown, authenticated = true, origin = env.BETTER_AUTH_URL) {
  return new Request(`${env.BETTER_AUTH_URL}/api/reports`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...(authenticated ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body) })
}

describe('D1 reports with real Better Auth sessions', () => {
  it('requires authentication and a trusted origin', async () => {
    expect((await createReport(request(input, false), env)).status).toBe(401)
    expect((await createReport(request(input, true, 'https://untrusted.example'), env)).status).toBe(403)
  })
  it('rejects non-object JSON and unknown forecast hours', async () => {
    for (const body of [null, [], 'report', { ...input, forecastTime: '2000-01-01T00:00:00Z' }]) {
      expect((await createReport(request(body), env)).status).toBe(400)
    }
  })
  it('captures the exact forecast hour and keeps it after snapshot pruning', async () => {
    expect((await createReport(request(input), env)).status).toBe(201)
    const row = await env.DB.prepare('SELECT * FROM condition_report LIMIT 1').first()
    expect(row?.forecast_spot_snapshot_id).toBe(input.snapshotId)
    expect(JSON.parse(String(row?.forecast_hour_json)).time).toBe(input.forecastTime)
    await env.DB.prepare('DELETE FROM forecast_spot_snapshot WHERE id = ?').bind(input.snapshotId).run()
    const retained = await env.DB.prepare('SELECT * FROM condition_report LIMIT 1').first()
    expect(retained?.forecast_spot_snapshot_id).toBeNull()
    expect(retained?.forecast_hour_json).toBe(row?.forecast_hour_json)
    expect(retained?.model_version).toContain(`v${SCORING_MODEL_VERSION}`)
  })
  it('accepts at most five concurrent submissions per rolling minute', async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => createReport(request(input), env)))
    expect(responses.filter((response) => response.status === 201)).toHaveLength(5)
    expect(responses.filter((response) => response.status === 429)).toHaveLength(3)
  })
  it('enforces role boundaries through the API router', async () => {
    const ctx = { waitUntil() {} } as unknown as ExecutionContext
    const response = await worker.fetch(new Request(`${env.BETTER_AUTH_URL}/api/admin/spots`, { headers: { Cookie: cookie } }), env, ctx)
    expect(response.status).toBe(403)
  })
})
