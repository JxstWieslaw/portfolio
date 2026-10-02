import { selectVariantOrNull, type ModelCap, type ModelEntry, type ModelTier } from '@repo/contracts'
import { describe, expect, it } from 'vitest'
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
  it('loads, and keeps the generated gyroscope disabled so nothing resolves', () => {
    const manifest = loadManifest()
    expect(manifest.version).toBe(1)
    expect(manifest.models.find((m) => m.id === 'gyroscope')?.enabled).toBe(false)
    expect(resolveModel('gyroscope', 2)).toBeNull()
    expect(resolveModel('does-not-exist', 2)).toBeNull()
  })
})
