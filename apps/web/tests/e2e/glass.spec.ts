import { expect, test } from '@playwright/test'

/**
 * The glass blur survives the production CSS build.
 *
 * Tailwind v4 runs the stylesheet through lightningcss with Safari 16.4 as a
 * target. When a rule hand-writes BOTH `backdrop-filter` and
 * `-webkit-backdrop-filter`, lightningcss keeps only the prefixed one, so
 * Chromium (which has no prefixed property) computed `backdrop-filter: none`
 * and the glass panels were not blurring the WebGL layers behind them. The
 * source now writes the unprefixed property only and lets lightningcss add the
 * prefix. This file fails on a build that has the old pattern.
 *
 * It must run against a PRODUCTION build: `next dev` does not minify or
 * transform the CSS the same way (the playwright webServer builds first).
 */

/** Every selector in globals.css that authors a backdrop-filter. */
const GLASS_SELECTORS = ['.glass', '.hairline-cell', '.placeholder-card', '.kpi[data-variant="proof"]']

test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium is the engine that lacks the -webkit- alias')

test('the built stylesheet gives every blurring rule the unprefixed backdrop-filter', async ({ page }) => {
  await page.goto('/')
  const hrefs = await page.$$eval('link[rel="stylesheet"]', (links) => links.map((l) => (l as HTMLLinkElement).href))
  expect(hrefs.length).toBeGreaterThan(0)

  const offenders: string[] = []
  let blurRules = 0
  for (const href of hrefs) {
    const css = await (await page.request.get(href)).text()
    // Flat declaration blocks are enough: nesting is flattened by the build.
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1] ?? ''
      const body = match[2] ?? ''
      const props = body.split(';').map((d) => (d.split(':')[0] ?? '').trim())
      if (!props.includes('backdrop-filter') && !props.includes('-webkit-backdrop-filter')) continue
      // Tailwind's own `backdrop-blur-*` utilities and `::backdrop` rules are not what this guards.
      if (/--tw-backdrop|::backdrop/.test(selector + body)) continue
      blurRules += 1
      const unprefixed = props.includes('backdrop-filter')
      const prefixed = props.includes('-webkit-backdrop-filter')
      if (!unprefixed || !prefixed) offenders.push(`${selector.trim().slice(-60)} unprefixed=${unprefixed} prefixed=${prefixed}`)
    }
  }
  // glass, the merged hairline-cell + placeholder-card rule, and the proof KPI.
  expect(blurRules).toBeGreaterThanOrEqual(3)
  expect(offenders).toEqual([])
})

test('the hero panel computes a real backdrop-filter, not none', async ({ page }) => {
  await page.goto('/?nogl=1')
  const panel = page.locator('[data-hero-panel]')
  await expect(panel).toBeVisible()
  const value = await panel.evaluate((el) => getComputedStyle(el).backdropFilter)
  expect(value).not.toBe('none')
  expect(value).toMatch(/blur\(/)
})

test('every glass surface on the page computes a real backdrop-filter', async ({ page }) => {
  await page.goto('/?nogl=1')
  const result = await page.evaluate((selectors) => {
    const out: Record<string, { count: number; none: number }> = {}
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector))
      out[selector] = { count: nodes.length, none: nodes.filter((n) => getComputedStyle(n).backdropFilter === 'none').length }
    }
    return out
  }, GLASS_SELECTORS)

  // `.glass` and the proof KPIs are always rendered on the home page; the others only if the page uses them.
  expect(result['.glass']?.count ?? 0).toBeGreaterThan(0)
  for (const [selector, { none }] of Object.entries(result)) expect(none, `${selector} elements with backdrop-filter: none`).toBe(0)
})
