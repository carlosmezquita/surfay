# Surfay — AGENTS.md

## Stack
- **Runtime**: Bun (not npm). React 19 + Vite 8 + TypeScript 6 + Tailwind 4.
- **Backend**: Single Cloudflare Worker (`worker/index.ts`) serving both API and SPA assets.
- **Database**: Cloudflare D1 (`wrangler.jsonc`, not `wrangler.toml`).
- **Auth**: Better Auth 1.6.23 (must use this exact version for schema generation) with admin plugin.

## Commands
| Command | What it does |
|---|---|
| `bun run dev` | Start Vite dev server (includes CF worker via plugin). Pass `-- --host 127.0.0.1` for local auth to work. |
| `bun run build` | `tsc -b && vite build` |
| `bun run preview` | Build then preview the production bundle locally |
| `bun run deploy` | `build && wrangler deploy` |
| `bun run test` | `vitest run` (portable unit tests and isolated Miniflare D1 integration). Uses `vitest.config.ts`, separate from deployment plugins. |
| `bun run test:e2e` | Playwright browser flows against the built Worker/assets with ephemeral D1 and fixture provider replies. Run `build` and install Chromium first. |
| `bun run benchmark 20` | Local first-refresh and cached-response measurements from the built Worker; synthetic weather, no production latency claim. |
| `bun run lint` | `eslint .` |
| `bun run cf:types` | Generate Cloudflare worker types |
| `bun run db:migrate:local` | Apply D1 migrations locally |
| `bun run db:migrate:remote` | Apply D1 migrations to remote |
| `bun run auth:schema` | Generate Better Auth SQL migration (uses pinned version) |
| `bun run admin:promote -- --email admin@example.com --local` | Promote a user to admin. Requires `--email` and either `--local` or `--remote`. |
| `bun run spots:seed-migration` | Generate spot seed SQL migration |
| `bun run shoreline:migration` | Generate composite shoreline D1 migration |

Python scripts (shoreline/bathymetry generation) require their own venv (see `scripts/requirements-*.txt`).

## Architecture
- **Entrypoints**: `src/main.tsx` (frontend), `worker/index.ts` (API + cron handler).
- **Routing**: React Router: `/` → `/map`, `/spots/:slug`, `/account`, `/admin`.
- **Forecast provider calls are server-side**. Map tiles come from OpenFreeMap in the browser.
- **Forecasts**: D1 stores gzip-compressed payloads. Cron refresh every 30 min (see `wrangler.jsonc` triggers). Stale data served up to 8 hours.
- **Roles**: `user`, `reporter`, `admin` (separate from billing `membership.plan`).
- **Bilingual**: Spanish + Galician in `src/features/i18n/`.
- **Worker assets**: SPA fallback with `run_worker_first` for `/api/*`.
- **Frontend env override**: `VITE_SURFAY_FORECAST_URL` (optional, `.env.example`) — leave empty when Worker and SPA share an origin.

## Project layout
- `src/` — React frontend (domain logic, features, pages, services, web workers)
- `worker/` — Cloudflare Worker API (auth, catalogue, forecast, reports, admin)
- `migrations/` — D1 SQL migrations (0001_better_auth, 0002_surfay_domain, ...)
- `scripts/` — Admin bootstrap, seed generators, Python model scripts
- `public/shoreline/` — Generated IHM shoreline geometry tiles (gitignored; rebuilt via `shoreline:tiles`). Current dataset: `ihm-lc-composite-v3`.
- `docs/rating-model.md` — Scoring model documentation

## Generated files (do not edit by hand)
- `src/data/bathymetryTransfer.generated.ts` — SWAN transfer tables (Python)
- `src/data/shorelineExposure.generated.ts` — Shoreline exposure profiles (Python)
- Migration SQL files in `migrations/` — from `auth:schema`, `spots:seed-migration`, `shoreline:migration`

## Testing
- `vitest` uses a dedicated config. D1 integration tests apply real migrations in Miniflare via `test/d1.ts`.
- `bun run test:data` separately requires generated IHM shoreline tiles; portable geometry tests use synthetic fixtures.
- Tests live in `src/domain/*.test.ts`, `src/services/*.test.ts`, and `worker/forecastPayload.test.ts`.
- ESLint verifies code; `.prettierrc.json` formats admin code via `bun run format:admin`.

## Local dev setup
1. `bun install --frozen-lockfile`
2. `bun run setup:local` (creates a random private local secret and runs migrations).
3. Optional geometry: follow `docs/model-data.md`.
4. `bun run dev -- --host 127.0.0.1`

## Conventions
- Optimistic concurrency on spots via `revision` integer field.
- Admin API uses explicit method checks (no REST framework).
- Forecast snapshot model version is `SCORING_MODEL_VERSION` in `src/domain/forecast.ts`.
- Shoreline profiles are versioned (`ihm-lc-composite-v3`).
- Data sources: IHM COALNE (CC BY 4.0), EMODnet DTM 2024.
- Worker code must use only Web APIs + CF bindings — no Node.js APIs despite `nodejs_compat`.


## Hardening conventions
- Model v8 stores UTC forecast timestamps; render in Europe/Madrid using forecastTime helpers.
- Publication must use `commitPublication`; its D1 guard and per-spot snapshots share one batch.
- Reports require the displayed snapshot ID and retain immutable hour JSON before old snapshots are pruned.
- Migration 0009 is hand-written. Do not rewrite existing migration history.
- Production uses ignored `wrangler.production.json`; checked-in config has no instance-specific IDs.
- Run `bun run check` and `bun run security:scan` before proposing publication.
- Browser changes must pass `bun run test:e2e` after the production build. External basemap availability and real forecast accuracy are outside this fixture suite.
- Keep benchmark hardware/runtime and fixture scope with any reported numbers. Do not invent user feedback, production latency or forecast calibration results.
- Strict TypeScript is enabled for frontend, config and Worker. Node-only test helpers live in `test/`, outside Worker code.
