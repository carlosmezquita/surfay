import { SCORING_MODEL_VERSION, type SpotForecast } from '../src/domain/forecast'
import { requirePermission, sessionUser, trustedMutation } from './authorization'
import { loadPublishedCatalogue } from './catalogue'
import type { Env } from './env'
import { decodeSpotForecast } from './forecastPayload'
import { json, readJsonObject } from './http'

type ReportInput = {
  spotSlug: string
  snapshotId: string
  forecastTime: string
  observedScore: number
  observedHeight: 'smaller' | 'matched' | 'larger'
  windMatched: boolean | null
  note?: string
}

type MembershipRow = {
  plan: 'free' | 'member' | 'contributor' | 'admin'
  status: 'inactive' | 'active' | 'past_due' | 'cancelled'
  current_period_end: number | null
}

function validReport(input: Record<string, unknown>): input is Record<string, unknown> & ReportInput {
  return typeof input.spotSlug === 'string' && input.spotSlug.length <= 64
    && typeof input.snapshotId === 'string' && /^[0-9a-f-]{36}$/i.test(input.snapshotId)
    && typeof input.forecastTime === 'string' && input.forecastTime.length <= 40
    && /(?:Z|[+-]\d{2}:\d{2})$/.test(input.forecastTime) && Number.isFinite(Date.parse(input.forecastTime))
    && typeof input.observedScore === 'number' && Number.isInteger(input.observedScore) && input.observedScore >= 1 && input.observedScore <= 5
    && ['smaller', 'matched', 'larger'].includes(String(input.observedHeight))
    && (input.windMatched === null || typeof input.windMatched === 'boolean')
    && (input.note === undefined || typeof input.note === 'string' && input.note.length <= 500)
}

export async function createReport(request: Request, env: Env) {
  const auth = await requirePermission(request, env, 'report', 'create')
  if (auth.response) return auth.response
  const originError = trustedMutation(request, env)
  if (originError) return originError
  const user = auth.user!
  let input: Record<string, unknown>
  try { input = await readJsonObject(request) } catch { return json({ error: 'Invalid JSON object' }, { status: 400 }) }
  if (!validReport(input)) return json({ error: 'Invalid report data; refresh the forecast before reporting' }, { status: 400 })
  const { version, spots } = await loadPublishedCatalogue(env)
  if (!spots.some((spot) => spot.slug === input.spotSlug)) return json({ error: 'Unknown published spot' }, { status: 400 })
  const snapshot = await env.DB.prepare(`SELECT id, model, payload_json, generated_at, catalogue_version
    FROM forecast_spot_snapshot WHERE id = ? AND spot_slug = ? AND catalogue_version = ? AND created_at >= ?`)
    .bind(input.snapshotId, input.spotSlug, version, Date.now() - 8 * 60 * 60 * 1000)
    .first<{ id: string; model: string; payload_json: string; generated_at: string; catalogue_version: number }>()
  if (!snapshot || snapshot.model !== `Open-Meteo partitions · Surfay coastal energy v${SCORING_MODEL_VERSION}`) {
    return json({ error: 'That forecast is no longer available; refresh before reporting' }, { status: 409 })
  }
  let forecast: SpotForecast
  try { forecast = await decodeSpotForecast(snapshot.payload_json) } catch { return json({ error: 'Forecast snapshot unavailable' }, { status: 409 }) }
  const hour = forecast.hours.find((candidate) => Date.parse(candidate.time) === Date.parse(input.forecastTime))
  if (!hour) return json({ error: 'The selected hour is not in that forecast' }, { status: 400 })
  const submittedAt = Date.now()
  const id = crypto.randomUUID()
  const observedAt = new Date(submittedAt).toISOString()
  // A single conditional insert makes the rolling per-user limit race-safe.
  const result = await env.DB.prepare(`INSERT INTO condition_report
    (id, user_id, spot_slug, forecast_time, observed_at, submitted_at, observed_score,
     observed_height, wind_matched, note, model_version, forecast_spot_snapshot_id,
     forecast_hour_json, forecast_generated_at, forecast_catalogue_version)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE (SELECT COUNT(*) FROM condition_report WHERE user_id = ? AND submitted_at >= ?) < 5`)
    .bind(id, user.id, input.spotSlug, hour.time, observedAt, submittedAt, input.observedScore,
      input.observedHeight, input.windMatched === null ? null : input.windMatched ? 1 : 0,
      input.note?.trim() ?? '', snapshot.model, snapshot.id, JSON.stringify(hour), snapshot.generated_at,
      snapshot.catalogue_version, user.id, submittedAt - 60_000).run()
  if (!result.meta.changes) return json({ error: 'Too many reports. Please wait a minute.' }, { status: 429, headers: { 'Retry-After': '60' } })
  return json({ report: { id, spotSlug: input.spotSlug, snapshotId: snapshot.id, forecastTime: hour.time,
    observedAt, submittedAt: observedAt, observedScore: input.observedScore, observedHeight: input.observedHeight,
    windMatched: input.windMatched, moderationStatus: 'pending' } }, { status: 201 })
}

export async function listMyReports(request: Request, env: Env) {
  const user = await sessionUser(request, env)
  if (!user) return json({ error: 'Authentication required' }, { status: 401 })

  const result = await env.DB.prepare(
    `SELECT cr.id, cr.spot_slug, cr.forecast_time, cr.observed_at, cr.submitted_at, cr.observed_score,
            cr.observed_height, cr.wind_matched, cr.moderation_status, cr.forecast_spot_snapshot_id,
            COALESCE(json_extract(ss.published_json, '$.name'), json_extract(ss.draft_json, '$.name')) AS spot_name
       FROM condition_report cr
       LEFT JOIN surf_spot ss ON ss.slug = cr.spot_slug
      WHERE cr.user_id = ?
      ORDER BY submitted_at DESC
      LIMIT 100`,
  ).bind(user.id).all()

  return json({
    reports: result.results.map((row) => ({
      id: row.id,
      snapshotId: row.forecast_spot_snapshot_id,
      spotSlug: row.spot_slug,
      spotName: row.spot_name,
      forecastTime: row.forecast_time,
      observedAt: row.observed_at,
      submittedAt: new Date(Number(row.submitted_at)).toISOString(),
      observedScore: row.observed_score,
      observedHeight: row.observed_height,
      windMatched: row.wind_matched === null ? null : row.wind_matched === 1,
      moderationStatus: row.moderation_status,
    })),
  })
}

export async function entitlements(request: Request, env: Env) {
  const user = await sessionUser(request, env)
  if (!user) {
    return json({ authenticated: false, plan: 'free', role: 'user', showAds: true, canReport: false, canAccessAdmin: false })
  }

  const membership = await env.DB.prepare(
    'SELECT plan, status, current_period_end FROM membership WHERE user_id = ?',
  ).bind(user.id).first<MembershipRow>()
  const active = membership?.status === 'active'
    && (membership.current_period_end === null || membership.current_period_end > Date.now())
  const plan = active ? membership.plan : 'free'

  return json({
    authenticated: true,
    plan,
    role: user.role,
    showAds: plan === 'free',
    canReport: user.role === 'reporter' || user.role === 'admin',
    canAccessAdmin: user.role === 'admin',
  })
}

