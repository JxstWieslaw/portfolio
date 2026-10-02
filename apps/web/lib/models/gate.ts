/**
 * Whether the Assembly may load models, and which tier — model platform spec § 3.4.
 *
 * PURE. An allow-list: only the `live` and `reduced-instances` rungs may load
 * (reduced motion never mounts WebGL, so the platform is inert there by
 * construction; any other rung, present or future, is refused by default).
 * Until the journey's `tier.ts` (detect-gpu) lands, the tier is a stub read
 * through `readTier`, the single seam to replace. `?tier=` is honoured only
 * where the test seam is, never for a production visitor.
 */

import type { FallbackRung } from '@/lib/formations/fallback'

/** `?tier=` is a test aid: dev, or a build made with NEXT_PUBLIC_MODEL_TEST=1. Module-local so it folds away in production. */
const TIER_OVERRIDE: boolean = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_MODEL_TEST === '1'

export type ModelTierNumber = 1 | 2 | 3

export interface ModelGateInputs {
  readonly rung: FallbackRung
  /** `html[data-gl="live"]` has been set. */
  readonly glLive: boolean
  readonly tier: ModelTierNumber
  /** `navigator.connection?.saveData === true`. */
  readonly saveData: boolean
  readonly effectiveType: string | undefined
  /** `?nomodels=1`. */
  readonly noModels: boolean
}

export type GateReason = 'gl-not-live' | 'nomodels' | 'rung' | 'save-data' | '2g'

const ALLOWED_RUNGS: readonly FallbackRung[] = ['live', 'reduced-instances']

/** Why models may not load, or `null` when they may. The first matching rule wins. */
export function gateReason(i: ModelGateInputs): GateReason | null {
  if (!i.glLive) return 'gl-not-live'
  if (i.noModels) return 'nomodels'
  if (!ALLOWED_RUNGS.includes(i.rung)) return 'rung'
  if (i.saveData) return 'save-data'
  if (i.effectiveType === 'slow-2g' || i.effectiveType === '2g') return '2g'
  return null
}

export function shouldLoadModels(i: ModelGateInputs): boolean {
  return gateReason(i) === null
}

/** The tier whose variants may load, or `null` when nothing may. 3g and the `reduced-instances` rung cap it at 1. */
export function variantTier(i: ModelGateInputs): ModelTierNumber | null {
  if (!shouldLoadModels(i)) return null
  if (i.effectiveType === '3g' || i.rung === 'reduced-instances') return 1
  return i.tier
}

/** The stub tier: `reduced-instances` is tier 1, `live` is tier 2. */
export function stubTier(rung: FallbackRung): ModelTierNumber {
  return rung === 'reduced-instances' ? 1 : 2
}

/** `?tier=1|2|3`, or `null`. */
export function parseTierOverride(search: string): ModelTierNumber | null {
  const value = Number(new URLSearchParams(search).get('tier'))
  return value === 1 || value === 2 || value === 3 ? value : null
}

export function hasNoModelsFlag(search: string): boolean {
  return new URLSearchParams(search).get('nomodels') === '1'
}

/** The single seam for the tier: the rung stub, overridden by `?tier=` only when `allowOverride`; later detect-gpu. */
export function readTier(rung: FallbackRung, search: string, allowOverride: boolean): ModelTierNumber {
  return (allowOverride ? parseTierOverride(search) : null) ?? stubTier(rung)
}

interface NetworkInformationLike {
  readonly saveData?: boolean
  readonly effectiveType?: string
}

/** Reads the live environment into gate inputs. Browser only; every probe is defensive. */
export function readGateInputs(rung: FallbackRung): ModelGateInputs {
  const search = typeof window === 'undefined' ? '' : window.location.search
  const connection = (typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { connection?: NetworkInformationLike }).connection) ?? {}
  return {
    rung,
    glLive: typeof document !== 'undefined' && document.documentElement.dataset.gl === 'live',
    tier: readTier(rung, search, TIER_OVERRIDE),
    saveData: connection.saveData === true,
    effectiveType: connection.effectiveType,
    noModels: hasNoModelsFlag(search),
  }
}
