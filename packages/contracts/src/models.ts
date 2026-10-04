import { z } from 'zod'

import { slugSchema } from './content.js'

/** The only licences the site can represent. Adding one is a reviewed code change. */
export const licenceSchema = z.enum(['CC0-1.0', 'CC-BY-4.0', 'own'])
export type Licence = z.infer<typeof licenceSchema>
export const LICENCES_REQUIRING_CREDIT: readonly Licence[] = ['CC-BY-4.0']

/**
 * One hardened https URL for the whole platform (credits, sources, remote variants).
 * `z.string().url()` alone accepts `javascript:`; this also refuses userinfo, ports, IP
 * literals and localhost, so a URL that parses is one a server may safely link to or fetch.
 */
export const httpsUrlSchema = z
  .string()
  .url()
  .superRefine((value, ctx) => {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      return ctx.addIssue({ code: 'custom', message: 'must be a URL' })
    }
    const problem =
      url.protocol !== 'https:'
        ? 'must be an https URL'
        : url.username !== '' || url.password !== ''
          ? 'must not carry credentials'
          : url.port !== ''
            ? 'must not name a port'
            : /^[0-9.]+$/.test(url.hostname) || url.hostname.startsWith('[')
              ? 'must not be an IP address'
              : url.hostname === 'localhost' || url.hostname.endsWith('.localhost')
                ? 'must not be localhost'
                : null
    if (problem) ctx.addIssue({ code: 'custom', message: problem })
  })

/** YYYY-MM-DD that is also a real calendar day (no 2026-02-31). */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .refine((s) => {
    const t = Date.parse(`${s}T00:00:00Z`)
    return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s
  }, 'must be a real date')

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
    sourceUrl: httpsUrlSchema,
    licence: licenceSchema,
    licenceUrl: httpsUrlSchema.optional(),
    retrievedAt: isoDateSchema,
  })
  .strict()
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
/** One file may never exceed the largest tier's budget. */
export const MODEL_FILE_BYTES = MODEL_BUDGETS[3].bytes

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

const SAME_ORIGIN_MODEL_URL = /^\/models\/[a-z0-9]+(?:-[a-z0-9]+)*\.t([123])\.[0-9a-f]{8}\.glb$/

const isSortedUnique = (list: readonly string[]): boolean => list.every((x, i) => i === 0 || (list[i - 1] ?? '') < x)

export const modelVariantSchema = z
  .object({
    tier: modelTierSchema,
    /** Codecs the client must support to use this variant. Sorted, no duplicates. */
    requires: z.array(modelCapSchema),
    /** Same-origin committed path, or an https URL once the API serves it. */
    url: z.union([z.string().regex(SAME_ORIGIN_MODEL_URL), httpsUrlSchema]),
    bytes: z.number().int().positive().max(MODEL_FILE_BYTES),
    triangles: z.number().int().positive(),
    maxTexturePx: z.number().int().nonnegative(),
    /** Subresource-Integrity string, passed to `fetch({ integrity })`. */
    integrity: z.string().regex(/^sha256-[A-Za-z0-9+/]{43}=$/),
    /** Sorted, no duplicates. */
    extensions: z.array(gltfExtensionSchema),
  })
  .strict()
  .superRefine((v, ctx) => {
    const budget = MODEL_BUDGETS[v.tier]
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
    if (v.bytes > budget.bytes) issue('bytes', `${v.bytes} B exceeds the tier ${v.tier} budget of ${budget.bytes} B`)
    if (v.triangles > budget.triangles) issue('triangles', `${v.triangles} triangles exceed the tier ${v.tier} budget of ${budget.triangles}`)
    if (v.maxTexturePx > budget.texturePx) issue('maxTexturePx', `${v.maxTexturePx} px exceeds the tier ${v.tier} cap of ${budget.texturePx} px`)
    const allowed = new Set<string>(TIER_EXTENSIONS[v.tier])
    for (const ext of v.extensions) if (!allowed.has(ext)) issue('extensions', `${ext} is not allowed at tier ${v.tier}`)
    if (v.extensions.includes('EXT_meshopt_compression') && !v.requires.includes('meshopt'))
      issue('requires', 'EXT_meshopt_compression needs the meshopt capability')
    if (v.extensions.includes('EXT_texture_webp') && !v.requires.includes('webp'))
      issue('requires', 'EXT_texture_webp needs the webp capability')
    if (!isSortedUnique(v.requires)) issue('requires', 'must be sorted and free of duplicates')
    if (!isSortedUnique(v.extensions)) issue('extensions', 'must be sorted and free of duplicates')
    const fileTier = SAME_ORIGIN_MODEL_URL.exec(v.url)?.[1]
    if (fileTier !== undefined && Number(fileTier) !== v.tier) issue('url', `file name says tier ${fileTier}, the variant says tier ${v.tier}`)
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
    /**
     * Hash of the sources.json inputs the bytes were built from (`assets/build-inputs.ts`). Written by ingest and
     * checked by `assets:check` for every enabled entry; the runtime never reads it. Optional in the schema so a
     * manifest served by the API need not carry it; the committed one must.
     */
    buildInputsHash: z.string().regex(/^[0-9a-f]{16}$/).optional(),
    clips: z.array(z.object({ name: slugSchema, seconds: z.number().positive().max(20) }).strict()).max(2).default([]),
    variants: z.array(modelVariantSchema).min(1),
  })
  .strict()
  .superRefine((e, ctx) => {
    const seen = new Set<string>()
    for (const v of e.variants) {
      const key = `${v.tier}:${[...v.requires].sort().join(',')}`
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['variants'], message: `duplicate variant ${key}` })
      seen.add(key)
    }
  })
