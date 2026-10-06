/**
 * The material merge and recolour: a flat-colour, multi-material source becomes ONE material.
 *
 * Third-party kits (Kenney's among them) colour a model with one flat material per colour. The tier
 * budgets allow one or two materials and a draw call each, so the colours move into the vertex
 * stream instead: each primitive gets a constant `COLOR_0` equal to its material's base colour, all
 * primitives then share one material (white base colour, so the vertex colour is the colour), and
 * `join` can fuse the lot into a single draw call.
 *
 * The rule, in full (documented in docs/3d-asset-sourcing.md section 5.1):
 * 1. Applies only to a source entry that has a `look` block. No `look`, no change.
 * 2. Refuses a source that the merge would change the look of: any texture, a non-OPAQUE alpha mode, a
 *    double-sided material, a base-colour alpha below 1, or a primitive that already has COLOR_0. One merged
 *    opaque, single-sided material cannot express those, and baking them in silently would be wrong.
 * 3. Recolour: a material whose name is a key of `look.palette` gets that sRGB hex colour instead of
 *    its own; a material that is not listed keeps its source colour. There is no automatic "nearest
 *    token" guess: which source colour becomes violet, cyan or a neutral is an art-direction call
 *    written down in sources.json, where the owner can read and change it.
 * 4. The merged material gets `look.metallic` / `look.roughness` (defaults 0.6 and 0.3: the artefact's
 *    metal, a little rougher than a mirror) and an optional emissive accent.
 * 5. Per-vertex colour is stored as COLOR_0 (VEC3, linear), the only attribute the merge adds. UV
 *    sets are dropped: with no texture nothing reads them.
 *
 * Deterministic: iteration is in document order and the only arithmetic is the sRGB transfer function.
 */
import type { Document, Material, Primitive } from '@gltf-transform/core'
import { compactPrimitive } from '@gltf-transform/functions'

import type { SourceLook } from './sources'

export const DEFAULT_METALLIC = 0.6
export const DEFAULT_ROUGHNESS = 0.3

/** sRGB hex (`#rrggbb`) to linear RGB, the space glTF colour factors and COLOR_0 live in. */
export function hexToLinear(hex: string): [number, number, number] {
  const channel = (at: number): number => {
    const s = parseInt(hex.slice(at, at + 2), 16) / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return [channel(1), channel(3), channel(5)]
}

export interface MergeResult {
  /** Materials before the merge, for the ingest log. */
  readonly from: number
  /** Names (source names) the palette recoloured. */
  readonly recoloured: readonly string[]
  /** Palette keys that matched no material: a typo in sources.json must not pass silently. */
  readonly unmatched: readonly string[]
}

/** Thrown for a source the merge cannot flatten; the pipeline turns it into an IngestRejected. */
export class MergeRefused extends Error {}

function hasTexture(material: Material): boolean {
  return Boolean(
    material.getBaseColorTexture() ??
      material.getMetallicRoughnessTexture() ??
      material.getEmissiveTexture() ??
      material.getNormalTexture() ??
      material.getOcclusionTexture(),
  )
}

export function mergeMaterials(doc: Document, look: SourceLook): MergeResult {
  const root = doc.getRoot()
  const palette = look.palette ?? {}
  const used = new Set<Material>()
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial()
      if (material) used.add(material)
    }
  for (const material of used) {
    const name = JSON.stringify(material.getName())
    if (hasTexture(material)) throw new MergeRefused(`material ${name} has a texture; the look merge only flattens flat-colour sources`)
    if (material.getAlphaMode() !== 'OPAQUE') throw new MergeRefused(`material ${name} has alphaMode ${material.getAlphaMode()}; the look merge only flattens opaque materials`)
    if (material.getDoubleSided()) throw new MergeRefused(`material ${name} is double-sided; the look merge only flattens single-sided materials`)
    if (material.getBaseColorFactor()[3] < 1) throw new MergeRefused(`material ${name} has a base-colour alpha below 1; the look merge only flattens opaque colours`)
  }
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives())
      if (prim.getAttribute('COLOR_0')) throw new MergeRefused(`mesh ${JSON.stringify(mesh.getName())} already has COLOR_0 vertex colours; the look merge would overwrite them`)

  const merged = doc
    .createMaterial('look')
    .setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(look.metallic ?? DEFAULT_METALLIC)
    .setRoughnessFactor(look.roughness ?? DEFAULT_ROUGHNESS)
  if (look.emissive) {
    const [r, g, b] = hexToLinear(look.emissive.color)
    const k = look.emissive.amount
    merged.setEmissiveFactor([r * k, g * k, b * k])
  }

  const recoloured = new Set<string>()
  const matched = new Set<string>()
  const before = used.size
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial()
      const name = material?.getName() ?? ''
      let rgb: [number, number, number] = material ? (material.getBaseColorFactor().slice(0, 3) as [number, number, number]) : [1, 1, 1]
      const mapped = Object.hasOwn(palette, name) ? palette[name] : undefined
      if (mapped !== undefined) {
        rgb = hexToLinear(mapped)
        recoloured.add(name)
        matched.add(name)
      }
      bakeColour(doc, prim, rgb)
      prim.setMaterial(merged)
    }
  }
  for (const material of used) material.dispose()
  return {
    from: before,
    recoloured: [...recoloured],
    unmatched: Object.keys(palette).filter((key) => !matched.has(key)),
  }
}

/** Gives `prim` its own vertex streams (unused vertices dropped) and a constant COLOR_0. */
function bakeColour(doc: Document, prim: Primitive, rgb: readonly [number, number, number]): void {
  compactPrimitive(prim)
  for (const semantic of prim.listSemantics()) if (semantic.startsWith('TEXCOORD_')) prim.setAttribute(semantic, null)
  const position = prim.getAttribute('POSITION')
  if (!position) return
  const count = position.getCount()
  const colours = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) colours.set(rgb, i * 3)
  const buffer = position.getBuffer()
  prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(colours).setBuffer(buffer))
}
