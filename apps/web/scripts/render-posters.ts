/**
 * Renders the hero posters and the OG image from the live hero engine — hero monolith spec § 7.
 *
 *   NEXT_PUBLIC_MODEL_TEST=1 npm run build -w @repo/web     # the test-seam build: it has ?freeze and ?grain=0
 *   npm run posters:render -w @repo/web                     # starts `next start`, renders, encodes, writes
 *   npm run posters:render -w @repo/web -- --url http://localhost:3000   # or use a server that is already up
 *
 * For each orientation and state (`scripts/posters/spec.ts`) it opens `/?hero=a&tier=3&freeze=3,<s>&grain=0` in
 * Chromium on SwiftShader (a CPU rasteriser, which is fine for a still and needs no GPU), hides everything except the
 * hero canvas, screenshots it at the poster's pixel size, and encodes AVIF and WebP with `sharp`. Files are named by
 * the first 8 hex of their sha256 and listed in `public/posters/manifest.json` with the inputs hash, so a re-render of
 * unchanged inputs on the same toolchain is byte-identical and `posters:check` can tell when the posters are stale.
 *
 * Needs the seam build because `?freeze` and `?grain` exist only there (the production guard keeps them out of the
 * shipped bundle). The script refuses to run against anything else instead of rendering a live, moving frame.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import { chromium, type Page } from '@playwright/test'
import sharp from 'sharp'

import type { PosterEntry, PosterFile, PosterManifest } from '../lib/hero/posters'
import { MANIFEST_FILE, OG_PUBLIC, POSTER_PUBLIC, sha256Bytes } from './posters/check'
import { budgetFor, ENCODE, FREEZE_T, OG, PARITY, ORIENTATIONS, POSTER_PIPELINE_VERSION, posterInputsHash, sharpVersionFrom, STATES } from './posters/spec'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Hides the page and everything on it but the hero canvas, without changing layout (the engine frames on the panel). */
const ISOLATE = `
  main > :not([data-assembly]), header, footer, .skip-link, nav,
  [data-assembly] canvas:not([data-hero-canvas]) { visibility: hidden !important; }
  html, body { background: #000 !important; }
`

interface Seam {
  frames: number
  errors: string[]
}

const arg = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`)
  return at >= 0 ? process.argv[at + 1] : undefined
}

async function reachable(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok
  } catch {
    return false
  }
}

async function serve(): Promise<{ url: string; stop: () => void }> {
  const given = arg('url')
  if (given) {
    if (!(await reachable(given))) throw new Error(`nothing is answering at ${given}`)
    return { url: given, stop: () => {} }
  }
  const port = 3107
  const url = `http://localhost:${port}`
  const next = path.join(webRoot, '..', '..', 'node_modules', 'next', 'dist', 'bin', 'next')
  const child: ChildProcess = spawn(process.execPath, [next, 'start', '--port', String(port)], { cwd: webRoot, stdio: 'inherit' })
  for (let waited = 0; waited < 60_000; waited += 500) {
    if (await reachable(url)) return { url, stop: () => child.kill() }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  child.kill()
  throw new Error('next start did not come up: run NEXT_PUBLIC_MODEL_TEST=1 npm run build -w @repo/web first')
}

async function render(page: Page, base: string, s: number): Promise<Buffer> {
  await page.goto(`${base}/?hero=a&tier=3&freeze=${FREEZE_T},${s}&grain=0`, { waitUntil: 'load' })
  await page.waitForSelector('html[data-hero="live"]', { timeout: 120_000 }).catch(() => {
    throw new Error('the hero never went live: is this a NEXT_PUBLIC_MODEL_TEST=1 build, and does WebGL2 work in this Chromium?')
  })
  await page.addStyleTag({ content: ISOLATE })
  // The loop keeps redrawing the same frozen still; wait until a few frames have been presented since the isolation.
  const seen = await page.evaluate(() => (window as unknown as { __ASSEMBLY_HERO__: Seam }).__ASSEMBLY_HERO__.frames)
  await page.waitForFunction((n) => (window as unknown as { __ASSEMBLY_HERO__: Seam }).__ASSEMBLY_HERO__.frames >= n + 3, seen, { timeout: 120_000 })
  const errors = await page.evaluate(() => (window as unknown as { __ASSEMBLY_HERO__: Seam }).__ASSEMBLY_HERO__.errors)
  if (errors.length > 0) throw new Error(`the engine reported errors: ${errors.join(' | ')}`)
  return page.screenshot({ type: 'png', animations: 'disabled' })
}

