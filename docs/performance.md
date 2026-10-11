# Local performance baseline

Reproduce from a fresh checkout:

```bash
bun install --frozen-lockfile
bun run build
bun run benchmark 20
```

No Cloudflare account, production configuration or external weather access is
needed. Each run starts the production Worker bundle in Miniflare, creates an
ephemeral D1 database and applies all migrations. The first request populates
the empty snapshot store through the normal provider adapter, scoring,
compression and database write path. Provider replies use
`test/provider-fixture.ts`: 13 spots, 168 hours per spot, four batched requests,
with immediate synthetic replies.

Each duration ends after consuming the full response body. Cached requests run
sequentially; the tool fails if any of them call the provider or return an error.
The first-response measurement excludes process/database startup. None of these
measurements include real provider network latency, an HTTP network hop, edge
cache behavior or production D1 performance. This is a repeatable local baseline,
not a load test or a Cloudflare cold-start benchmark.

Recorded sample: [performance-sample.json](performance-sample.json), Linux x64,
Bun 1.4.3, 20 sequential samples per cached endpoint.

| Operation | First request | Cached p50 | Cached p95 | Response body |
| --- | ---: | ---: | ---: | ---: |
| Complete catalogue summary | 115.31 ms | 20.34 ms | 23.10 ms | 684,443 bytes |
| One spot (`baldaio`) | — | 5.35 ms | 7.93 ms | 198,234 bytes |

Response sizes are uncompressed JSON bytes, not browser transfer sizes. Exact
timings vary with hardware, runtime version and concurrent work. CI records a
new JSON artifact per run; it does not enforce a machine-dependent millisecond
threshold.

The summary still carries all hourly score rows for the catalogue and reads
compressed per-spot snapshots. Its payload and decompression cost are useful
targets for a future profile-driven optimization. Measure on a deployed instance
before changing the API contract or claiming production performance.
