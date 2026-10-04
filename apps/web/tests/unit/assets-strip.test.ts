// @vitest-environment node
/**
 * Group B: what `strip()` removes from a source so that a real kit export is ingested rather than
 * refused. Every source here goes through `NodeIO` write and read first, so the pipeline meets the
 * extension exactly as it would in a file from disk, not as an in-memory object.
 */
import type { Document } from '@gltf-transform/core'
import { KHRMaterialsEmissiveStrength, KHRMaterialsUnlit } from '@gltf-transform/extensions'
import { beforeAll, describe, expect, it } from 'vitest'

import { IngestRejected, buildVariant, loadToolchain, stripGlbMetadata, type Toolchain } from '../../scripts/assets/pipeline'
import { materialsMessage, packGlb, parseGlb, scanGlb } from '../../scripts/assets/validators'
import { type Json, addClip, richDoc, uvSphere } from './assets-fixtures'

let tc: Toolchain
beforeAll(async () => {
  tc = await loadToolchain()
})

const subject = 'strip'
/** Writes the document to GLB bytes and reads it back, so extensions arrive as they do from a file. */
const roundTrip = async (doc: Document): Promise<Document> => tc.io.readBinary(await tc.io.writeBinary(doc))
const jsonOf = (bytes: Uint8Array): Json => parseGlb(bytes).json
const list = (json: Json, key: string): Json[] => (json[key] ?? []) as Json[]

describe('B1: sparse accessors are written dense', () => {
  it('the source really declares a sparse accessor (so the next test proves something)', async () => {
    const source = parseGlb(await tc.io.writeBinary(await richDoc(2))).json
    expect(list(source, 'accessors').some((a) => 'sparse' in a)).toBe(true)
  })

  it('ingests a source with a sparse morph target, and the written file has no sparse accessor', async () => {
    const doc = await roundTrip(await richDoc(2))
    expect(doc.getRoot().listAccessors().some((a) => a.getSparse())).toBe(true)
    const out = await buildVariant(tc, doc, { subject, tier: 2, clips: [{ from: 'idle', as: 'idle' }] })
    expect(list(jsonOf(out.bytes), 'accessors').some((a) => 'sparse' in a)).toBe(false)
    expect(JSON.stringify(jsonOf(out.bytes))).not.toContain('"sparse"')
    expect(scanGlb(out.bytes, subject, 2)).toEqual([])
  }, 120_000)
})

describe('B1: a sparse animation output (no transform rewrites it, so only the explicit densify saves it)', () => {
  /** 40 keyframes, one of them non-zero: gltf-transform writes the output accessor sparse when it is flagged. */
  function sparseClip(): Document {
    const doc = uvSphere(8, 10)
    const node = doc.getRoot().listNodes()[0]
    const buffer = doc.getRoot().listBuffers()[0] ?? null
    const input = doc.createAccessor().setType('SCALAR').setArray(Float32Array.from({ length: 40 }, (_, i) => i * 0.1)).setBuffer(buffer)
    const values = new Float32Array(40 * 3)
    values[3 * 20] = 1
    const output = doc.createAccessor().setType('VEC3').setArray(values).setBuffer(buffer).setSparse(true)
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR')
    const channel = doc.createAnimationChannel().setSampler(sampler).setTargetNode(node ?? null).setTargetPath('translation')
    doc.createAnimation('idle').addSampler(sampler).addChannel(channel)
    return doc
  }

  it('is sparse in the source, dense in the output, and the output passes the scanner', async () => {
    expect(JSON.stringify(parseGlb(await tc.io.writeBinary(sparseClip())).json)).toContain('"sparse"')
    const out = await buildVariant(tc, await roundTrip(sparseClip()), { subject, tier: 2, clips: [{ from: 'idle', as: 'idle' }] })
    expect(JSON.stringify(jsonOf(out.bytes))).not.toContain('"sparse"')
    expect(scanGlb(out.bytes, subject, 2)).toEqual([])
    expect(out.report.clips.map((c) => c.name)).toEqual(['idle'])
  }, 60_000)
})

