import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import sharp from 'sharp'

/**
 * Cube pixel parity — plain-three migration spec § 9 (slice S0).
 *
 * The cubes (the Assembly canvas) had no pixel test: the visual suite runs with `?nogl=1`. This renders the cube layer
 * alone at a fixed set of frozen states and compares each with a committed Linux baseline, so a renderer swap (S1, S2)
 * can prove it changed no pixel. Shaders, geometry and draw calls are the same across those slices; only the host changes.
 *
 * `?cubefreeze=<t>,<from>,<to>,<mix>` (the test seam: `lib/assembly/cube-freeze.ts`, compiled out of a deployed build)
 * makes a frame a function of (t, formation pair, mix, viewport). The spec then:
 *   - draws every state twice, in the same order, and requires the two draws to agree (a determinism self-check: it
 *     catches an unseeded random or a wall-clock leak before it becomes a flaky gate);
 *   - refuses a blank capture: the probe must report real draw calls and triangles, and the pixels must carry cubes;
 *   - compares each draw with the baseline PNG under the tolerances below;
 *   - compares what each frame handed the GPU (`__ASSEMBLY_RIG__`, instance count, calls, triangles, programs) with a
 *     committed JSON baseline, exactly.
 *
 * Chromium with SwiftShader, test-seam build only, `desktop` project only (the file makes its own contexts at device
 * pixel ratio 1). Baselines are Linux only, made in the Playwright container: docs/visual-regression.md.
 */

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'needs Chromium with SwiftShader WebGL')
  test.skip(testInfo.project.name !== 'desktop', 'renders its own viewports; one project is enough')
})
test.skip(process.env.NEXT_PUBLIC_MODEL_TEST !== '1', 'needs an app built with NEXT_PUBLIC_MODEL_TEST=1 (the cube freeze seam)')

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } })
test.describe.configure({ timeout: 280_000 })

/** The tolerances, see docs/visual-regression.md for how they were chosen. */
const TOLERANCE = {
  /** Mean absolute channel difference, 0..1. */
  mean: Number(process.env.CUBES_TOL_MEAN ?? 0.002),
  /** 99th percentile of the per-pixel largest channel difference, 0..1. */
  p99: Number(process.env.CUBES_TOL_P99 ?? 0.01),
  /** Share of pixels with any channel off by more than 8/255. */
  over8: Number(process.env.CUBES_TOL_OVER8 ?? 0.0005),
}

interface Frame {
  readonly name: string
  readonly t: number
  readonly from: number
  readonly to: number
  readonly mix: number
}

/** Index in `FORMATION_IDS`: monolith 0, stream 1, lattice 2, orbit 3, scatter 4, grid 5, ring 6. */
const IDS = ['monolith', 'stream', 'lattice', 'orbit', 'scatter', 'grid', 'ring'] as const
const SETTLED_T = 20

const FRAMES: readonly Frame[] = [
  // Each formation at rest, as the scroll store reports it: the section the visitor is in, the next one waiting.
  ...IDS.map((id, i): Frame => ({ name: `rest-${id}`, t: SETTLED_T, from: i, to: Math.min(i + 1, IDS.length - 1), mix: 0 })),
  // Mid-transition states between neighbours: the stream's flow, the scatter's drop, the ring's arrival.
  ...[0.25, 0.5, 0.75].map((mix): Frame => ({ name: `mix-stream-lattice-${mix}`, t: SETTLED_T, from: 1, to: 2, mix })),
  ...[0.25, 0.5, 0.75].map((mix): Frame => ({ name: `mix-orbit-scatter-${mix}`, t: SETTLED_T, from: 3, to: 4, mix })),
  ...[0.25, 0.5, 0.75].map((mix): Frame => ({ name: `mix-grid-ring-${mix}`, t: SETTLED_T, from: 5, to: 6, mix })),
  // The hero hand-over band with the hero engine off: the monolith's own cubes morph into the stream.
  ...[0.25, 0.5, 0.75].map((mix): Frame => ({ name: `handover-band-${mix}`, t: SETTLED_T, from: 0, to: 1, mix })),
  // The on-load assembly, from the seeded cloud into the monolith.
  ...[0.5, 1.5, 3].map((t): Frame => ({ name: `intro-${t}s`, t, from: 0, to: 0, mix: 0 })),
]

interface Size {
  readonly name: string
  readonly w: number
  readonly h: number
}

const SIZES: readonly Size[] = [
  { name: 'phone', w: 390, h: 844 },
  { name: 'desktop', w: 1440, h: 900 },
]

interface Raster {
  readonly data: Uint8Array
  readonly w: number
  readonly h: number
}

async function raster(png: Buffer): Promise<Raster> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8Array(data), w: info.width, h: info.height }
}

interface Difference {
  readonly mean: number
  readonly p99: number
  readonly over8: number
}

