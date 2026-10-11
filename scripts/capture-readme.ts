import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { compiledWorker, SMOKE_ORIGIN } from '../test/compiled-worker'

// Capture the real UI with live cartography, but isolated fixture forecasts/D1.
// This is separate from the offline browser tests and is never a CI requirement.
const worker = await compiledWorker(4173)
const proxyUrl = process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : undefined
try {
  const browser = await chromium.launch({
    ...(process.env.SURFAY_CHROMIUM_EXECUTABLE ? { executablePath: process.env.SURFAY_CHROMIUM_EXECUTABLE } : {}),
    ...(proxyUrl ? { proxy: {
      server: `${proxyUrl.protocol}//${proxyUrl.host}`,
      ...(proxyUrl.username ? { username: decodeURIComponent(proxyUrl.username), password: decodeURIComponent(proxyUrl.password) } : {}),
      bypass: '127.0.0.1,localhost',
    } } : {}),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1.5,
      timezoneId: 'Europe/Madrid', ignoreHTTPSErrors: Boolean(proxyUrl),
    })
    const tile = page.waitForResponse(response =>
      response.url().startsWith('https://tiles.openfreemap.org/') &&
      response.url().endsWith('.pbf') && response.ok(), { timeout: 60_000 })
    await page.goto(`${SMOKE_ORIGIN}/spots/pantin`)
    await page.getByRole('heading', { name: 'Pantín', exact: true }).waitFor()
    await tile
    await page.waitForLoadState('networkidle', { timeout: 60_000 })
    await page.evaluate(() => document.fonts.ready)
    const attribution = page.locator('.spot-mini-map .maplibregl-ctrl-attrib')
    if (!(await attribution.getAttribute('class'))?.includes('maplibregl-compact-show')) {
      await attribution.locator('button').click()
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    const top = await page.locator('.top-grid').boundingBox()
    const day = await page.locator('.day').boundingBox()
    if (!top || !day) throw new Error('Forecast layout is missing')
    await mkdir('docs/images', { recursive: true })
    await page.screenshot({
      path: 'docs/images/forecast.png',
      clip: { x: top.x - 12, y: top.y - 12, width: top.width + 24, height: day.y + day.height - top.y + 24 },
    })
    console.log('Captured docs/images/forecast.png: fixture weather, live OpenFreeMap cartography.')
  } finally {
    await browser.close()
  }
} finally {
  await worker.dispose()
}
