import { resolve } from 'node:path'
import { readdirSync } from 'node:fs'
import { Miniflare, Response, type Request } from 'miniflare'
import { applyTestMigrations } from './d1'
import { providerFixture } from './provider-fixture'

export const SMOKE_ORIGIN = 'http://127.0.0.1:4173'
export const REPORTER = { email: 'smoke-reporter@example.com', password: 'local-smoke-password-123' }

/** The actual production bundle and static assets, with ephemeral D1 and no real provider traffic. */
export async function compiledWorker(port?: number) {
  let providerCalls = 0
  const bundleRoot = resolve('dist/surfay')
  const chunks = readdirSync(bundleRoot, { recursive: true }).filter(name =>
    typeof name === 'string' && name.endsWith('.js') && name !== 'index.js') as string[]
  const mf = new Miniflare({
    host: '127.0.0.1', port: port ?? 0,
    modulesRoot: bundleRoot,
    // Explicit modules also retain optional Better Auth adapter chunks with
    // dynamic imports, which Miniflare's automatic module crawler rejects.
    modules: ['index.js', ...chunks].map(path => ({ type: 'ESModule', path: resolve(bundleRoot, path) })),
    compatibilityDate: '2026-07-21', compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'],
    bindings: {
      BETTER_AUTH_SECRET: 'ephemeral-smoke-secret-at-least-32-characters',
      BETTER_AUTH_URL: SMOKE_ORIGIN, TRUSTED_ORIGINS: SMOKE_ORIGIN,
    },
    assets: {
      directory: resolve('dist/client'),
      routerConfig: { has_user_worker: true, static_routing: { user_worker: ['/api/*'] } },
      assetConfig: { not_found_handling: 'single-page-application' },
    },
    outboundService(request: Request) {
      providerCalls++
      return new Response(JSON.stringify(providerFixture(new URL(request.url))), {
        headers: { 'Content-Type': 'application/json' },
      })
    },
  })
  try {
    const db = await mf.getD1Database('DB')
    await applyTestMigrations(db as unknown as D1Database)
    return { mf, db, providerCalls: () => providerCalls, dispose: () => mf.dispose() }
  } catch (error) {
    await mf.dispose()
    throw error
  }
}
