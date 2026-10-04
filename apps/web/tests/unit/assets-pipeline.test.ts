// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Document } from '@gltf-transform/core'
import { KHRMaterialsTransmission } from '@gltf-transform/extensions'
import { MODEL_BUDGETS, TIER_EXTENSIONS, type ModelTier } from '@repo/contracts'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runIngest } from '../../scripts/assets/ingest'
import { IngestRejected, buildVariant, loadToolchain, measureBounds, type Toolchain } from '../../scripts/assets/pipeline'
import { defaultRoot, layoutFor } from '../../scripts/assets/sources'
import { buildReport, parseGlb, scanGlb, sha256Hex } from '../../scripts/assets/validators'
import { gyroscopeSource } from './assets-fixtures'

/** A UV sphere with `lat * lon * 2` triangles (poles included), offset and scaled away from the origin. */
function uvSphere(lat: number, lon: number, withUv = false, extraMaterials = 0): Document {
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
  const material = doc.createMaterial('shell').setMetallicFactor(0.5)
  const positionAccessor = doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer)
  const indexAccessor = doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(indices)).setBuffer(buffer)
  const primitive = doc.createPrimitive().setAttribute('POSITION', positionAccessor).setIndices(indexAccessor).setMaterial(material)
  if (withUv) primitive.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uvs).setBuffer(buffer))
  const node = doc
    .createNode('sphere')
    .setMesh(doc.createMesh('sphere').addPrimitive(primitive))
    .setTranslation([3, 4, 5])
    .setScale([2, 2, 2])
  const scene = doc.createScene('main').addChild(node)
  for (let k = 0; k < extraMaterials; k++) {
    const extra = doc
      .createPrimitive()
      .setAttribute('POSITION', positionAccessor)
      .setIndices(indexAccessor)
      .setMaterial(doc.createMaterial(`extra-${k}`))
    scene.addChild(doc.createNode(`extra-${k}`).setMesh(doc.createMesh(`extra-${k}`).addPrimitive(extra)))
  }
  return doc
}

let tc: Toolchain
beforeAll(async () => {
  tc = await loadToolchain()
})

const subject = 'test'
const build = (doc: Document, tier: ModelTier) => buildVariant(tc, doc, { subject, tier })

describe('pipeline: a 5 000 triangle generated document', () => {
  it.each([1, 2, 3] as const)('tier %i lands inside its budget, normalised, with allowed extensions only', async (tier) => {
    const source = uvSphere(50, 51) // 50 * 51 * 2 = 5 100 triangles
    const out = await build(source, tier)
    const budget = MODEL_BUDGETS[tier]

    expect(out.report.triangles).toBeLessThanOrEqual(budget.triangles)
    expect(out.bytes.byteLength).toBeLessThanOrEqual(budget.bytes)
    for (const ext of out.report.extensionsUsed) expect(TIER_EXTENSIONS[tier]).toContain(ext)
    expect(out.requires).toEqual(['meshopt'])
    const bounds = await measureBounds(tc, out.bytes)
    expect(bounds.radius).toBeCloseTo(1, 3)
    // The source sits at (3, 4, 5); normalising must have moved its centre to the origin, not just scaled it.
    for (const c of bounds.centre) expect(Math.abs(c)).toBeLessThan(1e-3)
    expect(scanGlb(out.bytes, subject)).toEqual([])
  }, 60_000)

  it('simplifies only when the source is over the tier budget', async () => {
    const t1 = await build(uvSphere(60, 60), 1) // 7 200 triangles, over the tier 1 budget of 6 000
    const t2 = await build(uvSphere(60, 60), 2)
    expect(t1.report.triangles).toBeLessThanOrEqual(6_000)
    expect(t2.report.triangles).toBe(7_200)
  }, 60_000)

  it('two runs over the same source give the same sha256', async () => {
    const first = await build(uvSphere(50, 51), 2)
    const second = await build(uvSphere(50, 51), 2)
    expect(sha256Hex(first.bytes)).toBe(sha256Hex(second.bytes))
  }, 60_000)

  it('writes no generator, no extras and no names a stranger could learn from', async () => {
    const doc = uvSphere(10, 12)
    doc.getRoot().setExtras({ author: 'C:\\Users\\wiesl' })
    doc.getRoot().listMeshes()[0]?.setExtras({ note: 'me@example.com' })
    doc.getRoot().getAsset().generator = 'Blender 4.2 (/home/wiesl/blend)'
    doc.getRoot().getAsset().copyright = 'me'
    const { bytes } = await build(doc, 2)
    const { json } = parseGlb(bytes)
    expect(json['asset']).toEqual({ version: '2.0' })
    expect(JSON.stringify(json)).not.toMatch(/extras|wiesl|example\.com|Blender/)
  }, 60_000)

  it('turns a PNG texture into WebP capped at the tier edge, and says so in `requires`', async () => {
    const width = 600
    const height = 300
    const raw = Buffer.alloc(width * height * 3)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const at = (y * width + x) * 3
        raw[at] = Math.round((x * 255) / width)
        raw[at + 1] = Math.round((y * 255) / height)
        raw[at + 2] = (x + y) % 64
      }
    }
    const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer()

    const doc = uvSphere(20, 24, true)
    const texture = doc.createTexture('albedo').setImage(new Uint8Array(png)).setMimeType('image/png')
    doc.getRoot().listMaterials()[0]?.setBaseColorTexture(texture)

    const out = await build(doc, 1)
    expect(out.report.textures).toHaveLength(1)
    expect(out.report.textures[0]?.mimeType).toBe('image/webp')
    expect(out.report.textures[0]?.longEdge).toBe(512)
    expect(out.requires).toEqual(['meshopt', 'webp'])
    expect(out.report.extensionsUsed).toContain('EXT_texture_webp')
    expect(scanGlb(out.bytes, subject)).toEqual([])
  }, 60_000)

  it('rejects a source with three materials before doing any work, and names the rule', async () => {
    const doc = uvSphere(10, 12, false, 2)
    // dedup merges identical materials, so each one gets its own colour: this is three real materials.
    doc.getRoot().listMaterials().forEach((m, i) => m.setBaseColorFactor([i / 4, 0.5, 0.5, 1]))
    const error = await build(doc, 2).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IngestRejected)
    expect((error as IngestRejected).violations.map((x) => x.code)).toEqual(['MATERIALS'])
  })

  it('rejects a source that needs a transmissive extension below tier 3', async () => {
    const doc = uvSphere(10, 12)
    const ext = doc.createExtension(KHRMaterialsTransmission)
    doc.getRoot().listMaterials()[0]?.setExtension('KHR_materials_transmission', ext.createTransmission().setTransmissionFactor(0.5))
    const error = await build(doc, 2).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IngestRejected)
    expect((error as IngestRejected).violations.map((x) => x.code)).toEqual(['EXTENSIONS'])
  })
})

