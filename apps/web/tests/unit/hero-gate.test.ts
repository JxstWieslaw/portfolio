import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSaveData, shouldMountWebGL } from '@/lib/assembly/capabilities'
import { FALLBACK_RUNGS } from '@/lib/formations/fallback'
import { heroFlagOn, shouldMountHero } from '@/lib/hero/gate'

const on = { rung: 'live', webgl2: true, noGl: false, saveData: false, flag: true } as const

describe('shouldMountHero', () => {
  it.each([
    ['live, everything on', on, true],
    ['reduced-instances still mounts', { ...on, rung: 'reduced-instances' }, true],
    ['the flag is off', { ...on, flag: false }, false],
    ['reduced motion never mounts', { ...on, rung: 'reduced-motion' }, false],
    ['static rung', { ...on, rung: 'static' }, false],
    ['wash rung', { ...on, rung: 'wash' }, false],
    ['no WebGL2', { ...on, webgl2: false }, false],
    ['?nogl=1', { ...on, noGl: true }, false],
    ['Save-Data', { ...on, saveData: true }, false],
  ] as const)('%s -> %s', (_name, inputs, expected) => {
    expect(shouldMountHero(inputs)).toBe(expected)
  })

  it('needs the flag on every rung', () => {
    for (const rung of FALLBACK_RUNGS) expect(shouldMountHero({ ...on, rung, flag: false })).toBe(false)
  })
})

describe('Save-Data in the Assembly gate', () => {
  it('stops the whole Assembly, not just the hero (a behaviour change)', () => {
    expect(shouldMountWebGL({ rung: 'live', webgl2: true, noGl: false, saveData: true })).toBe(false)
    expect(shouldMountWebGL({ rung: 'live', webgl2: true, noGl: false, saveData: false })).toBe(true)
    expect(shouldMountWebGL({ rung: 'live', webgl2: true, noGl: false })).toBe(true)
  })
})

describe('readSaveData', () => {
  const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'connection')
  afterEach(() => {
    if (original) Object.defineProperty(Navigator.prototype, 'connection', original)
    else Reflect.deleteProperty(Navigator.prototype, 'connection')
  })
  const set = (value: unknown): void => {
    Object.defineProperty(Navigator.prototype, 'connection', { configurable: true, get: () => value })
  }

  it('reads Save-Data and 2g, and treats a missing API as no signal', () => {
    expect(readSaveData()).toBe(false)
    set({ saveData: true })
    expect(readSaveData()).toBe(true)
    set({ effectiveType: 'slow-2g' })
    expect(readSaveData()).toBe(true)
    set({ effectiveType: '2g' })
    expect(readSaveData()).toBe(true)
    set({ effectiveType: '4g', saveData: false })
    expect(readSaveData()).toBe(false)
  })
})

describe('heroFlagOn', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is off by default', () => {
    expect(heroFlagOn('')).toBe(false)
    expect(heroFlagOn('?hero=b')).toBe(false)
    expect(heroFlagOn('?hero=off')).toBe(false)
  })

  it('turns on with ?hero=a', () => {
    expect(heroFlagOn('?hero=a')).toBe(true)
    expect(heroFlagOn('?x=1&hero=a&perf=1')).toBe(true)
  })

  it('turns on with NEXT_PUBLIC_HERO=monolith', () => {
    vi.stubEnv('NEXT_PUBLIC_HERO', 'monolith')
    expect(heroFlagOn('')).toBe(true)
  })
})
