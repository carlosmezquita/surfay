import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SCORING_MODEL_VERSION } from '../src/domain/forecast'
import { buildDemoForecast } from '../src/services/demoForecast'
import { loadAdminSpot, loadPublishedCatalogue } from './catalogue'
import type { Env } from './env'
import { commitPublication } from './publication'
import { testDatabase } from '../test/d1'

let env: Env
let dispose: () => Promise<void>
beforeEach(async () => { ({ env, dispose } = await testDatabase()) })
afterEach(async () => { await dispose?.() })

async function candidate() {
  const { version, spots } = await loadPublishedCatalogue(env)
  const spot = spots[0]
  const row = (await loadAdminSpot(env, spot.id))!
  const dataset = buildDemoForecast(spots)
  dataset.model = `Open-Meteo partitions · Surfay coastal energy v${SCORING_MODEL_VERSION}`
  dataset.source = 'open-meteo'
  return { input: { spotId: row.id, revision: row.revision, catalogueVersion: version, actorId: 'test-admin', archive: false }, dataset }
}

describe('D1 publication transactions', () => {
  it('publishes all per-spot snapshots in the same transaction as the catalogue', async () => {
    const { input, dataset } = await candidate()
    expect(await commitPublication(env, input, dataset)).toBe(input.catalogueVersion + 1)
    const catalogue = await loadPublishedCatalogue(env)
    expect(catalogue.version).toBe(input.catalogueVersion + 1)
    expect((await loadAdminSpot(env, input.spotId))?.revision).toBe(input.revision + 1)
    const rows = await env.DB.prepare('SELECT spot_slug, catalogue_version FROM forecast_spot_snapshot').all()
    expect(rows.results).toHaveLength(catalogue.spots.length)
    expect(rows.results.every((row) => row.catalogue_version === catalogue.version)).toBe(true)
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM catalogue_publication_guard').first<{ n: number }>())?.n).toBe(0)
  })

  it('rejects a concurrent edit without changing version or writing forecasts', async () => {
    const { input, dataset } = await candidate()
    await env.DB.prepare('UPDATE surf_spot SET revision = revision + 1 WHERE id = ?').bind(input.spotId).run()
    await expect(commitPublication(env, input, dataset)).rejects.toThrow('SURFAY_PUBLICATION_CONFLICT')
    expect((await loadPublishedCatalogue(env)).version).toBe(input.catalogueVersion)
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM forecast_spot_snapshot').first<{ n: number }>())?.n).toBe(0)
  })

  it('allows only one of two publications built from the same catalogue', async () => {
    const first = await candidate()
    const second = await candidate()
    second.input.spotId = second.dataset.spots[1].id
    second.input.revision = (await loadAdminSpot(env, second.input.spotId))!.revision
    const results = await Promise.allSettled([
      commitPublication(env, first.input, first.dataset), commitPublication(env, second.input, second.dataset),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect((await loadPublishedCatalogue(env)).version).toBe(first.input.catalogueVersion + 1)
  })

  it('rolls back spot and version changes if a snapshot write fails', async () => {
    const { input, dataset } = await candidate()
    await env.DB.prepare(`CREATE TRIGGER fail_snapshot BEFORE INSERT ON forecast_spot_snapshot
      BEGIN SELECT RAISE(ABORT, 'TEST_SNAPSHOT_FAILURE'); END`).run()
    await expect(commitPublication(env, input, dataset)).rejects.toThrow('TEST_SNAPSHOT_FAILURE')
    expect((await loadAdminSpot(env, input.spotId))?.revision).toBe(input.revision)
    expect((await loadPublishedCatalogue(env)).version).toBe(input.catalogueVersion)
  })

  it('protects the last administrator even with concurrent direct auth writes', async () => {
    for (const id of ['admin-a', 'admin-b']) {
      await env.DB.prepare(`INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
        VALUES (?, ?, ?, 1, ?, ?, 'admin', 0)`).bind(id, id, `${id}@example.com`, Date.now(), Date.now()).run()
    }
    await env.DB.prepare("UPDATE user SET role = 'user' WHERE id = 'test-admin'").run()
    const results = await Promise.allSettled(['admin-a', 'admin-b'].map((id) =>
      env.DB.prepare("UPDATE user SET role = 'user' WHERE id = ?").bind(id).run()))
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM user WHERE role = 'admin' AND COALESCE(banned, 0) = 0").first<{ n: number }>()
    expect(active?.n).toBe(1)
  })
})
