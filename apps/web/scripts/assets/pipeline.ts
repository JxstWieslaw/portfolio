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
import { ALL_EXTENSIONS, type EmissiveStrength } from '@gltf-transform/extensions'
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
  GlbFormatError,
  MAX_JSON_DEPTH,
  buildReport,
  deriveVariantMeta,
  elementExtensionNames,
  materialsMessage,
  packGlb,
  parseGlb,
  printable,
  quote,
  scanGlb,
  sha256Hex,
  validateReport,
  type GlbReport,
  type Violation,
} from './validators'

/** Marker for `npm run check:bundle`: a minifier keeps string values, so finding this in a client chunk proves the tooling shipped. */
export const ASSET_TOOLCHAIN_CANARY = '__asset-toolchain-7f3a__'

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
    // Subject and message can carry text from a hostile file: no control character may survive into the log.
    super(`${subject} rejected:\n${violations.map((x) => printable(`  [${x.code}] ${x.subject}: ${x.message}`)).join('\n')}`)
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

/** Extensions our renderer does not honour. Real sources carry them, so they are removed rather than rejected. */
const REMOVED_EXTENSIONS: ReadonlySet<string> = new Set([
  'KHR_lights_punctual',
  'KHR_materials_unlit',
  'KHR_materials_emissive_strength',
])

/** The most materials any tier allows. Checked after dedup and prune, so duplicates and unused ones do not count. */
const MAX_MATERIALS = Math.max(...Object.values(MODEL_BUDGETS).map((b) => b.materials))

/**
 * Every accessor is written dense. A sparse accessor (morph targets from a DCC export are the usual
 * source) is legal glTF but the scanner refuses it, and gltf-transform keeps a source's sparse flag
 * through its transforms. Run before the transforms and again before writing.
 */
function densify(doc: Document): void {
  for (const accessor of doc.getRoot().listAccessors()) accessor.setSparse(false)
}

/**
 * Strip: cameras, lights, extras, unused data; keep only the declared clips. Throws on anything unusable.
 *
 * Extensions our renderer does not honour are removed (see REMOVED_EXTENSIONS):
 * - `KHR_lights_punctual`: lights are ours.
 * - `KHR_materials_unlit`: our lighting must apply to every model, so an unlit material becomes a lit one.
 *   A flat colour must not turn into a dark mirror, so a material that still has the glTF default
 *   metallic 1 and roughness 1 (gltf-transform cannot tell "absent" from "explicit 1") and no
 *   metallic-roughness texture becomes metallic 0, roughness 1. Colour factor and textures are kept.
 * - `KHR_materials_emissive_strength`: folded into `emissiveFactor` without changing its hue: the colour
 *   is scaled by the strength, and when the brightest channel would pass 1 the whole colour is scaled
 *   down together instead of clipping each channel. A strength above 1 therefore loses its overdrive
 *   (logged), and no tier lists the extension.
 * Custom `_UPPERCASE` attributes are removed too: nothing in the renderer reads them.
 */
