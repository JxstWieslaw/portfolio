import { describe, expect, it } from 'vitest'
import { assemblyBuilder, formationBuilder } from '@/lib/assembly/bundle-cache'
import { CHAPTERS, type ModelPlacement } from '@/lib/assembly/chapters'
import {
  INSTANCE_CAPACITY,
  buildModelBundle,
  buildTargets,
  clearArtefact,
  clearSphere,
  frameFor,
  instanceCount,
  pixelToWorld,
  worldToPixel,
} from '@/lib/assembly/targets'
import { FORMATION_IDS, FORMATIONS } from '@/lib/formations/config'
import { REDUCED_KEEP } from '@/lib/formations/fallback'
import { pointsFor, shade } from '@/lib/formations/render'

const frame = frameFor(1440, 900)

const modelRow: ModelPlacement = {
  asset: 'test',
  role: 'prop',
  position: [0, 0, 0],
  scale: 1,
  rotation: [0, 0, 0],
  spin: 0,
  exclusion: 0,
  appear: [0.2, 0.8],
}

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

describe('clearSphere', () => {
  const centre = [0, 0.1, 0] as const

  it('moves cubes inside the radius out to it along the radius from the centre, and no others', () => {
    const bundle = buildModelBundle('monolith', INSTANCE_CAPACITY)
    const { bundle: cleared, moved } = clearSphere(bundle, centre, 0.3)
    expect(moved).toBeGreaterThan(0)
    for (let i = 0; i < cleared.count; i += 1) {
      const d = Math.hypot(
        (cleared.position[i * 3] ?? 0) - centre[0],
        (cleared.position[i * 3 + 1] ?? 0) - centre[1],
        (cleared.position[i * 3 + 2] ?? 0) - centre[2],
      )
      expect(d).toBeGreaterThanOrEqual(0.3 - 1e-6)
    }
    // Cubes already outside are untouched, and the input is not mutated.
    const before = Math.hypot(bundle.position[0] ?? 0, (bundle.position[1] ?? 0) - 0.1, bundle.position[2] ?? 0)
    if (before >= 0.3) expect(cleared.position.slice(0, 3)).toEqual(bundle.position.slice(0, 3))
    expect(bundle.position).toEqual(buildModelBundle('monolith', INSTANCE_CAPACITY).position)
  })

  it('moves nothing when the radius is 0 and returns the same positions', () => {
    const bundle = buildModelBundle('orbit', INSTANCE_CAPACITY)
    const { bundle: cleared, moved } = clearSphere(bundle, centre, 0)
    expect(moved).toBe(0)
    expect(cleared.position).toEqual(bundle.position)
  })

  it('is what clearArtefact does: the old name is a thin wrapper with identical output', () => {
    const bundle = buildModelBundle('monolith', INSTANCE_CAPACITY)
    const a = clearArtefact(bundle, centre, 0.42, 0.48)
    const b = clearSphere(bundle, centre, 0.42, 0.48)
    expect(a.moved).toBe(b.moved)
    expect(a.bundle.position).toEqual(b.bundle.position)
  })
})

describe('the chapter ledger leaves the formations alone while every model is null', () => {
  it.each(FORMATION_IDS)('%s: assemblyBuilder with the committed ledger equals the plain builder', (kind) => {
    const plain = formationBuilder(INSTANCE_CAPACITY, 1)
    const scene = assemblyBuilder(INSTANCE_CAPACITY, 1)
    if (kind === 'monolith') return // the monolith carries the artefact's own clearance, tested in assembly-journey
    expect(scene(kind).position).toEqual(plain(kind).position)
  })

  it('applies a placement exclusion to that formation only, and the monolith keeps the artefact clearance on top', () => {
    const ledger = {
      ...CHAPTERS,
      stream: { ...CHAPTERS.stream, model: { ...modelRow, position: [0, 0, 0] as const, exclusion: 0.4 } },
    }
    const base = assemblyBuilder(INSTANCE_CAPACITY, 1)
    const withRow = assemblyBuilder(INSTANCE_CAPACITY, 1, undefined, ledger)
    const stream = withRow('stream')
    expect(stream.position).not.toEqual(base('stream').position)
    for (let i = 0; i < stream.count; i += 1) {
      expect(Math.hypot(stream.position[i * 3] ?? 0, stream.position[i * 3 + 1] ?? 0, stream.position[i * 3 + 2] ?? 0)).toBeGreaterThanOrEqual(0.4 - 1e-6)
    }
    expect(withRow('lattice').position).toEqual(base('lattice').position)
    expect(withRow('monolith').position).toEqual(base('monolith').position)
  })
})
