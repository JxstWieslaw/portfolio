// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { main as fetchMain, fetchSource } from '../../scripts/assets/fetch'
import { main as ingestMain, runIngest } from '../../scripts/assets/ingest'
import { SourceHashMismatch } from '../../scripts/assets/pipeline'
import { defaultRoot, layoutFor, sourceEntrySchema } from '../../scripts/assets/sources'
import { sha256Hex } from '../../scripts/assets/validators'
import { gyroscopeSource } from './assets-fixtures'

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
  const gyro = gyroscopeSource()
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

  it('B2: exit 3 never claims a write under --dry-run or --verify, and verify still prints its mismatches', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const said = (spy: typeof log) => spy.mock.calls.flat().join('\n')
    try {
      const { root, actual } = rawRoot('exit3-flags', 'a'.repeat(64))
      expect(await ingestMain(['--accept-source-change', actual, '--dry-run'], root)).toBe(3)
      expect(said(log)).toMatch(/dry run: \d+ file\(s\) would be written, nothing was/)
      expect(said(log)).not.toMatch(/wrote/)
      expect(existsSync(layoutFor(root).manifestFile)).toBe(false)

      log.mockClear()
      err.mockClear()
      expect(await ingestMain(['--accept-source-change', actual, '--verify'], root)).toBe(3)
      expect(said(log)).not.toMatch(/wrote/)
      expect(said(err)).toContain('verify: manifest.json differs from a fresh ingest')
      expect(existsSync(layoutFor(root).manifestFile)).toBe(false)

      log.mockClear()
      expect(await ingestMain(['--accept-source-change', actual], root)).toBe(3)
      expect(said(log)).toMatch(/wrote \d+ file\(s\), manifest [0-9a-f]{16}$/)
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
    const source = sourceEntrySchema.parse(gyroscopeSource())
    await expect(fetchSource(source, layoutFor(tmp), { fetch: body(new Uint8Array(1)) })).rejects.toThrow(/generated/)
  })
})

/** What the offline library files may never contain. fetch.ts is the only network code in the toolchain. */
const NETWORK_PATTERNS: readonly (readonly [string, RegExp])[] = [
  ['an import of ./fetch', /from\s+['"]\.\/fetch(?:\.[jt]s)?['"]/],
  ['a dynamic import of ./fetch', /import\(\s*['"]\.\/fetch(?:\.[jt]s)?['"]\s*\)/],
  ['a fetch( call', /\bfetch\(/],
  ['globalThis.fetch(', /globalThis\.fetch\(/],
  ['a network or process module', /['"](?:node:)?(?:https?|http2|net|dns|tls|dgram|child_process)['"]/],
  ['undici', /['"]undici['"]/],
]

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
    for (const file of ['ingest.ts', 'check.ts', 'pipeline.ts', 'validators.ts', 'sources.ts', 'hosts.ts']) {
      const source = read('apps', 'web', 'scripts', 'assets', file)
      for (const [label, pattern] of NETWORK_PATTERNS) expect(source, `${file}: ${label}`).not.toMatch(pattern)
    }
  })

  it.each([
    ['import from ./fetch', `import { x } from './fetch'`],
    ['a dynamic import of ./fetch', `const m = await import('./fetch')`],
    ['fetch(', `await fetch(url)`],
    ['globalThis.fetch(', `await globalThis.fetch(url)`],
    ['node:http', `import h from 'node:http'`],
    ['node:https', `import h from 'node:https'`],
    ['node:http2', `import h from 'node:http2'`],
    ['node:net', `import n from 'node:net'`],
    ['node:dns', `import d from 'node:dns'`],
    ['node:tls', `import t from 'node:tls'`],
    ['node:dgram', `import d from 'node:dgram'`],
    ['child_process', `import { spawn } from 'node:child_process'`],
    ['a bare child_process', `const cp = require('child_process')`],
    ['undici', `import { request } from 'undici'`],
  ])('the no-network patterns catch %s', (_label, code) => {
    expect(NETWORK_PATTERNS.some(([, pattern]) => pattern.test(code))).toBe(true)
  })

  describe('CI refuses a tracked assets-src path, and only that', () => {
    // The pathspecs are read out of ci.yml and run by real git in a throwaway repository.
    const ci = read('.github', 'workflows', 'ci.yml')
    const line = /run: test -z "\$\(git ls-files -- (.+)\)"/.exec(ci)?.[1] ?? ''
    const specs = [...line.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '')
    const tracked = (files: string[]): string[] => {
      const repo = mkdtempSync(path.join(tmp, 'pathspec-'))
      const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
      git('init', '-q')
      for (const f of files) {
        mkdirSync(path.dirname(path.join(repo, f)), { recursive: true })
        writeFileSync(path.join(repo, f), 'x')
      }
      git('add', '-A')
      return git('ls-files', '--', ...specs).split(String.fromCharCode(10)).filter(Boolean)
    }

    it('uses two exact pathspecs', () => {
      expect(specs).toEqual([':(glob,icase)**/assets-src/**', ':(glob,icase)**/assets-src'])
    })
    it.each(['assets-src/a.glb', 'assets-src/raw/deep/m.glb', 'apps/web/assets-src/a.glb', 'ASSETS-SRC/a.glb', 'a/Assets-Src/b/c.zip', 'assets-src'])('refuses %s', (file) => {
      expect(tracked([file])).toEqual([file])
    })
    it.each(['docs/assets-src-notes.md', 'my-assets-src/a.glb', 'assets-src.md', 'assets-sources/a.glb', 'apps/web/assets/a.glb'])('lets %s through', (file) => {
      expect(tracked([file])).toEqual([])
    })
  })

  it('turbo caches the test task against the content folder that the tests read', () => {
    const turbo = JSON.parse(read('turbo.json')) as { tasks: Record<string, { inputs?: string[] }> }
    expect(turbo.tasks['test']?.inputs).toEqual(['$TURBO_DEFAULT$', '../../content/**'])
  })
})
