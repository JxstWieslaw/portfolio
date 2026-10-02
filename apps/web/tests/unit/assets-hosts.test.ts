// @vitest-environment node
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { runCheck } from '../../scripts/assets/check'
import { ALLOWED_HOSTS, checkUrl } from '../../scripts/assets/fetch'
import { SOURCE_HOSTS, isSourceHost } from '../../scripts/assets/hosts'
import { defaultRoot, layoutFor, loadSources, sourceEntrySchema } from '../../scripts/assets/sources'

const base = {
  id: 'x',
  title: 'X',
  kind: 'prop',
  enabled: false,
  origin: { type: 'file', path: 'assets-src/x/m.glb', url: 'https://kenney.nl/x', sha256: 'c'.repeat(64) },
  licenceId: 'CC0-1.0',
  licenceEvidence: { url: 'https://kenney.nl/license', retrievedAt: '2026-10-02' },
  credit: { author: 'A', sourceUrl: 'https://kenney.nl/x', retrievedAt: '2026-10-02' },
}
const withOrigin = (url: string) => ({ ...base, origin: { ...base.origin, url } })
const withEvidence = (url: string) => ({ ...base, licenceEvidence: { ...base.licenceEvidence, url } })
const issues = (input: unknown) => {
  const r = sourceEntrySchema.safeParse(input)
  return r.success ? [] : r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
}

describe('B1: one source of truth for hosts', () => {
  it('fetch derives its allow-list from hosts.ts, and today that is kenney.nl and nothing else', () => {
    expect(ALLOWED_HOSTS).toEqual(['kenney.nl'])
    expect([...ALLOWED_HOSTS]).toEqual(Object.values(SOURCE_HOSTS).flatMap((h) => h.download))
    expect(checkUrl('https://kenney.nl/x').ok).toBe(true)
    expect(checkUrl('https://www.kenney.nl/x').ok).toBe(false) // evidence-only host: never downloaded from
  })

  it('isSourceHost is an own-key test, not a prototype lookup', () => {
    expect(isSourceHost('kenney.nl')).toBe(true)
    for (const host of ['www.kenney.nl', 'evilkenney.nl', 'constructor', 'toString', '__proto__', '']) expect(isSourceHost(host), host).toBe(false)
  })

  it('accepts evidence on the download host and on its listed evidence host', () => {
    expect(issues(base)).toEqual([])
    expect(issues(withEvidence('https://www.kenney.nl/support'))).toEqual([])
  })

  it.each([
    'https://evilkenney.nl/license',
    'https://kenney.nl.evil.example/license',
    'https://sub.kenney.nl/license',
    'https://notkenney.nl/license',
    'https://kenney.nl./license',
    'https://evil.example/license',
  ])('rejects evidence on %s (no suffix or prefix matching)', (url) => {
    const found = issues(withEvidence(url))
    expect(found.map((i) => i.path)).toEqual(['licenceEvidence.url'])
    expect(found[0]?.message).toMatch(/must be on one of: kenney\.nl, www\.kenney\.nl/)
  })

  it.each(['https://quaternius.com/m.zip', 'https://www.kenney.nl/m.zip', 'https://evilkenney.nl/m.zip', 'https://kenney.nl.evil.example/m'])(
    'rejects a download from %s in the schema, so check and ingest refuse it too, not only fetch',
    (url) => {
      const found = issues(withOrigin(url))
      expect(found.map((i) => i.path)).toContain('origin.url')
      expect(found.find((i) => i.path === 'origin.url')?.message).toMatch(/is not a known source host/)
    },
  )

  describe('on disk: loadSources and assets:check', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'hosts-'))
    afterAll(() => rmSync(tmp, { recursive: true, force: true }))
    const committed = layoutFor(defaultRoot())

    it('loadSources throws and runCheck reports a SCHEMA violation for a host that is not in hosts.ts', async () => {
      const root = path.join(tmp, 'bad-host')
      const l = layoutFor(root)
      mkdirSync(path.dirname(l.sourcesFile), { recursive: true })
      cpSync(committed.creditsFile, l.creditsFile)
      cpSync(committed.modelsDir, l.modelsDir, { recursive: true })
      writeFileSync(l.sourcesFile, JSON.stringify([withOrigin('https://quaternius.com/m.zip')]))
      expect(() => loadSources(l)).toThrow(/not a known source host/)
      const { violations } = await runCheck({ root })
      expect(violations.some((x) => x.code === 'SCHEMA' && x.subject === 'sources.json' && /not a known source host/.test(x.message))).toBe(true)
    })

    it('B2: loadSources strips a UTF-8 BOM, as the manifest and credits readers do', () => {
      const root = path.join(tmp, 'bom')
      const l = layoutFor(root)
      mkdirSync(path.dirname(l.sourcesFile), { recursive: true })
      writeFileSync(l.sourcesFile, String.fromCharCode(0xfeff) + JSON.stringify([base]))
      expect(loadSources(l)).toHaveLength(1)
    })
  })
})

describe('B2: schema guards', () => {
  it.each(['not a url', 'https://', 'https://[::1', ''])('a bad origin url %j is a path-scoped message, never a TypeError', (url) => {
    expect(() => issues(withOrigin(url))).not.toThrow()
    const found = issues(withOrigin(url))
    expect(found.length).toBeGreaterThan(0)
    expect(found.every((i) => i.path === 'origin.url')).toBe(true)
  })

  it.each(['not a url', 'https://', ''])('a bad evidence url %j is a path-scoped message, never a TypeError', (url) => {
    expect(() => issues(withEvidence(url))).not.toThrow()
    const found = issues(withEvidence(url))
    expect(found.length).toBeGreaterThan(0)
    expect(found.every((i) => i.path === 'licenceEvidence.url')).toBe(true)
  })

  it('caps a clip name at 40 characters, the same cap the scanner puts on clip names', () => {
    const clip = (as: string) => issues({ ...base, clips: [{ from: 'Idle', as }] })
    expect(clip('a'.repeat(40))).toEqual([])
    expect(clip('a'.repeat(41)).map((i) => i.path)).toEqual(['clips.0.as'])
  })
})
