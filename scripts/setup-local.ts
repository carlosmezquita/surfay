import { existsSync } from 'node:fs'

if (!existsSync('.dev.vars')) {
  const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')
  await Bun.write('.dev.vars', `BETTER_AUTH_SECRET=${secret}\nBETTER_AUTH_URL=http://127.0.0.1:5173\nTRUSTED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173\n`)
  console.log('Created a private local auth configuration.')
}
const child = Bun.spawn([process.execPath, 'x', 'wrangler', 'd1', 'migrations', 'apply', 'surfay', '--local'], {
  stdin: 'inherit', stdout: 'inherit', stderr: 'inherit',
})
process.exit(await child.exited)
