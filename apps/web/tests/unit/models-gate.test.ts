import { describe, expect, it } from 'vitest'
import {
  hasNoModelsFlag,
  parseTierOverride,
  readTier,
  shouldLoadModels,
  stubTier,
  variantTier,
  type ModelGateInputs,
} from '@/lib/models/gate'

const base: ModelGateInputs = { rung: 'live', glLive: true, tier: 2, saveData: false, effectiveType: '4g', noModels: false }
const with_ = (over: Partial<ModelGateInputs>): ModelGateInputs => ({ ...base, ...over })

describe('shouldLoadModels', () => {
  it('says yes on a live, fast, default device', () => {
    expect(shouldLoadModels(base)).toBe(true)
    expect(shouldLoadModels(with_({ effectiveType: undefined }))).toBe(true)
  })

  it('says no until WebGL is live', () => {
    expect(shouldLoadModels(with_({ glLive: false }))).toBe(false)
  })

  it('says no for ?nomodels=1', () => {
    expect(shouldLoadModels(with_({ noModels: true }))).toBe(false)
  })

  it('says no under reduced motion, even if WebGL somehow mounted', () => {
    expect(shouldLoadModels(with_({ rung: 'reduced-motion' }))).toBe(false)
    expect(shouldLoadModels(with_({ rung: 'reduced-motion', glLive: true, tier: 3 }))).toBe(false)
  })

  it('says no on Save-Data and on 2g', () => {
    expect(shouldLoadModels(with_({ saveData: true }))).toBe(false)
    expect(shouldLoadModels(with_({ effectiveType: '2g' }))).toBe(false)
    expect(shouldLoadModels(with_({ effectiveType: 'slow-2g' }))).toBe(false)
  })

  it('says yes on 3g and the reduced-instances rung (they are capped, not refused)', () => {
    expect(shouldLoadModels(with_({ effectiveType: '3g' }))).toBe(true)
    expect(shouldLoadModels(with_({ rung: 'reduced-instances' }))).toBe(true)
  })
})

describe('variantTier', () => {
  it.each([
    [{}, 2],
    [{ tier: 3 as const }, 3],
    [{ tier: 1 as const }, 1],
    [{ effectiveType: '3g', tier: 3 as const }, 1],
    [{ rung: 'reduced-instances' as const, tier: 3 as const }, 1],
    [{ rung: 'reduced-instances' as const, tier: 1 as const }, 1],
    [{ glLive: false }, null],
    [{ noModels: true }, null],
    [{ saveData: true, tier: 3 as const }, null],
    [{ effectiveType: '2g' }, null],
    [{ rung: 'reduced-motion' as const }, null],
  ])('%j -> %s', (over, expected) => {
    expect(variantTier(with_(over))).toBe(expected)
  })
})

describe('the tier stub', () => {
  it('maps reduced-instances to 1 and live to 2', () => {
    expect(stubTier('reduced-instances')).toBe(1)
    expect(stubTier('live')).toBe(2)
  })

  it('lets ?tier=1|2|3 override it and ignores anything else', () => {
    expect(readTier('live', '?tier=3')).toBe(3)
    expect(readTier('reduced-instances', '?tier=2')).toBe(2)
    expect(readTier('live', '?tier=4')).toBe(2)
    expect(readTier('reduced-instances', '?tier=abc')).toBe(1)
    expect(readTier('live', '')).toBe(2)
    expect(parseTierOverride('?tier=')).toBeNull()
  })

  it('reads ?nomodels=1 and nothing else', () => {
    expect(hasNoModelsFlag('?nomodels=1')).toBe(true)
    expect(hasNoModelsFlag('?a=b&nomodels=1')).toBe(true)
    expect(hasNoModelsFlag('?nomodels=0')).toBe(false)
    expect(hasNoModelsFlag('')).toBe(false)
  })
})
