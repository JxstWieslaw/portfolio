import { describe, expect, it } from 'vitest'
import {
  INSTANCE_CAPACITY,
  buildTargets,
  frameFor,
  instanceCount,
  pixelToWorld,
  worldToPixel,
} from '@/lib/assembly/targets'
import { FORMATION_IDS, FORMATIONS } from '@/lib/formations/config'
import { REDUCED_KEEP } from '@/lib/formations/fallback'
import { pointsFor, shade } from '@/lib/formations/render'

const frame = frameFor(1440, 900)

describe('buildTargets', () => {
  it.each(FORMATION_IDS)('%s: one bundle, N*3 positions, N colours, N scales', (kind) => {
    const bundle = buildTargets(kind, frame, INSTANCE_CAPACITY)
    expect(bundle.position).toHaveLength(INSTANCE_CAPACITY * 3)
    expect(bundle.colour).toHaveLength(INSTANCE_CAPACITY * 3)
    expect(bundle.colourT).toHaveLength(INSTANCE_CAPACITY)
    expect(bundle.scale).toHaveLength(INSTANCE_CAPACITY)
    expect(bundle.capacity).toBe(INSTANCE_CAPACITY)
    expect(bundle.count).toBe(Math.min(pointsFor(kind).length, INSTANCE_CAPACITY))
  })

  it('covers every formation at full keep, the monolith and its stragglers included', () => {
    for (const kind of FORMATION_IDS) {
      expect(pointsFor(kind).length).toBeLessThanOrEqual(INSTANCE_CAPACITY)
    }
  })

  it('leaves surplus instances at scale 0 and live ones at the formation cube size', () => {
    const bundle = buildTargets('lattice', frame, INSTANCE_CAPACITY)
    const edge = FORMATIONS.lattice.size * frame.worldPerPx
    for (let i = 0; i < bundle.count; i += 1) expect(bundle.scale[i]).toBeCloseTo(edge, 6)
    for (let i = bundle.count; i < INSTANCE_CAPACITY; i += 1) expect(bundle.scale[i]).toBe(0)
    expect(bundle.count).toBeLessThan(INSTANCE_CAPACITY)
  })

  it('is deterministic: the same inputs give byte-identical arrays', () => {
    const first = buildTargets('orbit', frame, INSTANCE_CAPACITY)
    const second = buildTargets('orbit', frame, INSTANCE_CAPACITY)
    expect(second.position).toEqual(first.position)
    expect(second.colour).toEqual(first.colour)
    expect(second.scale).toEqual(first.scale)
    expect(second.anchor).toEqual(first.anchor)
  })

  it('lands the monolith anchor at cx 0.74 / cy 0.55 of a 1440x900 viewport within 1px', () => {
    const bundle = buildTargets('monolith', frame, INSTANCE_CAPACITY)
    const [px, py] = worldToPixel(frame, bundle.anchor[0], bundle.anchor[1])
    expect(Math.abs(px - 1440 * 0.74)).toBeLessThan(1)
    expect(Math.abs(py - 900 * 0.55)).toBeLessThan(1)
    expect(bundle.anchor[2]).toBe(0)
  })

  it('keeps the model unit equal to fit * scale CSS pixels, like the 2D painter', () => {
    const bundle = buildTargets('stream', frame, INSTANCE_CAPACITY)
    const [x] = pointsFor('stream')[0] ?? [0]
    const unitPx = Math.min(1440, 900) * FORMATIONS.stream.scale
    // Float32 storage: exact to a thousandth of a pixel, not to double precision.
    expect((bundle.position[0] ?? 0) / frame.worldPerPx).toBeCloseTo(x * unitPx, 3)
  })

  it('colours each instance from shade(t) of its own point', () => {
    const bundle = buildTargets('ring', frame, INSTANCE_CAPACITY)
    const [, , , t] = pointsFor('ring')[7] ?? [0, 0, 0, 0]
    const [r] = shade(t)
    expect(bundle.colourT[7]).toBeCloseTo(t, 6)
    // Linear-light, so darker than the sRGB value but monotonic with it.
    expect(bundle.colour[21]).toBeGreaterThan(0)
    expect(bundle.colour[21]).toBeLessThanOrEqual(r / 255)
  })

  it('is round-trip exact between pixel and world on the z = 0 plane', () => {
    const [x, y] = pixelToWorld(frame, 100, 820)
    const [px, py] = worldToPixel(frame, x, y)
    expect(px).toBeCloseTo(100, 6)
    expect(py).toBeCloseTo(820, 6)
  })

  it('uses 3000 instances at full keep and round(3000 * REDUCED_KEEP) on the reduced rung', () => {
    expect(instanceCount(1)).toBe(3000)
    expect(instanceCount(REDUCED_KEEP)).toBe(Math.round(3000 * REDUCED_KEEP))
    const reduced = buildTargets('monolith', frame, instanceCount(REDUCED_KEEP), REDUCED_KEEP)
    expect(reduced.count).toBeLessThanOrEqual(reduced.capacity)
    expect(reduced.count).toBe(pointsFor('monolith', REDUCED_KEEP).length)
  })

  it('widens the field on ultrawide and picks the portrait fov on tall viewports', () => {
    expect(buildTargets('grid', frameFor(3440, 1440), 10).spreadX).toBe(1.4)
    expect(buildTargets('grid', frame, 10).spreadX).toBe(1)
    expect(frameFor(390, 844).fov).toBe(45)
    expect(frame.fov).toBe(35)
  })
})
