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
  // A give-up is never silent: on the happy path there is no reason marker.
  await expect(page.locator('html')).not.toHaveAttribute('data-hero-reason', /.+/)
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
  await expect(html).toHaveAttribute('data-hero-reason', /^lost-x2/)
  expect(await washTransparent(page)).toBe(false)
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
  // The monolith is the hero but the engine will not run: the poster is the visual (S2), never 'live'.
  await expect(page.locator('html')).toHaveAttribute('data-hero', 'poster')
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

/**
 * The monolith's wash is transparent exactly while the hero engine is reported live (and the cubes are hidden);
 * otherwise it is the normal opaque wash and the cubes draw. So "never transparent without a live hero" is
 * "something is always painted behind the page".
 */
const washTransparent = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const wash = document.querySelector('[data-assembly] > div > div')
    return wash ? getComputedStyle(wash).backgroundImage === 'none' : false
  })

const heroPainting = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-hero-canvas]')
    return document.documentElement.dataset.hero === 'live' && canvas !== null && Number(canvas.style.opacity) > 0
  })

/** Samples every 250 ms and returns the instants at which the wash was transparent with no hero painting. */
async function sampleBlank(page: Page, ms: number): Promise<number> {
  let blank = 0
  for (let waited = 0; waited < ms; waited += 250) {
    if ((await washTransparent(page)) && !(await heroPainting(page))) blank += 1
    await page.waitForTimeout(250)
  }
  return blank
}

test('a context that never comes back hands the page and the cubes back, with a reason', async ({ page }) => {
  await page.goto('/?hero=a&tier=1')
  await page.waitForSelector(LIVE, { timeout: 90_000 })
  await expect.poll(() => washTransparent(page), { timeout: 20_000 }).toBe(true)
  // A real loss, and no restoreContext() ever.
  await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>('canvas[data-hero-canvas]')?.getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  })
  await expect(page.locator('html')).toHaveAttribute('data-hero-reason', /^restore-timeout/, { timeout: 15_000 })
  await expect(page.locator('html')).toHaveAttribute('data-hero', 'poster')
  expect(await washTransparent(page)).toBe(false)
})

test('away for more than 9 s and back: something is painted at every sampled instant', async ({ page }) => {
  await page.goto('/?hero=a&tier=1')
  await page.waitForSelector(LIVE, { timeout: 90_000 })
  let blank = await sampleBlank(page, 1500)
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2))
  blank += await sampleBlank(page, 9500)
  await expect(page.locator('html')).not.toHaveAttribute('data-hero', /.+/)
  await page.evaluate(() => window.scrollTo(0, 0))
  blank += await sampleBlank(page, 1000)
  await page.waitForSelector(LIVE, { timeout: 90_000 })
  blank += await sampleBlank(page, 1500)
  expect(blank).toBe(0)
  await expect(page.locator('html')).not.toHaveAttribute('data-hero-reason', /.+/)
})

/**
 * Per-frame sampler. Every animation frame it records whether the hero engine is painting (live, canvas visible), whether
 * the 3D layer instanced any cubes, and the time. Software GL draws the cubes in a few hundred milliseconds, so one
 * 3D frame is allowed to lag the hero by up to 700 ms; on a real GPU that is one frame. A flash is a run of "neither"
 * or "both" longer than that.
 */
const SAMPLER = `
  window.__frames = []
  const tick = () => {
    const canvas = document.querySelector('canvas[data-hero-canvas]')
    const hero = document.documentElement.dataset.hero === 'live' && canvas !== null && Number(canvas.style.opacity) > 0
    const cubes = (window.__ASSEMBLY_CUBES__ ?? -1) > 0
    window.__frames.push([hero, cubes, performance.now()])
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
`

async function flashes(page: Page): Promise<{ neither: number; both: number; frames: number }> {
  return page.evaluate(() => {
    const frames = (window as unknown as { __frames: [boolean, boolean, number][] }).__frames
    // Ignore the page before the 3D layer exists: nothing can be painted yet, and that is not a flash.
    const start = frames.findIndex(([hero, cubes]) => hero || cubes)
    let neither = 0
    let both = 0
    let sinceN = -1
    let sinceB = -1
    for (const [hero, cubes, t] of frames.slice(Math.max(0, start))) {
      if (!hero && !cubes) sinceN = sinceN < 0 ? t : sinceN
      else sinceN = -1
      if (hero && cubes) sinceB = sinceB < 0 ? t : sinceB
      else sinceB = -1
      if (sinceN >= 0 && t - sinceN > 700) neither += 1
      if (sinceB >= 0 && t - sinceB > 700) both += 1
    }
    return { neither, both, frames: frames.length }
  })
}

