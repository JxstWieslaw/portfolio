import { describe, expect, it } from 'vitest'

import {
  creditSchema,
  modelEntrySchema,
  modelManifestSchema,
  modelVariantSchema,
  selectVariant,
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
  extensions: [],
})

const entry = (variants: ReturnType<typeof variant>[]): ModelEntry =>
  modelEntrySchema.parse({
    id: 'core-crystal',
    title: 'Core crystal',
    kind: 'hero',
    enabled: true,
    boundsRadius: 1,
    variants,
  })

describe('licence and credit schemas', () => {
  it('accepts the three representable licences', () => {
    for (const licence of ['CC0-1.0', 'own'])
      expect(creditSchema.safeParse({ ...credit, licence }).success).toBe(true)
    expect(
      creditSchema.safeParse({ ...credit, licence: 'CC-BY-4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/' })
        .success,
    ).toBe(true)
  })

  it('rejects a licence outside the enum', () => {
    expect(creditSchema.safeParse({ ...credit, licence: 'CC-BY-NC-4.0' }).success).toBe(false)
    expect(creditSchema.safeParse({ ...credit, licence: 'MIT' }).success).toBe(false)
  })

  it('requires a licenceUrl for CC-BY', () => {
    const r = creditSchema.safeParse({ ...credit, licence: 'CC-BY-4.0' })
    expect(r.success).toBe(false)
  })

  it('rejects javascript:, http: and data: URLs', () => {
    for (const sourceUrl of ['javascript:alert(1)', 'http://kenney.nl/x', 'data:text/html,hi'])
      expect(creditSchema.safeParse({ ...credit, sourceUrl }).success).toBe(false)
  })

  it('rejects a malformed retrieval date', () => {
    expect(creditSchema.safeParse({ ...credit, retrievedAt: '02/10/2026' }).success).toBe(false)
  })
})

describe('variant, entry and manifest schemas', () => {
  it('parses a well-formed variant and defaults requires/extensions', () => {
    const full: Record<string, unknown> = { ...variant(2) }
    delete full['requires']
    delete full['extensions']
    const parsed = modelVariantSchema.parse(full)
    expect(parsed.requires).toEqual([])
    expect(parsed.extensions).toEqual([])
  })

  it('rejects a bad integrity string', () => {
    expect(modelVariantSchema.safeParse({ ...variant(1), integrity: 'sha256-short' }).success).toBe(false)
    expect(modelVariantSchema.safeParse({ ...variant(1), integrity: `sha1-${'A'.repeat(43)}=` }).success).toBe(false)
  })

  it('rejects a same-origin url that does not follow the hashed naming', () => {
    expect(modelVariantSchema.safeParse({ ...variant(1), url: '/models/core crystal.glb' }).success).toBe(false)
    expect(modelVariantSchema.safeParse({ ...variant(1), url: '/models/../x.t1.abcdef01.glb' }).success).toBe(false)
    expect(modelVariantSchema.safeParse({ ...variant(1), url: 'http://cdn.example/x.glb' }).success).toBe(false)
    expect(modelVariantSchema.safeParse({ ...variant(1), url: 'https://cdn.example/x.glb' }).success).toBe(true)
  })

  it('rejects a file over the 400 kB cap', () => {
    expect(modelVariantSchema.safeParse({ ...variant(3), bytes: 400_001 }).success).toBe(false)
  })

  it('rejects a duplicate tier and requires pair', () => {
    const r = modelEntrySchema.safeParse({
      id: 'core-crystal',
      title: 'x',
      kind: 'hero',
      enabled: true,
      boundsRadius: 1,
      variants: [variant(1), variant(1, ['meshopt'], '01234567')],
    })
    expect(r.success).toBe(false)
  })

  it('rejects a manifest whose contentHash is not 16 hex characters', () => {
    expect(modelManifestSchema.safeParse({ version: 1, contentHash: 'zz', models: [] }).success).toBe(false)
    expect(modelManifestSchema.safeParse({ version: 1, contentHash: '0'.repeat(16), models: [] }).success).toBe(true)
  })
})

describe('selectVariant', () => {
  const caps = (...c: ModelCap[]) => new Set<ModelCap>(c)

  it('asks for tier 3 when only tier 2 exists and returns tier 2', () => {
    const e = entry([variant(1), variant(2)])
    expect(selectVariant(e, 3, caps('meshopt'))?.tier).toBe(2)
  })

  it('never returns a tier above the one asked for', () => {
    const e = entry([variant(2), variant(3)])
    expect(selectVariant(e, 1, caps('meshopt'))).toBeNull()
    expect(selectVariant(e, 2, caps('meshopt'))?.tier).toBe(2)
  })

  it('skips a variant that requires ktx2 when the client lacks it', () => {
    const e = entry([variant(1), variant(3, ['meshopt', 'ktx2'], '01234567')])
    expect(selectVariant(e, 3, caps('meshopt', 'webp'))?.tier).toBe(1)
    expect(selectVariant(e, 3, caps('meshopt', 'ktx2'))?.tier).toBe(3)
  })

  it('returns null when nothing matches, so the site stays procedural', () => {
    const e = entry([variant(1), variant(2)])
    expect(selectVariant(e, 3, caps())).toBeNull()
  })

  it('prefers the variant needing more codecs within one tier', () => {
    const e = entry([variant(2, ['meshopt']), variant(2, ['meshopt', 'webp'], '01234567')])
    expect(selectVariant(e, 2, caps('meshopt', 'webp'))?.requires).toEqual(['meshopt', 'webp'])
    expect(selectVariant(e, 2, caps('meshopt'))?.requires).toEqual(['meshopt'])
  })

  it('does not consult the enabled flag', () => {
    const e = { ...entry([variant(1)]), enabled: false }
    expect(selectVariant(e, 1, caps('meshopt'))?.tier).toBe(1)
  })
})
