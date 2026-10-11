import type { ShorelineExposureProfile, SpotProfile } from '../src/domain/forecast'
import type { AdminSpotRecord, SpotDraft, SpotStatus } from '../src/domain/spotAdmin'
import type { Env } from './env'

export type SpotRow = {
  id: string; slug: string; status: SpotStatus; draft_json: string; published_json: string | null
  draft_exposure_json: string | null; published_exposure_json: string | null; revision: number
  created_at: number; updated_at: number; published_at: number | null
}
const parse = <T>(value: string | null): T | null => value ? JSON.parse(value) as T : null

export function rowToAdminSpot(row: SpotRow): AdminSpotRecord {
  const draft = parse<SpotDraft>(row.draft_json)!
  return {
    id: row.id, slug: row.slug, status: row.status, draft,
    published: parse<SpotDraft>(row.published_json), exposure: parse<ShorelineExposureProfile>(row.draft_exposure_json),
    revision: row.revision,
    hasUnpublishedChanges: row.published_json !== row.draft_json || row.published_exposure_json !== row.draft_exposure_json,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
    publishedAt: row.published_at === null ? null : new Date(row.published_at).toISOString(),
  }
}

export async function catalogueVersion(env: Env) {
  return (await env.DB.prepare('SELECT version FROM spot_catalogue_state WHERE id = 1').first<{ version: number }>())?.version ?? 1
}

/** One SQL statement captures spots and their version from the same database state. */
export async function loadPublishedCatalogue(env: Env): Promise<{ version: number; spots: SpotProfile[] }> {
  const rows = await env.DB.prepare(`SELECT sc.version, ss.id, ss.slug, ss.published_json, ss.published_exposure_json
    FROM spot_catalogue_state sc LEFT JOIN surf_spot ss
      ON ss.status = 'published' AND ss.published_json IS NOT NULL
    WHERE sc.id = 1 ORDER BY ss.slug`).all<{
      version: number; id: string | null; slug: string | null; published_json: string | null; published_exposure_json: string | null
    }>()
  const spots = rows.results.flatMap((row) => row.id && row.slug && row.published_json ? [{
    ...JSON.parse(row.published_json) as SpotDraft, id: row.id, slug: row.slug,
    shorelineExposure: parse<ShorelineExposureProfile>(row.published_exposure_json) ?? undefined,
  }] : [])
  return { version: rows.results[0]?.version ?? 1, spots }
}

export async function loadPublishedSpots(env: Env) {
  return (await loadPublishedCatalogue(env)).spots
}

export async function loadAdminSpot(env: Env, id: string) {
  return env.DB.prepare('SELECT * FROM surf_spot WHERE id = ?').bind(id).first<SpotRow>()
}

export async function loadAdminSpots(env: Env) {
  const rows = await env.DB.prepare('SELECT * FROM surf_spot ORDER BY updated_at DESC').all<SpotRow>()
  return rows.results.map(rowToAdminSpot)
}