describe('B2: extensions our renderer does not honour', () => {
  /** Two materials with an emissive strength: 0.25,0.5,0 x 2 and 0.5,0.5,0.5 x 4. */
  async function source(): Promise<Document> {
    const doc = uvSphere(10, 12)
    const strengthExt = doc.createExtension(KHRMaterialsEmissiveStrength)
    const sphere = doc.getRoot().listMeshes()[0]
    const first = doc.getRoot().listMaterials()[0]
    first?.setEmissiveFactor([0.25, 0.5, 0]).setExtension('KHR_materials_emissive_strength', strengthExt.createEmissiveStrength().setEmissiveStrength(2))
    const second = doc.createMaterial('hot').setEmissiveFactor([0.5, 0.5, 0.5])
    second.setExtension('KHR_materials_emissive_strength', strengthExt.createEmissiveStrength().setEmissiveStrength(4))
    const prim = sphere?.listPrimitives()[0]
    if (prim) {
      const copy = doc
        .createPrimitive()
        .setAttribute('POSITION', prim.getAttribute('POSITION'))
        .setIndices(prim.getIndices())
        .setMaterial(second)
      sphere?.addPrimitive(copy)
    }
    return roundTrip(doc)
  }

  it('ingests a source that declares KHR_materials_emissive_strength, folding it into the factor', async () => {
    const lines: string[] = []
    const out = await buildVariant(tc, await source(), { subject, tier: 2, log: (l) => lines.push(l) })
    expect(out.report.extensionsUsed).not.toContain('KHR_materials_emissive_strength')
    const factors = list(jsonOf(out.bytes), 'materials')
      .map((m) => (m['emissiveFactor'] ?? [0, 0, 0]) as number[])
      .map((f) => f.map((c) => Math.round(c * 1000) / 1000))
      .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))
    // 0.25,0.5,0 x2 = 0.5,1,0 ; 0.5 x4 clamps to 1.
    expect(factors).toEqual([
      [0.5, 1, 0],
      [1, 1, 1],
    ])
    expect(lines).toEqual([
      '  folding emissive strength 2 into the emissive factor',
      '  warning: emissive strength 2 is above 1 and is dropped to a factor of at most 1',
      '  folding emissive strength 4 into the emissive factor',
      '  warning: emissive strength 4 is above 1 and is dropped to a factor of at most 1',
    ])
    expect(scanGlb(out.bytes, subject, 2)).toEqual([])
  }, 120_000)

  it('ingests a source that declares KHR_materials_unlit, and the file does not carry it', async () => {
    const doc = uvSphere(10, 12)
    doc.getRoot().listMaterials()[0]?.setExtension('KHR_materials_unlit', doc.createExtension(KHRMaterialsUnlit).createUnlit())
    const fromFile = await roundTrip(doc)
    expect(fromFile.getRoot().listExtensionsUsed().map((e) => e.extensionName)).toContain('KHR_materials_unlit')
    const out = await buildVariant(tc, fromFile, { subject, tier: 2 })
    expect(out.report.extensionsUsed).not.toContain('KHR_materials_unlit')
    expect(JSON.stringify(jsonOf(out.bytes))).not.toContain('KHR_materials_unlit')
    expect(scanGlb(out.bytes, subject, 2)).toEqual([])
  }, 60_000)

  it('an extension nobody removes is still refused at the tier that does not allow it', async () => {
    const doc = uvSphere(8, 10)
    const ior = (await import('@gltf-transform/extensions')).KHRMaterialsIOR
    doc.getRoot().listMaterials()[0]?.setExtension('KHR_materials_ior', doc.createExtension(ior).createIOR().setIOR(1.4))
    const error = await buildVariant(tc, await roundTrip(doc), { subject, tier: 2 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IngestRejected)
    expect((error as IngestRejected).violations.map((x) => x.message)).toEqual(['source uses KHR_materials_ior, which tier 2 does not allow'])
  }, 60_000)
})

