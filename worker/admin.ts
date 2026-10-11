import type { ShorelineExposureProfile, SpotProfile } from '../src/domain/forecast'
import { validExposure, validateSpotDraft, type SpotDraft } from '../src/domain/spotAdmin'
import { fetchOpenMeteoForecast } from '../src/services/openMeteo'
import { requirePermission, trustedMutation } from './authorization'
import {
  catalogueVersion,
  loadAdminSpot,
  loadAdminSpots,
  loadPublishedCatalogue,
  rowToAdminSpot,
} from './catalogue'
import type { Env } from './env'
import { commitPublication } from './publication'
import { json, readJsonObject } from './http'

const parseBody = async <T>(request: Request) => readJsonObject(request) as Promise<T>

export async function adminSummary(request: Request, env: Env) {
  const auth = await requirePermission(request, env, 'spot', 'update')
  if (auth.response) return auth.response
  const [users, pending, spots, state, snapshot] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS total FROM user').first<{ total: number }>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM condition_report WHERE moderation_status = 'pending'",
    ).first<{ total: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS total, SUM(status = 'published') AS published,
      SUM(status = 'draft') AS drafts, SUM(status = 'archived') AS archived FROM surf_spot`,
    ).first<Record<string, number>>(),
    catalogueVersion(env),
    env.DB.prepare(
      'SELECT generated_at, catalogue_version FROM forecast_spot_snapshot ORDER BY created_at DESC LIMIT 1',
    ).first<{ generated_at: string; catalogue_version: number }>(),
  ])
  return json({
    users: users?.total ?? 0,
    pendingReports: pending?.total ?? 0,
    spots: spots ?? {},
    catalogueVersion: state,
    latestForecast: snapshot ?? null,
  })
}

export async function adminSpots(request: Request, env: Env) {
  const auth = await requirePermission(
    request,
    env,
    'spot',
    request.method === 'GET' ? 'update' : 'create',
  )
  if (auth.response) return auth.response
  if (request.method === 'GET') return json({ spots: await loadAdminSpots(env) })
  const originError = trustedMutation(request, env)
  if (originError) return originError
  let body: { draft: SpotDraft; exposure?: ShorelineExposureProfile }
  try {
    body = await parseBody(request)
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const validation = validateSpotDraft(body.draft)
  if (!validation.valid)
    return json({ error: 'Invalid spot data', fields: validation.errors }, { status: 400 })
  const now = Date.now()
  const id = crypto.randomUUID()
  const exposure = validExposure(body.exposure, body.draft) ? JSON.stringify(body.exposure) : null
  try {
    await env.DB.prepare(
      `INSERT INTO surf_spot
      (id, slug, status, draft_json, draft_exposure_json, revision, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, 'draft', ?, ?, 1, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        body.draft.slug,
        JSON.stringify(body.draft),
        exposure,
        auth.user!.id,
        auth.user!.id,
        now,
        now,
      )
      .run()
  } catch (error) {
    if (String(error).includes('UNIQUE'))
      return json({ error: 'That spot slug is already in use' }, { status: 409 })
    throw error
  }
  return json({ spot: rowToAdminSpot((await loadAdminSpot(env, id))!) }, { status: 201 })
}

