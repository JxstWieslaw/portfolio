import { expect, test, type Page } from '@playwright/test'

/**
 * Scroll speed reaches the cubes — animation spec § 6, A2.
 *
 * The cubes' stretch is one uniform (`uVelocity`). A browser test cannot read a
 * uniform, so the Assembly offers `window.__ASSEMBLY_VELOCITY__()`, which
 * exists only where the model test seam does: an app built with
 * `NEXT_PUBLIC_MODEL_TEST=1` (the CI e2e job sets it). A production build
 * compiles it out, and the seam guard greps for its name.
 *
 * Chromium runs on SwiftShader, so there is a WebGL2 context without a GPU;
 * `html[data-gl="live"]` is the proof the Assembly mounted. WebKit cannot
 * launch with these flags, so only the Chromium-based projects run this file.
 */

test.skip(({ browserName }) => browserName !== 'chromium', 'needs Chromium with SwiftShader WebGL; WebKit cannot launch with these flags')
test.skip(process.env.NEXT_PUBLIC_MODEL_TEST !== '1', 'needs an app built with NEXT_PUBLIC_MODEL_TEST=1 (the velocity read)')

// A small viewport keeps software-GL frames well inside the half-second gap past which a frame-to-frame jump is
// not read as a scroll speed (a stalled or hidden layer); a 1440 px canvas on SwiftShader can take longer than that.
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }, viewport: { width: 640, height: 400 } })
// Software GL is slow, and several workers share one CPU: be generous, not flaky.
test.describe.configure({ timeout: 150_000 })

const velocity = (page: Page): Promise<number | null> => page.evaluate(() => window.__ASSEMBLY_VELOCITY__?.() ?? null)

/** A scripted fast scroll down the page; returns the highest weight seen on any frame while it ran and just after. */
async function flick(page: Page, direction: 1 | -1): Promise<number> {
  return page.evaluate(async (sign) => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    let peak = 0
    const sample = () => {
      peak = Math.max(peak, window.__ASSEMBLY_VELOCITY__?.() ?? 0)
    }
    for (let i = 0; i < 14; i += 1) {
      window.scrollBy({ top: sign * window.innerHeight * 0.6, behavior: 'instant' })
      await frame()
      sample()
    }
    // Frames on software GL are slow: keep looking for a while after the last step.
    const until = performance.now() + 1500
    while (performance.now() < until) {
      await frame()
      sample()
    }
    return peak
  }, direction)
}

test('scroll speed raises the cubes\' stretch above 0 and it settles back to exactly 0 at rest', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-gl', 'live', { timeout: 90_000 })

  // At rest (after the on-load assembly has settled) the weight is exactly 0.
  await expect.poll(() => velocity(page), { timeout: 30_000 }).toBe(0)

  const down = await flick(page, 1)
  expect(down).toBeGreaterThan(0)
  expect(down).toBeLessThanOrEqual(1)

  // The scroll has stopped: the weight decays to exactly 0, not to "nearly".
  await expect.poll(() => velocity(page), { timeout: 30_000 }).toBe(0)

  // And scrolling back up is felt the same way.
  expect(await flick(page, -1)).toBeGreaterThan(0)
  await expect.poll(() => velocity(page), { timeout: 30_000 }).toBe(0)
})

test('a slow, reading-speed scroll does not stretch the cubes', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-gl', 'live', { timeout: 90_000 })
  await expect.poll(() => velocity(page), { timeout: 30_000 }).toBe(0)
  const peak = await page.evaluate(async () => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    let high = 0
    const start = performance.now()
    // About 0.05 viewport heights per second: under the dead zone, and a whole-pixel step is not mistaken for speed.
    while (performance.now() - start < 2000) {
      window.scrollBy({ top: (window.innerHeight * 0.05) / 60, behavior: 'instant' })
      await frame()
      high = Math.max(high, window.__ASSEMBLY_VELOCITY__?.() ?? 0)
    }
    return high
  })
  expect(peak).toBeLessThan(0.05)
})
