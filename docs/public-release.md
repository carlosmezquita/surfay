# Public release and live verification

## Current evidence

The local production bundle passes the portable/D1 tests and browser flows.
The README image uses fixture forecasts and live OpenFreeMap cartography.
The full optional coastline source-data regression remains unverified.

The live deployment has **not** been verified in this workspace. Wrangler is
not authenticated here and no deployed origin has been supplied. A successful
local test or `/api/health` response does not establish that production has
migration 0009, the current Worker, working auth or persistent reports.

## Publish without the old image history

Rights for the former hero/social artwork are undocumented. Keep the existing
development repository private. Export the reviewed current tree into a new
repository; do not fork it or push its existing branches/tags.

From the reviewed checkout, stage the files intended for release, then run:

```bash
python scripts/export-public-snapshot.py ../surfay-public
```

The export scans the staged files, copies no Git metadata and creates one new
root commit. It excludes ignored secrets, private deployment configuration,
downloads and build outputs because they are not tracked. It rejects known
removed artwork and requires the licence, attribution and new screenshot.
It also scans the new repository's complete history. This removes the old
image-history obstacle; it does not confirm the rights of the old images or
replace the licences for external sources still used by the current tree.

After inspecting the exported tree, publish it with an authenticated GitHub CLI:

```bash
gh repo create carlosmezquita/surfay --public --source ../surfay-public --remote origin --push
```

No repository is created or published by the export itself. Push only the new
repository's `main` branch; never copy the old repository's refs or history.

## Migrate and verify the real deployment

Use the private deployment configuration for the existing instance. Authenticate
Wrangler in that environment and inspect the database/Worker names before running:

```bash
bunx wrangler d1 migrations list surfay --remote --config wrangler.production.json
bun run db:migrate:remote
bunx wrangler d1 migrations list surfay --remote --config wrangler.production.json
bun run deploy
```

`migrations apply` applies every pending migration in order; it does not rerun
already recorded migrations. Confirm `0009_publication_and_reports.sql` is no
longer pending before deploying the updated Worker. Do not edit or manually
re-execute that historical SQL file.

On the final HTTPS origin, verify these flows:

1. Load `/map`, search Pantín, open its forecast, then navigate back. Confirm
   cartography, markers and provider attribution actually render.
2. Load `/api/forecast/pantin`. Confirm a snapshot ID, model v8, UTC hour
   timestamps and compatible generation/catalogue metadata; select a displayed
   hour and compare its height/wind with the matching API hour. Confirm Galicia
   display times when the browser uses a different timezone.
3. Sign in with a designated test reporter account through `/account`. Verify
   the session survives reload and a normal user cannot submit reports or open
   admin endpoints. This checks the real origin/cookie configuration.
4. Submit an explicitly labelled **deployment test**, not a real observation.
   Confirm the report appears after reloading the account view and that its
   stored snapshot/time match what was displayed. Keep it excluded from any
   future accuracy evaluation and moderate it in the real admin flow.

Record the checked origin, deployed commit, migration state, date and results.
Only then put the actual demo origin in the public repository's homepage:

```bash
gh repo edit carlosmezquita/surfay --homepage "$SURFAY_DEMO_URL" \
  --description "Experimental Galicia surf forecasts with explainable scoring, Cloudflare Workers and D1"
```

Use the verified URL for `SURFAY_DEMO_URL`. Do not infer an origin from a Worker
name or point visitors at an unverified demo.
