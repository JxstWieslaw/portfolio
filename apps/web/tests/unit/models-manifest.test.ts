import { modelManifestSchema, selectVariantOrNull, type ModelCap, type ModelEntry, type ModelTier } from '@repo/contracts'
import { describe, expect, it } from 'vitest'
import committed from '@/public/models/manifest.json'
import { CHAPTERS } from '@/lib/assembly/chapters'
import { ModelLoadError } from '@/lib/models/errors'
import { assertManifestShape } from '@/lib/models/validate'
import { CLIENT_CAPS, loadManifest, pickVariant, resolveModel } from '@/lib/models/manifest'

/**
 * The runtime cannot import `selectVariant` (it would carry Zod into the lazy
 * models chunk), so `pickVariant` mirrors it. These tests are the weld: any
 * drift between the two fails here.
 */
const SAMPLE_URL = (tier: number, hash: string) => `/models/thing.t${tier}.${hash}.glb`
const variant = (tier: ModelTier, requires: ModelCap[], bytes: number, hash: string) => ({
  tier,
  requires,
  url: SAMPLE_URL(tier, hash),
  bytes,
  triangles: 100,
  maxTexturePx: 0,
  integrity: 'sha256-uoOGK/a4W0oOBP14TMz1+HvcEOhkXnOsZlQFlKLw3po=',
  extensions: [],
})
const entry = (enabled: boolean, variants: ReturnType<typeof variant>[]): ModelEntry => ({
  id: 'thing',
  title: 'Thing',
  kind: 'prop',
  enabled,
  boundsRadius: 1,
  clips: [],
  variants,
})

describe('pickVariant mirrors selectVariantOrNull', () => {
  const entries = [
    entry(true, [variant(1, ['meshopt'], 100, 'aaaaaaaa'), variant(2, ['meshopt'], 200, 'bbbbbbbb')]),
    entry(true, [variant(2, ['meshopt'], 200, 'bbbbbbbb'), variant(2, ['meshopt', 'webp'], 150, 'cccccccc'), variant(3, ['ktx2'], 300, 'dddddddd')]),
    entry(true, [variant(3, ['meshopt'], 300, 'eeeeeeee')]),
    entry(true, [variant(1, [], 80, 'ffffffff'), variant(1, ['webp'], 90, '11111111')]),
    entry(false, [variant(1, ['meshopt'], 100, 'aaaaaaaa')]),
  ]
  const capSets: Array<ReadonlySet<ModelCap>> = [CLIENT_CAPS, new Set(), new Set<ModelCap>(['meshopt']), new Set<ModelCap>(['meshopt', 'webp', 'ktx2'])]
  const tiers: ModelTier[] = [1, 2, 3]

  it.each(entries.map((e, i) => [i, e] as const))('entry %s agrees for every tier and capability set', (_, e) => {
    for (const tier of tiers) for (const caps of capSets) expect(pickVariant(e, tier, caps)).toEqual(selectVariantOrNull(e, tier, caps))
  })
})

describe('the committed manifest', () => {
  it('parses with the contracts schema, so a bad edit fails here and not in a visitor browser', () => {
    expect(() => modelManifestSchema.parse(committed)).not.toThrow()
  })

  it('loads, and lists the three first models as enabled and resolvable at both tiers', () => {
    const manifest = loadManifest()
    expect(manifest.version).toBe(1)
    expect(manifest.models.map((m) => [m.id, m.enabled])).toEqual([
      ['crystal-cluster', true],
      ['gate-complex', true],
      ['gyroscope', true],
    ])
    for (const id of ['crystal-cluster', 'gate-complex', 'gyroscope'])
      for (const tier of [1, 2] as const) expect(resolveModel(id, tier).kind, `${id} tier ${tier}`).toBe('resolved')
  })


  it('treats an id the manifest does not contain as a bug (it throws), not as a quiet rollback', () => {
    expect(() => resolveModel('does-not-exist', 2)).toThrow(/not in the manifest/)
  })

  it('every non-null ledger asset resolves to a manifest entry', () => {
    const ids = new Set(loadManifest().models.map((m) => m.id))
    for (const chapter of Object.values(CHAPTERS)) if (chapter.model) expect(ids.has(chapter.model.asset)).toBe(true)
  })
})

describe('the structural guard on a manifest body', () => {
  it.each([null, {}, { models: 'x' }, { models: [{}] }, { models: [{ id: 'a' }] }, { models: [{ id: 3, variants: [] }] }])('rejects %j', (body) => {
    expect(() => assertManifestShape(body)).toThrow(ModelLoadError)
  })
  it('accepts a well-formed one', () => {
    expect(() => assertManifestShape({ models: [{ id: 'a', variants: [] }] })).not.toThrow()
  })
})