/** The three numbers the tolerances bound. Same dimensions required (the caller checks). */
function difference(a: Raster, b: Raster): Difference {
  const pixels = a.w * a.h
  const histogram = new Uint32Array(256)
  let sum = 0
  let over = 0
  for (let p = 0; p < pixels; p += 1) {
    let worst = 0
    for (let c = 0; c < 3; c += 1) {
      const d = Math.abs((a.data[p * 3 + c] ?? 0) - (b.data[p * 3 + c] ?? 0))
      sum += d
      if (d > worst) worst = d
    }
    histogram[worst] = (histogram[worst] ?? 0) + 1
    if (worst > 8) over += 1
  }
  let seen = 0
  let p99 = 0
  for (let v = 0; v < 256; v += 1) {
    seen += histogram[v] ?? 0
    if (seen >= pixels * 0.99) {
      p99 = v
      break
    }
  }
  return { mean: sum / (pixels * 3 * 255), p99: p99 / 255, over8: over / pixels }
}

/** A capture with cubes in it has bright, coloured pixels well above the dark wash; a blank canvas has none. */
function cubeEvidence(r: Raster): { lit: number; spread: number } {
  const pixels = r.w * r.h
  let lit = 0
  let sum = 0
  let sumSquares = 0
  for (let p = 0; p < pixels; p += 1) {
    const red = r.data[p * 3] ?? 0
    const green = r.data[p * 3 + 1] ?? 0
    const blue = r.data[p * 3 + 2] ?? 0
    if (Math.max(red, green, blue) >= 90) lit += 1
    const luma = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
    sum += luma
    sumSquares += luma * luma
  }
  const mean = sum / pixels
  return { lit: lit / pixels, spread: Math.sqrt(Math.max(0, sumSquares / pixels - mean * mean)) }
}

/** The least share of lit pixels, and luma spread, a capture needs to count as showing cubes. */
const MIN_LIT = Number(process.env.CUBES_MIN_LIT ?? 0.002)
const MIN_SPREAD = Number(process.env.CUBES_MIN_SPREAD ?? 0.01)

interface State {
  readonly rig: unknown
  readonly cubes: number | null
  readonly fade: unknown
  readonly calls: number
  readonly triangles: number
  readonly programs: number
}

type FreezeWindow = {
  __ASSEMBLY_FREEZE__?: {
    set(t: number, from: number, to: number, mix: number): void
    probe: { frames: number; calls: number; triangles: number; programs: number }
  }
  __ASSEMBLY_RIG__?: unknown
  __ASSEMBLY_CUBES__?: number
  __ASSEMBLY_FADE__?: unknown
}

/** Freezes one state, waits for a frame drawn after it, and returns the pixels and what the frame handed the GPU. */
async function draw(page: Page, frame: Frame): Promise<{ png: Buffer; state: State }> {
  const from = await page.evaluate(([t, a, b, mix]) => {
    const handle = (window as unknown as FreezeWindow).__ASSEMBLY_FREEZE__
    if (!handle) throw new Error('no __ASSEMBLY_FREEZE__: is the page loaded with ?cubefreeze= on a test-seam build?')
    const before = handle.probe.frames
    handle.set(t as number, a as number, b as number, mix as number)
    return before
  }, [frame.t, frame.from, frame.to, frame.mix])
  await page.waitForFunction((n) => ((window as unknown as FreezeWindow).__ASSEMBLY_FREEZE__?.probe.frames ?? 0) > (n as number), from, { timeout: 120_000 })
  // Two presented frames and a beat: the compositor has the canvas by then.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await page.waitForTimeout(120)
  const state = await page.evaluate((): State => {
    const w = window as unknown as FreezeWindow
    const probe = w.__ASSEMBLY_FREEZE__?.probe
    return {
      rig: w.__ASSEMBLY_RIG__ ?? null,
      cubes: w.__ASSEMBLY_CUBES__ ?? null,
      fade: w.__ASSEMBLY_FADE__ ?? null,
      calls: probe?.calls ?? 0,
      triangles: probe?.triangles ?? 0,
      programs: probe?.programs ?? 0,
    }
  })
  return { png: await page.screenshot(), state }
}

/** Reads a committed baseline, writes one under `--update-snapshots`, and otherwise reports a missing one with the actual attached. */
function baseline(testInfo: TestInfo, name: string, actual: Buffer): Buffer | null {
  const file = testInfo.snapshotPath(name)
  if (testInfo.config.updateSnapshots === 'all') {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, actual)
    return actual
  }
  if (existsSync(file)) return readFileSync(file)
  // No baseline: leave the capture where CI uploads it (test-results/), so it can be looked at and committed.
  const out = testInfo.outputPath(name.replace(/\.[^.]+$/, '') + '-actual' + (name.match(/\.[^.]+$/)?.[0] ?? ''))
  writeFileSync(out, actual)
  return null
}

