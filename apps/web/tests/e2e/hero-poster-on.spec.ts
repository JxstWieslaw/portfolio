import { expect, test, type Page } from '@playwright/test'

/**
 * The build where the monolith is the default (`NEXT_PUBLIC_HERO=monolith`, the same thing S3 will get from flipping
 * `HERO_DEFAULT_ON`): the poster is in the first HTML, eager, with a noscript copy and an OG image, and `?hero=off`
 * still gives the painted hero back.
 *
 * It only runs in a build made with that variable (CI has a step for it), and in no other: in the default build the
 * same assertions would be false by design.
 *
 *   NEXT_PUBLIC_HERO=monolith npx playwright test tests/e2e/hero-poster-on.spec.ts
 */

test.skip(process.env.NEXT_PUBLIC_HERO !== 'monolith', 'needs an app built with NEXT_PUBLIC_HERO=monolith')

const HERO_CHUNK = /\/_next\/static\/chunks\/hero\.[0-9a-f]+\.js/

const display = (page: Page, selector: string): Promise<string> => page.locator(selector).first().evaluate((el) => getComputedStyle(el).display)

test.describe('JavaScript off', () => {
  test.use({ javaScriptEnabled: false })

  test('the poster is the hero: in the HTML, visible, decoded, with the noscript still beside it', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-hero-mode', 'on')
    expect(await display(page, '.hero-poster')).toBe('block')
    const img = page.locator('.hero-poster-full')
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 15_000 }).toBe(true)
    // With scripting off the <noscript> content is real DOM: a plain <img> with its size.
    const plain = page.locator('noscript img')
    await expect(plain).toHaveCount(1)
    expect(Number(await plain.getAttribute('width'))).toBeGreaterThan(0)
    expect(Number(await plain.getAttribute('height'))).toBeGreaterThan(0)
    expect(await plain.getAttribute('alt')).toBe('')
    // The heading and the copy are all there: the poster is a backdrop, not the content.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})

test.describe('JavaScript on, the engine kept away (?nogl=1)', () => {
  test('the poster is the hero with no query string, the painted cubes stand down, the preview image is the render', async ({ page, request }) => {
    const urls: string[] = []
    page.on('request', (r) => urls.push(r.url()))
    await page.goto('/?nogl=1')
    await expect(page.locator('html')).toHaveAttribute('data-hero-mode', 'on')
    expect(await display(page, '.hero-poster')).toBe('block')
    const img = page.locator('.hero-poster-full')
    expect(await img.getAttribute('loading')).toBe('eager')
    expect(await img.getAttribute('fetchpriority')).toBe('low')
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 15_000 }).toBe(true)
    await expect(page.locator('canvas[data-f="monolith"]')).not.toHaveAttribute('data-rung', /.+/)
    await expect(page.locator('html')).toHaveAttribute('data-hero', 'poster', { timeout: 20_000 })

    // The link preview is the same render, at the size the spec gives.
    const og = await page.locator('meta[property="og:image"]').getAttribute('content')
    expect(og).toMatch(/\/og\/hero\.[0-9a-f]{8}\.png$/)
    expect(await page.locator('meta[property="og:image:width"]').getAttribute('content')).toBe('1200')
    expect(await page.locator('meta[property="og:image:height"]').getAttribute('content')).toBe('630')
    expect(await page.locator('meta[name="twitter:image"]').getAttribute('content')).toBe(og)
    const file = await request.get(new URL(og ?? '', 'http://localhost:3000').pathname)
    expect(file.ok()).toBe(true)
    expect(file.headers()['content-type']).toContain('image/png')
    expect(urls.some((u) => HERO_CHUNK.test(u))).toBe(false)
  })
})

test.describe('the kill switch in a build where the monolith is the default', () => {
  test('?hero=off gives back the painted hero: no poster, no preview-flag side effects, no engine', async ({ page }) => {
    const chunks: string[] = []
    page.on('request', (r) => {
      if (HERO_CHUNK.test(r.url())) chunks.push(r.url())
    })
    await page.goto('/?hero=off')
    await expect(page.locator('html')).toHaveAttribute('data-hero-mode', 'off')
    expect(await display(page, '.hero-poster')).toBe('none')
    await expect(page.locator('canvas[data-f="monolith"]')).toHaveAttribute('data-rung', /.+/)
    await page.waitForTimeout(9500)
    expect(chunks).toEqual([])
    await expect(page.locator('canvas[data-hero-canvas]')).toHaveCount(0)
  })
})
