import { expect, test, type Page } from '@playwright/test'

/**
 * The hero monolith engine in a real browser — hero monolith spec § 8.2.
 *
 * Chromium on SwiftShader gives a WebGL2 context without a GPU, which proves the
 * six programs compile and link and that the engine draws. It proves nothing
 * about frame time: SwiftShader's numbers mean nothing, so no test asserts one.
 * WebKit cannot launch with these flags, so only Chromium projects run this file.
 *
 * `window.__ASSEMBLY_HERO__` is the test seam (shader logs, presented frames,
 * the tier). It exists only in a build made with `NEXT_PUBLIC_MODEL_TEST=1`, the
 * same switch and the same guard as the model seam, so the file is skipped when
 * the runner was not given that variable.
 *
 * The CI runner has four cores, so nothing here assumes tier 3: the tier is
 * read from `html[data-hero-tier]`.
 */

test.skip(({ browserName }) => browserName !== 'chromium', 'needs Chromium with SwiftShader WebGL; WebKit cannot launch with these flags')
test.skip(process.env.NEXT_PUBLIC_MODEL_TEST !== '1', 'needs an app built with NEXT_PUBLIC_MODEL_TEST=1 (the hero test seam)')

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } })
// Software GL is slow and several workers share one CPU: be generous, not flaky.
test.describe.configure({ timeout: 150_000 })

const LIVE = 'html[data-hero="live"]'
const HERO_CHUNK = /\/_next\/static\/chunks\/hero\.[0-9a-f]+\.js/

interface Seam {
  readonly errors: readonly string[]
  readonly frames: number
  readonly tier: number
  readonly lost: number
  readonly ready: boolean
}

const seam = (page: Page): Promise<Seam> => page.evaluate(() => ({ ...(window as unknown as { __ASSEMBLY_HERO__: Seam }).__ASSEMBLY_HERO__ }))

/** Console errors and uncaught exceptions, for the whole life of the page. Warnings (three's deprecations) are not errors. */
function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

test('compiles every program and renders, with no error anywhere', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/?hero=a')
  await page.waitForSelector(LIVE, { timeout: 90_000 })

  const tier = Number(await page.locator('html').getAttribute('data-hero-tier'))
  expect([1, 2, 3]).toContain(tier)

  // Shader and link logs are empty only when all six programs linked.
  await expect.poll(async () => (await seam(page)).frames, { timeout: 30_000 }).toBeGreaterThanOrEqual(3)
  const now = await seam(page)
  expect(now.errors).toEqual([])
  expect(now.ready).toBe(true)
  expect(now.lost).toBe(0)

  // Frames keep arriving: the loop is alive, not a single lucky draw.
  const before = now.frames
  await expect.poll(async () => (await seam(page)).frames, { timeout: 30_000 }).toBeGreaterThan(before)

  // The hero engine owns the hero: the cube rig draws none and the layer is a canvas of its own.
  await expect(page.locator('canvas[data-hero-canvas]')).toHaveCount(1)
  expect(errors).toEqual([])
})

for (const tier of [1, 3] as const) {
  test(`?tier=${tier} is honoured and the governor leaves it alone`, async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto(`/?hero=a&tier=${tier}`)
    await page.waitForSelector(LIVE, { timeout: 90_000 })
    await expect(page.locator('html')).toHaveAttribute('data-hero-tier', String(tier))
    await expect.poll(async () => (await seam(page)).frames, { timeout: 30_000 }).toBeGreaterThanOrEqual(3)
    // Slow software frames must not walk an overridden tier down.
    await page.waitForTimeout(3000)
    await expect(page.locator('html')).toHaveAttribute('data-hero-tier', String(tier))
    expect((await seam(page)).errors).toEqual([])
    expect(errors).toEqual([])
  })
}

test('a lost context brings the poster back, a restore re-renders, a second loss gives up', async ({ page }) => {
  await page.goto('/?hero=a&tier=1')
  await page.waitForSelector(LIVE, { timeout: 90_000 })
  const html = page.locator('html')

  const fire = (type: 'webglcontextlost' | 'webglcontextrestored'): Promise<void> =>
    page.evaluate((name) => {
      document.querySelector('canvas[data-hero-canvas]')?.dispatchEvent(new Event(name, { cancelable: true }))
    }, type)

  await fire('webglcontextlost')
  await expect(html).not.toHaveAttribute('data-hero', /.+/)
  expect((await seam(page)).lost).toBe(1)

  await fire('webglcontextrestored')
  await page.waitForSelector(LIVE, { timeout: 90_000 })
  expect((await seam(page)).errors).toEqual([])

  await fire('webglcontextlost')
  await expect(html).toHaveAttribute('data-hero', 'poster')
  await expect(page.locator('canvas[data-hero-canvas]')).toHaveCount(0)
})

test('Save-Data never fetches the hero chunk, and never mounts the Assembly either', async ({ page }) => {
  const chunks: string[] = []
  page.on('request', (request) => {
    if (HERO_CHUNK.test(request.url())) chunks.push(request.url())
  })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true, effectiveType: '4g' } })
  })
  await page.goto('/?hero=a')
  // Past the LCP gate's own ceiling, so "not yet" cannot pass for "never".
  await page.waitForTimeout(9000)
  expect(chunks).toEqual([])
  await expect(page.locator('html')).not.toHaveAttribute('data-hero', /.+/)
  await expect(page.locator('html')).not.toHaveAttribute('data-gl', 'live')
})

test('without the flag the hero chunk is never fetched and the page is unchanged', async ({ page }) => {
  const chunks: string[] = []
  page.on('request', (request) => {
    if (HERO_CHUNK.test(request.url())) chunks.push(request.url())
  })
  await page.goto('/')
  await page.waitForSelector('html[data-gl="live"]', { timeout: 90_000 })
  await page.waitForTimeout(1500)
  expect(chunks).toEqual([])
  await expect(page.locator('html')).not.toHaveAttribute('data-hero', /.+/)
  await expect(page.locator('canvas[data-hero-canvas]')).toHaveCount(0)
})
