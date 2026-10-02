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
import { ModelLoadError } from '@/lib/models/errors'
import { testSeam } from '@/lib/models/test-seam'
import { assertManifestShape } from '@/lib/models/validate'

/** What this client can decode today: Meshopt geometry and WebP textures. */
export const CLIENT_CAPS: ReadonlySet<ModelCap> = new Set<ModelCap>(['meshopt', 'webp'])

export function loadManifest(): ModelManifest {
  // The seam's manifest gets the same structural guard as the committed one.
  const body = testSeam()?.manifest ?? committed
  assertManifestShape(body)
  return body as ModelManifest
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

export type Resolution =
  | { readonly kind: 'resolved'; readonly model: ResolvedModel }
  /** `enabled: false`, or no variant this client can use at this tier: the quiet, legitimate "stay procedural". */
  | { readonly kind: 'unavailable'; readonly reason: 'disabled' | 'no-variant' }

/**
 * The entry and variant to load for `id` at `tier`. An id the ledger names but
 * the manifest does not contain is a bug, not a rollback, so it throws.
 */
export function resolveModel(id: string, tier: 1 | 2 | 3): Resolution {
  const entry = loadManifest().models.find((m) => m.id === id)
  if (!entry) throw new ModelLoadError('missing', `ledger asset "${id}" is not in the manifest`)
  if (!entry.enabled) return { kind: 'unavailable', reason: 'disabled' }
  const variant = pickVariant(entry, tier)
  return variant ? { kind: 'resolved', model: { entry, variant } } : { kind: 'unavailable', reason: 'no-variant' }
}
