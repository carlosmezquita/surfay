import { expect, test, type Page } from '@playwright/test'
import { REPORTER } from '../test/compiled-worker'

const localStyle = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#c6d9d6' } }],
}

async function hold(page: Page, url: string) {
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(url, async (route) => {
    await waiting
    await route.continue()
  })
  return release
}

async function bounds(page: Page, selector: string) {
  let box: Awaited<ReturnType<ReturnType<Page['locator']>['boundingBox']>> = null
  await expect
    .poll(async () => {
      box = await page.locator(selector).boundingBox()
      return box !== null
    })
    .toBe(true)
  return box!
}

async function capture(page: Page, name: string) {
  if (process.env.SURFAY_CAPTURE_LOADING_SCREENSHOTS !== '1') return
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true })
}

test.beforeEach(async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.fulfill({ json: localStyle }),
  )
})

for (const width of [1440, 390, 320]) {
  test(`map loading retains sheet geometry without inventing scores at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const release = await hold(page, '**/api/forecast/summary')
    await page.goto('/map')
    await expect(page.locator('.spot-sheet')).toHaveAttribute('aria-busy', 'true')
    await expect(page.locator('.surf-map-marker, .surf-map-cluster').first()).toBeVisible()
    await expect(page.locator('.spot-sheet .stamp')).toHaveCount(0)
    await expect(
      page.locator('.surf-map-marker:not(.score-pending), .surf-map-cluster:not(.score-pending)'),
    ).toHaveCount(0)
    await page.evaluate(() => document.fonts.ready)
    const loading = await bounds(page, '.spot-sheet')
    await capture(page, 'map-loading')
    const summaryResponse = page.waitForResponse(
      (response) => response.url().includes('/api/forecast/summary') && response.ok(),
    )
    release()
    await summaryResponse
    await expect(page.locator('.spot-sheet__metrics .skeleton')).toHaveCount(0)
    await expect(page.locator('.primary-link')).toBeVisible()
    const ready = await bounds(page, '.spot-sheet')
    expect(loading.width).toBe(ready.width)
    expect(Math.abs(loading.height - ready.height)).toBeLessThanOrEqual(2)
    expect(Math.abs(loading.y - ready.y)).toBeLessThanOrEqual(2)
    expect(ready.x + ready.width).toBeLessThanOrEqual(width)
  })

  test(`spot skeleton follows the responsive map and table layout at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const release = await hold(page, '**/api/forecast/pantin')
    await page.goto('/spots/pantin')
    await expect(page.locator('.detail-shell')).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByRole('heading', { name: 'Pantín', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Volver al mapa' })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const loading = await bounds(page, '.direction-map')
    expect(loading.x + loading.width).toBeLessThanOrEqual(width)
    const heading = await bounds(page, '.spot-head')
    expect(heading.x + heading.width).toBeLessThanOrEqual(width)
    await capture(page, 'spot-loading')
    release()
    await expect(page.locator('.score-dial__inner')).toBeVisible()
    await expect(page.locator('.detail-shell .skeleton')).toHaveCount(0)
    const ready = await bounds(page, '.direction-map')
    expect(loading.x).toBe(ready.x)
    expect(loading.y).toBe(ready.y)
    expect(loading.width).toBe(ready.width)
    // Weather details vary in length; the map follows the same grid and keeps its
    // fixed 300px mobile height. Desktop can grow with the current conditions.
    expect(Math.abs(loading.height - ready.height)).toBeLessThanOrEqual(20)
  })

  test(`account loading keeps its navigation and form dimensions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const release = await hold(page, '**/api/auth/get-session')
    await page.goto('/account')
    await expect(page.locator('.account-auth-card')).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByRole('link', { name: 'Volver al mapa' })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const loading = await bounds(page, '.account-auth-card')
    await capture(page, 'account-loading')
    release()
    await expect(page.getByLabel('Correo electrónico')).toBeVisible()
    const ready = await bounds(page, '.account-auth-card')
    expect(loading.x).toBe(ready.x)
    expect(loading.y).toBe(ready.y)
    expect(loading.width).toBe(ready.width)
    expect(Math.abs(loading.height - ready.height)).toBeLessThanOrEqual(2)
  })
}

for (const route of ['map', 'spots/pantin', 'account']) {
  test(`lazy ${route} chunk uses its own page shell and supports reduced motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const name =
      route === 'map' ? 'MapPage' : route === 'account' ? 'AccountPage' : 'SpotDetailPage'
    const release = await hold(page, `**/assets/${name}-*.js`)
    await page.goto(`/${route}`)
    const shell = page.locator(
      route === 'map' ? '.home-page' : route === 'account' ? '.account-page' : '.detail-page',
    )
    await expect(shell).toBeVisible()
    await expect(page.locator('.skeleton').first()).toBeVisible()
    expect(
      await page
        .locator('.skeleton')
        .first()
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe('none')
    if (route !== 'map')
      await expect(page.getByRole('link', { name: 'Volver al mapa' })).toBeVisible()
    release()
    await expect(page.locator('.skeleton')).toHaveCount(0)
  })
}

for (const route of ['/map', '/spots/pantin']) {
  test(`${route} request failures end loading and allow retry`, async ({ page }) => {
    let fail = true
    await page.route(
      route === '/map' ? '**/api/forecast/summary' : '**/api/forecast/pantin',
      async (request) => {
        if (fail) await request.fulfill({ status: 503, json: { error: 'Unavailable' } })
        else await request.continue()
      },
    )
    await page.goto(route)
    await expect(page.getByText('No se pudo cargar la previsión.', { exact: true })).toBeVisible()
    await expect(page.locator('.skeleton')).toHaveCount(0)
    fail = false
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
    await expect(
      page.locator(route === '/map' ? '.spot-sheet__metrics' : '.score-dial__inner'),
    ).toBeVisible()
    await expect(page.getByText('No se pudo cargar la previsión.', { exact: true })).toHaveCount(0)
  })
}

for (const route of ['/map', '/spots/pantin']) {
  test(`${route} cartography failure leaves forecasts usable and supports retry`, async ({
    page,
  }) => {
    let fail = true
    await page.route('https://tiles.openfreemap.org/**', (request) =>
      request.fulfill(fail ? { status: 503, body: '' } : { json: localStyle }),
    )
    await page.goto(route)
    await expect(
      page.getByText('No se pudo cargar el mapa. Puedes seguir consultando las previsiones.'),
    ).toBeVisible()
    await expect(
      page.locator(route === '/map' ? '.spot-sheet__metrics' : '.score-dial__inner'),
    ).toBeVisible()
    fail = false
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
    await expect(page.locator('.map-unavailable, .map-loading-surface')).toHaveCount(0)
  })
}

test('account data waits for reports, shows a recoverable error, and never flashes an empty report list', async ({
  page,
}) => {
  const login = await page.request.post('/api/auth/sign-in/email', { data: REPORTER })
  expect(login.ok()).toBe(true)
  let fail = true
  let release!: () => void
  let waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/reports/me', async (route) => {
    await waiting
    await route.fulfill(
      fail ? { status: 503, json: { error: 'Unavailable' } } : { json: { reports: [] } },
    )
  })
  await page.goto('/account')
  await expect(page.locator('.account-report-list[aria-busy="true"]')).toBeVisible()
  await expect(page.locator('.account-empty')).toHaveCount(0)
  release()
  await expect(page.getByText('No se pudieron cargar los datos de tu cuenta.')).toBeVisible()
  await expect(page.locator('.account-empty')).toHaveCount(0)
  fail = false
  waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.locator('.account-report-list[aria-busy="true"]')).toBeVisible()
  await expect(page.locator('.account-empty')).toHaveCount(0)
  release()
  await expect(page.getByText('Todavía no has enviado ningún reporte.')).toBeVisible()
})

