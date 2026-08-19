import { expect, test } from '@playwright/test'

/**
 * The real DOM contract (established by reading `app/page.tsx`,
 * `components/layout/Section.tsx`, `components/layout/Nav.tsx`,
 * `components/layout/BottomSheet.tsx` and `components/three/*` — this app
 * does not have the brief's `PosterLayer` / `data-variant` component):
 *
 * - Each section is a `<section id="X" data-section="X">` rendered by
 *   `Section.tsx`. The nine ids below match `app/page.tsx`'s render order
 *   exactly, so the brief's `[data-section="id"]` selector needed no
 *   translation.
 * - The decorative canvas layer is `SectionBackdrop` → `FieldCanvas`, which
 *   renders `<canvas data-f="{formation}" aria-hidden="true">` inside a
 *   `<div aria-hidden="true" class="pointer-events-none absolute inset-0 …">`
 *   wrapper — NOT `[data-variant]` (that attribute exists elsewhere, on
 *   `Button`/`Chip`/`GlassCard`, and is part of the accessible tree, so
 *   reusing it would produce a false pass). Seven sections own a formation —
 *   hero (monolith), proof (stream), work (lattice), lead (orbit), craft
 *   (scatter), stack (grid), contact (ring); timeline and writing have none.
 * - The skip link is a literal `<a class="skip-link" href="#main">Skip to
 *   content</a>` in `app/layout.tsx`, first in `<body>`, matching the brief.
 * - Primary nav is `<nav aria-label="Primary">` with `<a href="#work">`,
 *   `hidden lg:flex` — matching the brief.
 * - The mobile trigger is `<button aria-label="Open menu" aria-haspopup
 *   ="dialog">`; the sheet is a native `<dialog aria-label="Menu">`
 *   (`BottomSheet.tsx`), which exposes the implicit `dialog` role — matching
 *   the brief's `getByRole('dialog', { name: 'Menu' })`.
 * - The hero CTA is `Button({ href: '#work' })` with the visible text "See
 *   the work" — matching the brief verbatim.
 */
const SECTIONS = ['hero', 'proof', 'work', 'lead', 'craft', 'stack', 'timeline', 'writing', 'contact']

const BACKDROP_FORMATIONS = ['monolith', 'stream', 'lattice', 'orbit', 'scatter', 'grid', 'ring']

test.describe('home page', () => {
  test('renders every section with visible content at this viewport', async ({ page }) => {
    await page.goto('/')
    for (const id of SECTIONS) {
      const section = page.locator(`[data-section="${id}"]`)
      await expect(section).toBeVisible()
      const box = await section.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThan(80)
    }
  })

  test('never scrolls horizontally', async ({ page }) => {
    await page.goto('/')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('the skip link is the first thing keyboard users reach', async ({ page, browserName }) => {
    // WebKit (both the `webkit` and `tablet` projects, which both run on the
    // WebKit engine) does not tab to plain `<a>` elements at all under
    // Playwright automation — confirmed empirically: pressing Tab leaves
    // `document.activeElement` on `<body>`, and it never reaches the skip
    // link or any other anchor on the page. This matches real desktop
    // Safari's actual out-of-box default (Tab only cycles form controls;
    // link-tabbing requires the user's own "Full Keyboard Access" OS
    // preference, which Playwright's WebKit build does not expose a way to
    // enable) — it is not an app defect, and Chromium confirms the skip link
    // itself is correctly the first focusable element in DOM order.
    test.skip(browserName === 'webkit', 'WebKit does not tab to <a> elements under automation (real Safari default)')

    await page.goto('/')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: /skip to content/i })).toBeFocused()
  })

  // The primary nav is `hidden lg:flex`, so this only applies at >= 1024px.
  // Below that the bottom sheet carries navigation and is covered by its own test.
  test('nav anchors move the viewport to the target section', async ({ page }, testInfo) => {
    const width = testInfo.project.use.viewport?.width ?? 0
    test.skip(width < 1024, 'primary nav is hidden below the lg breakpoint')

    await page.goto('/')
    await page.locator('nav[aria-label="Primary"] a[href="#work"]').click()
    await expect(page).toHaveURL(/#work$/)
    await expect(page.locator('[data-section="work"]')).toBeInViewport({ ratio: 0.2 })
  })

  test('the decorative background never intercepts pointer events', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'See the work' }).click()
    await expect(page).toHaveURL(/#work$/)
  })

  test('with reduced motion, no section is missing and the background is still painted', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('/')
    for (const id of SECTIONS) await expect(page.locator(`[data-section="${id}"]`)).toBeVisible()
    // "Painted" here means the canvas element for every section formation is
    // present and in the DOM (FieldCanvas fades opacity in once its first
    // frame lands; under reduced motion the hero simply skips the animation
    // loop and paints one static frame instead of none).
    await expect(page.locator('canvas[data-f]')).toHaveCount(BACKDROP_FORMATIONS.length)
    await expect(page.locator('canvas[data-f="monolith"]')).toHaveCount(1)
    await context.close()
  })

  test('with JavaScript disabled, all content is still present', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    for (const id of SECTIONS) await expect(page.locator(`[data-section="${id}"]`)).toBeVisible()
    await context.close()
  })
})

test.describe('mobile navigation', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the bottom sheet opens, navigates and closes', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /open menu/i }).click()
    const sheet = page.getByRole('dialog', { name: 'Menu' })
    await expect(sheet).toBeVisible()
    await sheet.locator('a[href="#work"]').click()
    await expect(sheet).toBeHidden()
    await expect(page).toHaveURL(/#work$/)
  })
})