export async function updateAdminSpot(request: Request, env: Env, id: string) {
  const auth = await requirePermission(request, env, 'spot', 'update')
  if (auth.response) return auth.response
  const originError = trustedMutation(request, env)
  if (originError) return originError
  let body: { draft: SpotDraft; exposure?: ShorelineExposureProfile | null; revision: number }
  try {
    body = await parseBody(request)
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const validation = validateSpotDraft(body.draft)
  if (!validation.valid)
    return json({ error: 'Invalid spot data', fields: validation.errors }, { status: 400 })
  const existing = await loadAdminSpot(env, id)
  if (!existing) return json({ error: 'Spot not found' }, { status: 404 })
  if (existing.revision !== body.revision)
    return json({ error: 'This spot was changed in another session' }, { status: 409 })
  if (existing.published_json && existing.slug !== body.draft.slug)
    return json({ error: 'Published spot slugs cannot be changed' }, { status: 409 })
  const exposure = validExposure(body.exposure, body.draft) ? JSON.stringify(body.exposure) : null
  try {
    const result = await env.DB.prepare(
      `UPDATE surf_spot SET slug = ?, draft_json = ?, draft_exposure_json = ?,
      revision = revision + 1, updated_by = ?, updated_at = ? WHERE id = ? AND revision = ?`,
    )
      .bind(
        body.draft.slug,
        JSON.stringify(body.draft),
        exposure,
        auth.user!.id,
        Date.now(),
        id,
        body.revision,
      )
      .run()
    if (!result.meta.changes)
      return json({ error: 'This spot was changed in another session' }, { status: 409 })
  } catch (error) {
    if (String(error).includes('UNIQUE'))
      return json({ error: 'That spot slug is already in use' }, { status: 409 })
    throw error
  }
  return json({ spot: rowToAdminSpot((await loadAdminSpot(env, id))!) })
}

export async function publishAdminSpot(request: Request, env: Env, id: string) {
  const auth = await requirePermission(request, env, 'spot', 'publish')
  if (auth.response) return auth.response
  const originError = trustedMutation(request, env)
  if (originError) return originError
  let body: { revision?: number }
  try {
    body = await parseBody(request)
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const existing = await loadAdminSpot(env, id)
  if (!existing) return json({ error: 'Spot not found' }, { status: 404 })
  if (!Number.isInteger(body.revision) || existing.revision !== body.revision)
    return json({ error: 'This spot was changed in another session' }, { status: 409 })
  const draft = JSON.parse(existing.draft_json) as SpotDraft
  const exposure = existing.draft_exposure_json
    ? (JSON.parse(existing.draft_exposure_json) as ShorelineExposureProfile)
    : null
  const validation = validateSpotDraft(draft)
  const isProvisional = draft.calibrationStatus === 'provisional'
  if (!validation.valid)
    return json({ error: 'Invalid spot data', fields: validation.errors }, { status: 400 })
  if (!isProvisional && !validExposure(exposure, draft))
    return json(
      { error: 'A current COALNE exposure profile is required', fields: validation.errors },
      { status: 400 },
    )
  const { spots: current, version: expectedVersion } = await loadPublishedCatalogue(env)
  const candidate: SpotProfile = {
    ...draft,
    id: existing.id,
    shorelineExposure: exposure ?? undefined,
  }
  const spots = [...current.filter((spot) => spot.id !== id), candidate].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  )
  const nextVersion = expectedVersion + 1
  let dataset
  try {
    dataset = await fetchOpenMeteoForecast(spots, nextVersion)
  } catch (error) {
    console.error('Candidate forecast failed', error)
    return json(
      {
        error:
          'Could not generate a forecast for this catalogue; the public version was not changed',
      },
      { status: 502 },
    )
  }
  const latest = await loadAdminSpot(env, id)
  if (!latest || latest.revision !== existing.revision)
    return json(
      { error: 'This spot was changed while the forecast was being generated' },
      { status: 409 },
    )
  try {
    await commitPublication(
      env,
      {
        spotId: id,
        revision: existing.revision,
        catalogueVersion: expectedVersion,
        actorId: auth.user!.id,
        archive: false,
      },
      dataset,
    )
  } catch (error) {
    if (String(error).includes('SURFAY_PUBLICATION_CONFLICT')) {
      return json(
        { error: 'The spot or catalogue changed; reload before publishing' },
        { status: 409 },
      )
    }
    throw error
  }
  return json({
    spot: rowToAdminSpot((await loadAdminSpot(env, id))!),
    catalogueVersion: nextVersion,
  })
}

export async function archiveAdminSpot(request: Request, env: Env, id: string) {
  const auth = await requirePermission(request, env, 'spot', 'archive')
  if (auth.response) return auth.response
  const originError = trustedMutation(request, env)
  if (originError) return originError
  let body: { revision?: number }
  try {
    body = await parseBody(request)
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const existing = await loadAdminSpot(env, id)
  if (!existing) return json({ error: 'Spot not found' }, { status: 404 })
  if (!Number.isInteger(body.revision) || existing.revision !== body.revision)
    return json({ error: 'This spot was changed in another session' }, { status: 409 })
  const { spots: current, version: expectedVersion } = await loadPublishedCatalogue(env)
  const spots = current.filter((spot) => spot.id !== id)
  if (!spots.length)
    return json({ error: 'At least one published spot is required' }, { status: 409 })
  const nextVersion = expectedVersion + 1
  let dataset
  try {
    dataset = await fetchOpenMeteoForecast(spots, nextVersion)
  } catch {
    return json(
      { error: 'Could not refresh the remaining catalogue; the spot was not archived' },
      { status: 502 },
    )
  }
  const latest = await loadAdminSpot(env, id)
  if (!latest || latest.revision !== existing.revision)
    return json(
      { error: 'This spot was changed while the forecast was being generated' },
      { status: 409 },
    )
  try {
    await commitPublication(
      env,
      {
        spotId: id,
        revision: existing.revision,
        catalogueVersion: expectedVersion,
        actorId: auth.user!.id,
        archive: true,
      },
      dataset,
    )
  } catch (error) {
    if (String(error).includes('SURFAY_PUBLICATION_CONFLICT')) {
      return json(
        { error: 'The spot or catalogue changed; reload before archiving' },
        { status: 409 },
      )
    }
    throw error
  }
  return json({
    spot: rowToAdminSpot((await loadAdminSpot(env, id))!),
    catalogueVersion: nextVersion,
  })
}

export async function adminReports(request: Request, env: Env) {
  const auth = await requirePermission(request, env, 'report', 'list')
  if (auth.response) return auth.response
  const url = new URL(request.url)
  const status = url.searchParams.get('status') ?? 'pending'
  const spot = url.searchParams.get('spot')
  const reporter = url.searchParams.get('reporter')
  const offset = Math.max(0, Number(url.searchParams.get('cursor')) || 0)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 30))
  const where = ["(? = 'all' OR cr.moderation_status = ?)"]
  const values: unknown[] = [status, status]
  if (spot) {
    where.push('cr.spot_slug = ?')
    values.push(spot)
  }
  if (reporter) {
    where.push('(u.email LIKE ? OR u.name LIKE ?)')
    values.push(`%${reporter}%`, `%${reporter}%`)
  }
  const rows = await env.DB.prepare(
    `SELECT cr.*, u.name AS reporter_name, u.email AS reporter_email,
      COALESCE(json_extract(ss.published_json, '$.name'), json_extract(ss.draft_json, '$.name')) AS spot_name
    FROM condition_report cr JOIN user u ON u.id = cr.user_id LEFT JOIN surf_spot ss ON ss.slug = cr.spot_slug WHERE ${where.join(' AND ')}
    ORDER BY cr.submitted_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...values, limit + 1, offset)
    .all<Record<string, unknown>>()
  const hasMore = rows.results.length > limit
  return json({
    reports: rows.results.slice(0, limit).map((row) => ({
      id: row.id,
      spotSlug: row.spot_slug,
      spotName: row.spot_name,
      reporter: { name: row.reporter_name, email: row.reporter_email },
      observedAt: row.observed_at,
      submittedAt: new Date(Number(row.submitted_at)).toISOString(),
      observedScore: row.observed_score,
      observedHeight: row.observed_height,
      windMatched: row.wind_matched === null ? null : row.wind_matched === 1,
      note: row.note,
      moderationStatus: row.moderation_status,
      moderationNote: row.moderation_note,
    })),
    nextCursor: hasMore ? String(offset + limit) : null,
  })
}

export async function moderateReport(request: Request, env: Env, id: string) {
  const auth = await requirePermission(request, env, 'report', 'moderate')
  if (auth.response) return auth.response
  const originError = trustedMutation(request, env)
  if (originError) return originError
  let body: { status?: string; note?: string }
  try {
    body = await parseBody(request)
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (body.status !== 'accepted' && body.status !== 'rejected')
    return json({ error: 'Status must be accepted or rejected' }, { status: 400 })
  if (typeof body.note !== 'undefined' && (typeof body.note !== 'string' || body.note.length > 500))
    return json({ error: 'Moderation note is too long' }, { status: 400 })
  const result = await env.DB.prepare(
    `UPDATE condition_report SET moderation_status = ?, moderation_note = ?,
    moderated_by = ?, moderated_at = ? WHERE id = ?`,
  )
    .bind(body.status, body.note?.trim() ?? '', auth.user!.id, Date.now(), id)
    .run()
  if (!result.meta.changes) return json({ error: 'Report not found' }, { status: 404 })
  return json({ ok: true, status: body.status })
}
