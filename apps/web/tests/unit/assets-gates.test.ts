// @vitest-environment node
import { Document } from '@gltf-transform/core'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'

import { IngestRejected, buildVariant, countTriangles, loadToolchain, type Toolchain } from '../../scripts/assets/pipeline'
import { buildReport, parseGlb, scanGlb } from '../../scripts/assets/validators'

import { addClip, soup, uvSphere } from './assets-fixtures'

let tc: Toolchain
beforeAll(async () => {
  tc = await loadToolchain()
})

const subject = 'gate'
const codesOf = (error: unknown) => (error as IngestRejected).violations.map((x) => x.code)
const messagesOf = (error: unknown) => (error as IngestRejected).violations.map((x) => x.message)

describe('buildVariant: the final validateReport + scanGlb gate is reachable', () => {
  it('BYTES: geometry that fits the triangle budget but not the byte budget', async () => {
    const error = await buildVariant(tc, soup(6_000), { subject, tier: 1 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IngestRejected)
    expect(messagesOf(error).join('\n')).toMatch(/exceeds the tier 1 budget of 70000 B/)
  }, 60_000)

  it('TRIS: a source simplify cannot reduce is rejected with a clear message, not looped on', async () => {
    const error = await buildVariant(tc, soup(30_000), { subject, tier: 1 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IngestRejected)
    expect(codesOf(error)).toEqual(['TRIS'])
    expect(messagesOf(error)[0]).toMatch(/^simplify stalled at \d+ triangles \(budget 6000\)$/)
  }, 120_000)

  it('TEXTURE: three textures on one material at tier 1', async () => {
    const doc = uvSphere(12, 16, true)
    const material = doc.getRoot().listMaterials()[0]
    const image = async (shift: number) => {
      const raw = Buffer.alloc(64 * 64 * 3)
      for (let i = 0; i < 64 * 64; i++) {
        raw[i * 3] = ((i % 64) * 4 + shift) & 255
        raw[i * 3 + 1] = (Math.floor(i / 64) * 4 + shift * 3) & 255
        raw[i * 3 + 2] = (i + shift * 9) & 63
      }
      return new Uint8Array(await sharp(raw, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer())
    }
    material?.setBaseColorTexture(doc.createTexture('a').setImage(await image(0)).setMimeType('image/png'))
    material?.setEmissiveTexture(doc.createTexture('b').setImage(await image(40)).setMimeType('image/png'))
    material?.setNormalTexture(doc.createTexture('c').setImage(await image(90)).setMimeType('image/png'))
    const error = await buildVariant(tc, doc, { subject, tier: 1 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IngestRejected)
    expect(messagesOf(error)).toContain('3 textures exceed the tier 1 cap of 1')
  }, 60_000)

  it('CLIPS: a 25 s clip', async () => {
    const doc = uvSphere(8, 10)
    addClip(doc, 'spin', 25)
    const error = await buildVariant(tc, doc, { subject, tier: 2, clips: [{ from: 'spin', as: 'spin' }] }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IngestRejected)
    expect(messagesOf(error)).toContain('clip "spin" runs 25 s; the cap is 20 s')
  }, 60_000)

  it('SECURITY: an email address in a material, node or mesh name never reaches the file (names are stripped)', async () => {
    const doc = uvSphere(8, 10)
    doc.getRoot().listMaterials()[0]?.setName('made-by-someone@example.com')
    doc.getRoot().listNodes()[0]?.setName('C:\\Users\\wiesl\\model')
    doc.getRoot().listMeshes()[0]?.setName('/home/wiesl/mesh')
    const out = await buildVariant(tc, doc, { subject, tier: 2 })
    const { json } = parseGlb(out.bytes)
    expect(JSON.stringify(json)).not.toMatch(/example.com|wiesl|Users/)
    expect(scanGlb(out.bytes, subject, 2)).toEqual([])
  }, 60_000)

  it('logs an animation it drops for not being listed in clips', async () => {
    const doc = uvSphere(8, 10)
    addClip(doc, 'unused', 1)
    const lines: string[] = []
    const out = await buildVariant(tc, doc, { subject, tier: 2, log: (l) => lines.push(l) })
    expect(lines.join('\n')).toContain('dropping animation "unused"')
    expect(out.report.clips).toEqual([])
  }, 60_000)
})

describe('countTriangles agrees with buildReport on the written file', () => {
  function meshDoc(opts: { vertices: number; indices?: number[]; mode?: number; instances?: number }): Document {
    const doc = new Document()
    const buffer = doc.createBuffer()
    const positions = new Float32Array(opts.vertices * 3)
    for (let i = 0; i < positions.length; i++) positions[i] = (i * 7919) % 101
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
    if (opts.indices)
      prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint16Array.from(opts.indices)).setBuffer(buffer))
    if (opts.mode !== undefined) prim.setMode(opts.mode as 0 | 1 | 2 | 3 | 4 | 5 | 6)
    const mesh = doc.createMesh('m').addPrimitive(prim)
    const scene = doc.createScene('s')
    for (let i = 0; i < (opts.instances ?? 1); i++) scene.addChild(doc.createNode(`n${i}`).setMesh(mesh))
    return doc
  }

  const cases: [string, Parameters<typeof meshDoc>[0], number][] = [
    ['indexed triangles', { vertices: 8, indices: [0, 1, 2, 2, 3, 4, 5, 6, 7] }, 3],
    ['non-indexed triangles', { vertices: 30 }, 10],
    ['one mesh instanced by three nodes', { vertices: 30, instances: 3 }, 30],
    ['a triangle strip', { vertices: 12, indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], mode: 5 }, 8],
    ['a triangle fan', { vertices: 12, indices: [0, 1, 2, 3, 4, 5, 6], mode: 6 }, 5],
    ['points, which draw no triangles', { vertices: 12, mode: 0 }, 0],
  ]
  it.each(cases)('%s', async (_label, opts, expected) => {
    const doc = meshDoc(opts)
    expect(countTriangles(doc)).toBe(expected)
    expect(buildReport(await tc.io.writeBinary(doc)).triangles).toBe(expected)
  })
})
