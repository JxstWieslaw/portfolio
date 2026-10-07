// @vitest-environment node
import { describe, expect, it } from 'vitest'
import config from '../../next.config'

type Rule = { source: string; headers: Array<{ key: string; value: string }> }

/** Next compiles `source` with path-to-regexp; the one custom parameter here is a plain regex group, so it can be tested directly. */
function rules(): Promise<Rule[]> {
  return (config.headers?.() ?? Promise.resolve([])) as Promise<Rule[]>
}

const value = (rule: Rule | undefined, key: string) => rule?.headers.find((h) => h.key === key)?.value

describe('/models delivery headers', () => {
  it('makes only hash-named model files immutable, and the manifest always revalidate', async () => {
    const all = await rules()
    const glb = all.find((r) => r.source.startsWith('/models/:file('))
    const manifest = all.find((r) => r.source === '/models/manifest.json')

    expect(value(glb, 'Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(value(manifest, 'Cache-Control')).toBe('public, max-age=0, must-revalidate')
    expect(value(manifest, 'Cache-Control')).not.toContain('immutable')
    for (const rule of [glb, manifest]) {
      expect(value(rule, 'X-Content-Type-Options')).toBe('nosniff')
      expect(value(rule, 'Cross-Origin-Resource-Policy')).toBe('same-origin')
    }
  })

  it('has no catch-all rule that could make the manifest immutable', async () => {
    for (const rule of await rules()) {
      // The site-wide security rule is the one catch-all, and it must never carry caching.
      if (/:path\*/.test(rule.source)) expect(value(rule, 'Cache-Control')).toBeUndefined()
      // Immutable only for a content-hashed file pattern: models (.glb), and the hero posters and OG image (S2).
      if (value(rule, 'Cache-Control')?.includes('immutable')) expect(rule.source).toMatch(/\.glb|\[0-9a-f\]\{8\}/)
    }
  })

  it('the immutable pattern matches hash-named files and nothing else', async () => {
    const glb = (await rules()).find((r) => r.source.startsWith('/models/:file('))
    const group = /\/models\/:file\((.*)\)$/.exec(glb?.source ?? '')?.[1] ?? ''
    const re = new RegExp(`^${group}$`)
    for (const ok of ['gyroscope.t1.ba83862b.glb', 'core-crystal.t3.0123abcd.glb']) expect(re.test(ok)).toBe(true)
    for (const bad of ['manifest.json', 'gyroscope.glb', 'gyroscope.t4.ba83862b.glb', 'gyroscope.t1.BA83862B.glb', 'gyroscope.t1.ba83862b.glb.map', '../x.t1.ba83862b.glb']) {
      expect(re.test(bad)).toBe(false)
    }
  })
})
