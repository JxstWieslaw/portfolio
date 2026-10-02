import { z } from 'zod'

import { slugSchema } from './content.js'

/** The only licences the site can represent. Adding one is a reviewed code change. */
export const licenceSchema = z.enum(['CC0-1.0', 'CC-BY-4.0', 'own'])
export type Licence = z.infer<typeof licenceSchema>
export const LICENCES_REQUIRING_CREDIT: readonly Licence[] = ['CC-BY-4.0']

// https only: z.string().url() alone accepts javascript: (security audit 2026-10-01).
const httpsUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith('https://'), 'must be an https URL')
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')

export const modelTierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)])
export type ModelTier = z.infer<typeof modelTierSchema>

/** What the client can decode. `ktx2` is reserved: no loader ships for it yet. */
export const modelCapSchema = z.enum(['meshopt', 'webp', 'ktx2'])
export type ModelCap = z.infer<typeof modelCapSchema>

export const gltfExtensionSchema = z.enum([
  'EXT_meshopt_compression',
  'KHR_mesh_quantization',
  'EXT_texture_webp',
  'KHR_texture_transform',
  'KHR_materials_emissive_strength',
  'KHR_materials_transmission',
  'KHR_materials_volume',
  'KHR_materials_ior',
])
export type GltfExtension = z.infer<typeof gltfExtensionSchema>

export const creditSchema = z
  .object({
    assetId: slugSchema,
    title: z.string().min(1).max(120),
    author: z.string().min(1).max(120),
    sourceUrl: httpsUrl,
    licence: licenceSchema,
    licenceUrl: httpsUrl.optional(),
    retrievedAt: isoDate,
  })
  .superRefine((c, ctx) => {
    if (LICENCES_REQUIRING_CREDIT.includes(c.licence) && !c.licenceUrl)
      ctx.addIssue({ code: 'custom', path: ['licenceUrl'], message: 'CC-BY requires a licenceUrl' })
  })
export type Credit = z.infer<typeof creditSchema>

export const MODEL_BUDGETS = {
  1: { bytes: 70_000, triangles: 6_000, texturePx: 512, textures: 1, materials: 1, clips: 1, gpuMb: 4 },
  2: { bytes: 180_000, triangles: 20_000, texturePx: 1_024, textures: 2, materials: 2, clips: 2, gpuMb: 12 },
  3: { bytes: 400_000, triangles: 50_000, texturePx: 2_048, textures: 2, materials: 2, clips: 2, gpuMb: 30 },
} as const satisfies Record<ModelTier, Record<string, number>>
export const MODEL_REPO_BYTES = 1_500_000
export const MODEL_FILE_BYTES = 400_000

/** glTF extensions a variant of each tier may use (spec section 3.6). Tier 3 alone may be transmissive. */
const BASE_EXTENSIONS: readonly GltfExtension[] = [
  'EXT_meshopt_compression',
  'KHR_mesh_quantization',
  'EXT_texture_webp',
  'KHR_texture_transform',
]
export const TIER_EXTENSIONS: Readonly<Record<ModelTier, readonly GltfExtension[]>> = {
  1: BASE_EXTENSIONS,
  2: BASE_EXTENSIONS,
  3: [...BASE_EXTENSIONS, 'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_ior'],
}

export const modelVariantSchema = z.object({
  tier: modelTierSchema,
  /** Codecs the client must support to use this variant. */
  requires: z.array(modelCapSchema).default([]),
  /** Same-origin committed path, or an https URL once the API serves it. */
  url: z.union([z.string().regex(/^\/models\/[a-z0-9]+(?:-[a-z0-9]+)*\.t[123]\.[0-9a-f]{8}\.glb$/), httpsUrl]),
  bytes: z.number().int().positive().max(MODEL_FILE_BYTES),
  triangles: z.number().int().positive(),
  maxTexturePx: z.number().int().nonnegative(),
  /** Subresource-Integrity string, passed to `fetch({ integrity })`. */
  integrity: z.string().regex(/^sha256-[A-Za-z0-9+/]{43}=$/),
  extensions: z.array(gltfExtensionSchema).default([]),
})
export type ModelVariant = z.infer<typeof modelVariantSchema>

export const modelEntrySchema = z
  .object({
    id: slugSchema,
    title: z.string().min(1).max(120),
    kind: z.enum(['hero', 'prop']),
    /** `false` keeps the files and credits but the ledger never loads it. The rollback switch. */
    enabled: z.boolean(),
    /** Always 1 for ingest output (normalised); stored so a future transcoder can differ. */
    boundsRadius: z.number().positive(),
    clips: z.array(z.object({ name: slugSchema, seconds: z.number().positive().max(20) })).max(2).default([]),
    variants: z.array(modelVariantSchema).min(1),
  })
  .superRefine((e, ctx) => {
    const seen = new Set<string>()
    for (const v of e.variants) {
      const key = `${v.tier}:${[...v.requires].sort().join(',')}`
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['variants'], message: `duplicate variant ${key}` })
      seen.add(key)
    }
  })
export type ModelEntry = z.infer<typeof modelEntrySchema>

/** The body of GET /v1/assets/manifest?tier&caps, and of the committed default manifest. */
export const modelManifestSchema = z.object({
  version: z.literal(1),
  /** sha256 over the canonical JSON of `models`, first 16 hex. No timestamps: ingest output must be reproducible. */
  contentHash: z.string().regex(/^[0-9a-f]{16}$/),
  models: z.array(modelEntrySchema),
})
export type ModelManifest = z.infer<typeof modelManifestSchema>

export const creditsFileSchema = z.array(creditSchema)

/**
 * Highest tier <= `tier` whose `requires` the client satisfies; `null` means "stay procedural".
 * Among variants of the same tier the one demanding the most codecs wins (it is the leaner file).
 * Pure; the API will reuse it. Whether the entry is `enabled` is the caller's concern.
 */
export function selectVariant(
  entry: Pick<ModelEntry, 'variants'>,
  tier: ModelTier,
  caps: ReadonlySet<ModelCap>,
): ModelVariant | null {
  let best: ModelVariant | null = null
  for (const v of entry.variants) {
    if (v.tier > tier) continue
    if (!v.requires.every((c) => caps.has(c))) continue
    if (
      best === null ||
      v.tier > best.tier ||
      (v.tier === best.tier && v.requires.length > best.requires.length)
    )
      best = v
  }
  return best
}
