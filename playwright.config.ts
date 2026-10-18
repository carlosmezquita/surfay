import { defineConfig, devices } from '@playwright/test'
import { SMOKE_ORIGIN } from './test/compiled-worker'

export default defineConfig({
  testDir: './e2e', testMatch: '**/*.spec.ts',
  fullyParallel: false, workers: 1, forbidOnly: Boolean(process.env.CI),
  retries: 0, timeout: 30_000, expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'], baseURL: SMOKE_ORIGIN,
    timezoneId: 'America/Los_Angeles', trace: 'retain-on-failure',
    launchOptions: {
      ...(process.env.SURFAY_CHROMIUM_EXECUTABLE ? { executablePath: process.env.SURFAY_CHROMIUM_EXECUTABLE } : {}),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'bun e2e/serve.ts', wait: { stdout: /SURFAY_SMOKE_READY/ },
    reuseExistingServer: false, timeout: 60_000,
  },
})
