/**
 * The hero's one quality ladder — hero monolith spec § 2.4 and § 5.
 *
 * One shading path on every device. Tiers differ only in pixel count (DPR cap),
 * MSAA samples, how many outer dust shards exist, and the idle frame rate. A
 * tier never changes a colour: that is the look-parity guarantee, and it is why
 * the table has no shader-variant column.
 *
 * Tier 0 is "no GL": the poster and nothing else. It is the floor, never a
 * place the engine starts at unless the gate said no.
 */

import type { FallbackRung } from '@/lib/formations/fallback'

export type HeroTier = 0 | 1 | 2 | 3

export interface TierSpec {
  /** Device-pixel-ratio cap, applied to css pixels. */
  readonly dprCap: number
  readonly msaa: 0 | 4
  /** 0..1 fraction of the outer dust shards kept. The slab's own shards are always all drawn. */
  readonly outerDust: number
  /** Whether the floor reflection also mirrors the dust. */
  readonly mirrorDust: boolean
  /** Frame rate of the idle ticker, once the load assembly is over and nobody scrolls. */
  readonly idleFps: number
  /** Ring tube multiplier: without MSAA a hairline shimmers, so it is drawn a little fatter. */
  readonly ringThicken: number
}

export const TIERS: Readonly<Record<Exclude<HeroTier, 0>, TierSpec>> = {
  3: { dprCap: 2.0, msaa: 4, outerDust: 1.0, mirrorDust: true, idleFps: 20, ringThicken: 1.0 },
  2: { dprCap: 1.5, msaa: 4, outerDust: 0.7, mirrorDust: false, idleFps: 20, ringThicken: 1.0 },
  1: { dprCap: 1.0, msaa: 0, outerDust: 0.4, mirrorDust: false, idleFps: 15, ringThicken: 1.4 },
}

/** Desktop and laptop class: this many cores or more, with a fine pointer, starts at tier 3. */
export const DESKTOP_CORES = 8

export interface TierSignals {
  readonly rung: FallbackRung
  /** `(pointer: fine)`. */
  readonly finePointer: boolean
  /** `navigator.hardwareConcurrency`, or null when the browser does not say. */
  readonly cores: number | null
  /** `prefers-reduced-data` or modest hardware: the same signal that picks the 2D `reduced-instances` rung. */
  readonly lowPower: boolean
  /** `?tier=0..3`. Wins over everything (dev and e2e). */
  readonly override: HeroTier | null
}

/**
 * Where the governor starts. A coarse signal only: the frame-time governor
 * (`governor.ts`) moves the tier down from here when the frame does not fit,
 * and never up.
 */
export function initialTier({ rung, finePointer, cores, lowPower, override }: TierSignals): HeroTier {
  if (override !== null) return override
  if (rung !== 'live' && rung !== 'reduced-instances') return 0
  if (lowPower || rung === 'reduced-instances') return 1
  if (finePointer && cores !== null && cores >= DESKTOP_CORES) return 3
  return 2
}

/** `?tier=` as a tier, or null when absent or not 0..3. */
export function tierOverride(search: string): HeroTier | null {
  let raw: string | null = null
  try {
    raw = new URLSearchParams(search).get('tier')
  } catch {
    return null
  }
  return raw === '0' || raw === '1' || raw === '2' || raw === '3' ? (Number(raw) as HeroTier) : null
}

/**
 * How many dust instances to draw. The instance buffer is ordered inside-first,
 * then outer by hash rank, so a tier is a prefix of the next one up: the L1 set
 * is within L2's, which is within L3's.
 */
export function dustCount(tier: Exclude<HeroTier, 0>, inside: number, outer: number): number {
  return inside + Math.floor(outer * TIERS[tier].outerDust)
}
