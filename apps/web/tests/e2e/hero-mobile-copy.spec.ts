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

test('390 px: the short standfirst and the lighter glass, with the blur intact', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
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

test('639 px is still short and 640 px is full', async ({ page }) => {
  await page.setViewportSize({ width: 639, height: 900 })
  await page.goto('/')
  await page.locator(PANEL).waitFor()
  expect((await state(page)).short).toBe(true)
  await page.setViewportSize({ width: 640, height: 900 })
  const s = await state(page)
  expect(s.short).toBe(false)
  expect(s.full).toBe(true)
})

test('820 px: the full standfirst and the brief\'s 72 percent glass', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.goto('/')
  await page.locator(PANEL).waitFor()
  const s = await state(page)
  expect(s.full).toBe(true)
  expect(s.short).toBe(false)
  expect(s.subText).toContain('AI agent fleet')
  expect(s.background).toBe('rgba(17, 22, 29, 0.72)')
  expect(s.blur).toMatch(/blur\(12px\)/)
})

test('1440 px: the full standfirst and the brief\'s 72 percent glass', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.locator(PANEL).waitFor()
  const s = await state(page)
  expect(s.full).toBe(true)
  expect(s.background).toBe('rgba(17, 22, 29, 0.72)')
})

test('the short copy makes the 390 px panel at least 100 px shorter, so the monolith has room', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.locator(PANEL).waitFor()
  const short = (await state(page)).panelHeight
  // Force the full variant for comparison, in this page only.
  await page.addStyleTag({ content: '.hero-sub-full{display:inline!important}.hero-sub-short{display:none!important}' })
  const full = (await state(page)).panelHeight
  expect(full - short).toBeGreaterThanOrEqual(100)
})
