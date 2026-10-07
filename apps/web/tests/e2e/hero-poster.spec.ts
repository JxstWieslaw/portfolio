import { expect, test, type Page } from '@playwright/test'

/**
 * The hero poster (hero monolith spec § 7, slice S2) in a real browser, in the default build, where the monolith is
 * NOT the default. Everything here reaches the poster through the preview flag `?hero=a`, and keeps the engine away
 * with the paths that must never mount it (`?nogl=1`, reduced motion, Save-Data), so the poster is what is on screen
 * and nothing races it. The engine going live over the poster is in `hero.spec.ts` (it needs SwiftShader).
 *
 * The build where the monolith is the default is `hero-poster-on.spec.ts`.
 *
 * No test here asserts a timing: LCP is not measured in this file, and that is stated in the PR rather than implied.
 */

test.skip(process.env.NEXT_PUBLIC_HERO === 'monolith', 'the default-on build is covered by hero-poster-on.spec.ts')

const POSTER = '.hero-poster'
const HERO_CHUNK = /\/_next\/static\/chunks\/hero\.[0-9a-f]+\.js/
const POSTER_FILE = /\/posters\/hero-[a-z]+-[a-z]+\.[0-9a-f]{8}\.(?:avif|webp)/

function watch(page: Page): { posters: string[]; chunks: string[] } {
  const seen = { posters: [] as string[], chunks: [] as string[] }
  page.on('request', (request) => {
    const url = request.url()
    if (POSTER_FILE.test(url)) seen.posters.push(url)
    if (HERO_CHUNK.test(url)) seen.chunks.push(url)
  })
  return seen
}

const display = (page: Page, selector: string): Promise<string> => page.locator(selector).first().evaluate((el) => getComputedStyle(el).display)

test.describe('a default visit', () => {
  test('is the painted hero it always was: no poster shown, none fetched, no preview image', async ({ page }) => {
    const seen = watch(page)
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-hero-mode', 'off')
    expect(await display(page, POSTER)).toBe('none')
    // The painted 2D cubes are drawn exactly as before.
    await expect(page.locator('canvas[data-f="monolith"]')).toHaveAttribute('data-rung', /.+/)
    await page.waitForTimeout(1500)
    expect(seen.posters).toEqual([])
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(0)
  })
})

test.describe('the kill switch', () => {
  test('?hero=off is the painted hero: no poster, no engine, in any build', async ({ page }) => {
    const seen = watch(page)
    await page.goto('/?hero=off')
    await expect(page.locator('html')).toHaveAttribute('data-hero-mode', 'off')
    expect(await display(page, POSTER)).toBe('none')
    await expect(page.locator('canvas[data-f="monolith"]')).toHaveAttribute('data-rung', /.+/)
    await page.waitForTimeout(1500)
    expect(seen.posters).toEqual([])
    expect(seen.chunks).toEqual([])
    await expect(page.locator('canvas[data-hero-canvas]')).toHaveCount(0)
  })
})

test.describe('the poster as the hero (?hero=a without the engine)', () => {
  test('is on screen from the first paint, fills the hero backdrop, and replaces the painted cubes', async ({ page }) => {
    const seen = watch(page)
    await page.goto('/?hero=a&nogl=1')
    await expect(page.locator('html')).toHaveAttribute('data-hero-mode', 'on')
    expect(await display(page, POSTER)).toBe('block')

    const img = page.locator('.hero-poster-full')
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 15_000 }).toBe(true)
    // The orientation decides the file: a portrait phone gets the portrait render, a desktop the landscape one.
    const viewport = page.viewportSize()
    const portrait = (viewport?.height ?? 0) > (viewport?.width ?? 0)
    const current = await img.evaluate((el: HTMLImageElement) => el.currentSrc)
    expect(current).toMatch(new RegExp(`/posters/hero-${portrait ? 'portrait' : 'landscape'}-full\\.[0-9a-f]{8}\\.(avif|webp)$`))
    expect(seen.posters.some((url) => url === current)).toBe(true)

    // Nothing is painted twice: the painted hero stands down while the poster is the hero.
    await expect(page.locator('canvas[data-f="monolith"]')).not.toHaveAttribute('data-rung', /.+/)
  })

  test('cannot shift layout: out of flow, intrinsic size on the image, the same page height with and without it', async ({ page }) => {
    await page.goto('/?hero=off')
    const heightOff = await page.evaluate(() => document.documentElement.scrollHeight)
    const heroOff = await page.locator('#hero').boundingBox()

    await page.goto('/?hero=a&nogl=1')
    const poster = page.locator(POSTER)
    await expect(poster).toBeVisible()
    expect(await poster.evaluate((el) => getComputedStyle(el).position)).toBe('absolute')

    // The <img> carries its intrinsic size, so even before decode the browser knows the ratio.
    const dims = await page.locator('.hero-poster-full').evaluate((el: HTMLImageElement) => ({ w: el.getAttribute('width'), h: el.getAttribute('height'), position: getComputedStyle(el).position, decoding: el.decoding }))
    expect(Number(dims.w)).toBeGreaterThan(0)
    expect(Number(dims.h)).toBeGreaterThan(0)
    expect(dims.position).toBe('absolute')
    expect(dims.decoding).toBe('async')

    // The poster's box is the backdrop's: the viewport, from the top of the hero.
    const viewport = page.viewportSize()
    const box = await poster.boundingBox()
    expect(box?.width).toBeCloseTo(viewport?.width ?? 0, 0)
    expect(box?.height).toBeCloseTo(viewport?.height ?? 0, 0)

    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(heightOff)
    const heroOn = await page.locator('#hero').boundingBox()
    expect(heroOn?.height).toBe(heroOff?.height)
    expect(heroOn?.width).toBe(heroOff?.width)
  })

  test('adds no layout shift of its own to the load', async ({ page }) => {
    // The sum of layout-shift entries over the load, with the poster on and with it off: the poster must not add any.
    const cls = async (url: string): Promise<number> => {
      await page.addInitScript(() => {
        const w = window as unknown as { __cls: number }
        w.__cls = 0
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!entry.hadRecentInput) w.__cls += entry.value
        }).observe({ type: 'layout-shift', buffered: true })
      })
      await page.goto(url)
      await page.waitForLoadState('load')
      await page.waitForTimeout(2500)
      return page.evaluate(() => (window as unknown as { __cls: number }).__cls)
    }
    const off = await cls('/?hero=off')
    const on = await cls('/?hero=a&nogl=1')
    expect(on).toBeLessThanOrEqual(off + 0.001)
  })

  test('is hidden from assistive technology and has no text alternative to read out', async ({ page }) => {
    await page.goto('/?hero=a&nogl=1')
    const poster = page.locator(POSTER)
    await expect(poster).toHaveAttribute('aria-hidden', 'true')
    for (const alt of await poster.locator('img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('alt')))) expect(alt).toBe('')
  })

  test('says it is the poster: html[data-hero="poster"] once the gate has decided', async ({ page }) => {
    await page.goto('/?hero=a&nogl=1')
    await expect(page.locator('html')).toHaveAttribute('data-hero', 'poster', { timeout: 20_000 })
  })
})

