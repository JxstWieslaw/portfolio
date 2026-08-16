import { beforeEach, describe, expect, it } from 'vitest'
import { FORMATIONS, type FormationId } from '@/lib/formations/config'
import {
  BLOOM_ALPHA_BASE,
  BLOOM_HALO_SCALE,
  BODY_ALPHA_BASE,
  clearPointCache,
  depthFor,
  MAX_DPR,
  paintCanvas,
  paintFormation,
  pointsFor,
  projectPoints,
  shade,
} from '@/lib/formations/render'

/** Records the calls the painter makes, in order, without a real 2D backend. */
interface Rect {
  readonly op: string
  readonly style: string
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

class RecordingContext {
  readonly rects: Rect[] = []
  readonly gradients: string[][] = []
  readonly transforms: number[][] = []
  clears = 0
  fillStyle: string | CanvasGradient = ''
  private composite = 'source-over'

  get globalCompositeOperation(): string {
    return this.composite
  }

  set globalCompositeOperation(value: string) {
    this.composite = value
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.transforms.push([a, b, c, d, e, f])
  }

  clearRect(): void {
    this.clears += 1
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.rects.push({
      op: this.composite,
      style: typeof this.fillStyle === 'string' ? this.fillStyle : 'gradient',
      x,
      y,
      w,
      h,
    })
  }

