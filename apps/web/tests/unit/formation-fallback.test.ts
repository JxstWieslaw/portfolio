import { describe, expect, it } from 'vitest'
import {
  animatesAt,
  crossFadesAt,
  FALLBACK_RUNGS,
  instanceKeep,
  REDUCED_KEEP,
  resolveRung,
  type CapabilitySnapshot,
} from '@/lib/formations/fallback'

/**
 * The ladder is a table, so it is tested as one. Reconciliation § 5.1:
 * live -> reduced instances -> reduced-motion static -> static, no cross-fade
 * -> radial accent wash alone.
 */
const FULL: CapabilitySnapshot = {
  canvas2d: true,
  intersectionObserver: true,
  reducedMotion: false,
  lowPower: false,
}

describe('the fallback ladder', () => {
  it('lists five rungs, most capable first', () => {
    expect(FALLBACK_RUNGS).toEqual(['live', 'reduced-instances', 'reduced-motion', 'static', 'wash'])
  })

  it.each([
    ['a capable browser', FULL, 'live'],
    ['modest hardware', { ...FULL, lowPower: true }, 'reduced-instances'],
    ['reduced motion', { ...FULL, reducedMotion: true }, 'reduced-motion'],
    ['no IntersectionObserver', { ...FULL, intersectionObserver: false }, 'static'],
    ['no 2D context', { ...FULL, canvas2d: false }, 'wash'],
  ] as const)('puts %s on the %s rung', (_label, caps, rung) => {
    expect(resolveRung(caps)).toBe(rung)
  })

  it('lets the least capable signal win when several apply at once', () => {
    expect(resolveRung({ canvas2d: false, intersectionObserver: false, reducedMotion: true, lowPower: true })).toBe('wash')
    expect(resolveRung({ ...FULL, intersectionObserver: false, reducedMotion: true })).toBe('static')
    expect(resolveRung({ ...FULL, reducedMotion: true, lowPower: true })).toBe('reduced-motion')
  })

  it('never animates below the reduced-instance rung', () => {
    expect(animatesAt('live')).toBe(true)
    expect(animatesAt('reduced-instances')).toBe(true)
    // Reduced motion is not "slower motion". The loop never starts.
    expect(animatesAt('reduced-motion')).toBe(false)
    expect(animatesAt('static')).toBe(false)
    expect(animatesAt('wash')).toBe(false)
  })

  it('keeps the opacity cross-fade under reduced motion but drops it at rung 4', () => {
    // --d-crossfade is deliberately outside the reduced-motion override.
    expect(crossFadesAt('reduced-motion')).toBe(true)
    expect(crossFadesAt('static')).toBe(false)
    expect(crossFadesAt('wash')).toBe(false)
  })

  it('thins the instance count from the hardware signal, not the rung', () => {
    expect(instanceKeep(FULL)).toBe(1)
    expect(instanceKeep({ ...FULL, lowPower: true })).toBe(REDUCED_KEEP)
    // A modest device under reduced motion still gets the lighter cloud.
    expect(instanceKeep({ ...FULL, lowPower: true, reducedMotion: true })).toBe(REDUCED_KEEP)
  })
})
