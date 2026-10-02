/**
 * The ingest pipeline: one source document in, one budget-checked, metadata-free,
 * Meshopt-compressed GLB per tier out.
 *
 * Every step is deterministic on one machine. Nothing here touches the network, and nothing
 * here may be imported by app code (ESLint `no-restricted-imports` enforces that for
 * `@gltf-transform/*`, `sharp` and `meshoptimizer`).
 * Spec: docs/superpowers/specs/2026-10-02-model-platform.md section 5.3.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { Logger, NodeIO, type Document, type Primitive } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import {
  dedup,
  flatten,
  getBounds,
  join,
  meshopt,
  prune,
  quantize,
  reorder,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import {
  MODEL_BUDGETS,
  TIER_EXTENSIONS,
  type GltfExtension,
  type ModelCap,
  type ModelTier,
} from '@repo/contracts'

import { buildGyroscope } from './generators/gyroscope'
import { type Layout, type SourceEntry } from './sources'
import {
  buildReport,
  deriveVariantMeta,
  packGlb,
  parseGlb,
  scanGlb,
  sha256Hex,
  validateReport,
  type GlbReport,
  type Violation,
} from './validators'

export class SourceHashMismatch extends Error {
  constructor(
    readonly sourceId: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      `source "${sourceId}" changed: sources.json pins sha256 ${expected} but the file hashes to ${actual}. ` +
        'Re-check the licence page, then update sources.json, or pass --accept-source-change <the new sha256> for one run.',
    )
  }
}

export class IngestRejected extends Error {
  constructor(
    readonly subject: string,
    readonly violations: readonly Violation[],
  ) {
    super(`${subject} rejected:\n${violations.map((x) => `  [${x.code}] ${x.subject}: ${x.message}`).join('\n')}`)
  }
}

export interface Toolchain {
  readonly io: NodeIO
}

/** Loads the WASM codecs once and builds the NodeIO every read and write goes through. */
export async function loadToolchain(): Promise<Toolchain> {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready])
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    })
  return { io }
}

// ---------------------------------------------------------------------------------------------
// Loading a source
// ---------------------------------------------------------------------------------------------

export interface LoadedSource {
  /** A fresh Document each call: transforms mutate in place and every tier starts from the source. */
  readonly makeDocument: () => Promise<Document>
  /** sha256 of the raw file; null for generated sources. */
  readonly rawSha256: string | null
}

export function loadSource(
  source: SourceEntry,
  layout: Layout,
  tc: Toolchain,
  /** The new sha256 the owner has looked at; a file that hashes to anything else is still refused. */
  opts: { readonly acceptSourceChange: string | null },
): LoadedSource {
  if (source.origin.type === 'generated') {
    return { makeDocument: () => Promise.resolve(buildGyroscope()), rawSha256: null }
  }
  const file = path.join(layout.root, ...source.origin.path.split('/'))
  const bytes = new Uint8Array(readFileSync(file))
  const actual = sha256Hex(bytes)
  if (actual !== source.origin.sha256 && opts.acceptSourceChange !== actual)
    throw new SourceHashMismatch(source.id, source.origin.sha256, actual)
  return { makeDocument: () => tc.io.readBinary(bytes), rawSha256: actual }
}

// ---------------------------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------------------------

/**
 * Triangles drawn by the default scene, counted exactly as `buildReport` counts them in the
 * written file: per node (an instanced mesh counts once per node) and per primitive mode.
 */
export function countTriangles(doc: Document): number {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
  if (!scene) return 0
  let total = 0
  scene.traverse((node) => {
    for (const prim of node.getMesh()?.listPrimitives() ?? []) total += primitiveTriangles(prim)
  })
  return total
}

function primitiveTriangles(prim: Primitive): number {
  const count = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0
  const mode = prim.getMode()
  if (mode === 4) return Math.floor(count / 3)
  if (mode === 5 || mode === 6) return Math.max(0, count - 2)
  return 0
}

/** Error limits tried in turn, as a fraction of mesh radius. Rising, bounded: never loops forever. */
const SIMPLIFY_ERRORS = [0.001, 0.003, 0.01, 0.03] as const

/** Strip: cameras, lights, extras, unused data; keep only the declared clips. Throws on anything unusable. */
function strip(
  doc: Document,
  tier: ModelTier,
  clips: SourceEntry['clips'],
  subject: string,
  log: ((line: string) => void) | undefined,
): void {
  const root = doc.getRoot()

  for (const camera of root.listCameras()) camera.dispose()
  for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'KHR_lights_punctual') ext.dispose()
  root.setExtras({})

  const scenes = root.listScenes()
  const keep = root.getDefaultScene() ?? scenes[0]
  if (!keep) throw new IngestRejected(subject, [{ code: 'SCHEMA', subject, message: 'source has no scene' }])
  for (const scene of scenes) if (scene !== keep) scene.dispose()

  for (const texture of root.listTextures()) texture.setURI('').setName('')

  const wanted = new Map((clips ?? []).map((c) => [c.from, c.as]))
  const found = new Set<string>()
  for (const animation of root.listAnimations()) {
    const from = animation.getName()
    const rename = wanted.get(from)
    if (rename === undefined) {
      log?.(`  dropping animation "${from}": not listed in clips`)
      animation.dispose()
    }
    else {
      found.add(from)
      animation.setName(rename)
    }
  }
  for (const from of wanted.keys()) {
    if (!found.has(from))
      throw new IngestRejected(subject, [{ code: 'CLIPS', subject, message: `clip "${from}" not found in the source` }])
  }

  const violations: Violation[] = []
  if (root.listMaterials().length > 2)
    violations.push({ code: 'MATERIALS', subject, message: `source has ${root.listMaterials().length} materials; at most two are accepted` })
  if (root.listSkins().length > 0 && root.listAnimations().length === 0)
    violations.push({ code: 'CLIPS', subject, message: 'source has a skin but no declared clip' })
  const allowed = new Set<string>(TIER_EXTENSIONS[tier])
  for (const ext of root.listExtensionsUsed()) {
    if (!allowed.has(ext.extensionName))
      violations.push({ code: 'EXTENSIONS', subject, message: `source uses ${ext.extensionName}, which tier ${tier} does not allow` })
  }
  if (violations.length > 0) throw new IngestRejected(subject, violations)
}