test.describe('the paths that never mount the engine', () => {
  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('shows the static poster, never mounts the engine, and never loads the scroll-floor stills', async ({ page }) => {
      const seen = watch(page)
      await page.goto('/?hero=a')
      // The gate runs after the LCP settles: its decision is the marker.
      await expect(page.locator('html')).toHaveAttribute('data-hero', 'poster', { timeout: 20_000 })
      expect(await display(page, POSTER)).toBe('block')
      expect(await display(page, '.hero-poster-floor')).toBe('none')
      await expect(page.locator('canvas[data-hero-canvas]')).toHaveCount(0)
      await expect(page.locator('[data-assembly]')).toHaveAttribute('data-assembly', 'idle')
      await page.waitForTimeout(1500)
      expect(seen.chunks).toEqual([])
      expect(seen.posters.filter((url) => /-(mid|dust)\./.test(url))).toEqual([])
      expect(seen.posters.some((url) => /-full\./.test(url))).toBe(true)
    })
  })

  test('Save-Data shows the poster and never fetches the engine', async ({ page }) => {
    const seen = watch(page)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true, effectiveType: '4g' } })
    })
    await page.goto('/?hero=a')
    await expect(page.locator('html')).toHaveAttribute('data-hero', 'poster', { timeout: 20_000 })
    expect(await display(page, POSTER)).toBe('block')
    await page.waitForTimeout(1500)
    expect(seen.chunks).toEqual([])
    await expect(page.locator('canvas[data-hero-canvas]')).toHaveCount(0)
  })
})

test.describe('the scroll floor (the poster triptych)', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'scroll-driven animation is asserted in Chromium; other engines keep the assembled still')
  })

  test('lays the mid and then the dust still over the assembled one as the hero scrolls', async ({ page }) => {
    const seen = watch(page)
    await page.goto('/?hero=a&nogl=1')
    await expect(page.locator('html')).toHaveAttribute('data-hero', 'poster', { timeout: 20_000 })
    test.skip(!(await page.evaluate(() => CSS.supports('animation-timeline: scroll()'))), 'this Chromium has no scroll-driven animation')
    expect(await display(page, '.hero-poster-floor')).toBe('block')

    const opacity = (selector: string): Promise<number> => page.locator(selector).first().evaluate((el) => Number(getComputedStyle(el).opacity))
    const vh = (page.viewportSize()?.height ?? 800) * 0.9
    await expect.poll(() => opacity('.hero-poster-mid')).toBeCloseTo(0, 1)
    await page.evaluate((y) => window.scrollTo(0, y), vh * 0.45)
    await expect.poll(() => opacity('.hero-poster-mid')).toBeCloseTo(1, 1)
    await expect.poll(() => opacity('.hero-poster-dust')).toBeCloseTo(0, 1)
    await page.evaluate((y) => window.scrollTo(0, y), vh * 0.85)
    await expect.poll(() => opacity('.hero-poster-dust')).toBeCloseTo(1, 1)
    // Scrolling up reassembles it: the same animation, backwards.
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect.poll(() => opacity('.hero-poster-dust')).toBeCloseTo(0, 1)

    expect(seen.posters.some((url) => /-mid\./.test(url))).toBe(true)
    expect(seen.posters.some((url) => /-dust\./.test(url))).toBe(true)
  })
})

test.describe('the files', () => {
  test('are served immutable under content-hashed names, with the manifest revalidated', async ({ request }) => {
    const manifest = await request.get('/posters/manifest.json')
    expect(manifest.ok()).toBe(true)
    expect(manifest.headers()['cache-control']).toContain('must-revalidate')
    const body = (await manifest.json()) as { posters: { avif: { file: string }; webp: { file: string } }[]; og: { file: string } }

    const avif = await request.get(`/posters/${body.posters[0]?.avif.file}`)
    expect(avif.ok()).toBe(true)
    expect(avif.headers()['content-type']).toContain('image/avif')
    expect(avif.headers()['cache-control']).toContain('immutable')
    expect(avif.headers()['cache-control']).toContain('max-age=31536000')

    const og = await request.get(`/og/${body.og.file}`)
    expect(og.ok()).toBe(true)
    expect(og.headers()['content-type']).toContain('image/png')
    expect(og.headers()['cache-control']).toContain('immutable')
  })
})
