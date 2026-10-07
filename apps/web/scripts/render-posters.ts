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
 *
 * It does not trust what it screenshots: every frame must be tier 3 with a half-float target and 4x MSAA, must not be
 * blank, must have the bright subject, and must have nothing bright where the page's panel and nav would be (which is
 * how a renamed attribute that breaks the isolation shows up). Any failure stops the run before a file or the manifest
 * is written, and a run that fails any budget or parity check leaves the committed posters exactly as they were.
 *
 * `--png-dir <dir>` keeps raw screenshots for re-encoding without re-rendering. They are filed under the inputs hash, so
 * pixels rendered from other inputs are never reused. `--only <state>/<orientation>` renders one still to a temp file
 * for a look; it writes nothing else.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, type Page } from '@playwright/test'
import sharp from 'sharp'

import type { PosterEntry, PosterFile, PosterManifest } from '../lib/hero/posters'
import { MANIFEST_FILE, OG_PUBLIC, POSTER_PUBLIC, sha256Bytes } from './posters/check'
import { BUDGET_BYTES, budgetFor, ENCODE, FREEZE_T, MIN_BYTES, OG, ORIENTATIONS, PARITY, POSTER_PIPELINE_VERSION, posterInputsHash, sharpVersionFrom, STATES } from './posters/spec'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3107

/** Hides the page and everything on it but the hero canvas, without changing layout (the engine frames on the panel). */
const ISOLATE = `
  main > :not([data-assembly]), header, footer, .skip-link, nav,
  [data-assembly] canvas:not([data-hero-canvas]) { visibility: hidden !important; }
  html, body { background: #000 !important; }
`

/** What a sane frame looks like, measured on the committed renders (greyscale 0..255): the floors leave a wide margin. */
const FRAME = { minMean: 12, minStdev: 6, minPeak: 150, quietMaxPeak: 110 } as const

interface Seam {
  frames: number
  errors: string[]
  tier: number
}

const FLAGS = ['url', 'only', 'png-dir'] as const

/** Flags take a value, and an unknown flag or a missing value is an error, not a silent default. */
function parseArgs(argv: readonly string[]): Record<(typeof FLAGS)[number], string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]?.replace(/^--/, '')
    const value = argv[i + 1]
    if (!argv[i]?.startsWith('--') || !name || !(FLAGS as readonly string[]).includes(name)) throw new Error(`unknown argument ${argv[i]}; flags are ${FLAGS.map((f) => `--${f}`).join(', ')}`)
    if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value`)
    out[name] = value
  }
  return out as Record<(typeof FLAGS)[number], string | undefined>
}

const args = parseArgs(process.argv.slice(2))
const valid = ORIENTATIONS.flatMap((o) => STATES.map((s) => `${s.id}/${o.id}`))
if (args.only !== undefined && !valid.includes(args.only)) throw new Error(`--only ${args.only} is not one of ${valid.join(', ')}`)

async function answers(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok
  } catch {
    return false
  }
}

async function serve(): Promise<{ url: string; stop: () => void }> {
  const given = args.url
  if (given) {
    if (!(await answers(given))) throw new Error(`nothing is answering at ${given}`)
    return { url: given, stop: () => {} }
  }
  const url = `http://localhost:${PORT}`
  // Rendering whatever happens to be on the port would silently mix another build into the posters.
  if (await answers(url)) throw new Error(`something already answers on port ${PORT}: stop it, or pass --url to use it on purpose`)
  const next = path.join(webRoot, '..', '..', 'node_modules', 'next', 'dist', 'bin', 'next')
  const child: ChildProcess = spawn(process.execPath, [next, 'start', '--port', String(PORT)], { cwd: webRoot, stdio: 'inherit' })
  let died: string | null = null
  child.on('error', (error) => (died = `next start could not start: ${error.message}`))
  child.on('exit', (code) => (died = `next start exited with code ${code} before it answered: has the app been built (NEXT_PUBLIC_MODEL_TEST=1 npm run build -w @repo/web)?`))
  for (let waited = 0; waited < 60_000; waited += 500) {
    if (died) throw new Error(died)
    if (await answers(url)) return { url, stop: () => child.kill() }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  child.kill()
  throw new Error('next start did not answer within 60 s: run NEXT_PUBLIC_MODEL_TEST=1 npm run build -w @repo/web first')
}

