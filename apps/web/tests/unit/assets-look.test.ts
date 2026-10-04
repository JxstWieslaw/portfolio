// @vitest-environment node
import { Document } from '@gltf-transform/core'
import { beforeAll, describe, expect, it } from 'vitest'

import { IngestRejected, buildVariant, loadToolchain, type Toolchain } from '../../scripts/assets/pipeline'
import { hexToLinear } from '../../scripts/assets/look'
import { sourceLookSchema, type SourceLook } from '../../scripts/assets/sources'
import { parseGlb, scanGlb, sha256Hex } from '../../scripts/assets/validators'

/**
 * A kit-like source: one vertex stream shared by three primitives, one flat material each (the way
 * Kenney's models are built), a flat origin offset, and a vertex on the border of two materials.
 */
function kitLike(opts: { textured?: boolean } = {}): Document {
  const doc = new Document()
  const buffer = doc.createBuffer()
  // A 4x4 grid of vertices, 18 triangles. Rows 0-1 are material A, rows 1-2 are B, rows 2-3 are C.
  const positions: number[] = []
  for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) positions.push(x + 10, y * 0.5, (x * y) % 2)
  const quad = (x: number, y: number): number[] => {
    const a = y * 4 + x
    return [a, a + 1, a + 4, a + 1, a + 5, a + 4]
  }
  const rows = [0, 1, 2].map((y) => [0, 1, 2].flatMap((x) => quad(x, y)))
  const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer)
  const normal = doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions.map((_, i) => (i % 3 === 2 ? 1 : 0)))).setBuffer(buffer)
  const uv = doc.createAccessor().setType('VEC2').setArray(new Float32Array(16 * 2)).setBuffer(buffer)
  const materials = [
    doc.createMaterial('alpha').setBaseColorFactor([0.9, 0.5, 0.4, 1]).setMetallicFactor(1).setRoughnessFactor(1),
    doc.createMaterial('beta').setBaseColorFactor([0.2, 0.8, 0.6, 1]).setMetallicFactor(1).setRoughnessFactor(1),
    doc.createMaterial('gamma').setBaseColorFactor([0.3, 0.3, 0.35, 1]).setMetallicFactor(1).setRoughnessFactor(1),
  ]
  if (opts.textured) {
    const texture = doc.createTexture('t').setImage(new Uint8Array([1, 2, 3])).setMimeType('image/png')
    materials[0]?.setBaseColorTexture(texture)
  }
  const mesh = doc.createMesh('kit')
  rows.forEach((indices, i) => {
    const idx = doc.createAccessor().setType('SCALAR').setArray(Uint16Array.from(indices)).setBuffer(buffer)
    mesh.addPrimitive(
      doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('NORMAL', normal).setAttribute('TEXCOORD_0', uv).setIndices(idx).setMaterial(materials[i] ?? null),
    )
  })
  doc.createScene('s').addChild(doc.createNode('kit').setMesh(mesh))
  return doc
}

const LOOK: SourceLook = {
  palette: { alpha: '#7C3AED', beta: '#22D3EE' },
  metallic: 0.6,
  roughness: 0.3,
  emissive: { color: '#22D3EE', amount: 0.1 },
}

let tc: Toolchain
beforeAll(async () => {
  tc = await loadToolchain()
})

const build = (doc: Document, tier: 1 | 2, look: SourceLook | null = LOOK) => buildVariant(tc, doc, { subject: 'kit', tier, ...(look ? { look } : {}) })

/** Every distinct vertex colour in the written file, as rounded linear triples. */
async function colours(bytes: Uint8Array): Promise<string[]> {
  const doc = await tc.io.readBinary(bytes)
  const seen = new Set<string>()
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const attr = prim.getAttribute('COLOR_0')
      for (let i = 0; i < (attr?.getCount() ?? 0); i += 1) seen.add((attr?.getElement(i, [] as number[]) ?? []).map((v) => v.toFixed(2)).join(','))
    }
  return [...seen].sort()
}

