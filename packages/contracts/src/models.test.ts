import { describe, expect, it } from 'vitest'

import {
  LICENCES_REQUIRING_CREDIT,
  MODEL_BUDGETS,
  MODEL_FILE_BYTES,
  MODEL_REPO_BYTES,
  TIER_EXTENSIONS,
  creditSchema,
  httpsUrlSchema,
  isoDateSchema,
  modelEntrySchema,
  modelManifestQuerySchema,
  modelManifestSchema,
  modelVariantSchema,
  selectVariant,
  selectVariantOrNull,
  type GltfExtension,
  type ModelCap,
  type ModelEntry,
  type ModelTier,
} from './models.js'

const credit = {
  assetId: 'core-crystal',
  title: 'Core crystal',
  author: 'Someone',
  sourceUrl: 'https://kenney.nl/assets/x',
  licence: 'CC0-1.0',
  retrievedAt: '2026-10-02',
}

const integrity = `sha256-${'A'.repeat(43)}=`
const variant = (tier: ModelTier, requires: ModelCap[] = ['meshopt'], hash = 'abcdef01') => ({
  tier,
  requires,
  url: `/models/core-crystal.t${tier}.${hash}.glb`,
  bytes: 1000,
  triangles: 100,
  maxTexturePx: 0,
  integrity,
  extensions: [] as GltfExtension[],
})

const entryInput = (variants: ReturnType<typeof variant>[], over: Record<string, unknown> = {}) => ({
  id: 'core-crystal',
  title: 'Core crystal',
  kind: 'hero',
  enabled: true,
  boundsRadius: 1,
  variants,
  ...over,
})
const entry = (variants: ReturnType<typeof variant>[], over: Record<string, unknown> = {}): ModelEntry =>
  modelEntrySchema.parse(entryInput(variants, over))

describe('the numbers that other code is allowed to depend on', () => {
  it('pins the per-tier budgets', () => {
    expect(MODEL_BUDGETS).toEqual({
      1: { bytes: 70_000, triangles: 6_000, texturePx: 512, textures: 1, materials: 1, clips: 1, gpuMb: 4 },
      2: { bytes: 180_000, triangles: 20_000, texturePx: 1_024, textures: 2, materials: 2, clips: 2, gpuMb: 12 },
      3: { bytes: 400_000, triangles: 50_000, texturePx: 2_048, textures: 2, materials: 2, clips: 2, gpuMb: 30 },
    })
  })
  it('pins the repository and per-file caps, and ties the file cap to the largest tier', () => {
    expect(MODEL_REPO_BYTES).toBe(1_500_000)
    expect(MODEL_FILE_BYTES).toBe(400_000)
    expect(MODEL_FILE_BYTES).toBe(MODEL_BUDGETS[3].bytes)
  })
  it('pins the extensions each tier may use', () => {
    const base = ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_texture_webp', 'KHR_texture_transform']
    expect(TIER_EXTENSIONS[1]).toEqual(base)
    expect(TIER_EXTENSIONS[2]).toEqual(base)
    expect(TIER_EXTENSIONS[3]).toEqual([...base, 'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_ior'])
  })
  it('pins which licences need a credit', () => {
    expect(LICENCES_REQUIRING_CREDIT).toEqual(['CC-BY-4.0'])
  })
})

describe('httpsUrlSchema and isoDateSchema', () => {
  it.each([
    'https://kenney.nl/assets/x',
    'https://creativecommons.org/licenses/by/4.0/',
  ])('accepts %s', (url) => {
    expect(httpsUrlSchema.safeParse(url).success).toBe(true)
  })
  it.each([
    'http://kenney.nl/x',
    'javascript:alert(1)',
    'data:text/html,hi',
    'https://user:pw@kenney.nl/x',
    'https://kenney.nl:8443/x',
    'https://127.0.0.1/x',
    'https://[::1]/x',
    'https://2130706433/x',
    'https://localhost/x',
    'https://app.localhost/x',
    'not a url',
  ])('rejects %s', (url) => {
    expect(httpsUrlSchema.safeParse(url).success).toBe(false)
  })
  it('accepts only real calendar days', () => {
    expect(isoDateSchema.safeParse('2026-10-02').success).toBe(true)
    expect(isoDateSchema.safeParse('2028-02-29').success).toBe(true)
    for (const bad of ['2026-02-31', '2026-13-01', '2026-00-10', '2027-02-29', '02/10/2026', '2026-1-2'])
      expect(isoDateSchema.safeParse(bad).success, bad).toBe(false)
  })
})

