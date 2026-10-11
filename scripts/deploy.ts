import { existsSync } from 'node:fs'

const path = 'wrangler.production.json'
if (!existsSync(path)) {
  throw new Error('Copy wrangler.jsonc to wrangler.production.json and configure your own D1 database before deploying.')
}
const config = await Bun.file(path).json() as { d1_databases?: { database_id?: string }[] }
const id = config.d1_databases?.[0]?.database_id
if (!id || id === '00000000-0000-0000-0000-000000000000') {
  throw new Error('Set a real D1 database_id in the private production config.')
}
// This task does not deploy anything until the user explicitly runs this command.
const build = Bun.spawn([process.execPath, 'run', 'build'], {
  env: { ...process.env, SURFAY_WRANGLER_CONFIG: path },
  stdin: 'inherit', stdout: 'inherit', stderr: 'inherit',
})
const result = await build.exited
if (result !== 0) process.exit(result)
const deploy = Bun.spawn([process.execPath, 'x', 'wrangler', 'deploy'], {
  stdin: 'inherit', stdout: 'inherit', stderr: 'inherit',
})
process.exit(await deploy.exited)
