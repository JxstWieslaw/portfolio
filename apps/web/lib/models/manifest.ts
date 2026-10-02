/**
 * The model manifest — model platform spec § 5.2, decision M5.
 *
 * `loadManifest()` is the single seam Phase 4 changes: today it returns the
 * committed `public/models/manifest.json`, imported as JSON so it ships inside
 * the lazy `models` chunk (zero initial bytes, zero extra requests); later it
 * will call `GET /v1/assets/manifest` and fall back to this file.
 *
 * Only the loader imports this module, so it lands in the models chunk. It
 * takes types from `@repo/contracts` and nothing else: the runtime must not
 * carry Zod, so `pickVariant` mirrors `selectVariantOrNull` and a unit test
 * pins the two together.
 */

import type { ModelCap, ModelEntry, ModelManifest, ModelVariant } from '@repo/contracts'
import committed from '@/public/models/manifest.json'
import { testSeam } from '@/lib/models/test-seam'

/** What this client can decode today: Meshopt geometry and WebP textures. */
export const CLIENT_CAPS: ReadonlySet<ModelCap> = new Set<ModelCap>(['meshopt', 'webp'])

export function loadManifest(): ModelManifest {
  const override = testSeam()?.manifest
  return (override ?? committed) as ModelManifest
}

/**
 * Highest tier at or below `tier` whose `requires` the client satisfies; the one
 * demanding the most codecs wins, then the smaller file, then the lexically
 * smaller url. `null` means "stay procedural". Same ordering as `selectVariant`.
 */
export function pickVariant(entry: Pick<ModelEntry, 'variants' | 'enabled'>, tier: 1 | 2 | 3, caps: ReadonlySet<ModelCap> = CLIENT_CAPS): ModelVariant | null {
  if (!entry.enabled) return null
  const usable = entry.variants.filter((v) => v.tier <= tier && v.requires.every((c) => caps.has(c)))
  const best = [...usable].sort(
    (a, b) => b.tier - a.tier || b.requires.length - a.requires.length || a.bytes - b.bytes || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0),
  )[0]
  return best ?? null
}

export interface ResolvedModel {
  readonly entry: ModelEntry
  readonly variant: ModelVariant
}

/** The entry and variant to load for `id` at `tier`, or `null` when disabled, missing or without a usable variant. */
export function resolveModel(id: string, tier: 1 | 2 | 3): ResolvedModel | null {
  const entry = loadManifest().models.find((m) => m.id === id)
  if (!entry) return null
  const variant = pickVariant(entry, tier)
  return variant ? { entry, variant } : null
}
