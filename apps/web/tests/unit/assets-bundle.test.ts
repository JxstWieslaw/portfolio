// @vitest-environment node
/** `npm run check:bundle`: the post-build guard that sits behind the ESLint rule. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { build } from 'esbuild'

import { ASSET_TOOLCHAIN_CANARY, main, scanBundle, scanText } from '../../scripts/assets/bundle'

const tmp = mkdtempSync(path.join(tmpdir(), 'bundle-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

let n = 0
/** A web root whose `.next/static` holds the given files. */
function webRoot(files: Record<string, string>): string {
  const root = path.join(tmp, `case-${n++}`)
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, '.next', 'static', ...name.split('/'))
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  return root
}
const staticDir = (root: string) => path.join(root, '.next', 'static')

describe('scanBundle', () => {
  it('passes chunks that are ordinary client code, including the English word', () => {
    const root = webRoot({
      'chunks/app.js': 'export const a = "a sharp edge, sharpen the mesh, meshopt decoder from three"; console.log(1)',
      'chunks/pages/x.js': 'var gltf = "gltf-transform is a name in prose"',
    })
    expect(scanBundle(staticDir(root))).toEqual({ files: 2, findings: [] })
  })

  it.each([
    ['an @gltf-transform package', 'var a = require("@gltf-transform/core")', '@gltf-transform'],
    ['a deep @gltf-transform import', 'import("@gltf-transform/functions/dist/x.js")', '@gltf-transform'],
    ['require("sharp")', 'var s = require("sharp")', 'sharp'],
    ['require with single quotes and spaces', "var s = require ( 'sharp' )", 'sharp'],
    ['import("sharp")', 'const s = await import("sharp")', 'sharp'],
    ['from "sharp"', 'import x from "sharp"', 'sharp'],
    ['the native binding package', 'path:"node_modules/@img/sharp-linux-x64/lib"', 'sharp'],
    ['libvips', 'x("sharp-libvips-linux-x64")', 'sharp'],
    ['a sharp subpath', 'require("sharp/lib/index")', 'sharp'],
    ['the meshopt encoder', 'require("meshoptimizer/meshopt_encoder.js")', 'meshopt encoder or simplifier'],
    ['the meshopt simplifier', 'var s = MeshoptSimplifier', 'meshopt encoder or simplifier'],
  ])('flags %s, in a nested chunk, by name', (_label, text, label) => {
    const root = webRoot({ 'chunks/ok.js': 'var fine = 1', 'chunks/deep/er/bad.js': text })
    expect(scanBundle(staticDir(root)).findings).toEqual([{ file: 'chunks/deep/er/bad.js', label }])
  })

  it('reads .mjs too, and ignores files that are not JavaScript', () => {
    const root = webRoot({ 'chunks/a.mjs': 'require("sharp")', 'media/readme.txt': 'require("sharp")', 'css/a.css': '@gltf-transform/' })
    expect(scanBundle(staticDir(root)).findings.map((f) => f.file)).toEqual(['chunks/a.mjs'])
    expect(scanBundle(staticDir(root)).files).toBe(1)
  })
})

describe('the canary: a minified chunk has no package names, only string values', () => {
  const minified = 'var a=1;function f(){return"__asset-toolchain-7f3a__"}export{f};'

  it('flags a chunk whose only trace is the canary', () => {
    const root = webRoot({ 'chunks/min.js': minified })
    expect(scanBundle(staticDir(root)).findings).toEqual([{ file: 'chunks/min.js', label: 'asset toolchain marker' }])
  })

  it('does not flag a client chunk that carries a runtime meshopt DECODER', () => {
    const root = webRoot({ 'chunks/decoder.js': 'import{MeshoptDecoder}from"meshoptimizer/meshopt_decoder.module.js";var d=MeshoptDecoder' })
    expect(scanBundle(staticDir(root)).findings).toEqual([])
  })

  it('validators.ts, pipeline.ts and images.ts all carry exactly the marker the checker greps for', () => {
    for (const file of ['validators.ts', 'pipeline.ts', 'images.ts'])
      expect(readFileSync(path.join(__dirname, '..', '..', 'scripts', 'assets', file), 'utf8'), file).toContain(`export const ASSET_TOOLCHAIN_CANARY = '${ASSET_TOOLCHAIN_CANARY}'`)
  })
})

describe('a real minified, tree-shaken browser bundle still carries the marker', () => {
  const scripts = path.join(__dirname, '..', '..', 'scripts', 'assets')
  const bundle = async (entry: string): Promise<string> => {
    const result = await build({
      stdin: { contents: entry.replace('SCRIPTS', scripts.split(path.sep).join('/')), resolveDir: scripts, loader: 'ts' },
      bundle: true,
      minify: true,
      treeShaking: true,
      platform: 'browser',
      format: 'esm',
      write: false,
      logLevel: 'silent',
      // The toolchain packages stay external: this is about OUR modules' own strings, with package names set aside.
      external: ['node:*', '@gltf-transform/*', 'sharp', 'meshoptimizer'],
    })
    return result.outputFiles[0]?.text ?? ''
  }

  it.each([
    ['validators.ts', "import { scanGlb } from 'SCRIPTS/validators';console.log(scanGlb)"],
    ['pipeline.ts', "import { buildVariant } from 'SCRIPTS/pipeline';console.log(buildVariant)"],
    ['images.ts', "import { verifyImages } from 'SCRIPTS/images';console.log(verifyImages)"],
  ])('importing one function from %s keeps the marker, and the scan flags the output', async (_file, entry) => {
    const out = await bundle(entry)
    expect(out.length).toBeGreaterThan(100)
    expect(out).toContain(ASSET_TOOLCHAIN_CANARY)
    expect(scanText(out)).toContain('asset toolchain marker')
    const root = webRoot({ 'chunks/min.js': out })
    expect(scanBundle(staticDir(root)).findings.map((f) => f.label)).toContain('asset toolchain marker')
  }, 60_000)

  it('a bundle that imports none of the toolchain does not carry it', async () => {
    const out = await bundle('console.log("an ordinary client module")')
    expect(scanText(out)).toEqual([])
  })
})

describe('main', () => {
  let errors: string[] = []
  let logs: string[] = []
  beforeEach(() => {
    errors = []
    logs = []
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => void errors.push(String(line)))
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => void logs.push(String(line)))
  })
  afterEach(() => vi.restoreAllMocks())

  it('exits 0 and says how many files it read', () => {
    expect(main(webRoot({ 'chunks/a.js': 'var a = 1' }))).toBe(0)
    expect(logs).toEqual(['check:bundle ok: 1 client JavaScript file(s), none carries asset tooling'])
  })

  it('exits 1 and names each file and what it carries', () => {
    expect(main(webRoot({ 'chunks/a.js': 'require("sharp")', 'chunks/b.js': 'require("@gltf-transform/core")' }))).toBe(1)
    expect(errors).toEqual(['[BUNDLE] chunks/a.js: contains sharp', '[BUNDLE] chunks/b.js: contains @gltf-transform', 'check:bundle failed: 2 client file(s) carry asset tooling'])
  })

  it('exits 1 when there is nothing to scan, instead of passing on an empty directory (no build ran)', () => {
    const root = path.join(tmp, 'never-built')
    expect(main(root)).toBe(1)
    expect(errors[0]).toContain('found no JavaScript')
  })
})
