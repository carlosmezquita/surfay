import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { unstable_splitSqlQuery } from 'wrangler'
import { Miniflare } from 'miniflare'
import type { Env } from '../worker/env'

export async function applyTestMigrations(db: D1Database) {
  for (const name of readdirSync(resolve('migrations')).filter((name) => name.endsWith('.sql')).sort()) {
    const statements = unstable_splitSqlQuery(readFileSync(resolve('migrations', name), 'utf8'))
    await db.batch(statements.map((sql) => db.prepare(sql)))
  }
}

/** Actual D1 SQL and batch semantics under the local Workers runtime. */
export async function testDatabase() {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("test") } }',
    compatibilityDate: '2026-07-21',
    d1Databases: ['DB'],
  })
  const db = await mf.getD1Database('DB')
  await applyTestMigrations(db as unknown as D1Database)
  const env: Env = {
    DB: db as unknown as D1Database,
    BETTER_AUTH_SECRET: 'integration-test-secret-at-least-32-characters',
    BETTER_AUTH_URL: 'http://localhost:5173',
    TRUSTED_ORIGINS: 'http://localhost:5173',
  }
  await env.DB.prepare(`INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
    VALUES ('test-admin', 'Test Admin', 'test-admin@example.com', 1, ?, ?, 'admin', 0)`)
    .bind(Date.now(), Date.now()).run()
  return { env, dispose: () => mf.dispose() }
}
