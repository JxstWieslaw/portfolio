/** Shared fixtures for the assets-*.test.ts files. Not a test itself. */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'

import { Document } from '@gltf-transform/core'
import { KHRMaterialsIOR, KHRMaterialsTransmission, KHRMaterialsVolume, KHRTextureTransform } from '@gltf-transform/extensions'
import sharp from 'sharp'

import { defaultRoot } from '../../scripts/assets/sources'
import { canonicalJson, contentHashOf, packGlb } from '../../scripts/assets/validators'

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


/**
 * A GLB whose whole binary chunk is one image, hung off a scene the way the pipeline hangs it
 * (scene, node, mesh, material, texture, image), so only the image's own defects are left to find.
 */
export function glbAroundImage(image: Uint8Array, mimeType = 'image/webp'): Uint8Array {
  return packGlb(
    {
      asset: { version: '2.0' },
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: {}, material: 0 }] }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      textures: [{ source: 0 }],
      images: [{ bufferView: 0, mimeType }],
      buffers: [{ byteLength: image.length }],
      bufferViews: [{ buffer: 0, byteLength: image.length }],
    },
    image,
  )
}

export type Json = Record<string, unknown>

/** A bufferView in buffer 0. */
export const view = (byteOffset: number, byteLength: number, more: Json = {}): Json => ({ buffer: 0, byteOffset, byteLength, ...more })
/** A float SCALAR accessor over a view: 4 bytes an element. */
export const floats = (bufferView: number, count: number, more: Json = {}): Json => ({ bufferView, componentType: 5126, count, type: 'SCALAR', ...more })
/** An unsigned short SCALAR accessor over a view: 2 bytes an element. */
export const shorts = (bufferView: number, count: number, more: Json = {}): Json => ({ bufferView, componentType: 5123, count, type: 'SCALAR', ...more })

export interface BinSpec {
  bufferViews?: Json[]
  accessors?: Json[]
  binLength?: number
  declared?: number
  extra?: Json
  /** Bytes to set in the binary chunk, by offset; everything else is zero. */
  patch?: Record<number, number>
}

/**
 * The smallest clean GLB with a binary chunk: one mesh in one scene reads every accessor, so a case
 * only has its own defect left to find. Two float accessors over two 8 byte views unless `spec` says otherwise.
 */
export function binGlb(spec: BinSpec = {}): Uint8Array {
  const binLength = spec.binLength ?? 16
  const accessors = spec.accessors ?? [floats(0, 2), floats(1, 2)]
  const bin = new Uint8Array(binLength)
  for (const [at, byte] of Object.entries(spec.patch ?? {})) bin[Number(at)] = byte
  return packGlb(
    {
      asset: { version: '2.0' },
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: Object.fromEntries(accessors.map((_, i) => [`TEXCOORD_${i}`, i])) }] }],
      accessors,
      bufferViews: spec.bufferViews ?? [view(0, 8), view(8, 8)],
      buffers: [{ byteLength: spec.declared ?? binLength }],
      ...spec.extra,
    },
    bin,
  )
}

/**
 * A source shaped like a real kit export, built to reach every collection the scanner covers: two
 * materials (the tier 2 and 3 cap), two textures with a transform on one, an animation, a morph
 * target held as a SPARSE accessor, a custom `_BATCHID` attribute and, at tier 3, the transmissive
 * extensions. Feed it to `buildVariant`; what comes out is what the scanner must never reject.
 */
export async function richDoc(tier: 2 | 3): Promise<Document> {
  // Noise, not a flat colour: prune() folds a solid texture into a material factor and the texture would vanish.
  const png = async (seed: number): Promise<Uint8Array> => {
    const rand = lcg(seed)
    const raw = Buffer.alloc(64 * 64 * 3)
    for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(rand() * 256)
    return new Uint8Array(await sharp(raw, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer())
  }
  const doc = uvSphere(20, 24, true)
  const a = doc.createTexture('a').setImage(await png(7)).setMimeType('image/png')
  const b = doc.createTexture('b').setImage(await png(11)).setMimeType('image/png')
  const body = doc.getRoot().listMaterials()[0] ?? doc.createMaterial('fallback')
  body.setNormalTexture(a).setOcclusionTexture(a).setEmissiveFactor([1, 0, 0]).setAlphaMode('BLEND').setDoubleSided(true)
  body.setBaseColorTexture(a)
  body
    .getBaseColorTextureInfo()
    ?.setExtension('KHR_texture_transform', doc.createExtension(KHRTextureTransform).createTransform().setScale([2, 2]).setOffset([0.1, 0]))
  if (tier === 3) {
    body.setExtension('KHR_materials_transmission', doc.createExtension(KHRMaterialsTransmission).createTransmission().setTransmissionFactor(0.5))
    body.setExtension('KHR_materials_volume', doc.createExtension(KHRMaterialsVolume).createVolume().setThicknessFactor(1))
    body.setExtension('KHR_materials_ior', doc.createExtension(KHRMaterialsIOR).createIOR().setIOR(1.4))
  }

  // A second mesh in its own node with its own material: a small tetrahedron.
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer()
  const tetra = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1])).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint16Array.from([0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3])).setBuffer(buffer))
    .setMaterial(doc.createMaterial('cap').setBaseColorFactor([0.2, 0.4, 0.8, 1]).setEmissiveTexture(b))
  doc.getRoot().listScenes()[0]?.addChild(doc.createNode('cap').setMesh(doc.createMesh('cap').addPrimitive(tetra)).setTranslation([0, 3, 0]))

  // A morph target and a custom attribute on the sphere. The target's accessor is flagged sparse.
  const sphere = doc.getRoot().listMeshes()[0]
  const prim = sphere?.listPrimitives()[0]
  const count = prim?.getAttribute('POSITION')?.getCount() ?? 0
  const delta = new Float32Array(count * 3)
  delta[0] = 0.25
  delta[count * 3 - 1] = -0.25
  const target = doc.createPrimitiveTarget().setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(delta).setBuffer(buffer).setSparse(true))
  prim?.addTarget(target)
  sphere?.setWeights([0.5])
  prim?.setAttribute('_BATCHID', doc.createAccessor().setType('SCALAR').setArray(new Float32Array(count)).setBuffer(buffer))

  addClip(doc, 'idle', 2)
  return doc
}

