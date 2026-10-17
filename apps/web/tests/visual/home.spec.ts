import { expect, test } from '@playwright/test'

const WIDTHS = [390, 834, 1440, 2560] as const

/**
 * Visual regression for the home page, on LINUX baselines only.
 *
 * Playwright suffixes every snapshot with the platform it was captured on, and font
 * rasterisation differs between win32 and linux, so one set can never satisfy both. Linux is
 * the authority: the baselines (`home-<width>-desktop-linux.png`) are generated and compared
 * inside the pinned Playwright container in CI (`visual` job in .github/workflows/ci.yml,
 * `visual-baselines.yml` to regenerate). Never commit baselines made on Windows or macOS.
 *
 * This spec is collected only by playwright.visual.config.ts (`npm run test:visual`), so the
 * main e2e job, which runs on the bare ubuntu runner, never compares against container pixels.
 * To refresh: see docs/visual-regression.md.
 */

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
    // ?nogl=1 keeps the WebGL hero engine off, so the poster image is the hero and the page is
    // the same pixels on every machine. The engine has its own specs (hero-*.spec.ts).
    await page.goto('/?nogl=1')
    await page.waitForLoadState('networkidle')
    // The fonts are self-hosted (next/font/local) but still load asynchronously: wait for
    // them so a capture never lands on the metric-matched fallback face.
    await page.evaluate(() => document.fonts.ready)
    // Full-page capture reads the layout height once; hold for two frames so lazy images and
    // the sticky header have settled.
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))

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
      // Same container, same fonts, same Chromium: a render is near byte-identical, so the
      // budget is tiny. 0.002 of a full-page frame tolerates sub-pixel anti-aliasing noise
      // (a few thousand pixels at 1440 wide) but not a moved or resized block, and a changed
      // page height fails outright because Playwright compares dimensions first.
      maxDiffPixelRatio: 0.002,
      // Per-pixel colour distance (YIQ, 0 to 1). 0.2 is Playwright's default: it ignores the
      // gamma and dithering wobble in the poster's gradients and keeps real colour changes.
      threshold: 0.2,
      animations: 'disabled',
      // Caret blink is the only time-dependent paint left (the footer year is a literal).
      caret: 'hide',
    })
  })
}
