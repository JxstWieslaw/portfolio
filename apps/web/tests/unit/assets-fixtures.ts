/** Shared fixtures for the assets-*.test.ts files. Not a test itself. */
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
