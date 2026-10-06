import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'

/**
 * Tier look parity — hero monolith spec § 8.4.
 *
 * One shading path on every device means a lower tier may differ from tier 3 only
 * in pixel count, MSAA edges and how many outer dust shards exist. This renders
 * the same deterministic still (`?freeze=<t>,<s>` and no grain, via the test
 * seam) at tiers 3, 2 and 1, crops to the subject, box-downsamples 4x so
 * resolution and MSAA are forgiven but colour and shape are not, and compares
 * each lower tier with tier 3 at the spec's tolerances.
 *
 * The lab raymarch oracle comparison (mesh L3 versus the lab at the same
 * framing) is informational in S1 and lives outside CI: see the PR body.
 *
 * Chromium with SwiftShader, test-seam build only, `desktop` project only (the
 * file makes its own 1440x900 and 390x844 contexts at device pixel ratio 1).
 */

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'needs Chromium with SwiftShader WebGL')
  test.skip(testInfo.project.name !== 'desktop', 'renders its own viewports; one project is enough')
})
test.skip(process.env.NEXT_PUBLIC_MODEL_TEST !== '1', 'needs an app built with NEXT_PUBLIC_MODEL_TEST=1 (the hero test seam)')

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } })
test.describe.configure({ timeout: 280_000 })

interface Size {
  readonly name: string
  readonly w: number
  readonly h: number
  /** The subject region, in css pixels: roughly the free area the panel leaves. */
  readonly crop: { left: number; top: number; width: number; height: number }
}

const SIZES: readonly Size[] = [
  { name: 'phone', w: 390, h: 844, crop: { left: 40, top: 60, width: 310, height: 300 } },
  { name: 'desktop', w: 1440, h: 900, crop: { left: 780, top: 80, width: 640, height: 800 } },
]

/** s -> the spec's tolerances: mean, p95, mean luma delta. */
const TOLERANCE: readonly { s: number; mean: number; p95: number; luma: number }[] = [
  { s: 1.0, mean: 0.02, p95: 0.08, luma: 0.015 },
  { s: 0.7, mean: 0.04, p95: 0.16, luma: 0.02 },
  { s: 0.35, mean: 0.06, p95: 0.22, luma: 0.02 },
]

const FACTOR = 4

interface Raster {
  readonly data: Uint8Array
  readonly w: number
  readonly h: number
}

async function raster(png: Buffer): Promise<Raster> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8Array(data), w: info.width, h: info.height }
}

