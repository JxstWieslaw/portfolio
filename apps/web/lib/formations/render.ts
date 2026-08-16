/**
 * The two-pass formation painter.
 *
 * Source of truth: `docs/Portfolio Design/Home.dc.html` — `paint(canvas, kind,
 * tSec)`. Transcribed in `docs/design-extraction/design-home.md` § 13 "Render
 * passes" and `design-foundations.md` § 4.4.
 *
 * Order of operations, all of it deliberate:
 *
 *   1. `--bg-0` ground fill, then a radial accent wash on the framing anchor.
 *   2. Project every point (Y-rotate -> X-tilt -> weak perspective) and sort
 *      back-to-front — painter's algorithm, no depth buffer.
 *   3. `scatter` only: a ground contact shadow. It is the one poster that
 *      touches a floor.
 *   4. Pass 1, `globalCompositeOperation = 'lighter'`: a wide, low-alpha halo
 *      4.4x the cube. Glow accumulates where instances crowd; hue does not.
 *   5. Pass 2, `source-over`: the cube bodies at 0.88 x depth, each with a
 *      `--fg-0`-at-20% band across its top 30% — the lit top face. Painting
 *      bodies normally is why violet stays violet at any density.
 *   6. A radial vignette so the formation never touches the frame edge.
 */

import { FORMATIONS, hexToRgb, spreadXFor, type FormationId } from './config'
import { createRng, generatePoints, seedFor, type Point } from './generators'

/** Retina caps at 2 — beyond that the fill rate buys nothing visible. */
export const MAX_DPR = 2

/** The halo pass is skipped entirely at or below this bloom value (grid: 0.18). */
export const BLOOM_MIN = 0.2

/**
 * Base halo alpha, multiplied by `bloom` and `depth`.
 *
 * The two extractions disagree on this one number. `Home.dc.html` — the page
 * renderer this file reproduces line for line — uses 0.030. `design-foundations.md`
 * § 4.4 documents 0.032, but that is the *Foundations poster-gallery* renderer,
 * a different scene with card-framed cameras and its own cfg table.
 *
 * We ship 0.030. Every other constant here comes from the page renderer, and
 * borrowing a single value from the gallery renderer would make the halo
 * subtly inconsistent with the depth and vignette maths it multiplies against.
 * Reconciliation § 0: when the disagreement is about a pixel, the export wins —
 * and for the page, the page's own renderer is the export.
 */
export const BLOOM_ALPHA_BASE = 0.03

/** The halo is 4.4x the cube edge, centred on it. */
export const BLOOM_HALO_SCALE = 4.4

/** "Exposure is set so the brightest cube is ~85% white, not blown." */
export const BODY_ALPHA_BASE = 0.88

/** `--fg-0` at 20% x depth, across the top 30% of the cube. */
export const HIGHLIGHT_ALPHA_BASE = 0.2

/** Three-stop ramp: violet -> fuchsia -> cyan. */
const RAMP_VIOLET = [124, 58, 237] as const
const RAMP_FUCHSIA = [232, 121, 249] as const
const RAMP_CYAN = [34, 211, 238] as const

export interface Projected {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly d: number
  readonly t: number
}

export interface PaintOptions {
  readonly width: number
  readonly height: number
  /**
   * Elapsed seconds. Supplying it adds the hero's rotational wobble and
   * breathing scale. Omit it — or pass `undefined` — for a static frame; that
   * is the reduced-motion path and every non-hero formation.
   */
  readonly timeSeconds?: number
  /** Fraction of instances to paint. `1` reproduces the export exactly. */
  readonly keep?: number
}

/**
 * `#7C3AED` -> `#E879F9` -> `#22D3EE`, linear in RGB.
 *
 * The middle stop is load-bearing: `--fuchsia-400` exists in the token set only
 * because this ramp routes through it (reconciliation § 2).
 */
