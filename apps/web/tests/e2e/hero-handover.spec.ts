import { expect, test, type Page } from '@playwright/test'

/**
 * The hero hand-over, behind the flag (`?hero=a`) — hero monolith spec § 4.4, § 4.6 and S3.
 *
 * Chromium on SwiftShader: shapes and states are meaningful, frame times are not, so nothing here asserts one. The
 * test seams (`__ASSEMBLY_CUBES__`, `__ASSEMBLY_FADE__`, `__ASSEMBLY_HERO__`) exist only in a build made with
 * `NEXT_PUBLIC_MODEL_TEST=1`, which is why the file is skipped without it.
 *
 * `__ASSEMBLY_FADE__` is the size multiplier of the two cube slots: `[0, 1]` while the monolith side of a morph is the
 * engine's, `[1, 1]` everywhere else. `__ASSEMBLY_CUBES__` is how many cubes the last frame instanced.
 */

test.skip(({ browserName }) => browserName !== 'chromium', 'needs Chromium with SwiftShader WebGL; WebKit cannot launch with these flags')
test.skip(process.env.NEXT_PUBLIC_MODEL_TEST !== '1', 'needs an app built with NEXT_PUBLIC_MODEL_TEST=1 (the test seams)')

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } })
test.describe.configure({ timeout: 150_000 })

const LIVE = 'html[data-hero="live"]'
const HERO_CHUNK = /\/_next\/static\/chunks\/hero\.[0-9a-f]+\.js/

interface Cubes {
  readonly count: number | null
  readonly fade: readonly [number, number] | null
}

const cubes = (page: Page): Promise<Cubes> =>
  page.evaluate(() => {
    const w = window as unknown as { __ASSEMBLY_CUBES__?: number; __ASSEMBLY_FADE__?: [number, number] }
    return { count: w.__ASSEMBLY_CUBES__ ?? null, fade: w.__ASSEMBLY_FADE__ ?? null }
  })

const surge = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __ASSEMBLY_HERO__?: { surge: number } }).__ASSEMBLY_HERO__?.surge ?? -1)

const heroOpacity = (page: Page): Promise<number> =>
  page.evaluate(() => Number(document.querySelector<HTMLCanvasElement>('canvas[data-hero-canvas]')?.style.opacity ?? 'NaN'))

const scrollToViewports = (page: Page, viewports: number): Promise<void> =>
  page.evaluate((v) => window.scrollTo(0, window.innerHeight * v), viewports)

test('the monolith disperses into the stream: cubes stay out at the top, grow as the page scrolls, and reassemble on the way back', async ({ page }) => {
  await page.goto('/?hero=a&tier=1')
  await page.waitForSelector(LIVE, { timeout: 90_000 })
  // Wait for the 3D layer's first frame: the hand-over is its business.
  await expect.poll(async () => (await cubes(page)).fade, { timeout: 60_000 }).not.toBeNull()

  // Top of the page: the engine owns the hero, the cube rig draws none and the monolith side is size 0.
  await expect.poll(async () => (await cubes(page)).count, { timeout: 30_000 }).toBe(0)
  expect(await heroOpacity(page)).toBeGreaterThan(0.9)

  // Into the hero-to-proof band: the monolith side stays at 0, the stream side is whole, cubes are instanced.
  await scrollToViewports(page, 0.65)
  await expect.poll(async () => (await cubes(page)).count, { timeout: 30_000 }).toBeGreaterThan(0)
  const mid = await cubes(page)
  expect(mid.fade).toEqual([0, 1])
  // The engine's layer is still painting and has started to fade, so the dust and the cubes share the band.
  expect(await heroOpacity(page)).toBeGreaterThan(0)

  // Past the band: the engine's layer is gone and the stream stands on its own at full size.
  await scrollToViewports(page, 1.3)
  await expect.poll(() => heroOpacity(page), { timeout: 30_000 }).toBe(0)
  await expect.poll(async () => (await cubes(page)).fade, { timeout: 30_000 }).toEqual([1, 1])

  // Back up: it reassembles (the engine returns, the cubes are gone from the hero again).
  await scrollToViewports(page, 0)
  await page.waitForSelector(LIVE, { timeout: 90_000 })
  await expect.poll(async () => (await cubes(page)).count, { timeout: 60_000 }).toBe(0)
  await expect.poll(() => heroOpacity(page), { timeout: 30_000 }).toBeGreaterThan(0.9)
})