test('going live and a forced loss never leave the page with neither, or both, for longer than one software 3D frame', async ({ page }) => {
  await page.addInitScript(SAMPLER)
  await page.goto('/?hero=a&tier=1')
  await page.waitForSelector(LIVE, { timeout: 90_000 })
  await page.waitForTimeout(2000)
  const fire = (type: string): Promise<void> =>
    page.evaluate((name) => {
      document.querySelector('canvas[data-hero-canvas]')?.dispatchEvent(new Event(name, { cancelable: true }))
    }, type)
  await fire('webglcontextlost')
  await page.waitForTimeout(1500)
  await fire('webglcontextrestored')
  await page.waitForSelector(LIVE, { timeout: 90_000 })
  await page.waitForTimeout(2000)
  const result = await flashes(page)
  expect(result.frames).toBeGreaterThan(30)
  expect(result).toMatchObject({ neither: 0, both: 0 })
})

/** The poster gives way when the engine paints and comes back when it gives up (hero monolith spec § 7: the cross-fade rule). */
const posterOpacity = (page: Page): Promise<number> => page.locator('.hero-poster').evaluate((el) => Number(getComputedStyle(el).opacity))

test('the poster fades out once the engine paints, and is back when the engine gives up', async ({ page }) => {
  await page.goto('/?hero=a&tier=1')
  await page.waitForSelector(LIVE, { timeout: 90_000 })
  // Poster and painted wash cross-fade out together over --d-crossfade.
  await expect.poll(() => posterOpacity(page), { timeout: 10_000 }).toBe(0)
  await expect.poll(() => page.locator('[data-wash="monolith"]').evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 10_000 }).toBe(0)

  const fire = (type: 'webglcontextlost' | 'webglcontextrestored'): Promise<void> =>
    page.evaluate((name) => {
      document.querySelector('canvas[data-hero-canvas]')?.dispatchEvent(new Event(name, { cancelable: true }))
    }, type)
  await fire('webglcontextlost')
  await expect.poll(() => posterOpacity(page), { timeout: 10_000 }).toBe(1)
  await fire('webglcontextrestored')
  await page.waitForSelector(LIVE, { timeout: 90_000 })
  await expect.poll(() => posterOpacity(page), { timeout: 10_000 }).toBe(0)
  await fire('webglcontextlost')
  await expect(page.locator('html')).toHaveAttribute('data-hero', 'poster')
  await expect.poll(() => posterOpacity(page), { timeout: 10_000 }).toBe(1)
})

/**
 * The hero's glass panel blurs what is behind it (`backdrop-filter`), and that includes the fixed WebGL canvases. A clip-path,
 * filter, mask or blend mode on any ancestor of the panel makes that ancestor the panel's backdrop root, and the blur then
 * stops seeing the canvases. The poster's clip therefore lives on its own wrapper, never on an ancestor of the panel.
 * This is the default build with WebGL live, which is the page every visitor gets today.
 */
test('the glass panel stays a backdrop for the WebGL canvases: no ancestor of it clips, filters or masks', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('html[data-gl="live"]', { timeout: 90_000 })
  const offenders = await page.evaluate(() => {
    const out: string[] = []
    for (let el: Element | null = document.querySelector('[data-hero-panel]')?.parentElement ?? null; el; el = el.parentElement) {
      const cs = getComputedStyle(el)
      const tag = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''}`
      if (cs.clipPath !== 'none') out.push(`${tag} clip-path ${cs.clipPath}`)
      if (cs.filter !== 'none') out.push(`${tag} filter ${cs.filter}`)
      if (cs.maskImage !== 'none') out.push(`${tag} mask ${cs.maskImage}`)
      if (cs.mixBlendMode !== 'normal') out.push(`${tag} mix-blend-mode ${cs.mixBlendMode}`)
      if (cs.backdropFilter !== 'none' && el.tagName !== 'BODY') out.push(`${tag} backdrop-filter ${cs.backdropFilter}`)
    }
    return out
  })
  expect(offenders).toEqual([])
  const panel = await page.locator('[data-hero-panel]').evaluate((el) => getComputedStyle(el).backdropFilter)
  expect(panel).not.toBe('none')
})
