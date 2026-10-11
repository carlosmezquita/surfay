# Engineering decisions

Surfay is an AI-assisted, data-intensive product prototype. Its score is a
deterministic heuristic, supported by coastal geometry and a limited physical
transfer table. No learned forecast model is trained here. The useful
engineering problem is turning external forecasts and editable local profiles
into consistent, explainable views and traceable observations.

## Request and refresh path

The React app asks the Worker for a catalogue-wide summary, then fetches a full
hourly payload only when a spot is opened. The Worker reads the published
catalogue and compatible compressed snapshots from D1. Missing forecasts trigger
batched marine and weather requests, normalization, scoring and snapshot storage.

Compatibility includes catalogue and scoring-model versions. The model version
is a data-contract version too: v8 introduced UTC instants without changing v7's
quality equations. The browser cache invalidates when the catalogue, model or
forecast generation changes. Display times use Europe/Madrid independently of
the viewer's timezone.

## Three decisions and their tradeoffs

| Decision | Failure it prevents | Tradeoff and evidence |
| --- | --- | --- |
| Publish the spot, catalogue version and forecast snapshots in one D1 batch, guarded by the expected revision and catalogue version. | A slow publication overwriting a concurrent edit, or a new profile becoming visible with old forecast inputs. | Provider work occurs before the transaction. Conflicts reject the candidate with HTTP 409, so an administrator must reload and retry. `worker/publication.test.ts` covers stale revisions, competing publications and rollback after a failed snapshot write. |
| Acquire a database refresh lease, with a 60-second expiry and token-specific release. | Multiple Worker isolates making duplicate provider calls during a refresh. Expiry allows recovery after a crashed holder. | This is a lease, not a promise of exactly-once execution: work outliving the lease can overlap. Provider requests have 20-second timeouts. Compatible complete groups remain available for up to eight hours during failures; incomplete groups do not masquerade as a successful catalogue. `worker/forecast.test.ts` checks contention, unknown slugs and stale fallback. |
| Bind each report to the displayed snapshot and retain the complete scored hour as immutable evidence. Enforce the rolling report limit with one conditional INSERT. | A later refresh or snapshot pruning changing what a report was evaluating, and parallel submissions bypassing the limit. | Evidence duplicates a small amount of data per report. It preserves model/catalogue versions and generation time but does not establish forecast accuracy. `worker/reports.test.ts` exercises real sessions, authorization, pruning and concurrent requests. |

D1 keeps catalogue changes, authorization invariants and snapshots in one
transactional system. The current scope is 13 pilot spots. A larger catalogue
would need measurements of summary overfetch, decompression cost and storage
growth before choosing a different persistence or cache design.

## What the checks establish

- Unit and Miniflare D1 tests cover scoring boundaries, geography calculations,
  timestamp handling, permissions and transactional invariants.
- Playwright runs the production Worker bundle and built React assets with a
  fresh ephemeral D1 database and all migrations. Marine/weather responses are
  synthetic fixtures; the API, scorer, compression, storage, Better Auth and
  report flow run normally. Only the external basemap is replaced by a local
  blank style. Tests run with an America/Los_Angeles browser timezone.
- The browser checks cover map markers/search, spot navigation, hour selection,
  anonymous reporting restrictions, reporter sign-in, report persistence and
  account display. They do not validate the real weather or tile services.
- The local benchmark measures a first uncached forecast request and repeated
  snapshot reads. [Performance notes](performance.md) describe its environment
  and limits; these numbers are not production latency claims.

## Remaining evidence to collect

The full source coastline regression requires the optional dataset described
in [model-data.md](model-data.md). The portable tests use synthetic geometry;
they are not a substitute for reproducing that dataset.

The score needs observations across different swell directions, periods,
heights and tides. Compare it with a simple baseline and evaluate on held-out
time periods; adjacent hours should not be randomly split across training and
evaluation. Report counts and passing tests are not accuracy measurements.
The confidence percentage describes profile/input completeness and remains a
heuristic, not a calibrated probability.

## Why accuracy claims stay modest

The tests establish that Surfay computes its intended equations and handles
data, permissions and concurrent writes correctly. Fixture forecasts have no
independent observations to compare against, so passing them cannot establish
how often the model predicts a surfable session or the right breaking height.

The 0–5 score combines hand-chosen weights and spot profiles. Offshore model
inputs, coarse bathymetry and a limited transfer grid do not resolve every
beach bar, breaking-wave shape or changing seabed. A physically plausible
transformation can still be systematically wrong at a particular beach.

A defensible claim today is “an explainable experimental score using offshore
forecasts and local coastal profiles.” A numerical accuracy claim would need
independent timestamped observations, declared metrics, a simple baseline,
coverage across spots and conditions, and evaluation on held-out events. The
stored report evidence makes that evaluation possible; collecting reports
alone does not complete it. Engineering reliability and forecast skill are
different measurements, and documenting both honestly is part of the work.

Before presenting a deployed version, apply migration 0009 and verify the live
map, a detail view, forecast refresh and an authorized report. The browser suite
uses private local fixture accounts and never deploys or migrates production.
