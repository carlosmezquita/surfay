import { defineConfig } from 'vitest/config'

// Pure TypeScript tests do not need the deployment plugin. D1 tests use an
// isolated Miniflare database, so no account, network or production secrets are required.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
    exclude: ['src/domain/shorelineDataset.data.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
})