describe('custom attributes', () => {
  it('removes _UPPERCASE attributes (Blender writes _BATCHID and the like), and the file then passes the scanner', async () => {
    const source = parseGlb(await tc.io.writeBinary(await richDoc(2))).json
    const attributes = (json: Json): string[] =>
      list(json, 'meshes').flatMap((m) => (m['primitives'] as Json[]).flatMap((p) => Object.keys(p['attributes'] as Json)))
    expect(attributes(source).some((a) => a.startsWith('_'))).toBe(true)
    const out = await buildVariant(tc, await roundTrip(await richDoc(2)), { subject, tier: 2, clips: [{ from: 'idle', as: 'idle' }] })
    expect(attributes(jsonOf(out.bytes)).filter((a) => a.startsWith('_'))).toEqual([])
    expect(scanGlb(out.bytes, subject, 2)).toEqual([])
  }, 120_000)

  it('removes them from morph targets too', async () => {
    const doc = uvSphere(8, 10)
    const prim = doc.getRoot().listMeshes()[0]?.listPrimitives()[0]
    const count = prim?.getAttribute('POSITION')?.getCount() ?? 0
    const buffer = doc.getRoot().listBuffers()[0]
    const target = doc.createPrimitiveTarget()
    target.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(count * 3).fill(0.01)).setBuffer(buffer ?? null))
    target.setAttribute('_EXTRA', doc.createAccessor().setType('SCALAR').setArray(new Float32Array(count)).setBuffer(buffer ?? null))
    prim?.addTarget(target)
    const out = await buildVariant(tc, await roundTrip(doc), { subject, tier: 2 })
    expect(JSON.stringify(jsonOf(out.bytes))).not.toContain('_EXTRA')
    expect(scanGlb(out.bytes, subject, 2)).toEqual([])
  }, 60_000)
})

describe('an animation that is not listed in clips leaves nothing behind', () => {
  it('writes no accessor for its keyframes (a live sampler used to keep them from being pruned)', async () => {
    const plain = await buildVariant(tc, uvSphere(8, 10), { subject, tier: 2 })
    const doc = uvSphere(8, 10)
    addClip(doc, 'unused', 1)
    const withClip = await buildVariant(tc, doc, { subject, tier: 2 })
    expect(list(jsonOf(withClip.bytes), 'accessors')).toHaveLength(list(jsonOf(plain.bytes), 'accessors').length)
    expect(jsonOf(withClip.bytes)['animations']).toBeUndefined()
  }, 60_000)
})

describe('B2: the material budget error says what to do', () => {
  const threeMaterials = (): Document => {
    const doc = uvSphere(8, 10)
    const prim = doc.getRoot().listMeshes()[0]?.listPrimitives()[0]
    for (const [i, name] of ['b', 'c'].entries()) {
      const copy = doc.createPrimitive().setAttribute('POSITION', prim?.getAttribute('POSITION') ?? null).setIndices(prim?.getIndices() ?? null).setMaterial(doc.createMaterial(name).setBaseColorFactor([0.2 * (i + 1), 0.9, 0.1, 1]))
      doc.getRoot().listMeshes()[0]?.addPrimitive(copy)
    }
    return doc
  }

  it('text of the message, shared by ingest and check', () => {
    expect(materialsMessage(3, 2)).toBe('materials: 3 > budget 2: needs a material merge, see docs/3d-asset-sourcing.md')
  })

  it('MATERIALS: a source with more materials than any tier allows is refused up front, with that message', async () => {
    const error = await buildVariant(tc, threeMaterials(), { subject, tier: 2 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IngestRejected)
    expect((error as IngestRejected).violations.map((x) => [x.code, x.message])).toEqual([
      ['MATERIALS', 'materials: 3 > budget 2: needs a material merge, see docs/3d-asset-sourcing.md'],
    ])
  }, 60_000)

  it('MATERIALS: two materials at tier 1 (budget 1) fail the final gate with the same advice', async () => {
    const doc = uvSphere(8, 10)
    const prim = doc.getRoot().listMeshes()[0]?.listPrimitives()[0]
    doc.getRoot().listMeshes()[0]?.addPrimitive(
      doc.createPrimitive().setAttribute('POSITION', prim?.getAttribute('POSITION') ?? null).setIndices(prim?.getIndices() ?? null).setMaterial(doc.createMaterial('b')),
    )
    const error = await buildVariant(tc, doc, { subject, tier: 1 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IngestRejected)
    expect((error as IngestRejected).violations.map((x) => x.message)).toEqual([
      'materials: 2 > budget 1: needs a material merge, see docs/3d-asset-sourcing.md',
    ])
  }, 60_000)
})

describe('stripGlbMetadata: extensionsUsed is the derived set, sorted', () => {
  const meshoptBody = { extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: 0, byteLength: 4, mode: 'ATTRIBUTES', byteStride: 4, count: 1 } } }
  const strip = (extensionsUsed: string[], extensionsRequired?: string[]): Json => {
    const json: Json = { asset: { version: '2.0', generator: 'x' }, bufferViews: [{ buffer: 1, byteLength: 4, ...meshoptBody }], extensionsUsed }
    if (extensionsRequired) json['extensionsRequired'] = extensionsRequired
    return jsonOf(stripGlbMetadata(packGlb(json, null)))
  }

  it('sorts, drops duplicates, and drops an extension no element carries (gltf-transform keeps one after quantize bakes it in)', () => {
    const out = strip(['KHR_texture_transform', 'KHR_mesh_quantization', 'EXT_meshopt_compression', 'EXT_meshopt_compression'], ['KHR_mesh_quantization', 'KHR_texture_transform', 'EXT_meshopt_compression'])
    expect(out['extensionsUsed']).toEqual(['EXT_meshopt_compression', 'KHR_mesh_quantization'])
    expect(out['extensionsRequired']).toEqual(['EXT_meshopt_compression', 'KHR_mesh_quantization'])
  })

  it('removes the key when nothing is left', () => {
    const json: Json = { asset: { version: '2.0' }, extensionsUsed: ['KHR_texture_transform'], extensionsRequired: ['KHR_texture_transform'] }
    const out = jsonOf(stripGlbMetadata(packGlb(json, null)))
    expect('extensionsUsed' in out).toBe(false)
    expect('extensionsRequired' in out).toBe(false)
  })

  it('keeps an extension that a nested textureInfo carries', () => {
    const json: Json = {
      asset: { version: '2.0' },
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0, extensions: { KHR_texture_transform: { scale: [2, 2] } } } } }],
      extensionsUsed: ['KHR_texture_transform'],
    }
    expect(jsonOf(stripGlbMetadata(packGlb(json, null)))['extensionsUsed']).toEqual(['KHR_texture_transform'])
  })
})

