import { describe, expect, it, vi } from 'vitest'
import { createBundleCache, formationBuilder } from '@/lib/assembly/bundle-cache'
import { pointerRay, rayAtPlane } from '@/lib/assembly/pointer-ray'
import { INSTANCE_CAPACITY, buildModelBundle, buildTargets, frameFor, frameScalars, pixelToWorld } from '@/lib/assembly/targets'
import { FORMATIONS, FORMATION_IDS } from '@/lib/formations/config'

describe('model bundles are frame-invariant', () => {
  it('builds the same bundle whatever the viewport, and the scalars carry the viewport', () => {
    const model = buildModelBundle('orbit', INSTANCE_CAPACITY)
    const again = buildModelBundle('orbit', INSTANCE_CAPACITY)
    expect(again.position).toEqual(model.position)
    expect(again.live).toEqual(model.live)
    expect(again.seed).toEqual(model.seed)

    for (const [w, h] of [
      [1440, 900],
      [390, 844],
      [3440, 1440],
    ] as const) {
      const frame = frameFor(w, h)
      const { unit, edge } = frameScalars(FORMATIONS.orbit, frame)
      const baked = buildTargets('orbit', frame, INSTANCE_CAPACITY)
      for (let i = 0; i < 30; i += 1) {
        expect(baked.position[i]).toBeCloseTo((model.position[i] ?? 0) * unit, 6)
      }
      expect(baked.scale[0]).toBeCloseTo((model.live[0] ?? 0) * edge, 6)
    }
  })

  it('reproduces the former viewport-baked positions to 1e-6 (resize changes scalars, not buffers)', () => {
    const frame = frameFor(1440, 900)
    for (const kind of FORMATION_IDS) {
      const model = buildModelBundle(kind, INSTANCE_CAPACITY)
      const { unit, anchor } = frameScalars(FORMATIONS[kind], frame)
      const cfg = FORMATIONS[kind]
      const fit = cfg.fit === 'h' ? frame.height : Math.min(frame.width, frame.height)
      expect(unit).toBeCloseTo(fit * cfg.scale * frame.worldPerPx, 9)
      expect(anchor).toEqual([...pixelToWorld(frame, frame.width * cfg.cx, frame.height * cfg.cy), 0])
      // Model positions are the generator's, z flipped, in model units (no viewport factor).
      expect(Math.max(...Array.from(model.position.subarray(0, 300)).map(Math.abs))).toBeLessThan(5)
    }
  })

  it('seeds every instance in 0..1 and keeps the same seed across formations', () => {
    const a = buildModelBundle('grid', 50)
    const b = buildModelBundle('ring', 50)
    expect(a.seed).toEqual(b.seed)
    for (const s of a.seed) expect(s >= 0 && s < 1).toBe(true)
  })

  it('recomputes the scalars from a different camera distance without touching the frame', () => {
    const frame = frameFor(1440, 900)
    const near = frameScalars(FORMATIONS.monolith, frame, 9)
    const far = frameScalars(FORMATIONS.monolith, frame, 12)
    expect(near.unit).toBeLessThan(far.unit)
    expect(far.unit / near.unit).toBeCloseTo(12 / 9, 9)
  })
})

describe('bundle cache', () => {
  it('builds each formation once, on demand, and never on a second get', () => {
    const build = vi.fn(formationBuilder(100, 1))
    const cache = createBundleCache(build)
    expect(cache.builds).toBe(0)
    expect(cache.has('monolith')).toBe(false)

    const first = cache.get('monolith')
    expect(cache.builds).toBe(1)
    expect(cache.get('monolith')).toBe(first)
    expect(cache.builds).toBe(1)

    cache.get('stream')
    expect(cache.builds).toBe(2)
    expect(build).toHaveBeenCalledTimes(2)
    expect(cache.has('stream')).toBe(true)
    expect(cache.has('ring')).toBe(false)
  })

  it('a resize rebuilds nothing: the scalars are the only viewport-dependent part', () => {
    const build = vi.fn(formationBuilder(100, 1))
    const cache = createBundleCache(build)
    const a = cache.get('monolith')
    frameScalars(FORMATIONS.monolith, frameFor(390, 844))
    frameScalars(FORMATIONS.monolith, frameFor(1920, 1080))
    expect(cache.get('monolith')).toBe(a)
    expect(cache.builds).toBe(1)
  })

  it('refuses the cloud through the formation-only builder', () => {
    expect(() => createBundleCache(formationBuilder(10, 1)).get('cloud')).toThrow(/cloud/)
  })
})

describe('pointer ray', () => {
  const frame = frameFor(1440, 900)

  it('starts at the camera and points straight down the axis for the centre pixel', () => {
    const ray = pointerRay(frame, 720, 450)
    expect(ray.origin).toEqual([0, 0, frame.distance])
    expect(ray.direction[0]).toBeCloseTo(0, 9)
    expect(ray.direction[1]).toBeCloseTo(0, 9)
    expect(ray.direction[2]).toBeCloseTo(-1, 9)
  })

  it('passes through the camera and the pointer’s point on z = 0 for an off-centre pixel', () => {
    const ray = pointerRay(frame, 100, 820)
    const [wx, wy] = pixelToWorld(frame, 100, 820)
    const hit = rayAtPlane(ray)
    expect(hit[0]).toBeCloseTo(wx, 9)
    expect(hit[1]).toBeCloseTo(wy, 9)
    expect(hit[2]).toBe(0)
    const len = Math.hypot(...ray.direction)
    expect(len).toBeCloseTo(1, 9)
    // Not the parallel ray the M2 slice used.
    expect(Math.abs(ray.direction[0])).toBeGreaterThan(0.01)
  })
})
