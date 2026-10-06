// @vitest-environment node
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { buildInputsHash, PIPELINE_VERSION } from '../../scripts/assets/build-inputs'
import { runCheck } from '../../scripts/assets/check'
import { defaultRoot, layoutFor, loadSources, sourceEntrySchema, type SourceEntry } from '../../scripts/assets/sources'

const committed = layoutFor(defaultRoot())
const source = (id: string): SourceEntry => {
  const found = loadSources(committed).find((s) => s.id === id)
  if (!found) throw new Error(`no source ${id}`)
  return found
}
const edited = (id: string, change: (raw: Record<string, unknown>) => void): SourceEntry => {
  const raw = JSON.parse(JSON.stringify(source(id))) as Record<string, unknown>
  change(raw)
  return sourceEntrySchema.parse(raw)
}

describe('buildInputsHash', () => {
  it('is 16 hex and stable across runs', () => {
    const hash = buildInputsHash(source('crystal-cluster'))
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
    expect(buildInputsHash(source('crystal-cluster'))).toBe(hash)
    expect(PIPELINE_VERSION).toBeGreaterThanOrEqual(1)
  })

  it('does not depend on key order', () => {
    const a = edited('crystal-cluster', () => undefined)
    const b = edited('crystal-cluster', (raw) => {
      const look = raw['look'] as { palette: Record<string, string> }
      look.palette = Object.fromEntries(Object.entries(look.palette).reverse())
      raw['look'] = Object.fromEntries(Object.entries(raw['look'] as object).reverse())
    })
    expect(buildInputsHash(b)).toBe(buildInputsHash(a))
  })

  it.each([
    ['a palette colour', (raw: Record<string, unknown>) => ((raw['look'] as { palette: Record<string, string> }).palette['crystal'] = '#22D3EE')],
    ['metallic', (raw: Record<string, unknown>) => ((raw['look'] as Record<string, number>)['metallic'] = 0.5)],
    ['the tier list', (raw: Record<string, unknown>) => (raw['tiers'] = [1, 2])],
    ['the raw hash', (raw: Record<string, unknown>) => ((raw['origin'] as Record<string, string>)['sha256'] = 'a'.repeat(64))],
  ])('changes with %s', (_, change) => {
    expect(buildInputsHash(edited('crystal-cluster', change))).not.toBe(buildInputsHash(source('crystal-cluster')))
  })

  it('ignores what does not decide the bytes (title, credit)', () => {
    const renamed = edited('crystal-cluster', (raw) => {
      raw['title'] = 'Another title'
    })
    expect(buildInputsHash(renamed)).toBe(buildInputsHash(source('crystal-cluster')))
  })

  it('every committed manifest entry carries the hash its source computes', () => {
    const manifest = JSON.parse(readFileSync(committed.manifestFile, 'utf8')) as { models: { id: string; buildInputsHash?: string }[] }
    for (const entry of manifest.models) expect(entry.buildInputsHash, entry.id).toBe(buildInputsHash(source(entry.id)))
  })
})

describe('assets:check and a stale committed model', () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'stale-'))
  afterAll(() => rmSync(tmp, { recursive: true, force: true }))

  const tree = (name: string, change?: (sources: Record<string, unknown>[]) => void): string => {
    const root = path.join(tmp, name)
    const l = layoutFor(root)
    mkdirSync(path.dirname(l.sourcesFile), { recursive: true })
    cpSync(committed.sourcesFile, l.sourcesFile)
    cpSync(committed.creditsFile, l.creditsFile)
    cpSync(committed.modelsDir, l.modelsDir, { recursive: true })
    if (change) {
      const sources = JSON.parse(readFileSync(l.sourcesFile, 'utf8')) as Record<string, unknown>[]
      change(sources)
      writeFileSync(l.sourcesFile, JSON.stringify(sources))
    }
    return root
  }
  const entry = (sources: Record<string, unknown>[], id: string) => sources.find((s) => s['id'] === id) as Record<string, Record<string, unknown>>

  it('passes when sources.json matches the last ingest', async () => {
    expect((await runCheck({ root: tree('same') })).violations).toEqual([])
  }, 120_000)

  it('fails, naming the id, when a palette colour is edited without re-ingesting', async () => {
    const root = tree('palette', (s) => ((entry(s, 'crystal-cluster')['look']?.['palette'] as Record<string, string>)['rock'] = '#000000'))
    const { violations } = await runCheck({ root })
    expect(violations.map((v) => v.message)).toContain('sources.json changed since the last ingest for "crystal-cluster": run npm run assets:ingest')
  }, 120_000)

  it('fails when metallic is edited without re-ingesting', async () => {
    const root = tree('metallic', (s) => ((entry(s, 'gate-complex')['look'] as Record<string, unknown>)['metallic'] = 0.9))
    const { violations } = await runCheck({ root })
    expect(violations.map((v) => v.message)).toContain('sources.json changed since the last ingest for "gate-complex": run npm run assets:ingest')
  }, 120_000)
})
