import { expect, test } from '@playwright/test'

const WIDTHS = [390, 834, 1440, 2560] as const

// This file sets its own viewport per test, so running it under all five Playwright
// projects would produce 20 near-identical baselines. One engine is enough.
test.skip(({ browserName }) => browserName !== 'chromium', 'visual baselines are chromium-only')

// `browserName` alone is not sufficient: `desktop`, `mobile` and `ultrawide` all run
// on Chromium (only `webkit` and `tablet` use WebKit), so without this the file would
// still execute under three projects, each writing its own project-suffixed snapshot
// set — three near-identical baselines instead of one. `testInfo` (which carries the
// project name) is only available inside a test/hook body, not in the `ConditionBody`
// callback above, hence the separate `beforeEach`.
// Playwright's fixture injection requires the first parameter to be an object
// destructuring pattern (even an empty one) to detect which fixtures are used;
// a plain named parameter throws at runtime. Empty is correct here — the hook
// only needs `testInfo`, which is Playwright's second, non-fixture argument.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'visual baselines run once, on the desktop project')
})

for (const width of WIDTHS) {
  test(`home page layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // The decorative canvas is excluded deliberately: M2 replaces its internals with
    // WebGL, and this suite must not fail on that planned change. This is a CSS hide,
    // NOT Playwright's `mask` option — verified empirically while writing this suite
    // that `mask` is the wrong tool here. `mask` paints an opaque box over a locator's
    // full BOUNDING RECT, regardless of stacking order. `SectionBackdrop`'s wrapper is
    // `absolute inset-0` on its (tall) parent `<section>`, so its bounding box spans
    // that section's entire height, not just one screen's worth — masking it blotted
    // out real headings and body copy sitting in front of it (confirmed by comparing a
    // masked capture against an unmasked one: the hero's h1, its CTA, all six sibling
    // sections' copy were replaced by solid mask color). Hiding just the `<canvas
    // data-f>` element via `visibility: hidden` respects paint order instead of
    // covering a rectangle, so real content stays visible; the section's CSS wash/scrim
    // (`SectionBackdrop`'s "rung 5 ... always painted", untouched by the WebGL work)
    // remains as the background in its place. `FieldCanvas`'s own docs promise M2 "keeps
    // this component's props, DOM position and `data-f` attribute unchanged", so this
    // selector survives that rewrite.
    await page.addStyleTag({ content: 'canvas[data-f] { visibility: hidden !important; }' })

    await expect(page).toHaveScreenshot(`home-${width}.png`, {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    })
  })
}
