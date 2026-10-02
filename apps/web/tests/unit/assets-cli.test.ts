// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { main as fetchMain, fetchSource } from '../../scripts/assets/fetch'
import { main as ingestMain, runIngest } from '../../scripts/assets/ingest'
import { SourceHashMismatch } from '../../scripts/assets/pipeline'
import { defaultRoot, layoutFor, sourceEntrySchema } from '../../scripts/assets/sources'
import { sha256Hex } from '../../scripts/assets/validators'

let tmp: string
beforeAll(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'cli-'))
})
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const committed = layoutFor(defaultRoot())
const committedGlb = (): Uint8Array => {
  const name = readdirSync(committed.modelsDir).find((f) => f.startsWith('gyroscope.t2.'))
  return new Uint8Array(readFileSync(path.join(committed.modelsDir, name ?? '')))
}

/** A root whose only source is a raw file (the committed tier 2 GLB, which is a valid GLB) pinned to `pinned`. */
function rawRoot(name: string, pinned: string): { root: string; actual: string } {
  const root = path.join(tmp, name)
  const l = layoutFor(root)
  const bytes = committedGlb()
  mkdirSync(path.join(root, 'assets-src', 'raw-one'), { recursive: true })
  writeFileSync(path.join(root, 'assets-src', 'raw-one', 'm.glb'), bytes)
  mkdirSync(path.dirname(l.sourcesFile), { recursive: true })
  const [gyro] = JSON.parse(readFileSync(committed.sourcesFile, 'utf8')) as Record<string, unknown>[]
  writeFileSync(
    l.sourcesFile,
    JSON.stringify([
      {
        ...gyro,
        id: 'raw-one',
        title: 'Raw one',
        licenceId: 'CC0-1.0',
        licenceEvidence: { url: 'https://kenney.nl/support', retrievedAt: '2026-10-02' },
        origin: { type: 'file', path: 'assets-src/raw-one/m.glb', url: 'https://kenney.nl/m', sha256: pinned },
        tiers: [2],
      },
    ]),
  )
  return { root, actual: sha256Hex(bytes) }
}

describe('ingest: a raw source that changed upstream', () => {
  it('is refused on a hash mismatch', async () => {
    const { root } = rawRoot('mismatch', 'a'.repeat(64))
    await expect(runIngest({ root })).rejects.toBeInstanceOf(SourceHashMismatch)
    expect(existsSync(layoutFor(root).manifestFile)).toBe(false)
  }, 60_000)

  it('is still refused when --accept-source-change names a different hash', async () => {
    const { root } = rawRoot('wrong-accept', 'a'.repeat(64))
    await expect(runIngest({ root, acceptSourceChange: 'b'.repeat(64) })).rejects.toBeInstanceOf(SourceHashMismatch)
  }, 60_000)

  it('is accepted only for the exact hash given, and reported so it gets pinned', async () => {
    const { root, actual } = rawRoot('accept', 'a'.repeat(64))
    const result = await runIngest({ root, acceptSourceChange: actual })
    expect(result.acceptedChanges).toEqual([{ id: 'raw-one', sha256: actual }])
    expect(result.manifest.models[0]?.id).toBe('raw-one')
  }, 60_000)

  it('main() exits 3 and says to pin the hash; 2 for a value that is not a sha256; 1 for a plain mismatch', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const { root, actual } = rawRoot('main-accept', 'a'.repeat(64))
      expect(await ingestMain(['--accept-source-change', actual], root)).toBe(3)
      expect(err.mock.calls.flat().join('\n')).toContain(`now pin sha256 in sources.json: ${actual}`)
      const other = rawRoot('main-plain', 'a'.repeat(64))
      expect(await ingestMain([], other.root)).toBe(1)
      expect(await ingestMain(['--accept-source-change', 'yes'], other.root)).toBe(2)
    } finally {
      log.mockRestore()
      err.mockRestore()
    }
  }, 120_000)

  it('a missing raw file points at assets:fetch', async () => {
    const { root } = rawRoot('missing', 'a'.repeat(64))
    rmSync(path.join(root, 'assets-src'), { recursive: true })
    await expect(runIngest({ root })).rejects.toThrow(/npm run assets:fetch -- --id raw-one/)
  })
})

