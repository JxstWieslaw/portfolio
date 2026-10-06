import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { deflateSync } from 'node:zlib'
import { Document, NodeIO } from '@gltf-transform/core'

/**
 * Builds `cube.glb`, the fixture the model e2e serves through `page.route` so
 * the browser test never depends on a shipped model (platform spec § 7.3). A
 * textured cube with a one-second `spin` clip: it exercises geometry, a
 * material, a texture and the mixer on the way in, and every one of them on
 * the way out.
 *
 * Deterministic: no timestamps, a hand-rolled stored-block PNG (no encoder
 * whose output varies by platform). Run it with `npx tsx tests/fixtures/make-cube-glb.ts`.
 */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** A 2 x 2 RGBA PNG: violet, cyan, cyan, violet. */
function png(): Uint8Array {
  const violet = [124, 58, 237, 255]
  const cyan = [34, 211, 238, 255]
  const rows = [[0, ...violet, ...cyan], [0, ...cyan, ...violet]]
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, 2)
  view.setUint32(4, 2)
  header.set([8, 6, 0, 0, 0], 8)
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Uint8Array.from(rows.flat()), { level: 0 })),
    chunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

export async function buildCubeGlb(): Promise<Uint8Array> {
  const doc = new Document()
  const buffer = doc.createBuffer()

  // Six faces of four vertices: normals and uvs per face, so the facets read as a cube.
  const faces: Array<{ n: [number, number, number]; u: [number, number, number]; v: [number, number, number] }> = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  ]
  const position: number[] = []
  const normal: number[] = []
  const uv: number[] = []
  const index: number[] = []
  const radius = Math.sqrt(3)
  faces.forEach(({ n, u, v }, f) => {
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      // A unit cube has bounding radius sqrt(3) / 2 * 2; scale by 1 / sqrt(3) so the radius is 1, as ingest does.
      for (let a = 0; a < 3; a += 1) position.push(((n[a] as number) + su * (u[a] as number) + sv * (v[a] as number)) / radius)
      normal.push(...n)
      uv.push((su + 1) / 2, (sv + 1) / 2)
    }
    const o = f * 4
    index.push(o, o + 1, o + 2, o, o + 2, o + 3)
  })

  const texture = doc.createTexture('checker').setImage(png()).setMimeType('image/png')
  const material = doc.createMaterial('cube').setBaseColorTexture(texture).setMetallicFactor(0.2).setRoughnessFactor(0.6)
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(position)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(normal)).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(index)).setBuffer(buffer))
    .setMaterial(material)
  const node = doc.createNode('cube').setMesh(doc.createMesh('cube').addPrimitive(primitive))

  const spin = doc.createAnimation('spin')
  const sampler = doc
    .createAnimationSampler()
    .setInput(doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 1])).setBuffer(buffer))
    .setOutput(doc.createAccessor().setType('VEC4').setArray(new Float32Array([0, 0, 0, 1, 0, 1, 0, 0])).setBuffer(buffer))
    .setInterpolation('LINEAR')
  spin.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath('rotation').setSampler(sampler))

  doc.createScene('scene').addChild(node)
  return new NodeIO().writeBinary(doc)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const bytes = await buildCubeGlb()
  const target = fileURLToPath(new URL('./cube.glb', import.meta.url))
  writeFileSync(target, bytes)
  console.log(`wrote ${target} (${bytes.length} bytes)`)
}
