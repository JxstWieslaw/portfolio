import { expect, test } from '@playwright/test'

/**
 * Motion contracts that only a real browser can prove: hit-testing follows the
 * transform, and the scroll-driven heading reveal is gated on reduced motion.
 */

test.describe('nav condense hit-testing', () => {
  test('the visible bar blocks pointer events and the strip below passes them', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough for a geometry contract')

    await page.goto('/')
    await page.mouse.wheel(0, 400)
    await expect(page.locator('header')).toHaveAttribute('data-condensed', 'true')
    // Let the 320ms transform settle.
    await page.waitForTimeout(600)

    const probe = await page.evaluate(() => {
      const x = Math.round(window.innerWidth / 2)
      const header = document.querySelector('header')
      const inside = (y: number) => {
        const element = document.elementFromPoint(x, y)
        return element !== null && header !== null && header.contains(element)
      }
      return { bar: inside(28), strip: inside(64), layoutHeight: header?.getBoundingClientRect().height }
    })

    expect(probe.layoutHeight).toBe(72)
    expect(probe.bar).toBe(true)
    expect(probe.strip).toBe(false)
  })
})

test.describe('section heading reveal', () => {
  test('is off under reduced motion', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('/')
    const names = await page
      .locator('.section-head-title h2')
      .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).animationName))
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) expect(name).toBe('none')
    await context.close()
  })

  test('runs where scroll-driven animation is supported', async ({ page }) => {
    await page.goto('/')
    const supported = await page.evaluate(() => CSS.supports('animation-timeline: view()'))
    test.skip(!supported, 'this engine has no scroll-driven animation; the heading just shows')

    const names = await page
      .locator('.section-head-title h2')
      .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).animationName))
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) expect(name).toBe('heading-unmask')
  })

  test('never touches the hero h1', async ({ page }) => {
    await page.goto('/')
    const name = await page.locator('h1').first().evaluate((node) => getComputedStyle(node).animationName)
    expect(name).not.toBe('heading-unmask')
  })
})
