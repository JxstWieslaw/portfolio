import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/** See `tests/e2e/home.spec.ts` for the full DOM-contract writeup. */
const BACKDROP_FORMATIONS = ['monolith', 'stream', 'lattice', 'orbit', 'scatter', 'grid', 'ring']

/**
 * FIXED (Task 18 finding, closed by b4a08eb; the fix was later made
 * responsive rather than unconditional — see `ChipScrollerList`):
 *
 * Below the 768px `md` breakpoint, `ChipScroller` (`components/ui/Chip.tsx`,
 * backing `.chip-scroller` in `app/globals.css`) renders the proof-strip's
 * eight domain chips as an `overflow-x: auto` row with no wrapping. That used
 * to be a horizontally scrollable region with no `tabindex`, reachable by
 * touch or mouse drag but not by keyboard — axe's `scrollable-region-focusable`
 * rule (serious, WCAG 2.1.1) correctly flagged it, reproducing only on the
 * `mobile` project (Pixel 5, 393px) where the row is a real scroll container.
 * `ChipScrollerList` gives the `<ul>` a tab stop exactly there — below
 * 768px, where the row genuinely scrolls — and this test asserts that
 * violation stays gone on the `mobile` project.
 */
test('home page has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()

  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])

  // Informational only — not asserted against, just surfaced for the report.
  const informational = results.violations.filter((v) => v.impact === 'moderate' || v.impact === 'minor')
  if (informational.length > 0) {
    console.log(
      'axe moderate/minor (informational, not blocking):',
      informational.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s)`)
    )
  }
})

test('the decorative background contributes nothing to the accessibility tree', async ({ page }) => {
  await page.goto('/')

  // The canvas layer exists — one `<canvas data-f>` per formation-owning
  // section (see the DOM-contract note in `home.spec.ts`; this app has no
  // `[data-variant]` decorative layer, so the brief's selector is translated
  // to the real attribute `FieldCanvas` renders).
  await expect(page.locator('canvas[data-f]')).toHaveCount(BACKDROP_FORMATIONS.length)

  // ...but every one of them sits inside an aria-hidden subtree, so a screen
  // reader never announces it. All content is real DOM elsewhere on the page.
  const exposed = await page.evaluate(() =>
    Array.from(document.querySelectorAll('canvas[data-f]')).filter(
      (el) => el.closest('[aria-hidden="true"]') === null
    ).length
  )
  expect(exposed).toBe(0)
})

test('every interactive element is reachable by keyboard', async ({ page }) => {
  await page.goto('/')
  const interactive = await page.locator('a[href], button:not([disabled]), input, textarea').count()
  expect(interactive).toBeGreaterThan(20)

  const focusable = await page.evaluate(() => {
    const nodes = document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, textarea')
    return Array.from(nodes).filter((n) => n.tabIndex >= 0).length
  })
  expect(focusable).toBe(interactive)
})
