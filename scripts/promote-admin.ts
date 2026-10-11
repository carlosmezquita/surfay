const args = Bun.argv.slice(2)
const emailIndex = args.indexOf('--email')
const email = emailIndex >= 0 ? args[emailIndex + 1]?.trim().toLowerCase() : undefined
const target = args.includes('--remote') ? '--remote' : args.includes('--local') ? '--local' : undefined

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !target) {
  console.error('Usage: bun run admin:promote -- --email user@example.com --local|--remote')
  process.exit(1)
}

const escaped = email.replaceAll("'", "''")
const sql = `UPDATE "user" SET "role" = 'admin', "banned" = 0, "banReason" = NULL, "banExpires" = NULL WHERE lower("email") = '${escaped}'; SELECT "id", "email", "role" FROM "user" WHERE lower("email") = '${escaped}';`
const child = Bun.spawn([process.execPath, 'x', 'wrangler', 'd1', 'execute', 'surfay', target, ...(target === '--remote' ? ['--config', 'wrangler.production.json'] : []), '--command', sql, '--json'], {
  cwd: `${import.meta.dir}/..`,
  stdout: 'pipe', stderr: 'pipe',
})
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
])
if (exitCode !== 0) {
  console.error(stderr || stdout)
  process.exit(exitCode)
}
const parsed = JSON.parse(stdout) as Array<{ results?: unknown[] }>
const found = parsed.some((entry) => Array.isArray(entry.results) && entry.results.length > 0)
if (!found) {
  console.error(`No Better Auth account exists for ${email}. Sign up first, then rerun this command.`)
  process.exit(1)
}
console.log(`Promoted ${email} to admin in the ${target === '--remote' ? 'remote' : 'local'} database.`)

