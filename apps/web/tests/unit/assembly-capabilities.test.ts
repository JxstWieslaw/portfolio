import { describe, expect, it } from 'vitest'
import { hasNoGlFlag, probeWebGL2, shouldMountWebGL } from '@/lib/assembly/capabilities'
import { FALLBACK_RUNGS } from '@/lib/formations/fallback'

describe('shouldMountWebGL', () => {
  it.each([
    ['live', true, false, true],
    ['reduced-instances', true, false, true],
    ['reduced-motion', true, false, false],
    ['static', true, false, false],
    ['wash', true, false, false],
    ['live', false, false, false],
    ['live', true, true, false],
    ['reduced-instances', false, true, false],
  ] as const)('rung=%s webgl2=%s noGl=%s -> %s', (rung, webgl2, noGl, expected) => {
    expect(shouldMountWebGL({ rung, webgl2, noGl })).toBe(expected)
  })

  it('never mounts under Save-Data: the lazy 3D chunk is decoration', () => {
    expect(shouldMountWebGL({ rung: 'live', webgl2: true, noGl: false, saveData: true })).toBe(false)
    expect(shouldMountWebGL({ rung: 'reduced-instances', webgl2: true, noGl: false, saveData: false })).toBe(true)
  })

  it('never mounts under prefers-reduced-motion, whatever else is true', () => {
    expect(shouldMountWebGL({ rung: 'reduced-motion', webgl2: true, noGl: false })).toBe(false)
  })

  it('needs both WebGL2 and no kill switch on every rung', () => {
    for (const rung of FALLBACK_RUNGS) {
      expect(shouldMountWebGL({ rung, webgl2: false, noGl: false })).toBe(false)
      expect(shouldMountWebGL({ rung, webgl2: true, noGl: true })).toBe(false)
    }
  })
})

describe('hasNoGlFlag', () => {
  it('reads ?nogl=1 and nothing else', () => {
    expect(hasNoGlFlag('?nogl=1')).toBe(true)
    expect(hasNoGlFlag('?utm=x&nogl=1')).toBe(true)
    expect(hasNoGlFlag('?nogl=0')).toBe(false)
    expect(hasNoGlFlag('')).toBe(false)
  })
})

describe('probeWebGL2', () => {
  it('treats a null context and a throwing getContext the same way', () => {
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'getContext', { configurable: true, value: () => null })
    expect(probeWebGL2(canvas)).toBe(false)
    Object.defineProperty(canvas, 'getContext', {
      configurable: true,
      value: () => {
        throw new Error('blocked')
      },
    })
    expect(probeWebGL2(canvas)).toBe(false)
    Object.defineProperty(canvas, 'getContext', { configurable: true, value: () => ({}) })
    expect(probeWebGL2(canvas)).toBe(true)
  })
})