describe('the look merge', () => {
  it('collapses three flat materials to one, one primitive, one draw call, inside tier 1', async () => {
    const out = await build(kitLike(), 1)
    expect(out.report.materials).toBe(1)
    const { json } = parseGlb(out.bytes)
    expect(json['materials']).toHaveLength(1)
    const prims = (json['meshes'] as { primitives: unknown[] }[]).flatMap((m) => m.primitives)
    expect(prims).toHaveLength(1)
    expect(scanGlb(out.bytes, 'kit', 1)).toEqual([])
    expect(scanGlb(out.bytes, 'kit', 2)).toEqual([])
  }, 60_000)

  it('keeps each material colour per vertex: palette entries recoloured, unlisted materials untouched', async () => {
    const out = await build(kitLike(), 2)
    const want = [hexToLinear('#7C3AED'), hexToLinear('#22D3EE'), [0.3, 0.3, 0.35]].map((rgb) => rgb.map((v) => v.toFixed(2)).join(','))
    const got = await colours(out.bytes)
    // 8-bit vertex colour: allow one step of rounding per channel by comparing at two decimals.
    expect(got).toHaveLength(3)
    for (const c of want) expect(got.some((g) => g.split(',').every((v, i) => Math.abs(Number(v) - Number(c.split(',')[i])) <= 0.011))).toBe(true)
  }, 60_000)

  it('gives the merged material the look values and drops the UV set nothing reads', async () => {
    const out = await build(kitLike(), 2)
    const { json } = parseGlb(out.bytes)
    const material = (json['materials'] as Record<string, unknown>[])[0] ?? {}
    const pbr = material['pbrMetallicRoughness'] as Record<string, number>
    expect(pbr['metallicFactor']).toBeCloseTo(0.6, 5)
    expect(pbr['roughnessFactor']).toBeCloseTo(0.3, 5)
    expect(material['emissiveFactor']).toBeDefined()
    const attributes = Object.keys(((json['meshes'] as { primitives: { attributes: object }[] }[])[0]?.primitives[0]?.attributes) ?? {})
    expect(attributes.sort()).toEqual(['COLOR_0', 'NORMAL', 'POSITION'])
  }, 60_000)

  it('is deterministic: two runs give the same sha256', async () => {
    const first = await build(kitLike(), 2)
    const second = await build(kitLike(), 2)
    expect(sha256Hex(first.bytes)).toBe(sha256Hex(second.bytes))
  }, 60_000)

  it('without a look block the materials are untouched (three stay three, and tier 1 refuses them)', async () => {
    await expect(build(kitLike(), 1, null)).rejects.toBeInstanceOf(IngestRejected)
  }, 60_000)

  it('refuses a textured source: flattening it would lose the texture', async () => {
    await expect(build(kitLike({ textured: true }), 2)).rejects.toThrow(/has a texture/)
  }, 60_000)

  it('refuses a palette key that names no material, so a typo cannot pass silently', async () => {
    await expect(build(kitLike(), 2, { palette: { alpha: '#7C3AED', alfa: '#22D3EE' } })).rejects.toThrow(/no such material: "alfa"/)
  }, 60_000)
})

describe('the look merge refuses what one opaque material cannot express', () => {
  const refused = async (change: (doc: Document) => void, message: RegExp): Promise<void> => {
    const doc = kitLike()
    change(doc)
    await expect(build(doc, 2)).rejects.toThrow(message)
  }
  const material = (doc: Document, name: string) => doc.getRoot().listMaterials().find((m) => m.getName() === name)

  it('a blended material, naming it', () => refused((d) => void material(d, 'beta')?.setAlphaMode('BLEND'), /material "beta" has alphaMode BLEND/), 60_000)
  it('a double-sided material, naming it', () => refused((d) => void material(d, 'gamma')?.setDoubleSided(true), /material "gamma" is double-sided/), 60_000)
  it('a base-colour alpha below 1, naming it', () => refused((d) => void material(d, 'alpha')?.setBaseColorFactor([0.9, 0.5, 0.4, 0.5]), /material "alpha" has a base-colour alpha below 1/), 60_000)
  it('a primitive that already has COLOR_0, naming the mesh', () =>
    refused((d) => {
      const prim = d.getRoot().listMeshes()[0]?.listPrimitives()[0]
      const count = prim?.getAttribute('POSITION')?.getCount() ?? 0
      prim?.setAttribute('COLOR_0', d.createAccessor().setType('VEC3').setArray(new Float32Array(count * 3)).setBuffer(d.getRoot().listBuffers()[0] ?? null))
    }, /mesh "kit" already has COLOR_0/), 60_000)
  it('a material name with a quote or newline is escaped in the message, not printed raw', () =>
    refused((d) => void material(d, 'beta')?.setName('be"ta\nx').setAlphaMode('BLEND'), /"be\\"ta\\nx"/), 60_000)
})

describe('the look schema', () => {
  it('accepts a palette, metallic, roughness and an emissive accent', () => {
    expect(sourceLookSchema.parse(LOOK)).toEqual(LOOK)
  })
  it.each([
    [{ palette: { a: 'violet' } }],
    [{ palette: { a: '#fff' } }],
    [{ metallic: 1.2 }],
    [{ emissive: { color: '#22D3EE', amount: 2 } }],
    [{ tint: '#7C3AED' }],
  ])('rejects %j', (look) => {
    expect(sourceLookSchema.safeParse(look).success).toBe(false)
  })
})