describe('M3: emissive strength keeps its hue; unlit stays a flat, non-metal colour', () => {
  const emissiveOf = async (colour: [number, number, number], strength: number): Promise<number[]> => {
    const doc = uvSphere(8, 10)
    const ext = doc.createExtension(KHRMaterialsEmissiveStrength)
    doc.getRoot().listMaterials()[0]?.setEmissiveFactor(colour).setExtension('KHR_materials_emissive_strength', ext.createEmissiveStrength().setEmissiveStrength(strength))
    const out = await buildVariant(tc, await roundTrip(doc), { subject, tier: 2 })
    return ((list(jsonOf(out.bytes), 'materials')[0] ?? {})['emissiveFactor'] ?? []) as number[]
  }
  const near = (got: number[], want: number[]) => got.forEach((c, i) => expect(c).toBeCloseTo(want[i] ?? 0, 5))

  it('an orange glow at strength 10 stays orange (red 1, green half of red), and is not clipped to yellow', async () => {
    near(await emissiveOf([1, 0.5, 0], 10), [1, 0.5, 0])
    near(await emissiveOf([0.2, 0.1, 0], 10), [1, 0.5, 0])
  }, 60_000)

  it('a strength that does not pass 1 is a plain multiplication', async () => {
    near(await emissiveOf([0.2, 0.1, 0.05], 2), [0.4, 0.2, 0.1])
  }, 60_000)

  it('an unlit flat colour keeps its colour, becomes non-metal and fully rough, and the removal is logged', async () => {
    const doc = uvSphere(8, 10)
    const material = doc.getRoot().listMaterials()[0]
    material?.setBaseColorFactor([0.8, 0.3, 0.1, 1]).setMetallicFactor(1).setRoughnessFactor(1)
    material?.setExtension('KHR_materials_unlit', doc.createExtension(KHRMaterialsUnlit).createUnlit())
    const lines: string[] = []
    const out = await buildVariant(tc, await roundTrip(doc), { subject, tier: 2, log: (l) => lines.push(l) })
    const m = list(jsonOf(out.bytes), 'materials')[0] ?? {}
    const pbr = m['pbrMetallicRoughness'] as Json
    expect(pbr['baseColorFactor']).toEqual([0.8, 0.3, 0.1, 1])
    expect(pbr['metallicFactor']).toBe(0)
    expect(lines).toContain('  removing KHR_materials_unlit: the material is lit by our lighting')
  }, 60_000)

  it('an unlit material with its own metallic and roughness keeps them', async () => {
    const doc = uvSphere(8, 10)
    const material = doc.getRoot().listMaterials()[0]
    material?.setMetallicFactor(0.5).setRoughnessFactor(0.25)
    material?.setExtension('KHR_materials_unlit', doc.createExtension(KHRMaterialsUnlit).createUnlit())
    const out = await buildVariant(tc, await roundTrip(doc), { subject, tier: 2 })
    const pbr = (list(jsonOf(out.bytes), 'materials')[0] ?? {})['pbrMetallicRoughness'] as Json
    expect(pbr['metallicFactor']).toBe(0.5)
    expect(pbr['roughnessFactor']).toBe(0.25)
  }, 60_000)
})