function writeHashed(dir: string, name: string, ext: string, bytes: Buffer): PosterFile {
  const sha256 = sha256Bytes(bytes)
  const file = `${name}.${sha256.slice(0, 8)}.${ext}`
  writeFileSync(path.join(webRoot, dir, file), bytes)
  return { file, bytes: bytes.length, sha256 }
}

/**
 * How far an encoded poster is from the render it came from: max-channel absolute difference per pixel on 0..1, after a
 * 4x box downsample (the spec's parity method, § 8.4), as mean and p95. The first live frame is the same pixels as the
 * render, so this is also the distance between the poster and the first live frame the fade crosses.
 */
async function encodeError(png: Buffer, encoded: Buffer): Promise<{ mean: number; p95: number }> {
  const meta = await sharp(png).metadata()
  const w = Math.round((meta.width ?? 4) / 4)
  const h = Math.round((meta.height ?? 4) / 4)
  const grid = (input: Buffer): Promise<Buffer> => sharp(input).resize(w, h, { kernel: 'lanczos3', fit: 'fill' }).removeAlpha().raw().toBuffer()
  const [a, b] = await Promise.all([grid(png), grid(encoded)])
  const diffs: number[] = []
  for (let i = 0; i < a.length; i += 3) diffs.push(Math.max(Math.abs((a[i] ?? 0) - (b[i] ?? 0)), Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0)), Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0))) / 255)
  diffs.sort((x, y) => x - y)
  return { mean: diffs.reduce((s, d) => s + d, 0) / diffs.length, p95: diffs[Math.floor(diffs.length * 0.95)] ?? 0 }
}

/** The highest quality whose result fits `budget`, never below the format's floor. Deterministic: same pixels, same bytes. */
async function encodeToBudget(png: Buffer, format: 'avif' | 'webp', budget: number): Promise<{ bytes: Buffer; quality: number }> {
  const e = ENCODE[format]
  let quality: number = e.quality
  for (;;) {
    const bytes = format === 'avif' ? await sharp(png).avif({ ...ENCODE.avif, quality }).toBuffer() : await sharp(png).webp({ ...ENCODE.webp, quality }).toBuffer()
    if (bytes.length <= budget || quality <= e.floor) return { bytes, quality }
    quality = Math.max(e.floor, quality - e.step)
  }
}

function playwrightVersion(): string {
  const pkg = JSON.parse(readFileSync(path.join(webRoot, '..', '..', 'node_modules', '@playwright', 'test', 'package.json'), 'utf8')) as { version: string }
  return pkg.version
}