export function shade(t: number): readonly [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t))
  const lower = clamped < 0.5
  const from = lower ? RAMP_VIOLET : RAMP_FUCHSIA
  const to = lower ? RAMP_FUCHSIA : RAMP_CYAN
  const u = lower ? clamped * 2 : (clamped - 0.5) * 2
  return [
    Math.round(from[0] + (to[0] - from[0]) * u),
    Math.round(from[1] + (to[1] - from[1]) * u),
    Math.round(from[2] + (to[2] - from[2]) * u),
  ]
}

/** Perspective factor -> exposure. Floors at 0.18 so distant cubes never vanish. */
export function depthFor(d: number): number {
  return Math.max(0.18, Math.min(1, 0.55 + d * 0.55))
}

/**
 * The canonical cloud for a formation, memoised.
 *
 * The export regenerates points on every frame. The generators are pure and
 * seeded, so every regeneration returns the identical array — caching it is
 * invisible in the output and removes ~2600 allocations per hero frame.
 */
const pointCache = new Map<string, readonly Point[]>()

export function pointsFor(kind: FormationId, keep = 1): readonly Point[] {
  const key = `${kind}:${keep}`
  const cached = pointCache.get(key)
  if (cached) return cached
  const built = generatePoints(kind, FORMATIONS[kind].n, createRng(seedFor(kind)), keep)
  pointCache.set(key, built)
  return built
}

/** Test seam. Production never needs this — the cache can only hold one answer. */
export function clearPointCache(): void {
  pointCache.clear()
}

/**
 * Y-rotate, X-tilt, weak perspective, then sort back to front.
 *
 * Ultrawide (reconciliation § 3.5): above 2.2 aspect the projected x offset is
 * multiplied by 1.4. The camera stays put and the cubes stay their size — the
 * formation simply spreads into the extra width instead of shrinking away.
 */
export function projectPoints(
  kind: FormationId,
  points: readonly Point[],
  width: number,
  height: number,
  timeSeconds?: number,
): Projected[] {
  const cfg = FORMATIONS[kind]
  const centreY = height * cfg.cy
  const wobble = timeSeconds ? Math.sin(timeSeconds * 0.35) * 0.05 : 0
  const fit = cfg.fit === 'h' ? height : Math.min(width, height)
  const breath = timeSeconds ? 1 + 0.012 * Math.sin(timeSeconds * 0.8) : 1
  const S = fit * cfg.scale * breath
  const cr = Math.cos(cfg.rot + wobble)
  const sr = Math.sin(cfg.rot + wobble)
  const ct = Math.cos(cfg.tilt)
  const st = Math.sin(cfg.tilt)
  const spreadX = spreadXFor(width, height)

  return points
    .map(([px, py, pz, t]) => {
      const x1 = px * cr - pz * sr
      const z1 = px * sr + pz * cr
      const y1 = py * ct - z1 * st
      const z2 = py * st + z1 * ct
      const d = 1 / (1 + z2 * 0.16)
      return {
        x: width * cfg.cx + x1 * S * d * spreadX,
        y: centreY - y1 * S * d,
        z: z2,
        d,
        t,
      }
    })
    .sort((a, b) => b.z - a.z)
}

/**
 * Paints one formation into an already-sized, already-transformed 2D context.
 * `width` / `height` are CSS pixels; the DPR transform is the caller's job.
 */
