import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'

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
  test('is the painted hero it always was: no poster shown, none fetched, the static brand card as preview image', async ({ page }) => {
    const seen = watch(page)
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-hero-mode', 'off')
    expect(await display(page, POSTER)).toBe('none')
    // The painted 2D cubes are drawn exactly as before.
    await expect(page.locator('canvas[data-f="monolith"]')).toHaveAttribute('data-rung', /.+/)
    await page.waitForTimeout(1500)
    expect(seen.posters).toEqual([])
    // The hero render is never the preview when the monolith is not the hero; the static brand card always is.
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1)
    await expect(page.locator('meta[name="twitter:image"]')).toHaveCount(1)
    const og = await page.locator('meta[property="og:image"]').getAttribute('content')
    expect(og).toMatch(/^https?:\/\/.+\/brand\/og-default\.png$/)
    expect(og).not.toMatch(/\/og\/hero\./)
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
    // The phone copy variant (monolith on, below 640px) is a deliberate height change of its own and has its own spec;
    // this test is about the poster, so both pages are compared with the same standfirst.
    await page.addStyleTag({ content: '.hero-sub-full{display:inline!important}.hero-sub-short{display:none!important}' })
    const poster = page.locator(POSTER)
    await expect(poster).toBeVisible()
    expect(await poster.evaluate((el) => getComputedStyle(el).position)).toBe('fixed')

    // The <img> carries its intrinsic size, so even before decode the browser knows the ratio.
    const dims = await page.locator('.hero-poster-full').evaluate((el: HTMLImageElement) => ({ w: el.getAttribute('width'), h: el.getAttribute('height'), position: getComputedStyle(el).position, decoding: el.decoding }))
    expect(Number(dims.w)).toBeGreaterThan(0)
    expect(Number(dims.h)).toBeGreaterThan(0)
    expect(dims.position).toBe('absolute')
    expect(dims.decoding).toBe('async')

    // The poster's box is the viewport, from its top edge: the same place as the engine's fixed canvas, whatever sits above the hero.
    const viewport = page.viewportSize()
    const box = await poster.boundingBox()
    expect(box?.width).toBeCloseTo(viewport?.width ?? 0, 0)
    expect(box?.height).toBeCloseTo(viewport?.height ?? 0, 0)
    expect(box?.y).toBeCloseTo(0, 0)
    expect(box?.x).toBeCloseTo(0, 0)

    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(heightOff)
    const heroOn = await page.locator('#hero').boundingBox()
    expect(heroOn?.height).toBe(heroOff?.height)
    expect(heroOn?.width).toBe(heroOff?.width)
  })

  test('is clipped to the hero: once the hero has scrolled away the next section looks the same as without the poster', async ({ page }) => {
    // The two shots must differ only by the poster, so each one waits for the page below the hero to come to rest
    // instead of sleeping a fixed time. Without that, a slow runner photographs the two pages at different points of
    // processes that have nothing to do with the poster, and the mean drifts past the bar (CI saw 2.3 to 7.8):
    //   - `html { scroll-behavior: smooth }` turns a plain scrollTo into an animated scroll, so the scroll is made
    //     instant and the shot waits for scrollY to be the target;
    //   - each section's FieldCanvas paints at idle once it is near the viewport, then cross-fades in from opacity 0;
    //   - Reveal hides below-the-fold blocks and fades them in (560 ms + stagger) when the observer fires;
    //   - the nav condenses on scroll with its own transitions.
    // Scroll-driven animations (the section headings, the poster's floor stills) are a function of scrollY, so the
    // same scroll position gives the same frame and they need no waiting.
    const shot = async (url: string): Promise<Buffer> => {
      await page.goto(url)
      await page.waitForLoadState('load')
      const target = await page.evaluate(() => {
        const r = document.querySelector('#hero')?.getBoundingClientRect()
        const y = Math.round((r?.bottom ?? 0) + window.scrollY + 20)
        window.scrollTo({ top: y, behavior: 'instant' })
        return Math.min(y, document.documentElement.scrollHeight - window.innerHeight)
      })
      await page.waitForFunction(
        (y) => {
          if (Math.abs(window.scrollY - y) > 1) return false
          const inView = (el: Element): boolean => {
            const r = el.getBoundingClientRect()
            return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight
          }
          // A section canvas in view has painted (its inline opacity is 1), unless its rung is the CSS wash.
          const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas[data-f]:not([data-f="monolith"])')).filter(inView)
          if (!canvases.every((c) => c.dataset['rung'] === 'wash' || (c.dataset['rung'] !== undefined && c.style.opacity === '1'))) return false
          // Every reveal target in view has been revealed (the observer, the poll or the 4 s deadline).
          if (!Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]')).filter(inView).every((el) => el.dataset['revealed'] === 'true')) return false
          // And nothing on screen is mid-transition: the canvas cross-fades, the reveals and the nav have all finished.
          // (Off-screen ones, such as the deadline's reveals further down, cannot change the shot.)
          return document.getAnimations().every((a) => {
            if (!(a instanceof CSSTransition) || a.playState === 'finished') return true
            const target = a.effect instanceof KeyframeEffect ? a.effect.target : null
            return target !== null && !inView(target)
          })
        },
        target,
        { polling: 'raf', timeout: 15_000 },
      )
      return page.screenshot()
    }
    const without = await shot('/?hero=off&nogl=1')
    const withPoster = await shot('/?hero=a&nogl=1')
    const a = await sharp(without).removeAlpha().greyscale().raw().toBuffer()
    const b = await sharp(withPoster).removeAlpha().greyscale().raw().toBuffer()
    let sum = 0
    for (let i = 0; i < a.length; i++) sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0))
    // Settled, the two shots are pixel-identical (a mean of 0 in repeated runs on every project); a poster showing below
    // the hero would cover this whole viewport and put the mean tens of levels up. This checks what a visitor sees: the
    // sections after the hero paint over a fixed poster as well, so the clip-path alone being lost would not show here.
    expect(sum / a.length).toBeLessThan(2)
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
    await expect(page.locator('[data-hero-poster-clip]')).toHaveAttribute('aria-hidden', 'true')
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
    // Save-Data asked for fewer downloads: the poster, but never the scroll-floor stills (a scroll effect is not worth them).
    await expect(page.locator('html')).toHaveAttribute('data-hero-saver', '')
    expect(await display(page, '.hero-poster-floor')).toBe('none')
    await page.evaluate(() => window.scrollTo(0, 400))
    await page.waitForTimeout(1000)
    expect(seen.posters.filter((url) => /-(mid|dust)./.test(url))).toEqual([])
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
