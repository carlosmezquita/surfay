import type { ForecastDataset } from '../src/domain/forecast'
import type { Env } from './env'
import { prepareForecastSnapshots } from './forecast'

/** D1 batch is a transaction. The first statement raises on either stale input. */
export async function commitPublication(
  env: Env,
  input: { spotId: string; revision: number; catalogueVersion: number; actorId: string; archive: boolean },
  dataset: ForecastDataset,
) {
  const now = Date.now()
  const nextVersion = input.catalogueVersion + 1
  const snapshots = await prepareForecastSnapshots(env, dataset, nextVersion, now)
  const update = input.archive
    ? env.DB.prepare(`UPDATE surf_spot SET status = 'archived', revision = revision + 1,
        updated_by = ?, updated_at = ? WHERE id = ?`).bind(input.actorId, now, input.spotId)
    : env.DB.prepare(`UPDATE surf_spot SET status = 'published', published_json = draft_json,
        published_exposure_json = draft_exposure_json, revision = revision + 1,
        updated_by = ?, updated_at = ?, published_at = ? WHERE id = ?`)
      .bind(input.actorId, now, now, input.spotId)
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO catalogue_publication_guard
      (id, spot_id, revision, catalogue_version) VALUES (1, ?, ?, ?)`)
      .bind(input.spotId, input.revision, input.catalogueVersion),
    update,
    env.DB.prepare('UPDATE spot_catalogue_state SET version = ?, updated_at = ? WHERE id = 1')
      .bind(nextVersion, now),
    ...snapshots,
    env.DB.prepare('DELETE FROM catalogue_publication_guard WHERE id = 1'),
  ])
  return nextVersion
}
