/**
 * The frame-interval governor — hero monolith spec § 2.4.
 *
 * Pure. It watches `requestAnimationFrame` intervals while the loop is running
 * continuously and can only ever step the tier DOWN. A tier change rewrites
 * uniforms, the render-target size and an instance count; it never recompiles,
 * so the governor cannot cause a stall of its own.
 *
 * What it can and cannot see: a rAF interval tells "makes the frame budget"
 * from "does not". It cannot see 40 versus 60 fps of headroom, which is why the
 * starting tier carries a large margin and why tiers 1 and 0 exist.
 */

import type { HeroTier } from './tiers'

export type GovernorPhase = 'assembly' | 'scroll' | 'idle'

export interface GovernorState {
  /** The most recent usable intervals, oldest first. */
  readonly samples: readonly number[]
  /** Intervals seen so far, including the warm-up ones. */
  readonly seen: number
  /** Samples still to pass before the next step down is allowed. */
  readonly cooldown: number
  readonly tier: HeroTier
}

/** Compile and first-use hitches are not the steady state: the first samples are dropped. */
export const WARMUP_SAMPLES = 10
/** The assembly window, and its p75 limit (a 45 fps floor). */
export const ASSEMBLY_WINDOW = 45
export const ASSEMBLY_LIMIT_MS = 22
/** The rolling scroll window, and its p90 limit. */
export const SCROLL_WINDOW = 60
export const SCROLL_LIMIT_MS = 28
/** No more than one step per this many samples. */
export const COOLDOWN_SAMPLES = 90
/** Tier 1 drops to tier 0 when the p75 of this many samples is above the limit. */
export const FLOOR_WINDOW = 90
export const FLOOR_LIMIT_MS = 40

export function initialGovernor(tier: HeroTier): GovernorState {
  return { samples: [], seen: 0, cooldown: 0, tier }
}

/** Nearest-rank percentile of a non-empty list; `q` in 0..1. */
export function percentile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))
  return sorted[index] ?? 0
}

function tail(values: readonly number[], n: number): readonly number[] {
  return values.length > n ? values.slice(values.length - n) : values
}

/**
 * One interval in, the next state out. `idle` intervals (the 20 fps ticker) say
 * nothing about the frame budget and are ignored; so is anything that is not a
 * positive finite number (a throttled background tab reports huge values and a
 * zero is a duplicate callback).
 */
export function governorStep(state: GovernorState, intervalMs: number, phase: GovernorPhase): GovernorState {
  if (phase === 'idle' || state.tier === 0) return state
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return state

  const seen = state.seen + 1
  if (seen <= WARMUP_SAMPLES) return { ...state, seen }

  const cooldown = Math.max(0, state.cooldown - 1)
  const samples = tail([...state.samples, intervalMs], FLOOR_WINDOW)
  const held = { ...state, seen, cooldown, samples }
  if (cooldown > 0) return held

  const down = (tier: HeroTier): GovernorState => ({ samples: [], seen, cooldown: COOLDOWN_SAMPLES, tier })

  if (state.tier === 1) {
    return samples.length >= FLOOR_WINDOW && percentile(samples, 0.75) > FLOOR_LIMIT_MS ? down(0) : held
  }
  if (phase === 'assembly') {
    const window = tail(samples, ASSEMBLY_WINDOW)
    return window.length >= ASSEMBLY_WINDOW && percentile(window, 0.75) > ASSEMBLY_LIMIT_MS ? down((state.tier - 1) as HeroTier) : held
  }
  const window = tail(samples, SCROLL_WINDOW)
  return window.length >= SCROLL_WINDOW && percentile(window, 0.9) > SCROLL_LIMIT_MS ? down((state.tier - 1) as HeroTier) : held
}
