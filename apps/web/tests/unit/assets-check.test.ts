// @vitest-environment node
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runCheck } from '../../scripts/assets/check'
import { defaultRoot, layoutFor } from '../../scripts/assets/sources'
import { canonicalJson, contentHashOf, type Violation } from '../../scripts/assets/validators'

const committed = layoutFor(defaultRoot())
const codes = (vs: readonly Violation[]) => [...new Set(vs.map((x) => x.code))].sort()

let tmp: string
let root: string
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'check-'))
  root = path.join(tmp, 'repo')
  const l = layoutFor(root)
  mkdirSync(path.dirname(l.sourcesFile), { recursive: true })
  cpSync(committed.sourcesFile, l.sourcesFile)
  cpSync(committed.creditsFile, l.creditsFile)
  cpSync(committed.modelsDir, l.modelsDir, { recursive: true })
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

const editJson = (file: string, change: (json: Record<string, unknown>) => void) => {
  const json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  change(json)
  writeFileSync(file, canonicalJson(json))
}

describe('assets:check on the committed tree', () => {
  it('passes the repository as committed', () => {
    const result = runCheck({ root: defaultRoot() })
    expect(result.violations).toEqual([])
    expect(result.entries).toBeGreaterThanOrEqual(1)
    expect(result.files).toBeGreaterThanOrEqual(1)
  })

  it('passes an empty manifest, so the first PR is green before any model exists', () => {
    const l = layoutFor(root)
    for (const f of readdirSync(l.modelsDir)) if (f.endsWith('.glb')) rmSync(path.join(l.modelsDir, f))
    writeFileSync(l.sourcesFile, '[]\n')
    writeFileSync(l.manifestFile, canonicalJson({ version: 1, contentHash: contentHashOf([]), models: [] }))
    writeFileSync(l.creditsFile, '[]\n')
    expect(runCheck({ root }).violations).toEqual([])
  })
})

describe('assets:check catches tampering', () => {
  it('HASH: one flipped byte in a committed GLB', () => {
    const l = layoutFor(root)
    const glb = readdirSync(l.modelsDir).find((f) => f.endsWith('.glb'))
    expect(glb).toBeDefined()
    const file = path.join(l.modelsDir, glb ?? '')
    const bytes = readFileSync(file)
    bytes[bytes.length - 5] = (bytes[bytes.length - 5] ?? 0) ^ 0xff
    writeFileSync(file, bytes)
    expect(codes(runCheck({ root }).violations)).toContain('HASH')
  })

  it('ORPHAN: a GLB the manifest does not reference, a missing GLB, and a stray file', () => {
    const l = layoutFor(root)
    writeFileSync(path.join(l.modelsDir, 'stray.t1.deadbeef.glb'), 'x')
    writeFileSync(path.join(l.modelsDir, 'notes.txt'), 'x')
    const real = readdirSync(l.modelsDir).find((f) => f.startsWith('gyroscope.t2'))
    rmSync(path.join(l.modelsDir, real ?? ''))
    const found = runCheck({ root }).violations.filter((v) => v.code === 'ORPHAN').map((v) => v.subject)
    expect(found).toEqual(expect.arrayContaining(['stray.t1.deadbeef.glb', 'notes.txt', real]))
  })

  it('SCHEMA: a contentHash that no longer matches the models', () => {
    editJson(layoutFor(root).manifestFile, (j) => void (j['contentHash'] = '0000000000000000'))
    expect(codes(runCheck({ root }).violations)).toEqual(['SCHEMA'])
  })

  it('SCHEMA: a missing manifest or credits file, and a manifest that is not JSON', () => {
    const l = layoutFor(root)
    rmSync(l.creditsFile)
    expect(codes(runCheck({ root }).violations)).toContain('SCHEMA')
    writeFileSync(l.manifestFile, '{not json')
    expect(runCheck({ root }).violations.some((v) => v.code === 'SCHEMA' && v.subject === 'manifest.json')).toBe(true)
  })

  it('LICENCE: turning an entry on in the manifest without crediting it', () => {
    editJson(layoutFor(root).manifestFile, (j) => {
      const models = j['models'] as Record<string, unknown>[]
      for (const m of models) m['enabled'] = true
      j['contentHash'] = contentHashOf(models)
    })
    const found = codes(runCheck({ root }).violations)
    expect(found).toContain('LICENCE')
    expect(found).toContain('SCHEMA') // sources.json still says enabled: false
  })

  it('COMPLETE: an enabled source that asks for a tier its manifest entry lacks, with credits in order', () => {
    const l = layoutFor(root)
    const sources = JSON.parse(readFileSync(l.sourcesFile, 'utf8')) as Record<string, unknown>[]
    const [source] = sources
    if (!source) throw new Error('fixture has no source')
    source['enabled'] = true
    source['tiers'] = [1, 2, 3]
    writeFileSync(l.sourcesFile, canonicalJson(sources))
    editJson(l.manifestFile, (j) => {
      const models = j['models'] as Record<string, unknown>[]
      for (const m of models) m['enabled'] = true
      j['contentHash'] = contentHashOf(models)
    })
    const credit = source['credit'] as Record<string, string>
    writeFileSync(
      l.creditsFile,
      canonicalJson([
        {
          assetId: 'gyroscope',
          title: 'Gyroscope',
          author: credit['author'],
          sourceUrl: credit['sourceUrl'],
          licence: 'own',
          retrievedAt: credit['retrievedAt'],
        },
      ]),
    )
    expect(codes(runCheck({ root }).violations)).toEqual(['COMPLETE'])
  })
})