export type ModelEntry = z.infer<typeof modelEntrySchema>

/**
 * The body of GET /v1/assets/manifest?tier&caps, and of the committed default manifest.
 * GLB-only for `version: 1`: no USDZ or poster fields exist, and adding one is a version bump.
 */
export const modelManifestSchema = z
  .object({
    version: z.literal(1),
    /** sha256 over the canonical JSON of `models`, first 16 hex. No timestamps: ingest output must be reproducible. */
    contentHash: z.string().regex(/^[0-9a-f]{16}$/),
    models: z.array(modelEntrySchema),
  })
  .strict()
  .superRefine((m, ctx) => {
    const seen = new Set<string>()
    for (const [i, e] of m.models.entries()) {
      if (seen.has(e.id)) ctx.addIssue({ code: 'custom', path: ['models', i, 'id'], message: `duplicate model id ${e.id}` })
      seen.add(e.id)
    }
  })
export type ModelManifest = z.infer<typeof modelManifestSchema>

export const creditsFileSchema = z.array(creditSchema)

/** Capabilities a client may announce today. `ktx2` is reserved and rejected until a loader ships. */
export const modelQueryCapSchema = z.enum(['meshopt', 'webp'])

/** The query string of GET /v1/assets/manifest: `?tier=2&caps=meshopt,webp`. Strict: unknown keys are errors. */
export const modelManifestQuerySchema = z
  .object({
    tier: z.coerce.number().int().pipe(modelTierSchema),
    caps: z
      .string()
      .default('')
      .transform((s) => (s.trim() === '' ? [] : s.split(',').map((c) => c.trim())))
      .pipe(z.array(modelQueryCapSchema)),
  })
  .strict()
export type ModelManifestQuery = z.infer<typeof modelManifestQuerySchema>

export type SelectVariantResult =
  | { readonly ok: true; readonly variant: ModelVariant }
  | { readonly ok: false; readonly reason: 'disabled' | 'no-variant-at-tier' | 'missing-caps' }

/**
 * Highest tier <= `tier` whose `requires` the client satisfies. Among variants of that tier the
 * one demanding the most codecs wins (it is the leaner file), then the smaller file, then the
 * lexically smaller url, so the answer never depends on array order. Pure; the API will reuse it.
 */
export function selectVariant(
  entry: Pick<ModelEntry, 'variants' | 'enabled'>,
  tier: ModelTier,
  caps: ReadonlySet<ModelCap>,
): SelectVariantResult {
  if (!entry.enabled) return { ok: false, reason: 'disabled' }
  const atOrBelow = entry.variants.filter((v) => v.tier <= tier)
  if (atOrBelow.length === 0) return { ok: false, reason: 'no-variant-at-tier' }
  const usable = atOrBelow.filter((v) => v.requires.every((c) => caps.has(c)))
  if (usable.length === 0) return { ok: false, reason: 'missing-caps' }
  const best = [...usable].sort(
    (a, b) => b.tier - a.tier || b.requires.length - a.requires.length || a.bytes - b.bytes || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0),
  )[0]
  if (!best) return { ok: false, reason: 'missing-caps' }
  return { ok: true, variant: best }
}

/** `selectVariant` for callers that only care whether there is something to load. */
export function selectVariantOrNull(
  entry: Pick<ModelEntry, 'variants' | 'enabled'>,
  tier: ModelTier,
  caps: ReadonlySet<ModelCap>,
): ModelVariant | null {
  const r = selectVariant(entry, tier, caps)
  return r.ok ? r.variant : null
}
