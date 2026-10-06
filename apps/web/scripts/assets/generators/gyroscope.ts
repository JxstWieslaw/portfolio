/**
 * Generator: a gyroscope of three perpendicular rings around a core.
 *
 * Pure maths, no random numbers, no textures, one material. Every coordinate is rounded to
 * 1e-5 before it becomes a float32 so the bytes cannot drift with a last-bit difference in
 * `Math.sin` between platforms. It is the owner's own work (`licenceId: own`) and gives the
 * pipeline something to ingest on day one without a licence to check.
 *
 * About 7 100 triangles at source: over the tier 1 budget (6 000), so ingest has to simplify
 * for tier 1, and inside tier 2 as it stands.
 */
import { Document } from '@gltf-transform/core'

const RING_SEGMENTS = 64
const TUBE_SEGMENTS = 16
const SPHERE_LON = 32
const SPHERE_LAT = 16

const snap = (x: number): number => Math.fround(Math.round(x * 1e5) / 1e5)

interface Geometry {
  readonly positions: Float32Array
  readonly normals: Float32Array
  readonly indices: Uint32Array
}

/** Torus around the Y axis; vertices wrap, so there are no seam duplicates to weld. */
function torus(major: number, minor: number): Geometry {
  const u = RING_SEGMENTS
  const w = TUBE_SEGMENTS
  const positions = new Float32Array(u * w * 3)
  const normals = new Float32Array(u * w * 3)
  for (let i = 0; i < u; i++) {
    const theta = (2 * Math.PI * i) / u
    for (let j = 0; j < w; j++) {
      const phi = (2 * Math.PI * j) / w
      const at = (i * w + j) * 3
      const nx = Math.cos(phi) * Math.cos(theta)
      const ny = Math.sin(phi)
      const nz = Math.cos(phi) * Math.sin(theta)
      positions.set([snap((major + minor * Math.cos(phi)) * Math.cos(theta)), snap(minor * ny), snap((major + minor * Math.cos(phi)) * Math.sin(theta))], at)
      normals.set([snap(nx), snap(ny), snap(nz)], at)
    }
  }
  const indices = new Uint32Array(u * w * 6)
  let k = 0
  for (let i = 0; i < u; i++) {
    for (let j = 0; j < w; j++) {
      const a = i * w + j
      const b = ((i + 1) % u) * w + j
      const c = ((i + 1) % u) * w + ((j + 1) % w)
      const d = i * w + ((j + 1) % w)
      indices.set([a, c, b, a, d, c], k)
      k += 6
    }
  }
  return { positions, normals, indices }
}

/** UV sphere with single-vertex poles. */
function sphere(radius: number): Geometry {
  const lon = SPHERE_LON
  const lat = SPHERE_LAT
  const count = 2 + (lat - 1) * lon
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const put = (index: number, x: number, y: number, z: number) => {
    positions.set([snap(radius * x), snap(radius * y), snap(radius * z)], index * 3)
    normals.set([snap(x), snap(y), snap(z)], index * 3)
  }
  put(0, 0, 1, 0)
  for (let i = 1; i < lat; i++) {
    const theta = (Math.PI * i) / lat
    for (let j = 0; j < lon; j++) {
      const phi = (2 * Math.PI * j) / lon
      put(1 + (i - 1) * lon + j, Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi))
    }
  }
  const bottom = count - 1
  put(bottom, 0, -1, 0)

  const ring = (i: number, j: number) => 1 + (i - 1) * lon + (j % lon)
  const tris: number[] = []
  for (let j = 0; j < lon; j++) tris.push(0, ring(1, j + 1), ring(1, j))
  for (let i = 1; i < lat - 1; i++) {
    for (let j = 0; j < lon; j++) {
      tris.push(ring(i, j), ring(i, j + 1), ring(i + 1, j))
      tris.push(ring(i, j + 1), ring(i + 1, j + 1), ring(i + 1, j))
    }
  }
  for (let j = 0; j < lon; j++) tris.push(bottom, ring(lat - 1, j), ring(lat - 1, j + 1))
  return { positions, normals, indices: Uint32Array.from(tris) }
}

const H = Math.fround(Math.SQRT1_2)

export function buildGyroscope(): Document {
  const doc = new Document()
  const buffer = doc.createBuffer('gyroscope-data')
  const material = doc
    .createMaterial('gyroscope-metal')
    .setBaseColorFactor([0.75, 0.8, 0.9, 1])
    .setMetallicFactor(0.9)
    .setRoughnessFactor(0.3)
  const scene = doc.createScene('gyroscope')

  const part = (name: string, g: Geometry, rotation: [number, number, number, number]) => {
    const primitive = doc
      .createPrimitive()
      .setAttribute('POSITION', doc.createAccessor(`${name}-position`).setType('VEC3').setArray(g.positions).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor(`${name}-normal`).setType('VEC3').setArray(g.normals).setBuffer(buffer))
      .setIndices(doc.createAccessor(`${name}-indices`).setType('SCALAR').setArray(g.indices).setBuffer(buffer))
      .setMaterial(material)
    const mesh = doc.createMesh(name).addPrimitive(primitive)
    scene.addChild(doc.createNode(name).setMesh(mesh).setRotation(rotation))
  }

  part('ring-outer', torus(1, 0.04), [0, 0, 0, 1])
  part('ring-middle', torus(0.78, 0.04), [H, 0, 0, H])
  part('ring-inner', torus(0.56, 0.04), [0, 0, H, H])
  part('core', sphere(0.18), [0, 0, 0, 1])
  return doc
}
