/** Shared fixtures for the assets-*.test.ts files. Not a test itself. */
import { crc32, deflateRawSync } from 'node:zlib'

import { Document } from '@gltf-transform/core'

/** A UV sphere offset and scaled away from the origin: `lat * lon * 2` triangles. */
export function uvSphere(lat: number, lon: number, withUv = false): Document {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const rows = lat + 1
  const positions = new Float32Array(rows * lon * 3)
  const uvs = new Float32Array(rows * lon * 2)
  for (let i = 0; i < rows; i++) {
    const theta = (Math.PI * i) / lat
    for (let j = 0; j < lon; j++) {
      const phi = (2 * Math.PI * j) / lon
      const at = i * lon + j
      positions.set([Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)], at * 3)
      uvs.set([j / lon, i / lat], at * 2)
    }
  }
  const indices: number[] = []
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = i * lon + j
      const b = i * lon + ((j + 1) % lon)
      const c = (i + 1) * lon + j
      const d = (i + 1) * lon + ((j + 1) % lon)
      indices.push(a, b, c, b, d, c)
    }
  }
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(indices)).setBuffer(buffer))
    .setMaterial(doc.createMaterial('shell').setMetallicFactor(0.5))
  if (withUv) primitive.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uvs).setBuffer(buffer))
  doc
    .createScene('main')
    .addChild(
      doc.createNode('sphere').setMesh(doc.createMesh('sphere').addPrimitive(primitive)).setTranslation([3, 4, 5]).setScale([2, 2, 2]),
    )
  return doc
}

/** Deterministic pseudo-random numbers so the "bad" fixtures are identical on every machine. */
export function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

/** A triangle soup: nothing shares a vertex, so it neither welds nor simplifies much, and it barely compresses. */
export function soup(triangles: number, seed = 1): Document {
  const rand = lcg(seed)
  const doc = new Document()
  const buffer = doc.createBuffer()
  const positions = new Float32Array(triangles * 9)
  for (let i = 0; i < positions.length; i++) positions[i] = rand() * 2 - 1
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
    .setMaterial(doc.createMaterial('soup'))
  doc.createScene('s').addChild(doc.createNode('soup').setMesh(doc.createMesh('soup').addPrimitive(prim)))
  return doc
}

/** Adds a translation clip of the given length to the first node. */
export function addClip(doc: Document, name: string, seconds: number): void {
  const node = doc.getRoot().listNodes()[0]
  if (!node) throw new Error('fixture has no node')
  const buffer = doc.getRoot().listBuffers()[0] ?? null
  const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, seconds])).setBuffer(buffer)
  const output = doc.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 0, 0])).setBuffer(buffer)
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR')
  const channel = doc.createAnimationChannel().setSampler(sampler).setTargetNode(node).setTargetPath('translation')
  doc.createAnimation(name).addSampler(sampler).addChannel(channel)
}

export interface ZipSpec {
  name: string
  data?: Uint8Array | string
  method?: 0 | 8
  flags?: number
  /** Unix mode in the high 16 bits of the external attributes. */
  mode?: number
  usize?: number
  crc?: number
}

export function makeZip(specs: ZipSpec[]): Uint8Array {
  const out: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const s of specs) {
    const name = Buffer.from(s.name)
    const raw = Buffer.from(s.data ?? '')
    const method = s.method ?? 0
    const packed = method === 8 ? deflateRawSync(raw) : raw
    const crc = s.crc ?? crc32(raw)
    const usize = s.usize ?? raw.length

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(s.flags ?? 0, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(usize, 22)
    local.writeUInt16LE(name.length, 26)
    out.push(local, name, packed)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE((3 << 8) | 20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(s.flags ?? 0, 8)
    cd.writeUInt16LE(method, 10)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(packed.length, 20)
    cd.writeUInt32LE(usize, 24)
    cd.writeUInt16LE(name.length, 28)
    cd.writeUInt32LE(((s.mode ?? 0o100644) << 16) >>> 0, 38)
    cd.writeUInt32LE(offset, 42)
    central.push(cd, name)
    offset += local.length + name.length + packed.length
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(specs.length, 8)
  eocd.writeUInt16LE(specs.length, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...out, ...central, eocd]))
}

