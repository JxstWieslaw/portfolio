/**
 * The frame-interval governor — hero monolith spec § 2.4. Pure.
 *
 * It watches `requestAnimationFrame` intervals while the loop is running
 * continuously and can only ever step the tier DOWN. A tier change rewrites
 * uniforms, the render-target size and an instance count; it never recompiles,
 * so the governor cannot cause a stall of its own.
 *
 * What it can and cannot see: a rAF interval tells "makes the frame budget"
 * from "does not". It cannot see 40 versus 60 fps of headroom, which is why the
 * starting tier carries a large margin and why tiers 1 and 0 exist.
 *
 * A browser that caps rAF (iOS Low Power Mode, Chrome Energy Saver) delivers a
 * steady 30 Hz whatever the GPU does. A stable cap is detected and becomes the
 * frame budget, so the governor does not punish a phone for the OS's choice.
 *
 * A steady 33 ms is also what a 60 Hz display shows for a GPU that needs 17 to
 * 33 ms (vsync quantises it). The two cannot be told apart from one tier, so a
 * cap-like stream is believed only after it survives ONE step down: a cap stays
 * 33 ms, a slow GPU drops to 16.7 ms. The trade-off, accepted: a GPU that snaps
 * to 33 ms at tiers 3 and 2 but reaches 16.7 ms at tier 1 is taken for a cap
 * and runs tier 2 at a steady 30 fps instead of tier 1 at 60. A cap-like stream
 * at tier 1 is never believed unless it was already seen at a higher tier: a
 * stream never tested against a lower-cost tier is not stored.
 */

import type { HeroTier } from './tiers'

export type GovernorPhase = 'assembly' | 'scroll' | 'idle'

export interface GovernorState {
  /** The most recent usable intervals, oldest first. */
  readonly samples: readonly number[]
  /** Intervals seen since the last tier change, including the warm-up ones. */
  readonly seen: number
  /** Samples still to pass before the next step down is allowed. */
  readonly cooldown: number
  readonly tier: HeroTier
  /** The cap-like interval in ms (about 33 for 30 Hz), or 0 when none was seen. Only budget once `capState` is confirmed. */
  readonly cap: number
  /** none: no cap-like stream. unconfirmed: seen, and stepped down to test it. confirmed: it stayed at lower tiers, so it is the OS. */
  readonly capState: 'none' | 'unconfirmed' | 'confirmed'
  /** How many tiers the cap-like interval has persisted through. */
  readonly capHits: number
  /** True once the cap was seen this session. A cap loaded from the previous page is re-checked against the first window. */
  readonly capVerified: boolean
  /** Why the last step happened, for the HUD and `data-hero-reason`. Empty until a step. */
  readonly reason: string
}

/** Compile and first-use hitches, and every tier change, are not the steady state: this many samples are dropped. */
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
/** An interval above this is a hitch or a hidden tab, not a frame-budget sample. */
export const MAX_SAMPLE_MS = 100
/** A cap is a median in this band with at most this spread (p90 minus p10). */
const CAP_BAND: readonly [number, number] = [29, 38]
const CAP_SPREAD_MS = 3
/** Slack on top of a detected cap before a sample counts as over budget. */
const CAP_SLACK_MS = 6
/** Tiers a cap-like interval must persist through before it is believed. */
const CAP_CONFIRM_HITS = 2

/** `knownCap`: a cap already confirmed earlier in this session. */
export function initialGovernor(tier: HeroTier, knownCap = 0): GovernorState {
  return { samples: [], seen: 0, cooldown: 0, tier, cap: knownCap, capState: knownCap > 0 ? 'confirmed' : 'none', capHits: 0, capVerified: false, reason: '' }
}

/** Nearest-rank percentile of a non-empty list; `q` in 0..1. */
export function percentile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return rank(sorted, q)
}

function rank(sorted: readonly number[], q: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))
  return sorted[index] ?? 0
}

function tail(values: readonly number[], n: number): readonly number[] {
  return values.length > n ? values.slice(values.length - n) : values
}

/** The cap of a steady 30 Hz stream, or 0. */
export function detectCap(window: readonly number[]): number {
  if (window.length < ASSEMBLY_WINDOW) return 0
  const sorted = [...window].sort((a, b) => a - b)
  const median = rank(sorted, 0.5)
  if (median < CAP_BAND[0] || median > CAP_BAND[1]) return 0
  return rank(sorted, 0.9) - rank(sorted, 0.1) <= CAP_SPREAD_MS ? median : 0
}

