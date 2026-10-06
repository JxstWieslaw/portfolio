import { describe, expect, it } from 'vitest'
import { buildCube, buildDust, buildSlab, buildTorus, CELL, PLANES, RINGS, slabDistance, TORUS_U, TORUS_V } from '@/lib/hero/geometry'

/** FNV-1a over values rounded to 1e-4, so the pin survives last-bit differences between engines. */
function checksum(values: Float32Array): string {
  let h = 0x811c9dc5
  for (const v of values) {
    h ^= Math.round(v * 1e4) | 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

describe('PLANES', () => {
  it('are the twelve half-spaces of the lab slab, unit normals', () => {
    expect(PLANES).toHaveLength(12)
    for (const { n } of PLANES) expect(Math.hypot(...n)).toBeCloseTo(1, 9)
  })
})

describe('buildSlab', () => {
  const slab = buildSlab()
  const vertexCount = slab.positions.length / 3

  it('is 32 triangles', () => {
    expect(vertexCount / 3).toBe(32)
    expect(slab.normals.length).toBe(slab.positions.length)
  })

  it('has every vertex inside or on all twelve planes', () => {
    for (let i = 0; i < vertexCount; i += 1) {
      const p: [number, number, number] = [slab.positions[i * 3] as number, slab.positions[i * 3 + 1] as number, slab.positions[i * 3 + 2] as number]
      for (const plane of PLANES) {
        expect(plane.n[0] * p[0] + plane.n[1] * p[1] + plane.n[2] * p[2] - plane.d).toBeLessThan(1e-6)
      }
    }
  })

  it('fits the lab slab bounds: x within 0.46, z within 0.30, y from -1.5 to 1.6', () => {
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < vertexCount; i += 1) {
      for (let k = 0; k < 3; k += 1) {
        const v = slab.positions[i * 3 + k] as number
        lo[k] = Math.min(lo[k] as number, v)
        hi[k] = Math.max(hi[k] as number, v)
      }
    }
    expect(lo[0]).toBeCloseTo(-0.46, 5)
    expect(hi[0]).toBeCloseTo(0.46, 5)
    expect(lo[2]).toBeCloseTo(-0.3, 5)
    expect(hi[2]).toBeCloseTo(0.3, 5)
    expect(lo[1]).toBeCloseTo(-1.5, 5)
    expect(hi[1]).toBeGreaterThan(1.4)
    expect(hi[1]).toBeLessThanOrEqual(1.6 + 1e-6)
  })

  it('has unit normals that agree with the plane of their triangle', () => {
    for (let t = 0; t < vertexCount / 3; t += 1) {
      const at = (i: number): number[] => [0, 1, 2].map((k) => slab.positions[(t * 3 + i) * 3 + k] as number)
      const [a, b, c] = [at(0), at(1), at(2)] as [number[], number[], number[]]
      const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!]
      const e2 = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!]
      const cross = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!]
      const area = Math.hypot(...cross)
      expect(area).toBeGreaterThan(1e-9)
      const n = [0, 1, 2].map((k) => slab.normals[t * 9 + k] as number)
      expect(Math.hypot(...n)).toBeCloseTo(1, 5)
      // The mesh is built to be wound outward: the geometric normal and the stored normal point the same way.
      expect((cross[0]! * n[0]! + cross[1]! * n[1]! + cross[2]! * n[2]!) / area).toBeCloseTo(1, 4)
    }
  })

  it('is deterministic, with the checksum pinned', () => {
    expect(checksum(buildSlab().positions)).toBe(checksum(slab.positions))
    expect(checksum(slab.positions)).toBe('2b51f5c3')
  })
})

describe('buildDust', () => {
  const dust = buildDust()

  it('is deterministic with the counts and checksum pinned', () => {
    const again = buildDust()
    expect(checksum(again.instances)).toBe(checksum(dust.instances))
    expect(dust.inside).toBe(PIN_INSIDE)
    expect(dust.outer).toBe(PIN_OUTER)
    expect(dust.instances.length).toBe((dust.inside + dust.outer) * 4)
    expect(checksum(dust.instances)).toBe('53b86bf5')
  })

  it('puts the slab shards first, every one inside the slab', () => {
    for (let i = 0; i < dust.inside; i += 1) {
      expect(dust.instances[i * 4 + 3]).toBe(1)
      const c = [0, 1, 2].map((k) => ((dust.instances[i * 4 + k] as number) + 0.5) * CELL) as [number, number, number]
      expect(slabDistance(c)).toBeLessThan(0.03)
    }
  })

  it('keeps the outer shards outside the slab and ordered by hash rank', () => {
    for (let i = dust.inside; i < dust.inside + dust.outer; i += 1) {
      expect(dust.instances[i * 4 + 3]).toBe(0)
      const c = [0, 1, 2].map((k) => ((dust.instances[i * 4 + k] as number) + 0.5) * CELL) as [number, number, number]
      expect(slabDistance(c)).toBeGreaterThanOrEqual(0.03)
    }
  })

  it('is about a thousand instances, the spec figure', () => {
    expect(dust.inside + dust.outer).toBeGreaterThan(900)
    expect(dust.inside + dust.outer).toBeLessThan(1050)
  })
})

describe('the small meshes', () => {
  it('cube is 12 triangles with unit normals', () => {
    const cube = buildCube()
    expect(cube.positions.length / 9).toBe(12)
    for (let i = 0; i < cube.normals.length; i += 3) {
      expect(Math.hypot(cube.normals[i]!, cube.normals[i + 1]!, cube.normals[i + 2]!)).toBeCloseTo(1, 6)
    }
  })

  it('torus is TORUS_U by TORUS_V quads', () => {
    expect(buildTorus().length / 2 / 6).toBe(TORUS_U * TORUS_V)
  })

  it('three rings, each contracting onto the slab', () => {
    expect(RINGS).toHaveLength(3)
    for (const ring of RINGS) expect(ring.major[1]).toBeLessThan(ring.major[0])
  })
})

const PIN_INSIDE = 106
const PIN_OUTER = 867