/** Box-downsamples to a fixed grid, so tiers with different pixel counts line up. */
async function grid(png: Buffer, size: Size): Promise<Raster> {
  const out = await sharp(png).resize(Math.round(size.crop.width / FACTOR), Math.round(size.crop.height / FACTOR), { kernel: 'lanczos3', fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8Array(out.data), w: out.info.width, h: out.info.height }
}

function compare(a: Raster, b: Raster): { mean: number; p95: number; luma: number } {
  const diffs: number[] = []
  let la = 0
  let lb = 0
  for (let i = 0; i < a.data.length; i += 3) {
    const [ar, ag, ab] = [a.data[i] ?? 0, a.data[i + 1] ?? 0, a.data[i + 2] ?? 0]
    const [br, bg, bb] = [b.data[i] ?? 0, b.data[i + 1] ?? 0, b.data[i + 2] ?? 0]
    diffs.push(Math.max(Math.abs(ar - br), Math.abs(ag - bg), Math.abs(ab - bb)) / 255)
    la += (0.2126 * ar + 0.7152 * ag + 0.0722 * ab) / 255
    lb += (0.2126 * br + 0.7152 * bg + 0.0722 * bb) / 255
  }
  diffs.sort((x, y) => x - y)
  const n = diffs.length
  return { mean: diffs.reduce((s, v) => s + v, 0) / n, p95: diffs[Math.min(n - 1, Math.floor(n * 0.95))] ?? 0, luma: Math.abs(la - lb) / n }
}

/** Share of the bright, coloured pixels in each of the three film hues: cyan, violet, magenta. */
function hueShares(r: Raster): { cyan: number; violet: number; magenta: number } {
  const bins = { cyan: 0, violet: 0, magenta: 0 }
  let total = 0
  for (let i = 0; i < r.data.length; i += 3) {
    const [rr, gg, bb] = [(r.data[i] ?? 0) / 255, (r.data[i + 1] ?? 0) / 255, (r.data[i + 2] ?? 0) / 255]
    const max = Math.max(rr, gg, bb)
    const min = Math.min(rr, gg, bb)
    if (max < 0.3 || max - min < 0.15) continue
    let hue: number
    if (max === rr) hue = ((gg - bb) / (max - min)) * 60
    else if (max === gg) hue = (2 + (bb - rr) / (max - min)) * 60
    else hue = (4 + (rr - gg) / (max - min)) * 60
    if (hue < 0) hue += 360
    if (hue >= 150 && hue < 240) bins.cyan += 1
    else if (hue >= 240 && hue < 300) bins.violet += 1
    else if (hue >= 300 || hue < 30) bins.magenta += 1
    else continue
    total += 1
  }
  const t = Math.max(1, total)
  return { cyan: bins.cyan / t, violet: bins.violet / t, magenta: bins.magenta / t }
}

/** Renders the hero canvas alone at a fixed tier and returns one PNG per `s`. */
async function stills(page: Page, tier: number, size: Size, extra = ''): Promise<Map<number, Buffer>> {
  await page.goto(`/?hero=a&tier=${tier}&freeze=3,1&grain=0${extra}`)
  await page.waitForSelector('html[data-hero="live"]', { timeout: 120_000 })
  // Only the hero canvas: the page content, the nav and the 3D layer are hidden, the layout stays.
  await page.addStyleTag({ content: 'main>:not([data-assembly]),header,footer{visibility:hidden!important}[data-assembly]>div:not([data-hero-layer]){display:none!important}' })
  const out = new Map<number, Buffer>()
  for (const { s } of TOLERANCE) {
    const frames = await page.evaluate(
      ([value]) => {
        const hero = (window as unknown as { __ASSEMBLY_HERO__: { frames: number; setFreeze(t: number, s: number): void } }).__ASSEMBLY_HERO__
        hero.setFreeze(3, value as number)
        return hero.frames
      },
      [s],
    )
    // Two more presented frames: the first may have been drawn before the new still was set.
    await page.waitForFunction((from) => (window as unknown as { __ASSEMBLY_HERO__: { frames: number } }).__ASSEMBLY_HERO__.frames >= (from as number) + 2, frames, { timeout: 120_000 })
    await page.waitForTimeout(700)
    out.set(s, await page.screenshot({ clip: { x: size.crop.left, y: size.crop.top, width: size.crop.width, height: size.crop.height } }))
  }
  return out
}

for (const size of SIZES) {
  test(`tiers 2 and 1 match tier 3 at ${size.name} (${size.w}x${size.h})`, async ({ browser }) => {
    const shots = new Map<number, Map<number, Buffer>>()
    for (const tier of [3, 2, 1]) {
      const context = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1, isMobile: size.name === 'phone', hasTouch: size.name === 'phone' })
      const page = await context.newPage()
      shots.set(tier, await stills(page, tier, size))
      await context.close()
    }

    for (const { s, mean, p95, luma } of TOLERANCE) {
      const reference = await grid(shots.get(3)?.get(s) as Buffer, size)
      for (const tier of [2, 1]) {
        const candidate = await grid(shots.get(tier)?.get(s) as Buffer, size)
        const result = compare(reference, candidate)
        test.info().annotations.push({ type: `${size.name} s=${s} L${tier} vs L3`, description: JSON.stringify({ mean: +result.mean.toFixed(4), p95: +result.p95.toFixed(4), luma: +result.luma.toFixed(4) }) })
        expect(result.mean, `${size.name} s=${s} L${tier} mean`).toBeLessThanOrEqual(mean)
        expect(result.p95, `${size.name} s=${s} L${tier} p95`).toBeLessThanOrEqual(p95)
        expect(result.luma, `${size.name} s=${s} L${tier} luma`).toBeLessThanOrEqual(luma)
      }
    }

    // Palette: the slab's hue mix may not drift between tiers.
    const reference = hueShares(await raster(shots.get(3)?.get(1) as Buffer))
    for (const tier of [2, 1]) {
      const shares = hueShares(await raster(shots.get(tier)?.get(1) as Buffer))
      for (const hue of ['cyan', 'violet', 'magenta'] as const) {
        expect(Math.abs(shares[hue] - reference[hue]), `${size.name} L${tier} ${hue} share`).toBeLessThanOrEqual(0.1)
      }
    }
  })
}

// A device with no float render targets takes the RGBA8 path (headroom factor, reflection mixed by weight). It must still
// look like the half-float render: the same tolerances, against the same tier.
test('the RGBA8 fallback matches half-float at phone size', async ({ browser }) => {
  const size = SIZES[0] as Size
  const render = async (extra: string): Promise<Map<number, Buffer>> => {
    const context = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
    const page = await context.newPage()
    const shots = await stills(page, 2, size, extra)
    if (extra) await expect(page.locator('html')).toHaveAttribute('data-hero-target', 'rgba8')
    await context.close()
    return shots
  }
  const half = await render('')
  const rgba = await render('&hdr=0')
  for (const { s, mean, p95, luma } of TOLERANCE) {
    const result = compare(await grid(half.get(s) as Buffer, size), await grid(rgba.get(s) as Buffer, size))
    test.info().annotations.push({ type: `rgba8 s=${s}`, description: JSON.stringify(result) })
    // Looser than tier-to-tier: the RGBA8 path trades darks for headroom, but colour and shape must hold.
    expect(result.mean, `rgba8 s=${s} mean`).toBeLessThanOrEqual(mean * 2)
    expect(result.p95, `rgba8 s=${s} p95`).toBeLessThanOrEqual(p95 * 2)
    expect(result.luma, `rgba8 s=${s} luma`).toBeLessThanOrEqual(luma * 3)
  }
})
