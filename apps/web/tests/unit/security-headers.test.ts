// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import config from '../../next.config'

type Rule = { source: string; headers: Array<{ key: string; value: string }> }

const REPORT_ONLY = 'Content-Security-Policy-Report-Only'

async function allRules(): Promise<Rule[]> {
  return (await config.headers?.()) as Rule[]
}

async function siteWide(): Promise<Record<string, string>> {
  const rule = (await allRules()).find((r) => r.source === '/:path*')
  expect(rule).toBeDefined()
  return Object.fromEntries((rule?.headers ?? []).map((h) => [h.key, h.value]))
}

const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? ''

afterEach(() => vi.unstubAllEnvs())

describe('site-wide security headers', () => {
  it('sets nosniff, a referrer policy and a Permissions-Policy that denies the sensitive features', async () => {
    const h = await siteWide()
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    for (const f of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) expect(h['Permissions-Policy']).toContain(`${f}=()`)
  })

  it('ships the CSP as report-only and never as an enforcing header', async () => {
    expect((await siteWide())[REPORT_ONLY]).toBeTruthy()
    for (const r of await allRules()) expect(r.headers.map((x) => x.key)).not.toContain('Content-Security-Policy')
  })

  it('production policy: wasm but no eval, no remote scripts, no Vercel toolbar', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    const csp = (await siteWide())[REPORT_ONLY] ?? ''
    const script = directive(csp, 'script-src')
    expect(script).toContain("'wasm-unsafe-eval'")
    expect(script).not.toContain("'unsafe-eval'")
    expect(csp).not.toContain('vercel.live')
    expect(directive(csp, 'worker-src')).toBe("worker-src 'self'")
    expect(directive(csp, 'object-src')).toBe("object-src 'none'")
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'")
  })

  it('allows the API origin, from env, in connect-src only', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test/v1/')
    const csp = (await siteWide())[REPORT_ONLY] ?? ''
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self' https://api.example.test")
    expect(directive(csp, 'script-src')).not.toContain('api.example.test')
  })

  it('ignores a malformed API url instead of breaking the config', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'not a url')
    expect(directive((await siteWide())[REPORT_ONLY] ?? '', 'connect-src')).toBe("connect-src 'self'")
  })

  it('production with no VERCEL_ENV and no API url has none of the dev or preview allowances', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NEXT_PUBLIC_API_URL', '')
    const csp = (await siteWide())[REPORT_ONLY] ?? ''
    for (const banned of ["'unsafe-eval'", 'ws:', 'http:', 'vercel.live']) expect(csp).not.toContain(banned)
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self'")
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'")
    expect(directive(csp, 'form-action')).toBe("form-action 'self' mailto:")
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(directive(csp, 'object-src')).toBe("object-src 'none'")
  })

  it('development adds eval and websockets for the dev server, and only then', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('VERCEL_ENV', '')
    const csp = (await siteWide())[REPORT_ONLY] ?? ''
    expect(directive(csp, 'script-src')).toContain("'unsafe-eval'")
    expect(directive(csp, 'connect-src')).toContain('ws:')
  })

  it.each([
    ['javascript:x', "connect-src 'self'"],
    ['ftp://h', "connect-src 'self'"],
    ['https://*.x.com', "connect-src 'self'"],
    ['https://a;script-src.evil.com', "connect-src 'self'"],
    ['https://a,b.com', "connect-src 'self'"],
    ['https://api.example.test/v1/deep?q=1#f', "connect-src 'self' https://api.example.test"],
    ['https://user:pass@api.example.test', "connect-src 'self' https://api.example.test"],
    ['http://localhost:4000', "connect-src 'self' http://localhost:4000"],
  ])('API url %s gives %s', async (raw, expected) => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_API_URL', raw)
    const csp = (await siteWide())[REPORT_ONLY] ?? ''
    expect(directive(csp, 'connect-src')).toBe(expected)
    expect(csp).not.toMatch(/null|user:pass/)
    expect(csp).not.toContain('*')
  })

  it('adds the Vercel toolbar origins on previews only', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    const csp = (await siteWide())[REPORT_ONLY] ?? ''
    expect(directive(csp, 'script-src')).toContain('https://vercel.live')
    expect(directive(csp, 'frame-src')).toContain('https://vercel.live')
  })

  it('leaves the model asset rules exact: scope, caching and CORP', async () => {
    const rules = await allRules()
    const glb = rules.find((r) => r.source.startsWith('/models/:file('))
    const manifest = rules.find((r) => r.source === '/models/manifest.json')
    const get = (r: Rule | undefined, k: string) => r?.headers.find((h) => h.key === k)?.value
    expect(glb?.source).toBe(String.raw`/models/:file([a-z0-9-]+\.t[123]\.[0-9a-f]{8}\.glb)`)
    expect(get(glb, 'Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(get(manifest, 'Cache-Control')).toBe('public, max-age=0, must-revalidate')
    expect(get(manifest, 'Cross-Origin-Resource-Policy')).toBe('same-origin')
  })
})