test('empty spot responses show an empty state instead of a permanent skeleton', async ({
  page,
}) => {
  await page.route('**/api/forecast/pantin', async (route) => {
    const response = await route.fetch()
    const forecast = await response.json()
    await route.fulfill({ json: { ...forecast, hours: [] } })
  })
  await page.goto('/spots/pantin')
  await expect(page.getByText('No hay datos para este spot en este momento.')).toBeVisible()
  await expect(page.locator('.skeleton')).toHaveCount(0)
})

test('sign-in shows a busy action while authentication is pending', async ({ page }) => {
  const release = await hold(page, '**/api/auth/sign-in/email')
  await page.goto('/account')
  await page.getByLabel('Correo electrónico').fill(REPORTER.email)
  await page.getByLabel('Contraseña').fill(REPORTER.password)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Iniciando sesión…' })).toBeDisabled()
  release()
  await expect(page.locator('.account-dashboard')).toBeVisible()
})

test('report submission shows a busy action until the observation is saved', async ({ page }) => {
  const login = await page.request.post('/api/auth/sign-in/email', { data: REPORTER })
  expect(login.ok()).toBe(true)
  const release = await hold(page, '**/api/reports')
  await page.goto('/spots/pantin')
  await page.getByRole('button', { name: 'Reportar condiciones', exact: true }).click()
  await page.getByRole('button', { name: 'Guardar observación' }).click()
  await expect(page.getByRole('button', { name: 'Guardando observación…' })).toBeDisabled()
  release()
  await expect(page.getByText('Observación guardada. Gracias.')).toBeVisible()
})