describe('licence and credit schemas', () => {
  it('accepts the three representable licences', () => {
    for (const licence of ['CC0-1.0', 'own']) expect(creditSchema.safeParse({ ...credit, licence }).success).toBe(true)
    expect(
      creditSchema.safeParse({ ...credit, licence: 'CC-BY-4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/' }).success,
    ).toBe(true)
  })
  it('rejects a licence outside the enum', () => {
    expect(creditSchema.safeParse({ ...credit, licence: 'CC-BY-NC-4.0' }).success).toBe(false)
    expect(creditSchema.safeParse({ ...credit, licence: 'MIT' }).success).toBe(false)
  })
  it('requires a licenceUrl for CC-BY', () => {
    expect(creditSchema.safeParse({ ...credit, licence: 'CC-BY-4.0' }).success).toBe(false)
  })
  it('rejects javascript:, http: and data: URLs, a bad date and unknown keys', () => {
    for (const sourceUrl of ['javascript:alert(1)', 'http://kenney.nl/x', 'data:text/html,hi'])
      expect(creditSchema.safeParse({ ...credit, sourceUrl }).success).toBe(false)
    expect(creditSchema.safeParse({ ...credit, retrievedAt: '2026-02-31' }).success).toBe(false)
    expect(creditSchema.safeParse({ ...credit, surprise: true }).success).toBe(false)
  })
})