/** Greyscale mean, standard deviation and peak of a region of a PNG. */
async function lumaStats(png: Buffer, region?: { left: number; top: number; width: number; height: number }): Promise<{ mean: number; stdev: number; peak: number }> {
  // `stats()` ignores a pipeline's crop, so the crop is materialised first.
  const input = region ? await sharp(png).extract(region).png().toBuffer() : png
  const c = (await sharp(input).greyscale().stats()).channels[0]
  return { mean: c?.mean ?? 0, stdev: c?.stdev ?? 0, peak: c?.max ?? 0 }
}

/** Throws unless the screenshot is a sane hero frame: not blank, has the bright subject, and the page chrome is gone. */
async function assertSaneFrame(png: Buffer, label: string, orientation: string): Promise<void> {
  const meta = await sharp(png).metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  const whole = await lumaStats(png)
  if (whole.mean < FRAME.minMean || whole.stdev < FRAME.minStdev) throw new Error(`${label}: the frame is blank or nearly so (mean ${whole.mean.toFixed(1)}, stdev ${whole.stdev.toFixed(1)}): refusing to write it`)
  if (whole.peak < FRAME.minPeak) throw new Error(`${label}: the frame has no bright subject (peak ${whole.peak}): wrong state, or the engine did not draw it`)
  // Where the glass panel and the nav would be, an isolated frame is empty floor. Text there means the isolation broke.
  const quiet = orientation === 'portrait' ? { left: 0, top: Math.round(h * 0.55), width: w, height: h - Math.round(h * 0.55) } : { left: 0, top: 0, width: Math.round(w * 0.4), height: h }
  const q = await lumaStats(png, quiet)
  if (q.peak > FRAME.quietMaxPeak) throw new Error(`${label}: something bright (peak ${q.peak}) is where only the floor should be: the page was not isolated (ISOLATE no longer matches the markup?)`)
}

async function render(page: Page, base: string, s: number, label: string, orientation: string): Promise<Buffer> {
  await page.goto(`${base}/?hero=a&tier=3&freeze=${FREEZE_T},${s}&grain=0`, { waitUntil: 'load' })
  // The seam is created when the hero mounts (after the LCP gate), so its absence is only knowable once the wait has failed.
  await page.waitForSelector('html[data-hero="live"]', { timeout: 120_000 }).catch(async () => {
    const seam = await page.evaluate(() => typeof (window as unknown as { __ASSEMBLY_HERO__?: unknown }).__ASSEMBLY_HERO__ !== 'undefined')
    throw new Error(seam ? 'the hero never went live: does WebGL2 work in this Chromium?' : 'the hero test seam (__ASSEMBLY_HERO__) is absent: this is not a NEXT_PUBLIC_MODEL_TEST=1 build, so ?freeze and ?grain do nothing')
  })
  await page.addStyleTag({ content: ISOLATE })
  // The loop keeps redrawing the same frozen still; wait until a few frames have been presented since the isolation.
  const seen = await page.evaluate(() => (window as unknown as { __ASSEMBLY_HERO__: Seam }).__ASSEMBLY_HERO__.frames)
  await page.waitForFunction((n) => (window as unknown as { __ASSEMBLY_HERO__: Seam }).__ASSEMBLY_HERO__.frames >= n + 3, seen, { timeout: 120_000 })
  const state = await page.evaluate(() => ({
    errors: (window as unknown as { __ASSEMBLY_HERO__: Seam }).__ASSEMBLY_HERO__.errors,
    tier: (window as unknown as { __ASSEMBLY_HERO__: Seam }).__ASSEMBLY_HERO__.tier,
    target: document.documentElement.getAttribute('data-hero-target'),
    reason: document.documentElement.getAttribute('data-hero-reason'),
  }))
  if (state.errors.length > 0) throw new Error(`${label}: the engine reported errors: ${state.errors.join(' | ')}`)
  if (state.reason) throw new Error(`${label}: the hero gave up (${state.reason})`)
  // Posters are the L3 look: full resolution, half-float, 4x MSAA. A degraded target would bake the degradation in.
  if (state.tier !== 3) throw new Error(`${label}: rendered at tier ${state.tier}, not 3`)
  if (state.target === 'rgba8' || state.target === 'msaa0') throw new Error(`${label}: the engine fell back to a ${state.target} target`)
  const png = await page.screenshot({ type: 'png', animations: 'disabled' })
  await assertSaneFrame(png, label, orientation)
  return png
}

