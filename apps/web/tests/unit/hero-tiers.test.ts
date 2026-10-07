import { describe, expect, it } from 'vitest'
import { buildDust } from '@/lib/hero/geometry'
import { dustCount, initialTier, TIERS, tierOverride, type TierSignals } from '@/lib/hero/tiers'

const base: TierSignals = { rung: 'live', finePointer: false, cores: 8, lowPower: false, override: null }

describe('TIERS', () => {
  it('matches the spec table, one shading path: only resolution and density differ', () => {
    expect(TIERS[3]).toEqual({ dprCap: 2, msaa: 4, outerDust: 1, mirrorDust: true, idleFps: 20, ringThicken: 1 })
    expect(TIERS[2]).toEqual({ dprCap: 1.5, msaa: 4, outerDust: 0.7, mirrorDust: false, idleFps: 20, ringThicken: 1 })
    expect(TIERS[1]).toEqual({ dprCap: 1, msaa: 0, outerDust: 0.4, mirrorDust: false, idleFps: 15, ringThicken: 1.4 })
  })

  it('every tier step costs less: dpr, msaa, dust and fps never rise going down', () => {
    expect(TIERS[3].dprCap).toBeGreaterThan(TIERS[2].dprCap)
    expect(TIERS[2].dprCap).toBeGreaterThan(TIERS[1].dprCap)
    expect(TIERS[3].outerDust).toBeGreaterThan(TIERS[2].outerDust)
    expect(TIERS[2].outerDust).toBeGreaterThan(TIERS[1].outerDust)
  })
})

describe('initialTier', () => {
  it.each([
    ['a desktop: fine pointer, 8 cores', { finePointer: true, cores: 8 }, 3],
    ['a laptop with 12 cores', { finePointer: true, cores: 12 }, 3],
    ['a fine pointer with 6 cores', { finePointer: true, cores: 6 }, 2],
    ['a phone: touch, 8 cores', { finePointer: false, cores: 8 }, 2],
    ['a phone that does not say its cores', { finePointer: false, cores: null }, 2],
    ['a desktop that does not say its cores', { finePointer: true, cores: null }, 2],
    ['low power, even on a desktop', { finePointer: true, cores: 16, lowPower: true }, 1],
    ['the reduced-instances rung', { rung: 'reduced-instances', finePointer: true, cores: 16 }, 1],
    ['reduced motion', { rung: 'reduced-motion' }, 0],
    ['no canvas', { rung: 'wash' }, 0],
    ['an override beats everything', { rung: 'reduced-motion', override: 3 }, 3],
    ['override 0', { finePointer: true, cores: 16, override: 0 }, 0],
  ] as const)('%s -> tier %s', (_name, patch, expected) => {
    expect(initialTier({ ...base, ...patch } as TierSignals)).toBe(expected)
  })
})

describe('tierOverride', () => {
  it('reads ?tier=0..3 and nothing else', () => {
    expect(tierOverride('?tier=2')).toBe(2)
    expect(tierOverride('?hero=a&tier=0')).toBe(0)
    expect(tierOverride('?tier=4')).toBeNull()
    expect(tierOverride('?tier=')).toBeNull()
    expect(tierOverride('?tier=x')).toBeNull()
    expect(tierOverride('')).toBeNull()
  })
})

describe('dustCount', () => {
  const { inside, outer } = buildDust()

  it('always draws every slab shard, thinning only the outer halo', () => {
    for (const tier of [1, 2, 3] as const) expect(dustCount(tier, inside, outer)).toBeGreaterThanOrEqual(inside)
    expect(dustCount(3, inside, outer)).toBe(inside + outer)
  })

  it('nests: the L1 set is within L2, which is within L3', () => {
    const [l1, l2, l3] = [1, 2, 3].map((t) => dustCount(t as 1 | 2 | 3, inside, outer)) as [number, number, number]
    expect(l1).toBeLessThan(l2)
    expect(l2).toBeLessThan(l3)
    expect(l1 - inside).toBe(Math.floor(outer * 0.4))
    expect(l2 - inside).toBe(Math.floor(outer * 0.7))
  })
})
