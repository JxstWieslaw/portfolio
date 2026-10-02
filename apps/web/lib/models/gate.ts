/**
 * Whether the Assembly may load models, and which tier — model platform spec § 3.4.
 *
 * PURE. Reduced motion never mounts WebGL (`shouldMountWebGL`), so the platform
 * is inert there by construction; the `reduced-motion` rule below is asserted
 * anyway. Until the journey's `tier.ts` (detect-gpu) lands, the tier is a stub
 * read through `readTier`, the single seam to replace.
 */

import type { FallbackRung } from '@/lib/formations/fallback'

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

export function shouldLoadModels(i: ModelGateInputs): boolean {
  if (!i.glLive || i.noModels) return false
  if (i.rung === 'reduced-motion') return false
  if (i.saveData) return false
  if (i.effectiveType === 'slow-2g' || i.effectiveType === '2g') return false
  return true
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

/** The single seam for the tier: today the rung stub with the `?tier=` override; later detect-gpu. */
export function readTier(rung: FallbackRung, search: string): ModelTierNumber {
  return parseTierOverride(search) ?? stubTier(rung)
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
    tier: readTier(rung, search),
    saveData: connection.saveData === true,
    effectiveType: connection.effectiveType,
    noModels: hasNoModelsFlag(search),
  }
}
