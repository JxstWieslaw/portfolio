import { expect, test, type Page } from '@playwright/test'

/**
 * The hero paragraph and the glass on a phone — hero monolith spec § 14 question 8 and § 4.7.
 *
 * Below 640px the paragraph is the short variant; from 640px up it is the full one. Below 768px the hero panel's glass is
 * lighter (60 percent) so the monolith reads through; at 768px and up it is the brief's 72 percent. Either way the blur
 * is still computed, so the Chromium-and-Edge backdrop-filter fix from #64 is not undone. Static page, no WebGL needed.
 */

const PANEL = '[data-hero-panel]'

async function state(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element | null): boolean => (el ? getComputedStyle(el).display !== 'none' : false)
    const panel = document.querySelector('[data-hero-panel]') as HTMLElement
    const sub = document.querySelector('.hero-sub') as HTMLElement
    const cs = getComputedStyle(panel)
    return {
      short: visible(document.querySelector('.hero-sub-short')),
      full: visible(document.querySelector('.hero-sub-full')),
      background: cs.backgroundColor,
      blur: cs.backdropFilter || (cs as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter || 'none',
      panelHeight: Math.round(panel.getBoundingClientRect().height),
      subText: sub.innerText,
    }
  })
}

test('390 px with the monolith on (?hero=a): the short standfirst and the lighter glass, with the blur intact', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?hero=a')
  await page.locator(PANEL).waitFor()
  const s = await state(page)
  expect(s.short).toBe(true)
  expect(s.full).toBe(false)
  expect(s.subText).toContain('Hospital operations, learning platforms')
  expect(s.subText).toContain('real-time 3D on the web that holds frame rate on a mid-range phone')
  expect(s.subText).not.toContain('AI agent fleet')
  expect(s.background).toBe('rgba(17, 22, 29, 0.6)')
  expect(s.blur).toMatch(/blur\(12px\)/)
})

test('the default build is exactly the full copy and the 72 percent glass at 390 px (no unapproved copy change)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.locator(PANEL).waitFor()
  await expect(page.locator('html')).toHaveAttribute('data-hero-mode', 'off')
  const s = await state(page)
  expect(s.short).toBe(false)
  expect(s.full).toBe(true)
  expect(s.subText).toContain('An AI agent fleet runs review')
  expect(s.subText).not.toContain('Technical direction by day;')
  expect(s.background).toBe('rgba(17, 22, 29, 0.72)')
})

test('?hero=off at 390 px is the default copy even with a monolith build flag in the query', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?hero=a&hero=off')
  await page.locator(PANEL).waitFor()
  const s = await state(page)
  expect(s.full).toBe(true)
  expect(s.short).toBe(false)
})

test('639 px is still short and 640 px is full (monolith on)', async ({ page }) => {
  await page.setViewportSize({ width: 639, height: 900 })
  await page.goto('/?hero=a')
  await page.locator(PANEL).waitFor()
  expect((await state(page)).short).toBe(true)
  await page.setViewportSize({ width: 640, height: 900 })
  const s = await state(page)
  expect(s.short).toBe(false)
  expect(s.full).toBe(true)
})

test('820 px (monolith on): the full standfirst and the 72 percent glass from the brief', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.goto('/?hero=a')
  await page.locator(PANEL).waitFor()
  const s = await state(page)
  expect(s.full).toBe(true)
  expect(s.short).toBe(false)
  expect(s.subText).toContain('AI agent fleet')
  expect(s.background).toBe('rgba(17, 22, 29, 0.72)')
  expect(s.blur).toMatch(/blur\(12px\)/)
})

test('1440 px (monolith on): the full standfirst and the 72 percent glass from the brief', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/?hero=a')
  await page.locator(PANEL).waitFor()
  const s = await state(page)
  expect(s.full).toBe(true)
  expect(s.background).toBe('rgba(17, 22, 29, 0.72)')
})

test('the short copy makes the 390 px panel at least 100 px shorter, so the CTAs reach the fold', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?hero=a')
  await page.locator(PANEL).waitFor()
  const short = (await state(page)).panelHeight
  // Force the full variant for comparison, in this page only.
  await page.addStyleTag({ content: '.hero-sub-full{display:inline!important}.hero-sub-short{display:none!important}' })
  const full = (await state(page)).panelHeight
  expect(full - short).toBeGreaterThanOrEqual(100)
})