describe('fetch main(): the exit code the CLI file returns', () => {
  const body = (bytes: Uint8Array) => () => Promise.resolve(new Response(bytes as BodyInit, { status: 200 }))

  it('returns 2 without --id, 1 for an unknown id, 1 on a hash mismatch, and 0 when the pin matches', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const glb = committedGlb()
      const { root } = rawRoot('fetch-main', sha256Hex(glb))
      rmSync(path.join(root, 'assets-src'), { recursive: true })
      expect(await fetchMain([], root, body(glb))).toBe(2)
      expect(await fetchMain(['--id', 'nope'], root, body(glb))).toBe(1)
      expect(await fetchMain(['--id', 'raw-one'], root, body(new Uint8Array([1, 2, 3])))).toBe(1)
      expect(existsSync(path.join(root, 'assets-src'))).toBe(false)
      expect(await fetchMain(['--id', 'raw-one'], root, body(glb))).toBe(0)
      expect(existsSync(path.join(root, 'assets-src', 'raw-one', 'm.glb'))).toBe(true)
    } finally {
      log.mockRestore()
      err.mockRestore()
    }
  })

  it('fetchSource itself writes nothing for a generated source', async () => {
    const source = sourceEntrySchema.parse(JSON.parse(readFileSync(committed.sourcesFile, 'utf8'))[0])
    await expect(fetchSource(source, layoutFor(tmp), { fetch: body(new Uint8Array(1)) })).rejects.toThrow(/generated/)
  })
})

describe('the project files the toolchain relies on', () => {
  const root = defaultRoot()
  const read = (...p: string[]) => readFileSync(path.join(root, ...p), 'utf8')

  it('.gitattributes marks every binary asset type binary and pins generated JSON to LF', () => {
    const lines = read('.gitattributes').split(/\r?\n/)
    for (const ext of ['glb', 'ktx2', 'hdr', 'webp', 'png', 'jpg', 'bin', 'usdz', 'zip'])
      expect(lines, `*.${ext}`).toContain(`*.${ext} binary`)
    expect(lines).toContain('apps/web/public/models/manifest.json text eol=lf')
    expect(lines).toContain('content/credits.json text eol=lf')
    expect(lines).toContain('content/models/sources.json text eol=lf')
  })

  it('.gitignore keeps raw sources out of the repository', () => {
    expect(read('.gitignore').split(/\r?\n/)).toContain('assets-src/')
  })

  it('the package scripts point at the thin CLI entry files, which call main() unconditionally', () => {
    const scripts = (JSON.parse(read('apps', 'web', 'package.json')) as { scripts: Record<string, string> }).scripts
    for (const name of ['ingest', 'check', 'fetch']) {
      expect(scripts[`assets:${name}`]).toBe(`tsx scripts/assets/${name}.cli.ts`)
      const cli = read('apps', 'web', 'scripts', 'assets', `${name}.cli.ts`)
      expect(cli).toContain(`import { main } from './${name}'`)
      expect(cli).toContain('process.exitCode = await main()')
      expect(cli).not.toMatch(/import\.meta|argv/)
    }
  })

  it('the library files are network-free and never import the fetcher', () => {
    for (const file of ['ingest.ts', 'check.ts', 'pipeline.ts', 'validators.ts', 'sources.ts']) {
      const source = read('apps', 'web', 'scripts', 'assets', file)
      expect(source, file).not.toMatch(/from '\.\/fetch'/)
      expect(source, file).not.toMatch(/\bfetch\(/)
      expect(source, file).not.toMatch(/node:https?|node:net|node:dns|node:tls/)
    }
  })

  it('turbo caches the test task against the content folder that the tests read', () => {
    const turbo = JSON.parse(read('turbo.json')) as { tasks: Record<string, { inputs?: string[] }> }
    expect(turbo.tasks['test']?.inputs).toEqual(['$TURBO_DEFAULT$', '../../content/**'])
  })
})
