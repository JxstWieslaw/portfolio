// @vitest-environment node
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { main, runCheck } from '../../scripts/assets/check'
import { defaultRoot, layoutFor, type Layout } from '../../scripts/assets/sources'
import {
  buildReport,
  canonicalJson,
  contentHashOf,
  integrityOf,
  packGlb,
  parseGlb,
  sha256Hex,
  type Violation,
} from '../../scripts/assets/validators'

const committed = layoutFor(defaultRoot())
const codes = (vs: readonly Violation[]) => [...new Set(vs.map((x) => x.code))].sort()
const messages = (vs: readonly Violation[], code: string) => vs.filter((x) => x.code === code).map((x) => x.message)

let tmp: string
let root: string
let l: Layout
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'check-'))
  root = path.join(tmp, 'repo')
  l = layoutFor(root)
  mkdirSync(path.dirname(l.sourcesFile), { recursive: true })
  cpSync(committed.sourcesFile, l.sourcesFile)
  cpSync(committed.creditsFile, l.creditsFile)
  cpSync(committed.modelsDir, l.modelsDir, { recursive: true })
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

type Models = Record<string, unknown>[]

const first = (list: Models): Record<string, unknown> => {
  const x = list[0]
  if (!x) throw new Error('fixture is empty')
  return x
}

const readManifest = () => JSON.parse(readFileSync(l.manifestFile, 'utf8')) as { models: Models } & Record<string, unknown>

/** Edits the manifest's models and keeps its contentHash honest, so only the edited claim is wrong. */
function editManifest(change: (models: Models) => void): void {
  const manifest = readManifest()
  change(manifest.models)
  manifest.contentHash = contentHashOf(manifest.models)
  writeFileSync(l.manifestFile, canonicalJson(manifest))
}

interface Rewrite {
  readonly json?: (json: Record<string, unknown>) => void
  readonly bin?: (bin: Uint8Array) => Uint8Array
  /** Replace the file with these bytes (they need not be a GLB). */
  readonly raw?: Uint8Array
  readonly rename?: (hash8: string) => string
}

/**
 * Rewrites the committed tier 2 GLB, renames it to its new hash, and fixes the manifest's url,
 * integrity, bytes, triangles and contentHash, so the ONLY thing wrong afterwards is the change.
 */
function rewriteVariant(opts: Rewrite): void {
  const manifest = readManifest()
  const variant = (manifest.models[0]?.['variants'] as Record<string, unknown>[]).find((v) => v['tier'] === 2)
  if (!variant) throw new Error('fixture has no tier 2 variant')
  const oldFile = path.join(l.modelsDir, String(variant['url']).replace('/models/', ''))
  let bytes: Uint8Array
  if (opts.raw) bytes = opts.raw
  else {
    const { json, bin } = parseGlb(new Uint8Array(readFileSync(oldFile)))
    opts.json?.(json)
    bytes = packGlb(json, bin && opts.bin ? opts.bin(bin) : bin)
  }
  const hash8 = sha256Hex(bytes).slice(0, 8)
  const name = opts.rename ? opts.rename(hash8) : `gyroscope.t2.${hash8}.glb`
  rmSync(oldFile)
  writeFileSync(path.join(l.modelsDir, name), bytes)
  variant['url'] = `/models/${name}`
  variant['integrity'] = integrityOf(bytes)
  variant['bytes'] = bytes.byteLength
  try {
    variant['triangles'] = buildReport(bytes).triangles
  } catch {
    /* an unreadable file keeps the old triangle count */
  }
  manifest.contentHash = contentHashOf(manifest.models)
  writeFileSync(l.manifestFile, canonicalJson(manifest))
}

const firstNode = (json: Record<string, unknown>) => (json['nodes'] as Record<string, unknown>[])[0] ?? {}

describe('assets:check on the committed tree', () => {
  it('passes the repository as committed', async () => {
    const result = await runCheck({ root: defaultRoot() })
    expect(result.violations).toEqual([])
    expect(result.entries).toBeGreaterThanOrEqual(1)
    expect(result.files).toBeGreaterThanOrEqual(1)
  })

  it('passes an empty manifest, so the first PR is green before any model exists', async () => {
    for (const f of readdirSync(l.modelsDir)) if (f.endsWith('.glb')) rmSync(path.join(l.modelsDir, f))
    writeFileSync(l.sourcesFile, '[]\n')
    writeFileSync(l.manifestFile, canonicalJson({ version: 1, contentHash: contentHashOf([]), models: [] }))
    writeFileSync(l.creditsFile, '[]\n')
    expect((await runCheck({ root })).violations).toEqual([])
  })

  it('tolerates a CRLF manifest and a UTF-8 BOM', async () => {
    const text = readFileSync(l.manifestFile, 'utf8')
    writeFileSync(l.manifestFile, `\uFEFF${text.replace(/\n/g, '\r\n')}`)
    writeFileSync(l.creditsFile, `\uFEFF[]\r\n`)
    expect((await runCheck({ root })).violations).toEqual([])
  })
})