function hashed(name: string, ext: string, bytes: Buffer): { file: PosterFile; bytes: Buffer } {
  const sha256 = sha256Bytes(bytes)
  return { file: { file: `${name}.${sha256.slice(0, 8)}.${ext}`, bytes: bytes.length, sha256 }, bytes }
}

function playwrightVersion(): string {
  const pkg = JSON.parse(readFileSync(path.join(webRoot, '..', '..', 'node_modules', '@playwright', 'test', 'package.json'), 'utf8')) as { version: string }
  return pkg.version
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

async function main(): Promise<void> {
  const inputsHash = posterInputsHash(webRoot)
  // Cached screenshots are filed under the inputs they were rendered from, so a changed shader never reuses old pixels.
  const pngDir = args['png-dir'] ? path.join(args['png-dir'], inputsHash) : null
  if (pngDir) mkdirSync(pngDir, { recursive: true })
  const server = await serve()
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  try {
    const entries: PosterEntry[] = []
    const pending: { dir: string; file: PosterFile; bytes: Buffer }[] = []
    const over: string[] = []
    let landscapeFull: Buffer | null = null
    for (const o of ORIENTATIONS) {
      const width = Math.round(o.cssWidth * o.scale)
      const height = Math.round(o.cssHeight * o.scale)
      const context = await browser.newContext({ viewport: { width: o.cssWidth, height: o.cssHeight }, deviceScaleFactor: o.scale })
      const page = await context.newPage()
      page.on('pageerror', (error) => console.error('page error:', error.message))
      for (const s of STATES) {
        const label = `${s.id}/${o.id}`
        if (args.only && args.only !== label) continue
        const started = Date.now()
        const cached = pngDir ? path.join(pngDir, `hero-${o.id}-${s.id}.png`) : null
        let png: Buffer
        if (cached && existsSync(cached)) {
          png = readFileSync(cached)
          await assertSaneFrame(png, label, o.id)
        } else {
          png = await render(page, server.url, s.s, label, o.id)
          if (cached) writeFileSync(cached, png)
        }
        const meta = await sharp(png).metadata()
        if (meta.width !== width || meta.height !== height) throw new Error(`${label}: screenshot is ${meta.width}x${meta.height}, expected ${width}x${height}`)
        const name = `hero-${o.id}-${s.id}`
        if (args.only) {
          const preview = path.join(tmpdir(), `${name}.preview.png`)
          writeFileSync(preview, png)
          console.log(`preview: ${preview}`)
          continue
        }
        if (s.id === 'full' && o.id === 'landscape') landscapeFull = png
        const a = await encodeToBudget(png, 'avif', budgetFor(s.id, o.id))
        const w = await encodeToBudget(png, 'webp', budgetFor(s.id, o.id, 'webp'))
        const avif = hashed(name, 'avif', a.bytes)
        const webp = hashed(name, 'webp', w.bytes)
        pending.push({ dir: POSTER_PUBLIC, ...avif }, { dir: POSTER_PUBLIC, ...webp })
        entries.push({ state: s.id, orientation: o.id, width, height, avif: avif.file, webp: webp.file })
        console.log(`${name}: ${width}x${height}  avif ${avif.bytes.length} B (q${a.quality})  webp ${webp.bytes.length} B (q${w.quality})  budget ${budgetFor(s.id, o.id)} B  (${((Date.now() - started) / 1000).toFixed(1)} s)`)
        for (const [format, r] of [['avif', a], ['webp', w]] as const) {
          const err = await encodeError(png, r.bytes)
          console.log(`  ${format} error vs render: mean ${err.mean.toFixed(4)}  p95 ${err.p95.toFixed(4)}`)
          if (err.mean > PARITY.mean || err.p95 > PARITY.p95) over.push(`${name} ${format}: differs from the render by mean ${err.mean.toFixed(4)} / p95 ${err.p95.toFixed(4)}, the fade tolerance is ${PARITY.mean} / ${PARITY.p95}`)
          if (r.bytes.length > budgetFor(s.id, o.id, format)) over.push(`${name} ${format}: ${r.bytes.length} B at the quality floor q${r.quality}, budget ${budgetFor(s.id, o.id, format)} B`)
          if (r.bytes.length < MIN_BYTES.poster) over.push(`${name} ${format}: only ${r.bytes.length} B: a blank frame?`)
        }
      }
      await context.close()
    }
    if (args.only) {
      console.log('--only renders one still for inspection: it writes nothing else')
      return
    }
    if (!landscapeFull) throw new Error('the landscape full still was not rendered, so there is no OG image')
    const ogBytes = await sharp(landscapeFull).resize(OG.width, OG.height, { fit: 'cover', position: 'right top' }).png(ENCODE.og).toBuffer()
    const og = hashed('hero', 'png', ogBytes)
    console.log(`og: ${OG.width}x${OG.height}  png ${og.bytes.length} B`)
    if (og.bytes.length > BUDGET_BYTES.og) over.push(`og: ${og.bytes.length} B, budget ${BUDGET_BYTES.og} B`)
    if (og.bytes.length < MIN_BYTES.og) over.push(`og: only ${og.bytes.length} B: a blank frame?`)

    // Nothing is written, and nothing is deleted, unless every check passed: a failed run leaves the committed posters alone.
    if (over.length > 0) {
      console.error(`over budget or out of tolerance, nothing written:\n  ${over.join('\n  ')}`)
      process.exitCode = 1
      return
    }
    const posterDir = path.join(webRoot, POSTER_PUBLIC)
    const ogDir = path.join(webRoot, OG_PUBLIC)
    mkdirSync(posterDir, { recursive: true })
    mkdirSync(ogDir, { recursive: true })
    for (const p of [...pending, { dir: OG_PUBLIC, ...og }]) writeFileSync(path.join(webRoot, p.dir, p.file.file), p.bytes)
    const manifest: PosterManifest = {
      pipeline: POSTER_PIPELINE_VERSION,
      inputsHash,
      renderedWith: { chromium: browser.version(), sharp: sharpVersionFrom(webRoot), playwright: playwrightVersion() },
      posters: entries,
      og: { ...og.file, width: OG.width, height: OG.height },
    }
    writeFileSync(path.join(webRoot, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`)
    // Clear what the new manifest no longer names, so a stale render cannot linger beside the fresh one.
    const keep = new Set(entries.flatMap((e) => [e.avif.file, e.webp.file]))
    for (const file of readdirSync(posterDir)) if (file !== 'manifest.json' && !keep.has(file)) rmSync(path.join(posterDir, file))
    for (const file of readdirSync(ogDir)) if (file !== og.file.file) rmSync(path.join(ogDir, file))
    console.log(`manifest written, inputs ${manifest.inputsHash}`)
  } finally {
    await browser.close()
    server.stop()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