describe('variant, entry and manifest schemas', () => {
  const parse = (over: Record<string, unknown>) => modelVariantSchema.safeParse({ ...variant(2), ...over })

  it('requires the codecs and extensions to be stated, never defaulted', () => {
    expect(modelVariantSchema.safeParse(variant(2)).success).toBe(true)
    for (const key of ['requires', 'extensions']) {
      const partial: Record<string, unknown> = { ...variant(2) }
      delete partial[key]
      expect(modelVariantSchema.safeParse(partial).success).toBe(false)
    }
  })

  it('rejects a bad integrity string and unknown keys', () => {
    expect(parse({ integrity: 'sha256-short' }).success).toBe(false)
    expect(parse({ integrity: `sha1-${'A'.repeat(43)}=` }).success).toBe(false)
    expect(parse({ poster: '/x.png' }).success).toBe(false)
  })

  it('rejects a same-origin url that does not follow the hashed naming', () => {
    expect(parse({ url: '/models/core crystal.glb' }).success).toBe(false)
    expect(parse({ url: '/models/../x.t2.abcdef01.glb' }).success).toBe(false)
    expect(parse({ url: 'http://cdn.example/x.glb' }).success).toBe(false)
    expect(parse({ url: 'https://cdn.example/x.glb' }).success).toBe(true)
  })

  it('rejects a file name whose tier is not the variant tier', () => {
    expect(parse({ url: '/models/core-crystal.t1.abcdef01.glb' }).success).toBe(false)
  })

  describe.each([
    [1, 70_000, 6_000, 512],
    [2, 180_000, 20_000, 1_024],
    [3, 400_000, 50_000, 2_048],
  ] as const)('tier %i boundaries', (tier, bytes, triangles, px) => {
    const at = (over: Record<string, unknown>) => modelVariantSchema.safeParse({ ...variant(tier), ...over })
    it('accepts exactly the budget and rejects one past it', () => {
      expect(at({ bytes, triangles, maxTexturePx: px }).success).toBe(true)
      expect(at({ bytes: bytes + 1 }).success).toBe(false)
      expect(at({ triangles: triangles + 1 }).success).toBe(false)
      expect(at({ maxTexturePx: px + 1 }).success).toBe(false)
    })
  })

  it('holds 2049 px out of tier 3 and 1025 px out of tier 2', () => {
    expect(modelVariantSchema.safeParse({ ...variant(3), maxTexturePx: 2_049 }).success).toBe(false)
    expect(modelVariantSchema.safeParse({ ...variant(2), maxTexturePx: 1_025 }).success).toBe(false)
  })

  it('rejects a file over the 400 kB cap', () => {
    expect(parse({ tier: 3, url: '/models/core-crystal.t3.abcdef01.glb', bytes: 400_001 }).success).toBe(false)
  })

  it('keeps transmission for tier 3 only', () => {
    expect(parse({ extensions: ['KHR_materials_transmission'] }).success).toBe(false)
    expect(modelVariantSchema.safeParse({ ...variant(3), extensions: ['KHR_materials_transmission'] }).success).toBe(true)
  })

  it('ties extensions to the capability a client needs', () => {
    expect(parse({ extensions: ['EXT_meshopt_compression'], requires: [] }).success).toBe(false)
    expect(parse({ extensions: ['EXT_meshopt_compression'], requires: ['meshopt'] }).success).toBe(true)
    expect(parse({ extensions: ['EXT_texture_webp'], requires: ['meshopt'] }).success).toBe(false)
    expect(parse({ extensions: ['EXT_texture_webp'], requires: ['meshopt', 'webp'] }).success).toBe(true)
  })

  it('requires requires and extensions to be sorted and de-duplicated', () => {
    expect(parse({ requires: ['webp', 'meshopt'] }).success).toBe(false)
    expect(parse({ requires: ['meshopt', 'meshopt'] }).success).toBe(false)
    expect(parse({ extensions: ['KHR_mesh_quantization', 'EXT_meshopt_compression'], requires: ['meshopt'] }).success).toBe(false)
    expect(parse({ extensions: ['EXT_meshopt_compression', 'EXT_meshopt_compression'], requires: ['meshopt'] }).success).toBe(false)
  })

  it('rejects a duplicate tier and requires pair, and unknown entry keys', () => {
    expect(modelEntrySchema.safeParse(entryInput([variant(1), variant(1, ['meshopt'], '01234567')])).success).toBe(false)
    expect(modelEntrySchema.safeParse(entryInput([variant(1)], { poster: 'x' })).success).toBe(false)
  })

  it('accepts a clip of exactly 20 s and rejects 20.001 s or a third clip', () => {
    const clip = (seconds: number, name = 'idle') => ({ name, seconds })
    expect(modelEntrySchema.safeParse(entryInput([variant(2)], { clips: [clip(20)] })).success).toBe(true)
    expect(modelEntrySchema.safeParse(entryInput([variant(2)], { clips: [clip(20.001)] })).success).toBe(false)
    expect(modelEntrySchema.safeParse(entryInput([variant(2)], { clips: [clip(1, 'a'), clip(1, 'b'), clip(1, 'c')] })).success).toBe(false)
  })

  it('rejects a manifest whose contentHash is not 16 hex characters, duplicate ids, or extra keys', () => {
    expect(modelManifestSchema.safeParse({ version: 1, contentHash: 'zz', models: [] }).success).toBe(false)
    expect(modelManifestSchema.safeParse({ version: 1, contentHash: '0'.repeat(16), models: [] }).success).toBe(true)
    const one = entryInput([variant(1)])
    expect(modelManifestSchema.safeParse({ version: 1, contentHash: '0'.repeat(16), models: [one, one] }).success).toBe(false)
    expect(modelManifestSchema.safeParse({ version: 1, contentHash: '0'.repeat(16), models: [], usdz: [] }).success).toBe(false)
  })
})