describe('main(): the exit code the CLI file returns', () => {
  it('returns 0 on a clean root and 1 on a violation, printing each finding', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      expect(await main(root)).toBe(0)
      rewriteVariant({ json: (j) => void (firstNode(j)['extras'] = { x: 1 }) })
      expect(await main(root)).toBe(1)
      expect(err.mock.calls.flat().join('\n')).toMatch(/\[SECURITY\].*extras/)
    } finally {
      log.mockRestore()
      err.mockRestore()
    }
  })

  it('says so when it validated nothing, instead of a bare ok', async () => {
    for (const f of readdirSync(l.modelsDir)) if (f.endsWith('.glb')) rmSync(path.join(l.modelsDir, f))
    writeFileSync(l.sourcesFile, '[]\n')
    writeFileSync(l.manifestFile, canonicalJson({ version: 1, contentHash: contentHashOf([]), models: [] }))
    writeFileSync(l.creditsFile, '[]\n')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      expect(await main(root)).toBe(0)
      expect(log.mock.calls.flat().join('\n')).toContain('nothing was validated')
    } finally {
      log.mockRestore()
    }
  })

  it('returns 1 and names the problem when the repository is unreadable', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      expect(await main(path.join(tmp, 'does-not-exist'))).toBe(1)
    } finally {
      err.mockRestore()
    }
  })
})