  createRadialGradient(): CanvasGradient {
    const stops: string[] = []
    this.gradients.push(stops)
    const gradient = {
      addColorStop(_offset: number, color: string): void {
        stops.push(color)
      },
    }
    return gradient as unknown as CanvasGradient
  }
}

function context(): { ctx: CanvasRenderingContext2D; recorder: RecordingContext } {
  const recorder = new RecordingContext()
  return { ctx: recorder as unknown as CanvasRenderingContext2D, recorder }
}

beforeEach(() => {
  clearPointCache()
})

describe('the colour ramp', () => {
  it('runs violet -> fuchsia -> cyan through the three documented stops', () => {
    expect(shade(0)).toEqual([124, 58, 237])
    expect(shade(0.5)).toEqual([232, 121, 249])
    expect(shade(1)).toEqual([34, 211, 238])
  })

  it('interpolates linearly inside each segment', () => {
    expect(shade(0.25)).toEqual([178, 90, 243])
    expect(shade(0.75)).toEqual([133, 166, 244])
  })

  it('clamps out-of-range ramp values instead of extrapolating', () => {
    expect(shade(-4)).toEqual(shade(0))
    expect(shade(9)).toEqual(shade(1))
  })
})

describe('depth exposure', () => {
  it('floors at 0.18 so distant cubes never disappear', () => {
    expect(depthFor(-10)).toBe(0.18)
  })

  it('caps at 1 so the brightest cube is never blown out', () => {
    expect(depthFor(10)).toBe(1)
    expect(BODY_ALPHA_BASE).toBe(0.88)
  })
})

describe('projection', () => {
  const size = { w: 1440, h: 900 }

  it('sorts back to front for the painter algorithm', () => {
    const projected = projectPoints('ring', pointsFor('ring'), size.w, size.h)
    for (let i = 1; i < projected.length; i += 1) {
      const previous = projected[i - 1]
      const current = projected[i]
      if (!previous || !current) throw new Error('unexpected sparse projection')
      expect(previous.z).toBeGreaterThanOrEqual(current.z)
    }
  })

  it('is stable frame to frame when no time is supplied', () => {
    const a = projectPoints('grid', pointsFor('grid'), size.w, size.h)
    const b = projectPoints('grid', pointsFor('grid'), size.w, size.h)
    expect(a[0]).toEqual(b[0])
  })

  it('wobbles and breathes only when time is supplied', () => {
    const still = projectPoints('monolith', pointsFor('monolith'), size.w, size.h)
    const moved = projectPoints('monolith', pointsFor('monolith'), size.w, size.h, 3.7)
    expect(moved[0]).not.toEqual(still[0])
  })

  it('spreads x by 1.4 on an ultrawide canvas and leaves the camera alone', () => {
    // Both canvases are 1000px tall, and `stream` fits against min(W, H), so
    // the projection scale is identical. Any x difference is spread, and any y
    // difference would mean the camera moved — which §3.5 forbids.
    const wide = projectPoints('stream', pointsFor('stream'), 3440, 1000) // 3.44 aspect
    const normal = projectPoints('stream', pointsFor('stream'), 2000, 1000) // 2.00 aspect
    const wideFirst = wide[0]
    const normalFirst = normal[0]
    if (!wideFirst || !normalFirst) throw new Error('empty projection')
    const wideOffset = wideFirst.x - 3440 * FORMATIONS.stream.cx
    const normalOffset = normalFirst.x - 2000 * FORMATIONS.stream.cx
    expect(wideOffset / normalOffset).toBeCloseTo(1.4, 6)
    expect(wideFirst.y).toBeCloseTo(normalFirst.y, 6)
  })
})

describe('the two-pass painter', () => {
  function paint(kind: FormationId) {
    const { ctx, recorder } = context()
    paintFormation(ctx, kind, { width: 1440, height: 900 })
    return recorder
  }

  it('paints the halo pass additively before the bodies', () => {
    const recorder = paint('monolith')
    const ops = recorder.rects.map((rect) => rect.op)
    expect(ops).toContain('lighter')
    expect(ops.indexOf('lighter')).toBeLessThan(ops.lastIndexOf('source-over'))
    // The composite mode is always restored before the bodies land.
    expect(recorder.globalCompositeOperation).toBe('source-over')
  })

  it('skips the halo entirely for grid, whose bloom is 0.18', () => {
    expect(paint('grid').rects.map((rect) => rect.op)).not.toContain('lighter')
    expect(paint('lattice').rects.map((rect) => rect.op)).toContain('lighter')
  })

  it('draws each halo at 4.4x the cube it surrounds, at bloom x depth alpha', () => {
    const recorder = paint('monolith')
    const halo = recorder.rects.find((rect) => rect.op === 'lighter')
    if (!halo) throw new Error('no halo painted')
    const cfg = FORMATIONS.monolith

    expect(halo.h).toBeCloseTo(halo.w, 6)
    // The halo is square and 4.4x the cube edge, so its width recovers `d`.
    const d = halo.w / (cfg.size * BLOOM_HALO_SCALE)

    // Both passes walk the same sorted list, so the first body belongs to the
    // same instance as the first halo — same centre, 4.4x the size.
    const body = recorder.rects.find((rect) => rect.op === 'source-over' && /^rgba\(\d+,\d+,\d+,/.test(rect.style))
    if (!body) throw new Error('no cube body painted')
    expect(halo.w).toBeCloseTo(body.w * BLOOM_HALO_SCALE, 6)
    expect(halo.x + halo.w / 2).toBeCloseTo(body.x + body.w / 2, 6)
    expect(halo.y + halo.h / 2).toBeCloseTo(body.y + body.h / 2, 6)

    const alpha = Number(/^rgba\(\d+,\d+,\d+,([\d.]+)\)$/.exec(halo.style)?.[1])
    expect(alpha).toBe(Number((BLOOM_ALPHA_BASE * cfg.bloom * depthFor(d)).toFixed(3)))
  })

  it('caps the top-face highlight band at 30% of the cube', () => {
    const recorder = paint('grid')
    const highlight = recorder.rects.find((rect) => rect.style.startsWith('rgba(240,246,252,'))
    if (!highlight) throw new Error('no top highlight painted')
    expect(highlight.h).toBeCloseTo(Math.max(0.6, highlight.w * 0.3), 6)
  })

  it('lays the ground, the wash and the vignette around the cubes', () => {
    const recorder = paint('ring')
    const first = recorder.rects[0]
    const last = recorder.rects[recorder.rects.length - 1]
    if (!first || !last) throw new Error('nothing painted')
    expect(first.style).toBe('#0D1117')
    expect(last.style).toBe('gradient')
    // Wash first, vignette last — two radial gradients, no more.
    expect(recorder.gradients).toHaveLength(2)
    expect(recorder.gradients[0]?.[1]).toBe('rgba(13,17,23,0)')
    expect(recorder.gradients[1]?.[1]).toBe(`rgba(13,17,23,${FORMATIONS.ring.vig})`)
  })

  it('gives scatter alone a ground contact shadow', () => {
    expect(paint('scatter').gradients).toHaveLength(3)
    expect(paint('monolith').gradients).toHaveLength(2)
  })
})

describe('paintCanvas', () => {
  function canvasWith(box: { width: number; height: number }, ctx: CanvasRenderingContext2D | null) {
    const canvas = document.createElement('canvas')
    canvas.getBoundingClientRect = () =>
      ({ width: box.width, height: box.height, top: 0, left: 0, right: box.width, bottom: box.height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    Object.defineProperty(canvas, 'getContext', { value: () => ctx, configurable: true })
    return canvas
  }

  function setDpr(value: number): void {
    Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true })
  }

  it('sizes the bitmap to the box times DPR, capped at 2', () => {
    setDpr(3)
    const { ctx, recorder } = context()
    const canvas = canvasWith({ width: 800, height: 600 }, ctx)
    expect(paintCanvas(canvas, 'grid')).toBe(true)
    expect(canvas.width).toBe(800 * MAX_DPR)
    expect(canvas.height).toBe(600 * MAX_DPR)
    expect(recorder.transforms[0]).toEqual([MAX_DPR, 0, 0, MAX_DPR, 0, 0])
  })

  it('never reassigns an unchanged bitmap, because that clears and reallocates it', () => {
    setDpr(1)
    const { ctx } = context()
    const canvas = canvasWith({ width: 400, height: 300 }, ctx)
    paintCanvas(canvas, 'grid')
    let writes = 0
    const descriptor = { get: () => 400, set: () => { writes += 1 }, configurable: true }
    Object.defineProperty(canvas, 'width', descriptor)
    paintCanvas(canvas, 'grid')
    expect(writes).toBe(0)
  })

  it('reports failure rather than throwing when there is no 2D context', () => {
    const canvas = canvasWith({ width: 400, height: 300 }, null)
    expect(paintCanvas(canvas, 'grid')).toBe(false)
  })

  it('reports failure on a zero-size box', () => {
    const { ctx } = context()
    expect(paintCanvas(canvasWith({ width: 0, height: 0 }, ctx), 'grid')).toBe(false)
  })
})
