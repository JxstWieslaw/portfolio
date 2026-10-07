import { expect, test } from '@playwright/test'

/**
 * The security headers as served by `next start` (a production build), on `/` and on the model files.
 * The CSP is report-only: a violation must never change behaviour, so this also asserts there is no enforcing header.
 */
test.describe('security headers', () => {
  test('the home page carries the site-wide headers, with the CSP report-only', async ({ request }) => {
    const h = (await request.get('/')).headers()
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(h['permissions-policy']).toContain('camera=()')
    expect(h['permissions-policy']).toContain('geolocation=()')
    expect(h['content-security-policy']).toBeUndefined()
    const csp = h['content-security-policy-report-only'] ?? ''
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).toContain("object-src 'none'")
  })

  test('the model manifest still revalidates and is not immutable', async ({ request }) => {
    const res = await request.get('/models/manifest.json')
    expect(res.ok()).toBe(true)
    const h = res.headers()
    expect(h['cache-control']).toBe('public, max-age=0, must-revalidate')
    expect(h['cross-origin-resource-policy']).toBe('same-origin')
    expect(h['x-content-type-options']).toBe('nosniff')
  })

  test('a hash-named GLB stays immutable', async ({ request }) => {
    const manifest = (await (await request.get('/models/manifest.json')).json()) as { models?: Array<{ variants?: Array<{ url: string }> }> }
    const urls = (manifest.models ?? []).flatMap((m) => (m.variants ?? []).map((v) => v.url))
    expect(urls.length).toBeGreaterThan(0)
    const res = await request.get(urls[0] ?? '')
    expect(res.status()).toBe(200)
    expect(res.headers()['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(res.headers()['cross-origin-resource-policy']).toBe('same-origin')
  })
})