/** Evaluating sorts a window, so it happens every few samples rather than on every frame. */
const EVAL_EVERY = 5

/**
 * One interval in, the next state out. `idle` intervals (the idle ticker) say
 * nothing about the frame budget and are ignored; so is anything that is not a
 * positive finite number or is above `MAX_SAMPLE_MS`.
 */
export function governorStep(state: GovernorState, intervalMs: number, phase: GovernorPhase): GovernorState {
  if (phase === 'idle' || state.tier === 0) return state
  if (!Number.isFinite(intervalMs) || intervalMs <= 0 || intervalMs > MAX_SAMPLE_MS) return state

  const seen = state.seen + 1
  if (seen <= WARMUP_SAMPLES) return { ...state, seen }

  const cooldown = Math.max(0, state.cooldown - 1)
  const samples = tail([...state.samples, intervalMs], FLOOR_WINDOW)
  const held = { ...state, seen, cooldown, samples }
  if (cooldown > 0 || seen % EVAL_EVERY !== 0) return held

  const detected = detectCap(tail(samples, ASSEMBLY_WINDOW))
  const trusted = state.capState === 'confirmed'
  const slack = trusted ? state.cap + CAP_SLACK_MS : 0
  const down = (tier: HeroTier, reason: string, patch: Partial<GovernorState> = {}): GovernorState => ({
    ...state,
    samples: [],
    seen: 0,
    cooldown: COOLDOWN_SAMPLES,
    tier,
    reason,
    ...patch,
  })
  // A stream that stays cap-like after stepping down is a cap; one that changes is a slow GPU that is now fine.
  // A remembered cap must not relax the budget forever: the first full window has to still look like a cap.
  if (state.capState === 'confirmed' && !state.capVerified && tail(samples, ASSEMBLY_WINDOW).length >= ASSEMBLY_WINDOW) {
    const median = percentile(tail(samples, ASSEMBLY_WINDOW), 0.5)
    if (median < CAP_BAND[0] || median > CAP_BAND[1]) return { ...held, capState: 'none', cap: 0, capHits: 0, capVerified: true }
    return { ...held, capVerified: true }
  }
  const calm = state.capState === 'unconfirmed' && detected === 0 ? { ...held, capState: 'none' as const, capHits: 0 } : held

  if (state.tier === 1) {
    if (state.capState !== 'confirmed' && detected > 0 && state.capHits >= 1) return { ...held, capState: 'confirmed', cap: detected, capVerified: true }
    const limit = Math.max(FLOOR_LIMIT_MS, slack)
    const p75 = percentile(samples, 0.75)
    return samples.length >= FLOOR_WINDOW && p75 > limit ? down(0, `p75 ${p75.toFixed(1)} over ${limit.toFixed(0)} ms at tier 1`) : calm
  }
  const assembly = phase === 'assembly'
  const need = assembly ? ASSEMBLY_WINDOW : SCROLL_WINDOW
  const window = tail(samples, need)
  const limit = Math.max(assembly ? ASSEMBLY_LIMIT_MS : SCROLL_LIMIT_MS, slack)
  if (window.length < need) return calm
  const q = assembly ? 0.75 : 0.9
  const value = percentile(window, q)
  if (value <= limit) return calm
  const why = `p${q * 100} ${value.toFixed(1)} over ${limit.toFixed(0)} ms at tier ${state.tier}`
  if (detected === 0) return down((state.tier - 1) as HeroTier, why, { capState: 'none', capHits: 0 })
  // Cap-looking and over budget: a vsync-quantised slow GPU looks exactly like this. Step down and see whether the
  // interval changes; only after it stays put at two lower tiers is it a cap, and then the stepping stops.
  const hits = state.capHits + 1
  if (hits >= CAP_CONFIRM_HITS) return { ...held, capState: 'confirmed', cap: detected, capHits: hits, capVerified: true, reason: `${why}; stayed ${detected.toFixed(1)} ms at lower tiers: a refresh cap` }
  return down((state.tier - 1) as HeroTier, why, { capState: 'unconfirmed', cap: detected, capHits: hits })
}