export function paintFormation(ctx: CanvasRenderingContext2D, kind: FormationId, options: PaintOptions): void {
  const cfg = FORMATIONS[kind]
  const W = options.width
  const H = options.height
  const centreY = H * cfg.cy

  // 1. Ground plus accent wash.
  ctx.fillStyle = '#0D1117'
  ctx.fillRect(0, 0, W, H)
  const [wr, wg, wb] = hexToRgb(cfg.wash)
  const wash = ctx.createRadialGradient(W * cfg.cx, centreY, 0, W * cfg.cx, centreY, Math.max(W, H) * 0.75)
  wash.addColorStop(0, `rgba(${wr},${wg},${wb},${cfg.washA})`)
  wash.addColorStop(1, 'rgba(13,17,23,0)')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, W, H)

  // 2. Project and depth-sort.
  const projected = projectPoints(kind, pointsFor(kind, options.keep ?? 1), W, H, options.timeSeconds)

  // 3. Scatter alone has a floor, so scatter alone gets a contact shadow.
  if (kind === 'scatter') {
    const groundY = centreY + H * 0.22
    const shadow = ctx.createRadialGradient(W * cfg.cx, groundY, 0, W * cfg.cx, groundY, W * 0.36)
    shadow.addColorStop(0, 'rgba(0,0,0,0.5)')
    shadow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = shadow
    ctx.fillRect(0, 0, W, H)
  }

  // 4. Pass 1 — additive halo only. Glow accumulates, hue does not.
  if (cfg.bloom > BLOOM_MIN) {
    ctx.globalCompositeOperation = 'lighter'
    for (const q of projected) {
      const [r, g, b] = shade(q.t)
      const depth = depthFor(q.d)
      const s = cfg.size * q.d
      ctx.fillStyle = `rgba(${r},${g},${b},${(BLOOM_ALPHA_BASE * cfg.bloom * depth).toFixed(3)})`
      const half = s * (BLOOM_HALO_SCALE / 2)
      ctx.fillRect(q.x - half, q.y - half, s * BLOOM_HALO_SCALE, s * BLOOM_HALO_SCALE)
    }
  }

  // 5. Pass 2 — cube bodies, painted normally, each with its lit top face.
  ctx.globalCompositeOperation = 'source-over'
  for (const q of projected) {
    const [r, g, b] = shade(q.t)
    const depth = depthFor(q.d)
    const s = cfg.size * q.d
    ctx.fillStyle = `rgba(${r},${g},${b},${(BODY_ALPHA_BASE * depth).toFixed(3)})`
    ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s)
    ctx.fillStyle = `rgba(240,246,252,${(HIGHLIGHT_ALPHA_BASE * depth).toFixed(3)})`
    ctx.fillRect(q.x - s / 2, q.y - s / 2, s, Math.max(0.6, s * 0.3))
  }

  // 6. Edge falloff — the formation never touches the frame.
  const vignette = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.3, W * 0.5, H * 0.5, Math.max(W, H) * 0.75)
  vignette.addColorStop(0, 'rgba(13,17,23,0)')
  vignette.addColorStop(1, `rgba(13,17,23,${cfg.vig})`)
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, W, H)
}

export interface PaintCanvasOptions {
  readonly timeSeconds?: number
  readonly keep?: number
}

/**
 * Measures, sizes and paints a canvas element.
 *
 * Sizing is idempotent: assigning `canvas.width` clears the bitmap and
 * reallocates, which at 20 fps would be a stutter, so both dimensions are
 * compared before either is written.
 *
 * Returns `false` when the canvas cannot paint — a zero-size box, or no 2D
 * context at all. The caller treats the latter as rung 5 of the fallback
 * ladder and lets the CSS wash stand alone.
 */
export function paintCanvas(canvas: HTMLCanvasElement, kind: FormationId, options: PaintCanvasOptions = {}): boolean {
  const box = canvas.getBoundingClientRect()
  if (!box.width || !box.height) return false

  const ctx = getContext2d(canvas)
  if (!ctx) return false

  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
  const W = Math.round(box.width)
  const H = Math.round(box.height)
  const bitmapW = Math.round(W * dpr)
  const bitmapH = Math.round(H * dpr)
  if (canvas.width !== bitmapW || canvas.height !== bitmapH) {
    canvas.width = bitmapW
    canvas.height = bitmapH
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  paintFormation(ctx, kind, {
    width: W,
    height: H,
    timeSeconds: options.timeSeconds,
    keep: options.keep,
  })
  return true
}

/**
 * Feature detection for `getContext('2d')`.
 *
 * jsdom and locked-down browsers can throw here rather than returning null, so
 * the probe is guarded. A thrown error means the same thing as a null context:
 * fall to the CSS wash.
 */
export function getContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  if (typeof canvas.getContext !== 'function') return null
  try {
    return canvas.getContext('2d')
  } catch {
    return null
  }
}
