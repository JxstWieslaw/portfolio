/**
 * Per-formation bundle cache — journey spec § 5.2.
 *
 * PURE. Bundles are frame-invariant (`ModelBundle`), so each one is built at
 * most once per mount and never on resize. Mount asks for the first `from`
 * and `to` only; the next formation is built the first time the scroll store
 * names it (~1 ms on desktop per the M2 measurement of 7 ms for all seven).
 */

import { ARTEFACT_CENTRE, ARTEFACT_RADIUS, CLEARANCE_RADIUS } from '@/lib/assembly/artefact'
import { CHAPTERS, type Chapter } from '@/lib/assembly/chapters'
import { buildCloudBundle } from '@/lib/assembly/cloud'
import { buildModelBundle, clearArtefact, clearSphere, type BundleKind, type ModelBundle } from '@/lib/assembly/targets'
import type { FormationId } from '@/lib/formations/config'

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

/**
 * A formation's bundle with its chapter's model exclusion applied (model
 * platform spec § 3.3): the hole belongs to the formation, not to the load
 * state, so the procedural artefact, a loaded model and a failed one all see
 * the same hole and nothing pops when a model arrives late. An exclusion of 0
 * (every row today) returns the bundle untouched.
 */
function withExclusion(bundle: ModelBundle, kind: FormationId, ledger: Readonly<Record<FormationId, Chapter>>): ModelBundle {
  const model = ledger[kind].model
  if (!model || model.exclusion <= 0) return bundle
  return clearSphere(bundle, model.position, model.exclusion).bundle
}

/**
 * The scene's builder: formations with the hero's artefact clearance applied
 * to the monolith (journey spec § 3.1), the chapter ledger's exclusions on top,
 * and the `cloud` pseudo-formation derived from that monolith so the on-load
 * assembly lands on the cleared points.
 */
export function assemblyBuilder(
  capacity: number,
  keep: number,
  onCleared?: (moved: number) => void,
  ledger: Readonly<Record<FormationId, Chapter>> = CHAPTERS,
): BundleBuilder {
  let monolith: ModelBundle | null = null
  const cleared = (): ModelBundle => {
    if (!monolith) {
      const { bundle, moved } = clearArtefact(buildModelBundle('monolith', capacity, keep), ARTEFACT_CENTRE, ARTEFACT_RADIUS, CLEARANCE_RADIUS)
      onCleared?.(moved)
      monolith = withExclusion(bundle, 'monolith', ledger)
    }
    return monolith
  }
  return (kind) => {
    if (kind === 'monolith') return cleared()
    if (kind === 'cloud') return buildCloudBundle(cleared())
    return withExclusion(buildModelBundle(kind, capacity, keep), kind, ledger)
  }
}
