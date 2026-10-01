/**
 * Per-formation bundle cache — journey spec § 5.2.
 *
 * PURE. Bundles are frame-invariant (`ModelBundle`), so each one is built at
 * most once per mount and never on resize. Mount asks for the first `from`
 * and `to` only; the next formation is built the first time the scroll store
 * names it (~1 ms on desktop per the M2 measurement of 7 ms for all seven).
 */

import { buildModelBundle, type BundleKind, type ModelBundle } from '@/lib/assembly/targets'

export type BundleBuilder = (kind: BundleKind) => ModelBundle

export interface BundleCache {
  /** The bundle for `kind`, built on first use. */
  get(kind: BundleKind): ModelBundle
  has(kind: BundleKind): boolean
  /** How many bundles have been built so far — the resize-never-rebuilds assertion. */
  readonly builds: number
}

/** The default builder: formations only. `cloud` is registered by the scene (§ 3.1). */
export function formationBuilder(capacity: number, keep: number): BundleBuilder {
  return (kind) => {
    if (kind === 'cloud') throw new Error('cloud bundle needs a builder that knows the monolith')
    return buildModelBundle(kind, capacity, keep)
  }
}

export function createBundleCache(build: BundleBuilder): BundleCache {
  const bundles = new Map<BundleKind, ModelBundle>()
  let builds = 0
  return {
    get(kind) {
      let bundle = bundles.get(kind)
      if (!bundle) {
        bundle = build(kind)
        bundles.set(kind, bundle)
        builds += 1
      }
      return bundle
    },
    has(kind) {
      return bundles.has(kind)
    },
    get builds() {
      return builds
    },
  }
}