/** A committed model (the gyroscope by default) at one tier, as the pipeline wrote it. */
export function committedGlb(tier: 1 | 2, id = 'gyroscope'): Uint8Array {
  const modelsDir = path.join(defaultRoot(), 'apps', 'web', 'public', 'models')
  const manifest = JSON.parse(readFileSync(path.join(modelsDir, 'manifest.json'), 'utf8')) as {
    models: { id: string; variants: { tier: number; url: string }[] }[]
  }
  const url = manifest.models.find((m) => m.id === id)?.variants.find((x) => x.tier === tier)?.url ?? ''
  return new Uint8Array(readFileSync(path.join(modelsDir, url.replace('/models/', ''))))
}

/** A GLB container around hand-written JSON text, so the text can hold what JSON.stringify never writes. */
export function rawGlb(jsonText: string, bin: Uint8Array | null): Uint8Array {
  const jsonBytes = new TextEncoder().encode(jsonText)
  const jsonPadded = Math.ceil(jsonBytes.byteLength / 4) * 4
  const binPadded = bin ? Math.ceil(bin.byteLength / 4) * 4 : 0
  const total = 12 + 8 + jsonPadded + (bin ? 8 + binPadded : 0)
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonPadded, true)
  view.setUint32(16, 0x4e4f534a, true)
  out.fill(0x20, 20, 20 + jsonPadded)
  out.set(jsonBytes, 20)
  if (bin) {
    const at = 20 + jsonPadded
    view.setUint32(at, binPadded, true)
    view.setUint32(at + 4, 0x004e4942, true)
    out.set(bin, at + 8)
  }
  return out
}

/**
 * The gyroscope entry of the committed sources.json in the shape these tests were written against:
 * `enabled: false`, so it has no credit row. Once more models were committed (and the gyroscope turned
 * on), the first entry of the real file stopped being a stable fixture; the tests that need "one
 * generated source, nothing enabled" take it from here instead and stay independent of what ships.
 */
export function gyroscopeSource(): Record<string, unknown> {
  const sources = JSON.parse(readFileSync(path.join(defaultRoot(), 'content', 'models', 'sources.json'), 'utf8')) as Record<string, unknown>[]
  const found = sources.find((s) => s['id'] === 'gyroscope')
  if (!found) throw new Error('committed sources.json has no gyroscope entry')
  return { ...found, enabled: false }
}

/**
 * Copies the committed tree into `root` reduced to that fixture: sources.json holds only the gyroscope
 * (disabled), credits.json is empty, and only the gyroscope's files and manifest entry come along.
 */
export function copyGyroscopeTree(root: string): void {
  const src = path.join(defaultRoot(), 'apps', 'web', 'public', 'models')
  const out = path.join(root, 'apps', 'web', 'public', 'models')
  mkdirSync(out, { recursive: true })
  mkdirSync(path.join(root, 'content', 'models'), { recursive: true })
  writeFileSync(path.join(root, 'content', 'models', 'sources.json'), JSON.stringify([gyroscopeSource()]))
  writeFileSync(path.join(root, 'content', 'credits.json'), '[]\n')
  const manifest = JSON.parse(readFileSync(path.join(src, 'manifest.json'), 'utf8')) as { models: { id: string; enabled: boolean }[]; contentHash: string }
  const models = manifest.models.filter((m) => m.id === 'gyroscope').map((m) => ({ ...m, enabled: false }))
  writeFileSync(path.join(out, 'manifest.json'), canonicalJson({ ...manifest, contentHash: contentHashOf(models), models }))
  for (const name of readdirSync(src)) if (name.startsWith('gyroscope.')) copyFileSync(path.join(src, name), path.join(out, name))
}
