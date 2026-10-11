import { compiledWorker, REPORTER, SMOKE_ORIGIN } from '../test/compiled-worker'

const runtime = await compiledWorker(4173)
try {
  const signup = await runtime.mf.dispatchFetch(`${SMOKE_ORIGIN}/api/auth/sign-up/email`, {
    method: 'POST', headers: { Origin: SMOKE_ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...REPORTER, name: 'Smoke Reporter' }),
  })
  if (!signup.ok) throw new Error(`Smoke signup failed: ${signup.status}`)
  await runtime.db.prepare("UPDATE user SET role = 'reporter' WHERE email = ?").bind(REPORTER.email).run()
  console.log('SURFAY_SMOKE_READY')
} catch (error) {
  await runtime.dispose()
  throw error
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void runtime.dispose().finally(() => process.exit()) })
}
// Miniflare's HTTP server owns the process until Playwright terminates it.
