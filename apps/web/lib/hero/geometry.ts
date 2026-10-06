/**
 * The monolith's geometry — hero monolith spec § 4.2. Pure and deterministic:
 * no GL, no clock, no randomness, so a checksum can be pinned in a test.
 *
 * The lab's `monolith()` SDF is the zero set of twelve half-spaces, so the
 * slab is exactly that convex polyhedron. Faces come from clipping one large
 * polygon per plane against the other eleven (Sutherland-Hodgman) and
 * fan-triangulating: 32 triangles, flat normals, no marching cubes.
 */

type V3 = readonly [number, number, number]

export interface Plane {
  readonly n: V3
  /** `n . p <= d` is inside. World space. */
  readonly d: number
}

const S2 = Math.SQRT1_2

const unit = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2])
  return [v[0] / l, v[1] / l, v[2] / l]
}
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

const CROWN_A = unit([-0.34, 1, -0.14])
const CROWN_B = unit([0.85, 1, 0.3])

/** The lab frames the slab at q = p - (0, 0.05, 0), so each `d` gains `n.y * 0.05` in world space. */
const LAB_PLANES: readonly (readonly [V3, number])[] = [
  [[1, 0, 0], 0.46],
  [[-1, 0, 0], 0.46],
  [[0, 0, 1], 0.3],
  [[0, 0, -1], 0.3],
  [[0, 1, 0], 1.55],
  [[0, -1, 0], 1.55],
  [[S2, 0, S2], 0.455],
  [[-S2, 0, -S2], 0.455],
  [[S2, 0, -S2], 0.455],
  [[-S2, 0, S2], 0.455],
  [CROWN_A, CROWN_A[1] * 1.36],
  [CROWN_B, CROWN_B[1] * 1.5],
]

export const PLANES: readonly Plane[] = LAB_PLANES.map(([n, d]) => ({ n, d: d + n[1] * 0.05 }))

/** Signed distance to the slab, the lab's `max` over the planes. Negative inside. */
export function slabDistance(p: V3): number {
  let m = -Infinity
  for (const plane of PLANES) m = Math.max(m, dot(plane.n, p) - plane.d)
  return m
}

function clip(poly: readonly V3[], plane: Plane): V3[] {
  const out: V3[] = []
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i] as V3
    const b = poly[(i + 1) % poly.length] as V3
    const da = dot(plane.n, a) - plane.d
    const db = dot(plane.n, b) - plane.d
    if (da <= 1e-7) out.push(a)
    if ((da < -1e-7 && db > 1e-7) || (da > 1e-7 && db < -1e-7)) {
      const t = da / (da - db)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
    }
  }
  return out
}

export interface SlabMesh {
  /** xyz per vertex, three vertices per triangle. */
  readonly positions: Float32Array
  /** The face normal, repeated per vertex. */
  readonly normals: Float32Array
}