for (const size of SIZES) {
  test(`the cubes match their baselines at ${size.name} (${size.w}x${size.h})`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1, isMobile: size.name === 'phone', hasTouch: size.name === 'phone' })
    const page = await context.newPage()
    const first = FRAMES[0] as Frame
    await page.goto(`/?hero=off&cubefreeze=${first.t},${first.from},${first.to},${first.mix}`)
    await page.waitForSelector('html[data-gl="live"]', { timeout: 120_000 })
    // Only the cube layer: everything else on the page is hidden, the layout stays.
    await page.addStyleTag({ content: 'body *{visibility:hidden!important}[data-assembly],[data-assembly] *{visibility:visible!important}' })

    const passA = new Map<string, { png: Buffer; state: State }>()
    for (const frame of FRAMES) passA.set(frame.name, await draw(page, frame))
    const passB = new Map<string, { png: Buffer; state: State }>()
    for (const frame of FRAMES) passB.set(frame.name, await draw(page, frame))

    const states: Record<string, State> = {}
    const worst = { mean: 0, p99: 0, over8: 0 }
    const noise = { mean: 0, p99: 0, over8: 0 }
    const missing: string[] = []

    for (const frame of FRAMES) {
      const a = passA.get(frame.name) as { png: Buffer; state: State }
      const b = passB.get(frame.name) as { png: Buffer; state: State }
      const ra = await raster(a.png)
      const rb = await raster(b.png)
      states[frame.name] = a.state

      // A blank capture can never become a baseline: it must have drawn cubes, and show them.
      const evidence = cubeEvidence(ra)
      expect.soft(a.state.calls, `${frame.name}: draw calls`).toBeGreaterThan(0)
      expect.soft(a.state.triangles, `${frame.name}: triangles`).toBeGreaterThan(12 * 100)
      expect.soft(a.state.cubes ?? 0, `${frame.name}: instanced cubes`).toBeGreaterThan(0)
      expect.soft(evidence.lit, `${frame.name}: share of lit pixels`).toBeGreaterThanOrEqual(MIN_LIT)
      expect.soft(evidence.spread, `${frame.name}: luma spread`).toBeGreaterThanOrEqual(MIN_SPREAD)

      // Determinism: the same state drawn twice, with every other state drawn in between.
      expect.soft(JSON.stringify(b.state), `${frame.name}: GPU state, second draw`).toBe(JSON.stringify(a.state))
      const repeat = difference(ra, rb)
      noise.mean = Math.max(noise.mean, repeat.mean)
      noise.p99 = Math.max(noise.p99, repeat.p99)
      noise.over8 = Math.max(noise.over8, repeat.over8)
      expect.soft(repeat.mean, `${frame.name}: repeat mean`).toBeLessThanOrEqual(TOLERANCE.mean)
      expect.soft(repeat.p99, `${frame.name}: repeat p99`).toBeLessThanOrEqual(TOLERANCE.p99)
      expect.soft(repeat.over8, `${frame.name}: repeat over 8/255`).toBeLessThanOrEqual(TOLERANCE.over8)

      const expected = baseline(testInfo, `${frame.name}-${size.name}.png`, a.png)
      if (!expected) {
        missing.push(frame.name)
        continue
      }
      const re = await raster(expected)
      if (re.w !== ra.w || re.h !== ra.h) {
        expect.soft(`${ra.w}x${ra.h}`, `${frame.name}: size`).toBe(`${re.w}x${re.h}`)
        continue
      }
      const d = difference(re, ra)
      worst.mean = Math.max(worst.mean, d.mean)
      worst.p99 = Math.max(worst.p99, d.p99)
      worst.over8 = Math.max(worst.over8, d.over8)
      if (d.mean > TOLERANCE.mean || d.p99 > TOLERANCE.p99 || d.over8 > TOLERANCE.over8) {
        await testInfo.attach(`${frame.name}-actual.png`, { body: a.png, contentType: 'image/png' })
        await testInfo.attach(`${frame.name}-expected.png`, { body: expected, contentType: 'image/png' })
      }
      expect.soft(d.mean, `${frame.name}: mean difference from the baseline`).toBeLessThanOrEqual(TOLERANCE.mean)
      expect.soft(d.p99, `${frame.name}: p99 difference from the baseline`).toBeLessThanOrEqual(TOLERANCE.p99)
      expect.soft(d.over8, `${frame.name}: share of pixels off by over 8/255`).toBeLessThanOrEqual(TOLERANCE.over8)
    }

    // What every frame handed the GPU, exactly: the rig, the instance count, calls, triangles and programs.
    const stateText = JSON.stringify(states, null, 2) + '\n'
    const committed = baseline(testInfo, `state-${size.name}.json`, Buffer.from(stateText))
    if (!committed) missing.push('state')
    else expect.soft(stateText, 'GPU state per frame').toBe(committed.toString('utf8').split('\r\n').join('\n'))

    testInfo.annotations.push({ type: 'run-to-run noise (max over frames)', description: JSON.stringify(noise) })
    testInfo.annotations.push({ type: 'worst difference from baseline', description: JSON.stringify(worst) })

    await context.close()
    expect(missing, 'baselines missing: take them from the uploaded test-results, look at them, commit them').toEqual([])
  })
}