describe('M5: the material count is taken after dedup and prune', () => {
  it('a source with 4 materials, two identical and one unused, ingests at tier 2 (budget 2)', async () => {
    const doc = uvSphere(8, 10)
    const sphere = doc.getRoot().listMeshes()[0]
    const prim = sphere?.listPrimitives()[0]
    const first = prim?.getMaterial()
    first?.setBaseColorFactor([0.9, 0.1, 0.1, 1])
    const second = doc.createMaterial('b').setBaseColorFactor([0.1, 0.9, 0.1, 1])
    const twin = doc.createMaterial('c').setBaseColorFactor([0.1, 0.9, 0.1, 1])
    doc.createMaterial('never-used').setBaseColorFactor([0.1, 0.1, 0.9, 1])
    const extra = (material: typeof second) =>
      doc.createPrimitive().setAttribute('POSITION', prim?.getAttribute('POSITION') ?? null).setIndices(prim?.getIndices() ?? null).setMaterial(material)
    sphere?.addPrimitive(extra(second)).addPrimitive(extra(twin))
    expect(doc.getRoot().listMaterials()).toHaveLength(4)
    const out = await buildVariant(tc, await roundTrip(doc), { subject, tier: 2 })
    expect(out.report.materials).toBe(2)
    expect(scanGlb(out.bytes, subject, 2)).toEqual([])
  }, 60_000)
})

describe('L4: a multi-scene export with an animation', () => {
  function twoScenes(): Document {
    const doc = uvSphere(8, 10)
    const buffer = doc.getRoot().listBuffers()[0] ?? null
    const kept = doc.getRoot().listNodes()[0]
    const other = doc.createNode('elsewhere')
    doc.createScene('second').addChild(other)
    const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 2])).setBuffer(buffer)
    const output = doc.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 0, 0])).setBuffer(buffer)
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR')
    const clip = doc.createAnimation('idle').addSampler(sampler)
    clip.addChannel(doc.createAnimationChannel().setSampler(sampler).setTargetNode(kept ?? null).setTargetPath('translation'))
    clip.addChannel(doc.createAnimationChannel().setSampler(sampler).setTargetNode(other).setTargetPath('translation'))
    return doc
  }

  it('drops the channel that targets a node outside the kept scene, keeps the rest, and the file is clean', async () => {
    const out = await buildVariant(tc, await roundTrip(twoScenes()), { subject, tier: 2, clips: [{ from: 'idle', as: 'idle' }] })
    expect(scanGlb(out.bytes, subject, 2)).toEqual([])
    const clip = list(jsonOf(out.bytes), 'animations')[0] ?? {}
    expect((clip['channels'] as unknown[]).length).toBe(1)
    expect(list(jsonOf(out.bytes), 'nodes').every((n) => !('name' in n))).toBe(true)
  }, 60_000)

  it('a clip that only animates the other scene is refused with a clear message', async () => {
    const doc = twoScenes()
    const clip = doc.getRoot().listAnimations()[0]
    const kept = clip?.listChannels().find((c) => c.getTargetNode()?.getName() !== 'elsewhere')
    kept?.dispose()
    const error = await buildVariant(tc, await roundTrip(doc), { subject, tier: 2, clips: [{ from: 'idle', as: 'idle' }] }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IngestRejected)
    expect((error as IngestRejected).violations.map((x) => x.message)).toEqual(['clip "idle" only animates nodes outside the kept scene'])
  }, 60_000)
})
