import { expect, test } from '@playwright/test'

test('an unknown address answers 404 with a designed, noindex page', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist')
  expect(response?.status()).toBe(404)

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Back to the home page' })).toHaveAttribute('href', '/')
  await expect(page.locator('meta[name="robots"][content^="noindex"]').first()).toHaveCount(1)
})

test('the skip link moves focus into the main landmark', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('main#main')).toBeFocused()
})

test('the home page describes itself to crawlers', async ({ page }) => {
  await page.goto('/')
  const raw = await page.locator('script[type="application/ld+json"]').first().textContent()
  const graph = (JSON.parse(raw ?? '{}') as { '@graph': { '@type': string }[] })['@graph']
  expect(graph.map((node) => node['@type'])).toEqual(['Person', 'WebSite'])
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1)
})

test('manifest, icons and security.txt are served', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest')
  expect(manifest.ok()).toBe(true)
  const json = (await manifest.json()) as { display: string; icons: { src: string; purpose?: string }[] }
  expect(json.display).toBe('standalone')
  expect(json.icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
  for (const icon of json.icons) expect((await request.get(icon.src)).ok()).toBe(true)

  const security = await request.get('/.well-known/security.txt')
  expect(security.ok()).toBe(true)
  const text = await security.text()
  expect(text).toMatch(/^Contact: mailto:.+@.+$/m)
  expect(text).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/m)
})