test('the procedural cube monolith never shows next to the engine: while live, the only fade is the monolith side at 0', async ({ page }) => {
  await page.goto('/?hero=a&tier=1')
  await page.waitForSelector(LIVE, { timeout: 90_000 })
  await expect.poll(async () => (await cubes(page)).fade, { timeout: 60_000 }).not.toBeNull()
  const seen = new Set<string>()
  // The band starts about 0.45 viewports down at 1440x900 and the engine's layer is gone by about 0.9.
  for (const v of [0, 0.3, 0.55, 0.65, 0.75, 0.85]) {
    await scrollToViewports(page, v)
    await page.waitForTimeout(700)
    const { fade, count } = await cubes(page)
    // Any frame that instances cubes while the engine is painting has the monolith side at size 0.
    if ((count ?? 0) > 0 && (await heroOpacity(page)) > 0) {
      seen.add(JSON.stringify(fade))
    }
  }
  // Not vacuous: at least one sampled frame had cubes instanced and the engine painting.
  expect([...seen]).toEqual(['[0,1]'])
})

test('scroll speed surges the reflections and is exactly 0 again at rest', async ({ page }) => {
  await page.goto('/?hero=a&tier=1')
  await page.waitForSelector(LIVE, { timeout: 90_000 })
  expect(await surge(page)).toBe(0)
  await page.mouse.move(400, 400)
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.wheel(0, 220)
    await page.waitForTimeout(50)
  }
  await expect.poll(() => surge(page), { timeout: 20_000 }).toBeGreaterThan(0)
  // At rest the integral stops growing: two reads a second apart agree.
  await page.waitForTimeout(2500)
  const a = await surge(page)
  await page.waitForTimeout(1000)
  expect(await surge(page)).toBe(a)
})

test('reduced motion keeps the poster: no engine chunk, no hand-over, no live attribute', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  const chunks: string[] = []
  page.on('request', (request) => {
    if (HERO_CHUNK.test(request.url())) chunks.push(request.url())
  })
  await page.goto('/?hero=a')
  await page.waitForTimeout(9000)
  expect(chunks).toEqual([])
  await expect(page.locator('html')).toHaveAttribute('data-hero', 'poster')
  await expect(page.locator('canvas[data-hero-canvas]')).toHaveCount(0)
  expect((await cubes(page)).fade).toBeNull()
  await context.close()
})

test('?nogl=1 keeps the poster and never runs the hand-over', async ({ page }) => {
  const chunks: string[] = []
  page.on('request', (request) => {
    if (HERO_CHUNK.test(request.url())) chunks.push(request.url())
  })
  await page.goto('/?hero=a&nogl=1')
  await page.waitForTimeout(9000)
  expect(chunks).toEqual([])
  await expect(page.locator('html')).toHaveAttribute('data-hero', 'poster')
  expect((await cubes(page)).fade).toBeNull()
})

test('Save-Data keeps the poster and never runs the hand-over', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true, effectiveType: '4g' } })
  })
  await page.goto('/?hero=a')
  await page.waitForTimeout(9000)
  await expect(page.locator('html')).toHaveAttribute('data-hero', 'poster')
  expect((await cubes(page)).fade).toBeNull()
})

test('the lowest tier (a device that gave up) keeps the poster: ?tier=0 never runs the hand-over', async ({ page }) => {
  await page.goto('/?hero=a&tier=0')
  await page.waitForTimeout(6000)
  await expect(page.locator('html')).not.toHaveAttribute('data-hero', 'live')
  await expect(page.locator('canvas[data-hero-canvas]')).toHaveCount(0)
  // The cubes (the 3D layer is separate from the hero engine) are untouched: every fade is 1.
  const { fade } = await cubes(page)
  if (fade !== null) expect(fade).toEqual([1, 1])
})

test('?hero=off wins over ?hero=a, in either order, and leaves the page as the default build has it', async ({ page }) => {
  const chunks: string[] = []
  page.on('request', (request) => {
    if (HERO_CHUNK.test(request.url())) chunks.push(request.url())
  })
  for (const query of ['?hero=off', '?hero=a&hero=off', '?hero=off&hero=a']) {
    await page.goto(`/${query}`)
    await page.waitForSelector('html[data-gl="live"]', { timeout: 90_000 })
    await expect(page.locator('html')).toHaveAttribute('data-hero-mode', 'off')
    await expect(page.locator('html')).not.toHaveAttribute('data-hero', /.+/)
    await expect.poll(async () => (await cubes(page)).fade, { timeout: 30_000 }).toEqual([1, 1])
  }
  expect(chunks).toEqual([])
})

test('the default build is unchanged: no flag, no engine, no hand-over, the cubes own the hero', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('html[data-gl="live"]', { timeout: 90_000 })
  await expect(page.locator('html')).toHaveAttribute('data-hero-mode', 'off')
  await expect(page.locator('html')).not.toHaveAttribute('data-hero', /.+/)
  await expect.poll(async () => (await cubes(page)).fade, { timeout: 30_000 }).toEqual([1, 1])
  // The cubes' own monolith draws at the top (3000 or the reduced count), not zero.
  expect((await cubes(page)).count).toBeGreaterThan(0)
})