describe('assets:check re-derives every claim, so each check is load-bearing', () => {
  it('SECURITY (scanGlb): extras in a committed GLB', async () => {
    rewriteVariant({ json: (j) => void (firstNode(j)['extras'] = { x: 1 }) })
    const { violations } = await runCheck({ root })
    expect(codes(violations)).toEqual(['SECURITY'])
    expect(messages(violations, 'SECURITY')).toEqual(['extras are not allowed'])
  })

  it('MATERIALS (validateReport): a file over its tier cap', async () => {
    rewriteVariant({ json: (j) => void (j['materials'] = [{}, {}, {}]) })
    const { violations } = await runCheck({ root })
    expect(messages(violations, 'MATERIALS')).toEqual(['3 materials exceed the tier 2 cap of 2'])
  })

  it('SCHEMA (the contract): a file name that says another tier than the variant', async () => {
    rewriteVariant({ rename: (hash8) => `gyroscope.t1.${hash8}.glb` })
    const found = messages((await runCheck({ root })).violations, 'SCHEMA')
    expect(found.some((x) => x.includes('file name says tier 1, the variant says tier 2'))).toBe(true)
  })

  it('SCHEMA: manifest bytes and triangles that disagree with the file', async () => {
    editManifest((m) => {
      const v = (m[0]?.['variants'] as Record<string, unknown>[])[1]
      if (v) {
        v['bytes'] = 1234
        v['triangles'] = 99
      }
    })
    const found = messages((await runCheck({ root })).violations, 'SCHEMA')
    expect(found.some((x) => /manifest says 1234 B, file is \d+ B/.test(x))).toBe(true)
    expect(found.some((x) => /manifest says 99 triangles, file has \d+/.test(x))).toBe(true)
  })

  it('SCHEMA: manifest requires, extensions and max texture size that disagree with the file', async () => {
    editManifest((m) => {
      const v = (m[0]?.['variants'] as Record<string, unknown>[])[1]
      if (v) {
        v['requires'] = ['meshopt', 'webp']
        v['extensions'] = ['EXT_meshopt_compression']
        v['maxTexturePx'] = 512
      }
    })
    const found = messages((await runCheck({ root })).violations, 'SCHEMA')
    expect(found).toEqual(
      expect.arrayContaining([
        expect.stringContaining('manifest requires [meshopt, webp], file needs [meshopt]'),
        expect.stringContaining('manifest extensions [EXT_meshopt_compression], file uses [EXT_meshopt_compression, KHR_mesh_quantization]'),
        expect.stringContaining('manifest says max texture 512 px, file has 0 px'),
      ]),
    )
  })

  it('SCHEMA: a boundsRadius that the geometry does not have (measured, not assumed)', async () => {
    editManifest((m) => void (first(m)['boundsRadius'] = 2))
    const found = messages((await runCheck({ root })).violations, 'SCHEMA')
    expect(found.some((x) => /manifest boundsRadius 2, measured 1\.00\d\d/.test(x))).toBe(true)
  })

  it('CLIPS: a clip whose duration the manifest states wrongly', async () => {
    rewriteVariant({
      json: (j) => {
        const accessors = j['accessors'] as Record<string, unknown>[]
        accessors.push({ componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [2.5] })
        accessors.push({ componentType: 5126, count: 2, type: 'VEC3' })
        j['animations'] = [
          {
            name: 'idle',
            samplers: [{ input: accessors.length - 2, output: accessors.length - 1 }],
            channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
          },
        ]
      },
    })
    editManifest((m) => void (first(m)['clips'] = [{ name: 'idle', seconds: 3 }]))
    const found = messages((await runCheck({ root })).violations, 'CLIPS')
    expect(found).toContain('clips in the file (idle:2.5) differ from the manifest (idle:3)')
  })

  it('NAMING (validateFileName): a file whose name belongs to another entry', async () => {
    rewriteVariant({ rename: (hash8) => `other.t2.${hash8}.glb` })
    const { violations } = await runCheck({ root })
    expect(messages(violations, 'NAMING').some((x) => x.includes('does not belong to entry "gyroscope" tier 2'))).toBe(true)
  })

  it('HASH: one flipped byte in a committed GLB', async () => {
    const glb = readdirSync(l.modelsDir).find((f) => f.endsWith('.glb'))
    const file = path.join(l.modelsDir, glb ?? '')
    const bytes = readFileSync(file)
    bytes[bytes.length - 5] = (bytes[bytes.length - 5] ?? 0) ^ 0xff
    writeFileSync(file, bytes)
    expect(codes((await runCheck({ root })).violations)).toContain('HASH')
  })

  it('SCHEMA (the GlbFormatError catch): a committed file that is not a GLB', async () => {
    rewriteVariant({ raw: new TextEncoder().encode('this is not a glb at all, just text') })
    const found = messages((await runCheck({ root })).violations, 'SCHEMA')
    expect(found.some((x) => x.includes('not a readable GLB'))).toBe(true)
  })

  it('BYTES (validateRepoBytes): tracked models over the 1.5 MB repository budget', async () => {
    writeFileSync(path.join(l.modelsDir, 'stray.t1.deadbeef.glb'), Buffer.alloc(1_500_000))
    const found = messages((await runCheck({ root })).violations, 'BYTES')
    expect(found.some((x) => x.includes('repository budget'))).toBe(true)
  })

  it('ORPHAN: a GLB the manifest does not reference, a missing GLB, and a stray file', async () => {
    writeFileSync(path.join(l.modelsDir, 'stray.t1.deadbeef.glb'), 'x')
    writeFileSync(path.join(l.modelsDir, 'notes.txt'), 'x')
    const real = readdirSync(l.modelsDir).find((f) => f.startsWith('gyroscope.t2'))
    rmSync(path.join(l.modelsDir, real ?? ''))
    const found = (await runCheck({ root })).violations.filter((v) => v.code === 'ORPHAN').map((v) => v.subject)
    expect(found).toEqual(expect.arrayContaining(['stray.t1.deadbeef.glb', 'notes.txt', real]))
  })

  it('SCHEMA: a manifest entry with no source (the no-matching-source check)', async () => {
    writeFileSync(l.sourcesFile, '[]\n')
    const found = messages((await runCheck({ root })).violations, 'SCHEMA')
    expect(found).toContain('manifest entry has no matching source in sources.json')
  })

  it('COMPLETE: an enabled source that has no manifest entry at all', async () => {
    const sources = JSON.parse(readFileSync(l.sourcesFile, 'utf8')) as Record<string, unknown>[]
    first(sources)['enabled'] = true
    writeFileSync(l.sourcesFile, canonicalJson(sources))
    editManifest((m) => void m.splice(0, m.length))
    for (const f of readdirSync(l.modelsDir)) if (f.endsWith('.glb')) rmSync(path.join(l.modelsDir, f))
    const found = messages((await runCheck({ root })).violations, 'COMPLETE')
    expect(found).toContain('enabled source has no manifest entry; run assets:ingest')
  })

  it('SCHEMA: a contentHash that no longer matches the models', async () => {
    const manifest = readManifest()
    manifest.contentHash = '0000000000000000'
    writeFileSync(l.manifestFile, canonicalJson(manifest))
    expect(codes((await runCheck({ root })).violations)).toEqual(['SCHEMA'])
  })

  it('SCHEMA: a missing credits file, and a manifest that is not JSON', async () => {
    rmSync(l.creditsFile)
    expect(codes((await runCheck({ root })).violations)).toContain('SCHEMA')
    writeFileSync(l.manifestFile, '{not json')
    expect((await runCheck({ root })).violations.some((v) => v.code === 'SCHEMA' && v.subject === 'manifest.json')).toBe(true)
  })

  it('LICENCE: turning an entry on in the manifest without crediting it', async () => {
    editManifest((m) => {
      for (const e of m) e['enabled'] = true
    })
    const found = codes((await runCheck({ root })).violations)
    expect(found).toContain('LICENCE')
    expect(found).toContain('SCHEMA') // sources.json still says enabled: false
  })

  it('COMPLETE: an enabled source that asks for a tier its manifest entry lacks, with credits in order', async () => {
    const sources = JSON.parse(readFileSync(l.sourcesFile, 'utf8')) as Record<string, unknown>[]
    const [source] = sources
    if (!source) throw new Error('fixture has no source')
    source['enabled'] = true
    source['tiers'] = [1, 2, 3]
    writeFileSync(l.sourcesFile, canonicalJson(sources))
    editManifest((m) => {
      for (const e of m) e['enabled'] = true
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
    expect(codes((await runCheck({ root })).violations)).toEqual(['COMPLETE'])
  })
})
