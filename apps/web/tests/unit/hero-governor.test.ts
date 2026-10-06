import { describe, expect, it } from 'vitest'
import {
  ASSEMBLY_WINDOW,
  COOLDOWN_SAMPLES,
  FLOOR_WINDOW,
  governorStep,
  initialGovernor,
  percentile,
  SCROLL_WINDOW,
  WARMUP_SAMPLES,
  type GovernorPhase,
  type GovernorState,
} from '@/lib/hero/governor'
import type { HeroTier } from '@/lib/hero/tiers'

function feed(state: GovernorState, intervals: readonly number[], phase: GovernorPhase): GovernorState {
  return intervals.reduce((s, ms) => governorStep(s, ms, phase), state)
}
const repeat = (ms: number, n: number): number[] => Array.from({ length: n }, () => ms)

describe('percentile', () => {
  it('is nearest-rank', () => {
    expect(percentile([1, 2, 3, 4], 0.75)).toBe(3)
    expect(percentile([5], 0.9)).toBe(5)
    expect(percentile([10, 1, 5], 0.5)).toBe(5)
  })
})

describe('governorStep', () => {
  it('ignores the warm-up samples, however slow', () => {
    const s = feed(initialGovernor(3), repeat(500, WARMUP_SAMPLES), 'assembly')
    expect(s.tier).toBe(3)
    expect(s.samples).toHaveLength(0)
  })

  it('steps down exactly one tier when the assembly p75 is above 22 ms after 45 samples', () => {
    const warm = feed(initialGovernor(3), repeat(16, WARMUP_SAMPLES), 'assembly')
    const almost = feed(warm, repeat(42, ASSEMBLY_WINDOW - 1), 'assembly')
    expect(almost.tier).toBe(3)
    const stepped = governorStep(almost, 42, 'assembly')
    expect(stepped.tier).toBe(2)
    expect(stepped.cooldown).toBe(COOLDOWN_SAMPLES)
    expect(stepped.samples).toHaveLength(0)
  })

  it('does not step for a p75 of exactly 22 ms or below', () => {
    const s = feed(initialGovernor(3), [...repeat(16, WARMUP_SAMPLES), ...repeat(22, 200)], 'assembly')
    expect(s.tier).toBe(3)
  })

  it('does not move on one slow outlier in a healthy stream', () => {
    const stream = [...repeat(16, WARMUP_SAMPLES), ...repeat(16, 20), 120, ...repeat(16, 30)]
    expect(feed(initialGovernor(3), stream, 'assembly').tier).toBe(3)
  })

  it('never steps more than one tier per 90 samples, then can step again', () => {
    let s = feed(initialGovernor(3), repeat(16, WARMUP_SAMPLES), 'assembly')
    s = feed(s, repeat(40, ASSEMBLY_WINDOW), 'assembly')
    expect(s.tier).toBe(2)
    s = feed(s, repeat(40, WARMUP_SAMPLES + COOLDOWN_SAMPLES - 1), 'assembly')
    expect(s.tier).toBe(2)
    s = feed(s, repeat(40, 1), 'assembly')
    expect(s.tier).toBe(1)
  })

  it('uses a p90 of 28 ms over a rolling 60 while scrolling', () => {
    const warm = feed(initialGovernor(2), repeat(16, WARMUP_SAMPLES), 'scroll')
    // Nine in ten slow is above the limit; a p90 exactly at the limit is not.
    const fine = feed(warm, [...repeat(16, 54), ...repeat(28, 6)], 'scroll')
    expect(fine.tier).toBe(2)
    const slow = feed(warm, [...repeat(16, 5), ...repeat(40, SCROLL_WINDOW - 5)], 'scroll')
    expect(slow.tier).toBe(1)
  })

  it('never raises the tier, whatever the stream', () => {
    const tiers: HeroTier[] = []
    let s = initialGovernor(1)
    for (let i = 0; i < 500; i += 1) {
      s = governorStep(s, i % 7 === 0 ? 8 : 6, 'scroll')
      tiers.push(s.tier)
    }
    expect(tiers.every((t) => t === 1)).toBe(true)
    expect(Math.max(...tiers)).toBeLessThanOrEqual(1)
  })

  it('takes tier 1 to tier 0 only on a p75 above 40 ms over 90 samples', () => {
    const warm = feed(initialGovernor(1), repeat(16, WARMUP_SAMPLES), 'scroll')
    // 30 ms is far over the budget but is not the floor's limit: tier 1 stays.
    expect(feed(warm, repeat(30, 300), 'scroll').tier).toBe(1)
    const before = feed(warm, repeat(50, FLOOR_WINDOW - 1), 'scroll')
    expect(before.tier).toBe(1)
    expect(governorStep(before, 50, 'scroll').tier).toBe(0)
  })

  it('a stable 16 ms stream never moves, on any tier', () => {
    for (const tier of [1, 2, 3] as const) {
      expect(feed(initialGovernor(tier), repeat(16, 1000), 'assembly').tier).toBe(tier)
      expect(feed(initialGovernor(tier), repeat(16.7, 1000), 'scroll').tier).toBe(tier)
    }
  })

  it('drops intervals over 100 ms: a hitch or a hidden tab is not a budget sample', () => {
    const s0 = initialGovernor(3)
    expect(governorStep(s0, 101, 'scroll')).toBe(s0)
    expect(governorStep(s0, 100, 'scroll').seen).toBe(1)
  })

  it('restarts the warm-up after every step down', () => {
    let s = feed(initialGovernor(3), [...repeat(16, WARMUP_SAMPLES), ...repeat(40, ASSEMBLY_WINDOW)], 'assembly')
    expect(s.tier).toBe(2)
    expect(s.seen).toBe(0)
    expect(s.reason).toMatch(/p75 40.0 over 22 ms at tier 3/)
    s = governorStep(s, 16, 'assembly')
    expect(s.seen).toBe(1)
  })

  /** Feeds a stream whose interval depends on the current tier, the way a real device's does. */
  function simulate(start: 1 | 2 | 3, ms: (tier: number, i: number) => number, n: number, phase: GovernorPhase = 'assembly'): GovernorState {
    let s = initialGovernor(start)
    for (let i = 0; i < n; i += 1) s = governorStep(s, ms(s.tier, i), phase)
    return s
  }
  const jitter = (i: number): number => (i % 3) * 0.3

  it('does not trust a cap-looking stream at once: it steps down to test it', () => {
    const s = feed(initialGovernor(3), [...repeat(16, WARMUP_SAMPLES), ...repeat(33.3, ASSEMBLY_WINDOW)], 'assembly')
    expect(s.tier).toBe(2)
    expect(s.capState).toBe('unconfirmed')
  })

  it('a vsync-quantised slow GPU (33 ms at tier 3, 16.7 ms lower) steps down once and is not mistaken for a cap', () => {
    const s = simulate(3, (tier, i) => (tier === 3 ? 33.3 : 16.7) + jitter(i), 600)
    expect(s.tier).toBe(2)
    expect(s.capState).toBe('none')
    expect(simulate(3, (tier, i) => (tier === 3 ? 33.3 : 16.7) + jitter(i), 600, 'scroll').tier).toBe(2)
  })

  it('a true 30 Hz cap that stays 33 ms at every tier is confirmed after two lower tiers, then stepping stops', () => {
    const s = simulate(3, (_t, i) => 33.3 + jitter(i), 900)
    expect(s.capState).toBe('confirmed')
    expect(s.tier).toBe(1)
    expect(s.cap).toBeGreaterThan(32)
    const more = feed(s, Array.from({ length: 600 }, (_, i) => 33.3 + jitter(i)), 'scroll')
    expect(more.tier).toBe(1)
    expect(more.cap).toBe(s.cap)
  })

  it('from tier 2 a persisting cap is confirmed at tier 1, the last tier there is', () => {
    const s = simulate(2, (_t, i) => 33.3 + jitter(i), 600, 'scroll')
    expect(s.tier).toBe(1)
    expect(s.capState).toBe('confirmed')
  })

  it('a cap confirmed earlier in the session is trusted from the start', () => {
    const s = feed(initialGovernor(2, 33.3), Array.from({ length: 300 }, (_, i) => 33.3 + jitter(i)), 'assembly')
    expect(s.tier).toBe(2)
    expect(s.capState).toBe('confirmed')
  })

  it('still steps down a ragged 33 ms stream: a cap is steady, a struggling GPU is not', () => {
    const ragged = Array.from({ length: 300 }, (_, i) => (i % 2 === 0 ? 20 : 48))
    expect(feed(initialGovernor(2), ragged, 'assembly').tier).toBeLessThan(2)
  })

  it('ignores idle intervals, and bad numbers', () => {
    const s0 = initialGovernor(3)
    expect(governorStep(s0, 500, 'idle')).toBe(s0)
    expect(governorStep(s0, Number.NaN, 'scroll')).toBe(s0)
    expect(governorStep(s0, 0, 'scroll')).toBe(s0)
    expect(governorStep(s0, Infinity, 'scroll')).toBe(s0)
  })

  it('is inert at tier 0', () => {
    const s0 = initialGovernor(0)
    expect(governorStep(s0, 16, 'scroll')).toBe(s0)
  })
})
