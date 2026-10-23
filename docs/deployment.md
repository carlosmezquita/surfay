# Hosted Surfay deployment

Live app: https://surfay.carlosmezquita.dev

The public `carlosmezquita/surfay` repository is the source for the hosted
Cloudflare Worker. Production builds follow `main`. The existing Worker and
D1 database are reused; connecting the repository does not create a database,
copy user data, reseed the catalogue, or apply SQL migrations.

## Private configuration

Keep instance configuration in Cloudflare's encrypted, production-only build
secret `SURFAY_PRODUCTION_CONFIG`. It contains the existing Worker name and
D1 binding. Do not put its value, credentials, database exports, or historical
private repository files in Git.

The build merges that configuration with the portable `wrangler.jsonc` and
writes the ignored `wrangler.production.json`. Vite reads this private file
through `SURFAY_WRANGLER_CONFIG`. The deploy command uses the generated
`dist/surfay/wrangler.json` and `--keep-vars`.

Runtime authentication secrets stay on the existing Worker. They are separate
from build variables. The canonical authentication origin is the live HTTPS
URL above. Custom domains remain managed in Cloudflare's dashboard.

## Build gates

The hosted build pins Bun 1.4.3 and Node 24 and runs `bun run check` and
`bun run security:scan` before deployment. GitHub CI additionally runs the
isolated browser suite. Preview builds are disabled: pull requests must not
receive production configuration or deploy against the production database.

Review future schema changes separately. The deployment command deliberately
does not apply remote migrations, run local setup, seed data, or promote users.
The existing deployment already had migrations 0001 through 0009 applied when
this repository connection was configured on 2026-10-23.

## Verification and recovery

Before changing production, record its active Worker version and a D1 Time
Travel bookmark privately. After deployment, check the map, a spot forecast,
account navigation, the existing DB binding, custom domains, and aggregate
application data counts. Real authenticated sign-in and report submission
require a designated test account; fixture browser tests alone do not verify
those production flows.

For a code-only regression, restore the previous Worker version in Cloudflare
while retaining current runtime origin settings. Database restoration is a
separate operation and can discard writes made after the chosen bookmark.
Do not restore or recreate the database as part of a routine code rollback.

The former development repository remains private. Do not merge or copy its
Git history, tags, removed artwork, private deployment files, or database
contents into this public repository.