async function main(): Promise<void> {
  const only = arg('only')
  const pngDir = arg('png-dir')
  if (pngDir) mkdirSync(pngDir, { recursive: true })
  const server = await serve()
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const posterDir = path.join(webRoot, POSTER_PUBLIC)
  const ogDir = path.join(webRoot, OG_PUBLIC)
  mkdirSync(posterDir, { recursive: true })
  mkdirSync(ogDir, { recursive: true })
  try {
    const entries: PosterEntry[] = []
    const over: string[] = []
    let landscapeFull: Buffer | null = null
    for (const o of ORIENTATIONS) {
      const width = Math.round(o.cssWidth * o.scale)
      const height = Math.round(o.cssHeight * o.scale)
      const context = await browser.newContext({ viewport: { width: o.cssWidth, height: o.cssHeight }, deviceScaleFactor: o.scale })
      const page = await context.newPage()
      page.on('pageerror', (error) => console.error('page error:', error.message))
      for (const s of STATES) {
        if (only && only !== `${s.id}/${o.id}`) continue
        const started = Date.now()
        // `--png-dir <dir>` keeps the raw screenshots and reuses them on the next run, so encoder settings can be tuned without re-rendering.
        const cached = pngDir ? path.join(pngDir, `hero-${o.id}-${s.id}.png`) : null
        const png = cached && existsSync(cached) ? readFileSync(cached) : await render(page, server.url, s.s)
        if (cached && !existsSync(cached)) writeFileSync(cached, png)
        const meta = await sharp(png).metadata()
        if (meta.width !== width || meta.height !== height) throw new Error(`${s.id}/${o.id}: screenshot is ${meta.width}x${meta.height}, expected ${width}x${height}`)
        if (s.id === 'full' && o.id === 'landscape') landscapeFull = png
        const name = `hero-${o.id}-${s.id}`
        if (only) {
          const preview = path.join(tmpdir(), `${name}.preview.png`)
          writeFileSync(preview, png)
          console.log(`preview: ${preview}`)
          continue
        }
        const budget = budgetFor(s.id, o.id)
        const a = await encodeToBudget(png, 'avif', budget)
        const w = await encodeToBudget(png, 'webp', budgetFor(s.id, o.id, 'webp'))
        const avif = writeHashed(POSTER_PUBLIC, name, 'avif', a.bytes)
        const webp = writeHashed(POSTER_PUBLIC, name, 'webp', w.bytes)
        entries.push({ state: s.id, orientation: o.id, width, height, avif, webp })
        console.log(`${name}: ${width}x${height}  avif ${avif.bytes} B (q${a.quality})  webp ${webp.bytes} B (q${w.quality})  budget ${budget} B  (${((Date.now() - started) / 1000).toFixed(1)} s)`)
        for (const [format, r] of [['avif', a], ['webp', w]] as const) {
          const err = await encodeError(png, r.bytes)
          console.log(`  ${format} error vs render: mean ${err.mean.toFixed(4)}  p95 ${err.p95.toFixed(4)}`)
          if (err.mean > PARITY.mean || err.p95 > PARITY.p95) over.push(`${name} ${format}: differs from the render by mean ${err.mean.toFixed(4)} / p95 ${err.p95.toFixed(4)}, the fade tolerance is ${PARITY.mean} / ${PARITY.p95}`)
        }
        for (const [format, r] of [['avif', a], ['webp', w]] as const) if (r.bytes.length > budgetFor(s.id, o.id, format)) over.push(`${name} ${format}: ${r.bytes.length} B at the quality floor q${r.quality}, budget ${budgetFor(s.id, o.id, format)} B`)
      }
      await context.close()
    }
    if (only) {
      console.log('--only renders one still for inspection: it does not write the manifest')
      return
    }
    if (!landscapeFull) throw new Error('the landscape full still was not rendered, so there is no OG image')
    const ogBytes = await sharp(landscapeFull).resize(OG.width, OG.height, { fit: 'cover', position: 'right top' }).png(ENCODE.og).toBuffer()
    const og = { ...writeHashed(OG_PUBLIC, 'hero', 'png', ogBytes), width: OG.width, height: OG.height }
    console.log(`og: ${OG.width}x${OG.height}  png ${og.bytes} B`)

    const manifest: PosterManifest = {
      pipeline: POSTER_PIPELINE_VERSION,
      inputsHash: posterInputsHash(webRoot),
      renderedWith: { chromium: browser.version(), sharp: sharpVersionFrom(webRoot), playwright: playwrightVersion() },
      posters: entries,
      og,
    }
    writeFileSync(path.join(webRoot, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`)

    // Clear what the new manifest no longer names, so a stale render cannot linger beside the fresh one.
    const keep = new Set(entries.flatMap((e) => [e.avif.file, e.webp.file]))
    for (const file of readdirSync(posterDir)) if (file !== 'manifest.json' && !keep.has(file)) rmSync(path.join(posterDir, file))
    for (const file of readdirSync(ogDir)) if (file !== og.file) rmSync(path.join(ogDir, file))
    console.log(`manifest written, inputs ${manifest.inputsHash}`)
    if (over.length > 0) {
      console.error(`over budget: ${over.join("; ")}`)
      process.exitCode = 1
    }
  } finally {
    await browser.close()
    server.stop()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