describe('ingest: the gyroscope generator', () => {
  let tmp: string
  const prepare = (name: string) => {
    const root = path.join(tmp, name)
    mkdirSync(path.join(root, 'content', 'models'), { recursive: true })
    writeFileSync(
      layoutFor(root).sourcesFile,
      JSON.stringify([gyroscopeSource()]),
    )
    return root
  }

  beforeAll(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'ingest-'))
  })
  afterAll(() => rmSync(tmp, { recursive: true, force: true }))

  it('ingesting twice gives identical sha256 for every file, the manifest and the credits', async () => {
    const a = await runIngest({ root: prepare('a') })
    const b = await runIngest({ root: prepare('b') })

    expect([...a.files.keys()].sort()).toEqual([...b.files.keys()].sort())
    expect(a.files.size).toBe(2)
    for (const [name, bytes] of a.files) expect(sha256Hex(bytes)).toBe(sha256Hex(b.files.get(name) ?? new Uint8Array()))
    expect(sha256Hex(new TextEncoder().encode(a.manifestText))).toBe(sha256Hex(new TextEncoder().encode(b.manifestText)))
    expect(a.manifest.contentHash).toBe(b.manifest.contentHash)

    const onDisk = readdirSync(layoutFor(path.join(tmp, 'a')).modelsDir).sort()
    expect(onDisk).toEqual([...a.files.keys(), 'manifest.json'].sort())
  }, 120_000)

  it('keeps every gyroscope tier inside MODEL_BUDGETS and the repo cap', async () => {
    const { manifest } = await runIngest({ root: prepare('c'), dryRun: true })
    const entry = manifest.models.find((m) => m.id === 'gyroscope')
    expect(entry?.enabled).toBe(false)
    expect(entry?.variants.map((v) => v.tier)).toEqual([1, 2])
    for (const v of entry?.variants ?? []) {
      expect(v.bytes).toBeLessThanOrEqual(MODEL_BUDGETS[v.tier].bytes)
      expect(v.triangles).toBeLessThanOrEqual(MODEL_BUDGETS[v.tier].triangles)
    }
    expect(entry?.variants.reduce((s, v) => s + v.bytes, 0)).toBeLessThan(1_500_000)
  }, 120_000)

  it('--verify finds nothing to complain about on the committed tree, and flags a missing file', async () => {
    const committed = await runIngest({ root: defaultRoot(), only: 'generated', verify: true })
    expect(committed.mismatches).toEqual([])

    const empty = await runIngest({ root: prepare('d'), only: 'generated', verify: true })
    expect(empty.mismatches.length).toBeGreaterThan(0)
  }, 120_000)

  it('a gyroscope GLB reports the numbers the manifest stores', async () => {
    const { files, manifest } = await runIngest({ root: prepare('e'), dryRun: true })
    for (const v of manifest.models[0]?.variants ?? []) {
      const bytes = files.get(v.url.replace('/models/', ''))
      expect(bytes).toBeDefined()
      const report = buildReport(bytes ?? new Uint8Array())
      expect(report.bytes).toBe(v.bytes)
      expect(report.triangles).toBe(v.triangles)
    }
  }, 120_000)
})