describe('selectVariant', () => {
  const caps = (...c: ModelCap[]) => new Set<ModelCap>(c)
  const pick = (e: ModelEntry, tier: ModelTier, c: Set<ModelCap>) => selectVariantOrNull(e, tier, c)?.tier

  it('asks for tier 3 when only tier 2 exists and returns tier 2', () => {
    expect(pick(entry([variant(1), variant(2)]), 3, caps('meshopt'))).toBe(2)
  })

  it('never returns a tier above the one asked for, and says why when nothing fits', () => {
    const e = entry([variant(2), variant(3)])
    expect(selectVariant(e, 1, caps('meshopt'))).toEqual({ ok: false, reason: 'no-variant-at-tier' })
    expect(pick(e, 2, caps('meshopt'))).toBe(2)
  })

  it('skips a variant that requires ktx2 when the client lacks it', () => {
    const e = entry([variant(1), variant(3, ['ktx2', 'meshopt'], '01234567')])
    expect(pick(e, 3, caps('meshopt', 'webp'))).toBe(1)
    expect(pick(e, 3, caps('meshopt', 'ktx2'))).toBe(3)
  })

  it('reports missing-caps when variants exist but the client cannot decode any', () => {
    expect(selectVariant(entry([variant(1), variant(2)]), 3, caps())).toEqual({ ok: false, reason: 'missing-caps' })
  })

  it('reports disabled for a switched-off entry, whatever the tier and caps', () => {
    expect(selectVariant(entry([variant(1)], { enabled: false }), 3, caps('meshopt', 'webp'))).toEqual({ ok: false, reason: 'disabled' })
    expect(selectVariantOrNull(entry([variant(1)], { enabled: false }), 3, caps('meshopt'))).toBeNull()
  })

  it('prefers the variant needing more codecs within one tier', () => {
    const e = entry([variant(2, ['meshopt']), variant(2, ['meshopt', 'webp'], '01234567')])
    expect(selectVariantOrNull(e, 2, caps('meshopt', 'webp'))?.requires).toEqual(['meshopt', 'webp'])
    expect(selectVariantOrNull(e, 2, caps('meshopt'))?.requires).toEqual(['meshopt'])
  })

  it('breaks a full tie by size then url, so the answer never depends on array order', () => {
    const small = { ...variant(2, ['meshopt'], 'aaaaaaaa'), bytes: 500 }
    const big = { ...variant(2, ['meshopt'], 'bbbbbbbb'), bytes: 900 }
    const same = { ...variant(2, ['meshopt'], 'cccccccc'), bytes: 500 }
    // Same tier and requires would be a duplicate entry, so build the candidates by hand.
    const e = { enabled: true, variants: [big, same, small] }
    const reversed = { enabled: true, variants: [small, same, big] }
    const a = selectVariant(e, 2, caps('meshopt'))
    const b = selectVariant(reversed, 2, caps('meshopt'))
    expect(a).toEqual(b)
    expect(a.ok && a.variant.url).toBe('/models/core-crystal.t2.aaaaaaaa.glb')
  })
})

describe('modelManifestQuerySchema', () => {
  const q = (input: Record<string, unknown>) => modelManifestQuerySchema.safeParse(input)

  it('coerces tier from a string and splits caps on commas', () => {
    expect(q({ tier: '2', caps: 'meshopt,webp' })).toMatchObject({ success: true, data: { tier: 2, caps: ['meshopt', 'webp'] } })
    expect(q({ tier: '1' })).toMatchObject({ success: true, data: { tier: 1, caps: [] } })
    expect(q({ tier: 3, caps: ' meshopt , webp ' })).toMatchObject({ success: true, data: { caps: ['meshopt', 'webp'] } })
  })
  it('rejects ktx2 for now, unknown caps, bad tiers and unknown keys', () => {
    expect(q({ tier: '2', caps: 'meshopt,ktx2' }).success).toBe(false)
    expect(q({ tier: '2', caps: 'draco' }).success).toBe(false)
    for (const tier of ['0', '4', '1.5', 'two', ''])
      expect(q({ tier }).success, tier).toBe(false)
    expect(q({ tier: '2', extra: '1' }).success).toBe(false)
    expect(q({ caps: 'meshopt' }).success).toBe(false)
  })
})