function strip(
  doc: Document,
  tier: ModelTier,
  clips: SourceEntry['clips'],
  subject: string,
  log: ((line: string) => void) | undefined,
): void {
  const root = doc.getRoot()

  for (const camera of root.listCameras()) camera.dispose()
  for (const material of root.listMaterials()) {
    const strength = material.getExtension<EmissiveStrength>('KHR_materials_emissive_strength')?.getEmissiveStrength()
    if (strength === undefined) continue
    const [r, g, b] = material.getEmissiveFactor()
    // k is the brightest channel after the strength; if it passes 1, scale all three by 1/max so the hue survives.
    const k = Math.max(r, g, b) * strength
    const scale = k > 1 ? strength / k : strength
    material.setEmissiveFactor([r * scale, g * scale, b * scale])
    log?.(`  folding emissive strength ${strength} into the emissive factor`)
    if (strength > 1) log?.(`  warning: emissive strength ${strength} is above 1 and is dropped to a factor of at most 1`)
  }
  for (const material of root.listMaterials()) {
    if (!material.getExtension('KHR_materials_unlit')) continue
    log?.('  removing KHR_materials_unlit: the material is lit by our lighting')
    if (material.getMetallicFactor() === 1 && material.getRoughnessFactor() === 1 && !material.getMetallicRoughnessTexture())
      material.setMetallicFactor(0).setRoughnessFactor(1)
  }
  for (const ext of root.listExtensionsUsed()) if (REMOVED_EXTENSIONS.has(ext.extensionName)) ext.dispose()
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const semantic of prim.listSemantics()) if (semantic.startsWith('_')) prim.setAttribute(semantic, null)
      for (const target of prim.listTargets())
        for (const semantic of target.listSemantics()) if (semantic.startsWith('_')) target.setAttribute(semantic, null)
    }
  }
  densify(doc)
  root.setExtras({})

  const scenes = root.listScenes()
  const keep = root.getDefaultScene() ?? scenes[0]
  if (!keep) throw new IngestRejected(subject, [{ code: 'SCHEMA', subject, message: 'source has no scene' }])
  for (const scene of scenes) if (scene !== keep) scene.dispose()
  // A channel that targets a node outside the kept scene would keep that node alive in the file, unreachable.
  const reachable = new Set<unknown>()
  keep.traverse((node) => void reachable.add(node))
  for (const animation of root.listAnimations()) {
    for (const channel of animation.listChannels()) {
      const target = channel.getTargetNode()
      if (target && !reachable.has(target)) channel.dispose()
    }
    for (const sampler of animation.listSamplers()) {
      if (!animation.listChannels().some((c) => c.getSampler() === sampler)) sampler.dispose()
    }
  }

  for (const texture of root.listTextures()) texture.setURI('').setName('')

  const wanted = new Map((clips ?? []).map((c) => [c.from, c.as]))
  const found = new Set<string>()
  for (const animation of root.listAnimations()) {
    const from = animation.getName()
    const rename = wanted.get(from)
    if (rename === undefined) {
      log?.(`  dropping animation ${printable(quote(from))}: not listed in clips`)
      // Disposing the animation alone leaves its samplers alive, and a live sampler keeps its keyframe
      // accessors from being pruned: they would be written out and read by nothing.
      for (const sampler of animation.listSamplers()) sampler.dispose()
      for (const channel of animation.listChannels()) channel.dispose()
      animation.dispose()
    }
    else {
      found.add(from)
      animation.setName(rename)
    }
  }
  for (const from of wanted.keys()) {
    if (!found.has(from))
      throw new IngestRejected(subject, [{ code: 'CLIPS', subject, message: `clip ${quote(from)} not found in the source` }])
  }
  for (const animation of root.listAnimations()) {
    if (animation.listChannels().length === 0)
      throw new IngestRejected(subject, [{ code: 'CLIPS', subject, message: `clip ${quote(animation.getName())} only animates nodes outside the kept scene` }])
  }

  const violations: Violation[] = []
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
  const clean = dropExtras(json, 0) as Record<string, unknown>
  clean['asset'] = { version: '2.0' }
  // extensionsUsed is exactly the set of extensions some element carries a body for, sorted. gltf-transform
  // keeps an extension listed after pruning every property that used it (KHR_texture_transform once
  // quantize has baked it into the UVs), and the scanner refuses a declaration nothing backs.
  // KHR_mesh_quantization has no element body of its own: it stays when it was declared.
  const used = elementExtensionNames(clean)
  used.add('KHR_mesh_quantization')
  for (const key of ['extensionsUsed', 'extensionsRequired'] as const) {
    const list = clean[key]
    if (!Array.isArray(list) || !list.every((e) => typeof e === 'string')) continue
    const kept = [...new Set(list as string[])].filter((e) => used.has(e)).sort()
    if (kept.length > 0) clean[key] = kept
    else delete clean[key]
  }
  // Names are where paths and addresses hide, and nothing at runtime reads them. Clip names stay: the ledger addresses clips by name.
  for (const collection of NAMED_COLLECTIONS) {
    const items = clean[collection]
    if (!Array.isArray(items)) continue
    clean[collection] = items.map((item: unknown) => {
      // A non-object element is left for the scanner to reject; spreading it would be wrong, not safe.
      if (item === null || typeof item !== 'object' || Array.isArray(item)) return item
      const rest = { ...(item as Record<string, unknown>) }
      delete rest['name']
      if (collection === 'images') delete rest['uri']
      return rest
    })
  }
  return packGlb(clean, bin)
}

function dropExtras(value: unknown, depth: number): unknown {
  if (value === null || typeof value !== 'object') return value
  // A hostile file can nest far deeper than the stack allows: refuse it with a message, not a RangeError.
  if (depth >= MAX_JSON_DEPTH) throw new GlbFormatError(`JSON nests deeper than ${MAX_JSON_DEPTH} levels`)
  if (Array.isArray(value)) return value.map((item) => dropExtras(item, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key !== 'extras') out[key] = dropExtras(child, depth + 1)
  }
  return out
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
  await doc.transform(dedup(), flatten(), weld(), prune())
  // Counted here and not in strip(): duplicate and unused materials are gone by now, so only a real excess is refused.
  // The final validateReport gate still enforces each tier's own budget.
  const materialCount = doc.getRoot().listMaterials().length
  if (materialCount > MAX_MATERIALS)
    throw new IngestRejected(subject, [{ code: 'MATERIALS', subject, message: materialsMessage(materialCount, MAX_MATERIALS) }])
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

  densify(doc)
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

/** Bounding radius and centre of a written GLB, measured the way `normalise` defines them. */
export async function measureBounds(
  tc: Toolchain,
  bytes: Uint8Array,
): Promise<{ readonly radius: number; readonly centre: readonly [number, number, number] }> {
  const doc = await tc.io.readBinary(bytes)
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
  if (!scene) return { radius: 0, centre: [0, 0, 0] }
  const { min, max } = getBounds(scene)
  return {
    radius: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2,
    centre: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  }
}

export async function measureBoundsRadius(tc: Toolchain, bytes: Uint8Array): Promise<number> {
  return (await measureBounds(tc, bytes)).radius
}