export function buildSlab(): SlabMesh {
  const positions: number[] = []
  const normals: number[] = []
  const BIG = 20
  PLANES.forEach((plane, i) => {
    const n = plane.n
    const c: V3 = [n[0] * plane.d, n[1] * plane.d, n[2] * plane.d]
    const u = unit(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
    const v = cross(n, u)
    let poly: V3[] = (
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const
    ).map(([a, b]): V3 => [
      c[0] + (u[0] * a + v[0] * b) * BIG,
      c[1] + (u[1] * a + v[1] * b) * BIG,
      c[2] + (u[2] * a + v[2] * b) * BIG,
    ])
    PLANES.forEach((other, j) => {
      if (j !== i && poly.length > 0) poly = clip(poly, other)
    })
    for (let k = 1; k < poly.length - 1; k += 1) {
      for (const p of [poly[0], poly[k], poly[k + 1]] as V3[]) {
        positions.push(p[0], p[1], p[2])
        normals.push(n[0], n[1], n[2])
      }
    }
  })
  return { positions: new Float32Array(positions), normals: new Float32Array(normals) }
}

/** The lab's cell size for the dust lattice. */
export const CELL = 0.22
/** A cell whose centre is within this of the slab is one of the slab's own shards. */
const INSIDE_BELOW = 0.03
/** Outer cells are kept when their hash is below this. */
const OUTER_KEEP = 0.22

const fract = (x: number): number => x - Math.floor(x)

/** The lab's `hash33` (Dave Hoskins), which the vertex program repeats on the GPU. */
export function hash33(x: number, y: number, z: number): V3 {
  let a = fract(x * 0.1031)
  let b = fract(y * 0.103)
  let c = fract(z * 0.0973)
  const d = a * (b + 33.33) + b * (a + 33.33) + c * (c + 33.33)
  a += d
  b += d
  c += d
  return [fract((a + b) * c), fract((a + a) * b), fract((b + a) * a)]
}

export interface DustMesh {
  /** Four floats per instance: cell ix, iy, iz, and 1 when the shard is one of the slab's own. */
  readonly instances: Float32Array
  readonly inside: number
  readonly outer: number
}

/**
 * Dust cells, ordered inside-first and then outer by hash rank (lowest hash
 * first), so any tier's set is a prefix and the sets nest.
 */
export function buildDust(): DustMesh {
  const inside: number[] = []
  const outer: { ix: number; iy: number; iz: number; rank: number }[] = []
  for (let ix = -8; ix <= 8; ix += 1) {
    for (let iy = -10; iy <= 11; iy += 1) {
      for (let iz = -8; iz <= 8; iz += 1) {
        const cx = (ix + 0.5) * CELL
        const cy = (iy + 0.5) * CELL
        const cz = (iz + 0.5) * CELL
        if (Math.abs(cx) > 1.55 || Math.abs(cz) > 1.55 || cy < -1.65 || cy > 2.55) continue
        if (slabDistance([cx, cy, cz]) < INSIDE_BELOW) {
          inside.push(ix, iy, iz, 1)
          continue
        }
        const h = hash33(ix + 7, iy + 7, iz + 7)
        if (h[1] < OUTER_KEEP) outer.push({ ix, iy, iz, rank: h[1] })
      }
    }
  }
  outer.sort((a, b) => a.rank - b.rank || a.ix - b.ix || a.iy - b.iy || a.iz - b.iz)
  const instances = new Float32Array(inside.length + outer.length * 4)
  instances.set(inside)
  outer.forEach((o, i) => instances.set([o.ix, o.iy, o.iz, 0], inside.length + i * 4))
  return { instances, inside: inside.length / 4, outer: outer.length }
}

export interface RingSpec {
  /** Major radius when scattered, and when settled on the slab. */
  readonly major: readonly [number, number]
  /** Tube radius when fully settled; the engine scales it with the ring's own progress. */
  readonly tube: number
}

export const RINGS: readonly RingSpec[] = [
  { major: [2.2, 1.22], tube: 0.0062 },
  { major: [2.7, 1.55], tube: 0.0062 * 0.85 },
  { major: [3.2, 1.95], tube: 0.0062 * 0.7 },
]

export const TORUS_U = 120
export const TORUS_V = 6

/** Unit cube: 36 vertices, positions and normals. Scaled per instance in the vertex program. */
export function buildCube(): SlabMesh {
  const positions: number[] = []
  const normals: number[] = []
  const faces: V3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ]
  for (const n of faces) {
    const a: V3 = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
    const u = cross(n, a)
    const v = cross(n, u)
    for (const [p, q] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      positions.push(n[0] + u[0] * p + v[0] * q, n[1] + u[1] * p + v[1] * q, n[2] + u[2] * p + v[2] * q)
      normals.push(n[0], n[1], n[2])
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals) }
}

/** Torus (u, v) angles, two floats per vertex, six vertices per quad. */
export function buildTorus(): Float32Array {
  const out: number[] = []
  const TAU = Math.PI * 2
  for (let i = 0; i < TORUS_U; i += 1) {
    for (let j = 0; j < TORUS_V; j += 1) {
      for (const [a, b] of [
        [i, j],
        [i + 1, j],
        [i + 1, j + 1],
        [i, j],
        [i + 1, j + 1],
        [i, j + 1],
      ] as const) {
        out.push((a / TORUS_U) * TAU, (b / TORUS_V) * TAU)
      }
    }
  }
  return new Float32Array(out)
}
