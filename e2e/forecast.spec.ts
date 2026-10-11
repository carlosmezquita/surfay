import { expect, test } from '@playwright/test'
import { REPORTER, SMOKE_ORIGIN } from '../test/compiled-worker'
import type { SpotForecast } from '../src/domain/forecast'

test.beforeEach(async ({ page }) => {
  // Third-party cartography is outside this smoke test. MapLibre and its markers
  // still render with a local style; no tiles, fonts or provider network is needed.
  await page.route('https://tiles.openfreemap.org/**', route => route.fulfill({
    json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#c6d9d6' } }] },
  }))
})

test('anonymous map → spot → selected hour, with Galicia time and reporting gated', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('.surf-map-marker, .surf-map-cluster').first()).toBeVisible()
  const search = page.getByRole('textbox', { name: 'Buscar spot o municipio…' })
  await search.fill('Pantín')
  await search.press('Enter')
  await expect(page.getByRole('heading', { name: 'Pantín', exact: true })).toBeVisible()
  const loaded = page.waitForResponse(response => response.url().endsWith('/api/forecast/pantin') && response.ok())
  await page.getByRole('link', { name: 'Ver previsión completa' }).click()
  const forecast = await (await loaded).json() as SpotForecast
  await expect(page).toHaveURL(/\/spots\/pantin$/)
  const hour = forecast.hours[0]
  const clock = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(hour.time))
  await page.locator('.dt__th').filter({ hasText: clock }).click()
  await expect(page.locator('.now .kicker')).toContainText(clock)
  await expect(page.locator('.now__cell').first()).toContainText(`${hour.effectiveHeightM.toFixed(1)} m`)
  await expect(page.getByRole('button', { name: 'Reportar condiciones', exact: true })).toBeDisabled()
  await expect(page.getByRole('link', { name: 'Inicia sesión para enviar un reporte.' })).toBeVisible()
  expect(forecast.snapshotId).toMatch(/^[0-9a-f-]{36}$/)
  expect((await request.post('/api/reports', { data: {} })).status()).toBe(401)
  expect(errors).toEqual([])
})

test('reporter signs in, saves the displayed forecast evidence and sees the report in their account', async ({ page }) => {
  await page.goto('/account?returnTo=%2Fspots%2Fpantin')
  await page.getByLabel('Correo electrónico').fill(REPORTER.email)
  await page.getByLabel('Contraseña').fill(REPORTER.password)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page).toHaveURL(/\/spots\/pantin$/)
  await page.getByRole('button', { name: 'Reportar condiciones', exact: true }).click()
  await page.locator('.report-score').getByRole('button', { name: '3', exact: true }).click()
  await page.getByLabel('Altura observada').selectOption('matched')
  const saved = page.waitForResponse(response => response.url().endsWith('/api/reports') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Guardar observación' }).click()
  const response = await saved
  expect(response.status()).toBe(201)
  const submitted = response.request().postDataJSON() as { snapshotId: string; forecastTime: string }
  expect(submitted.snapshotId).toMatch(/^[0-9a-f-]{36}$/)
  expect(submitted.forecastTime).toMatch(/Z$/)
  await expect(page.getByText('Observación guardada. Gracias.')).toBeVisible()
  const reportsResponse = await page.request.get(`${SMOKE_ORIGIN}/api/reports/me`)
  const { reports } = await reportsResponse.json() as { reports: { snapshotId: string; forecastTime: string }[] }
  expect(reports).toHaveLength(1)
  expect(reports[0]).toMatchObject({ snapshotId: submitted.snapshotId, forecastTime: submitted.forecastTime })
  expect((await page.request.get('/api/admin/summary')).status()).toBe(403)
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Tus reportes' })).toBeVisible()
  await expect(page.locator('.account-report-list')).toContainText('Pantín')
})