/**
 * Normalise: centre the bounds on the origin and scale so the bounding radius (half the AABB
 * diagonal) is exactly 1. The ledger's `scale` is then the only size knob.
 */
function normalise(doc: Document, subject: string): void {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
  if (!scene) throw new Error(`${subject}: no scene to normalise`)
  const { min, max } = getBounds(scene)
  const radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2
  if (!(radius > 0) || !Number.isFinite(radius))
    throw new IngestRejected(subject, [{ code: 'SCHEMA', subject, message: 'source has empty or non-finite bounds' }])
  const s = 1 / radius
  const centre = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] as const
  const wrapper = doc.createNode('model-root')
  for (const child of scene.listChildren()) {
    scene.removeChild(child)
    wrapper.addChild(child)
  }
  wrapper.setScale([s, s, s]).setTranslation([-centre[0] * s, -centre[1] * s, -centre[2] * s])
  scene.addChild(wrapper)
}

const NAMED_COLLECTIONS = ['scenes', 'nodes', 'meshes', 'materials', 'accessors', 'bufferViews', 'buffers', 'images', 'textures', 'samplers', 'skins'] as const

/** Removes every `extras` key and all metadata the writer adds, from the written bytes. Deterministic. */
export function stripGlbMetadata(bytes: Uint8Array): Uint8Array {
  const { json, bin } = parseGlb(bytes)
  const clean = dropExtras(json) as Record<string, unknown>
  clean['asset'] = { version: '2.0' }
  // Names are where paths and addresses hide, and nothing at runtime reads them. Clip names stay: the ledger addresses clips by name.
  for (const collection of NAMED_COLLECTIONS) {
    const items = clean[collection]
    if (!Array.isArray(items)) continue
    clean[collection] = items.map((item: Record<string, unknown>) => {
      const rest = { ...item }
      delete rest['name']
      if (collection === 'images') delete rest['uri']
      return rest
    })
  }
  return packGlb(clean, bin)
}

function dropExtras(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropExtras)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key !== 'extras') out[key] = dropExtras(child)
    }
    return out
  }
  return value
}

// ---------------------------------------------------------------------------------------------
// One tier
// ---------------------------------------------------------------------------------------------

export interface BuiltVariant {
  readonly tier: ModelTier
  readonly bytes: Uint8Array
  readonly report: GlbReport
  readonly requires: ModelCap[]
  readonly extensions: GltfExtension[]
  readonly maxTexturePx: number
}

export interface BuildOptions {
  readonly subject: string
  readonly tier: ModelTier
  readonly clips?: SourceEntry['clips']
  readonly log?: (line: string) => void
}

export async function buildVariant(tc: Toolchain, doc: Document, opts: BuildOptions): Promise<BuiltVariant> {
  const { subject, tier } = opts
  const budget = MODEL_BUDGETS[tier]
  doc.setLogger(new Logger(Logger.Verbosity.WARN))

  strip(doc, tier, opts.clips, subject, opts.log)
  normalise(doc, subject)

  const animated = doc.getRoot().listAnimations().length > 0 || doc.getRoot().listSkins().length > 0
  await doc.transform(dedup(), flatten(), weld())
  if (!animated) await doc.transform(join())

  let triangles = countTriangles(doc)
  for (const error of SIMPLIFY_ERRORS) {
    if (triangles <= budget.triangles) break
    await doc.transform(
      simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, budget.triangles / triangles), error }),
    )
    triangles = countTriangles(doc)
  }
  if (triangles > budget.triangles)
    throw new IngestRejected(subject, [
      { code: 'TRIS', subject, message: `simplify stalled at ${triangles} triangles (budget ${budget.triangles})` },
    ])
  await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize(), prune())

  if (doc.getRoot().listTextures().length > 0) {
    const sharp = (await import('sharp')).default
    await doc.transform(
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [budget.texturePx, budget.texturePx], quality: 80 }),
    )
  }

  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }))

  const bytes = stripGlbMetadata(await tc.io.writeBinary(doc))
  const report = buildReport(bytes)

  const violations = [...validateReport(report, { subject, tier }), ...scanGlb(bytes, subject, tier)]
  if (violations.length > 0) throw new IngestRejected(subject, violations)

  const meta = deriveVariantMeta(report)
  if (meta.unknownExtensions.length > 0)
    throw new IngestRejected(subject, [
      { code: 'EXTENSIONS', subject, message: `${meta.unknownExtensions.join(', ')} cannot be represented in the manifest` },
    ])
  return { tier, bytes, report, requires: meta.requires, extensions: meta.extensions, maxTexturePx: meta.maxTexturePx }
}

/** Measures the bounding radius of a written GLB the same way `normalise` defines it. */
export async function measureBoundsRadius(tc: Toolchain, bytes: Uint8Array): Promise<number> {
  const doc = await tc.io.readBinary(bytes)
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
  if (!scene) return 0
  const { min, max } = getBounds(scene)
  return Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2
}
