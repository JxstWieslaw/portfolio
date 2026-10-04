import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PerspectiveCamera } from 'three'
import { assemblyBuilder } from '@/lib/assembly/bundle-cache'
import { damp } from '@/lib/assembly/camera'
import { CHAPTERS, chapterFor, lerpChapter, lookPoint, type ModelPlacement } from '@/lib/assembly/chapters'
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

describe('bundles are byte-identical to the pre-PR code while every model row is null', () => {
  /**
   * `tests/fixtures/assembly-bundles.golden.json` holds sha256 digests of the
   * Float32Array bytes of position, colour and scale for every bundle kind at
   * two instance fractions. They were captured by running the SAME
   * `assemblyBuilder` from the commit before this work (2e0ecce, develop after
   * #46) in a scratch checkout, not from this PR's own output.
   */
  const digest = (a: Float32Array) => createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex')
  const kinds = ['cloud', 'monolith', 'stream', 'lattice', 'orbit', 'scatter', 'grid', 'ring'] as const
  const golden = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/assembly-bundles.golden.json'), 'utf8')) as Record<string, Record<string, { count: number; position: string; colour: string; live: string } | number>>

  for (const keep of [1, 0.5]) {
    it.each(kinds)(`${keep}: %s matches the golden digests`, (kind) => {
      const capacity = instanceCount(keep)
      const expected = golden[String(keep)]?.[kind] as { count: number; position: string; colour: string; live: string }
      expect(golden[String(keep)]?.capacity).toBe(capacity)
      const bundle = assemblyBuilder(capacity, keep)(kind)
      expect({ count: bundle.count, position: digest(bundle.position), colour: digest(bundle.colour), live: digest(bundle.live) }).toEqual(expected)
    })
  }
})

describe('a model row composes with the artefact clearance in the right order', () => {
  it('the monolith keeps the artefact hole and gains the exclusion on top of it', () => {
    const ledger = {
      ...CHAPTERS,
      monolith: { ...CHAPTERS.monolith, model: { ...modelRow, position: [0.3, 0.1, 0] as const, exclusion: 0.3 } },
    }
    const base = assemblyBuilder(INSTANCE_CAPACITY, 1)('monolith')
    const withRow = assemblyBuilder(INSTANCE_CAPACITY, 1, undefined, ledger)('monolith')
    expect(withRow.position).not.toEqual(base.position)
    for (let i = 0; i < withRow.count; i += 1) {
      const x = withRow.position[i * 3] ?? 0
      const y = withRow.position[i * 3 + 1] ?? 0
      const z = withRow.position[i * 3 + 2] ?? 0
      // Nothing inside the artefact's cleared shell (centre [0, 0.1, 0], radius CLEARANCE_RADIUS) ...
      expect(Math.hypot(x, y - 0.1, z)).toBeGreaterThanOrEqual(0.42 - 1e-6)
      // ... and nothing inside the model's exclusion sphere.
      expect(Math.hypot(x - 0.3, y - 0.1, z)).toBeGreaterThanOrEqual(0.3 - 1e-6)
    }
  })

  it('the cloud follows the monolith it is derived from, exclusion included', () => {
    const ledger = { ...CHAPTERS, monolith: { ...CHAPTERS.monolith, model: { ...modelRow, exclusion: 0.5 } } }
    const cloud = assemblyBuilder(INSTANCE_CAPACITY, 1, undefined, ledger)('cloud')
    const monolith = assemblyBuilder(INSTANCE_CAPACITY, 1, undefined, ledger)('monolith')
    expect(cloud.count).toBe(monolith.count)
    expect(cloud.live).toEqual(monolith.live)
  })
})

describe('formations other than the monolith', () => {
  it('apply a placement exclusion to that formation only', () => {
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

describe('the neutral chapter ledger leaves the camera exactly where it was', () => {
  it('a frame with neutral rows looks at the origin: same matrices as camera.lookAt(0, 0, 0)', () => {
    const a = new PerspectiveCamera(45, 1.6, 0.1, 100)
    const b = new PerspectiveCamera(45, 1.6, 0.1, 100)
    for (const camera of [a, b]) camera.position.set(1.2, 0.4, 10)
    const chapter = lerpChapter(chapterFor('monolith'), chapterFor('stream'), 0.37)
    // The canvas damps `look` toward the blended target from rest (0): one frame at 60 fps.
    const look = { x: damp(0, chapter.target[0], 4, 1 / 60), y: damp(0, chapter.target[1], 4, 1 / 60), z: damp(0, chapter.target[2], 4, 1 / 60) }
    a.lookAt(0, 0, 0)
    a.updateMatrixWorld()
    const [x, y, z] = lookPoint(look, 7.3)
    b.lookAt(x, y, z)
    b.updateMatrixWorld()
    expect(x === 0 && y === 0 && z === 0).toBe(true)
    expect(b.matrixWorld.elements).toEqual(a.matrixWorld.elements)
    expect(b.quaternion.toArray()).toEqual(a.quaternion.toArray())
  })
})
