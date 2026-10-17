import { expect, test } from '@playwright/test'

/**
 * The header on the deep routes. The unit tests pin the hrefs and `aria-current`; this proves them in a browser: the
 * links really lead somewhere from `/about` and a case study, and the skip link's target exists on every route.
 */

const ROUTES = ['/', '/work', '/work/gabar', '/about', '/resume', '/no-such-page'] as const

for (const route of ROUTES) {
  test(`the skip link target exists on ${route}`, async ({ page }) => {
    await page.goto(route)
    await expect(page.locator('main#main')).toHaveCount(1)
  })
}

test('a section link on /about goes to that section of the home page', async ({ page }, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 0) < 1024, 'the pill row is hidden below the lg breakpoint')
  await page.goto('/about')
  const link = page.locator('nav[aria-label="Primary"] a', { hasText: 'How I lead' })
  await expect(link).toHaveAttribute('href', '/#lead')
  await link.click()
  await expect(page).toHaveURL(/\/#lead$/)
  await expect(page.locator('[data-section="lead"]')).toBeInViewport({ ratio: 0.2 })
})

test('the Work page is current on a case study, and only there', async ({ page }, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 0) < 1024, 'the pill row is hidden below the lg breakpoint')
  await page.goto('/work/gabar')
  const primary = page.locator('nav[aria-label="Primary"]')
  await expect(primary.locator('a[aria-current="page"]')).toHaveText('Work')
  await expect(primary.locator('[aria-current]')).toHaveCount(1)
})

test('the menu on a deep route carries root-relative links and the pages group', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/resume')
  await page.getByRole('button', { name: /open menu/i }).click()
  const sheet = page.getByRole('dialog', { name: 'Menu' })
  await expect(sheet.locator('nav[aria-label="Sections"] a[href="/#craft"]')).toHaveCount(1)
  await expect(sheet.locator('nav[aria-label="Pages"] a[aria-current="page"]')).toHaveText('Resume')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
})

test('the case study ends with a way back to all work', async ({ page }) => {
  await page.goto('/work/gabar')
  await page.getByRole('link', { name: 'All work' }).last().click()
  await expect(page).toHaveURL(/\/work$/)
})
