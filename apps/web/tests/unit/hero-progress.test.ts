import { describe, expect, it } from 'vitest'
import { assemblyS, cameraFor, heroWeight, loadAt, LOAD_SECONDS, ringK, scrollP, smoothstep } from '@/lib/hero/progress'

describe('assemblyS', () => {
  it('is fully assembled at the top once loaded', () => {
    expect(assemblyS(1, 0)).toBe(1)
  })

  it('is monotone in load', () => {
    let last = -1
    for (let i = 0; i <= 20; i += 1) {
      const s = assemblyS(i / 20, 0.3)
      expect(s).toBeGreaterThanOrEqual(last)
      last = s
    }
  })

  it('falls as the page scrolls and never below 0.35', () => {
    let last = 2
    for (let i = 0; i <= 20; i += 1) {
      const s = assemblyS(1, i / 20)
      expect(s).toBeLessThanOrEqual(last)
      last = s
    }
    expect(assemblyS(1, 1)).toBeCloseTo(0.35, 10)
  })

  it('reassembles on the way back up: it depends only on p, not on history', () => {
    expect(assemblyS(1, 0.5)).toBe(assemblyS(1, 0.5))
  })
})

describe('heroWeight', () => {
  it('is 1 up to p = 0.55 and 0 at p = 1', () => {
    expect(heroWeight(0)).toBe(1)
    expect(heroWeight(0.55)).toBe(1)
    expect(heroWeight(1)).toBe(0)
  })
})

describe('ringK', () => {
  it('matches the lab smoothstep(0.12, 0.72) at its edges and middle', () => {
    expect(ringK(0.12)).toBe(0)
    expect(ringK(0.72)).toBe(1)
    expect(ringK(0.42)).toBeCloseTo(0.5, 10)
  })
})

describe('scrollP and loadAt', () => {
  it('p is scrollY over 0.9 viewports, clamped, and 0 for a zero-height viewport', () => {
    expect(scrollP(0, 800)).toBe(0)
    expect(scrollP(360, 800)).toBeCloseTo(0.5, 10)
    expect(scrollP(5000, 800)).toBe(1)
    expect(scrollP(100, 0)).toBe(0)
  })

  it('load eases out over 2.6 seconds', () => {
    expect(loadAt(0)).toBe(0)
    expect(loadAt(LOAD_SECONDS)).toBe(1)
    expect(loadAt(99)).toBe(1)
    expect(loadAt(LOAD_SECONDS / 2)).toBeCloseTo(0.875, 10)
  })

  it('smoothstep clamps', () => {
    expect(smoothstep(0, 1, -3)).toBe(0)
    expect(smoothstep(0, 1, 3)).toBe(1)
  })
})

describe('cameraFor', () => {
  const rest = { x: 0.5, y: 0.5, active: 0 }

  it('is the lab camera at rest, assembled, at time zero', () => {
    const c = cameraFor(1, 0, 0, rest)
    expect(c.yaw).toBeCloseTo(0.42, 10)
    expect(c.pitch).toBeCloseTo(0.17, 10)
    expect(c.dist).toBe(11)
    expect(c.focal).toBe(2.7)
  })

  it('pulls back and turns as the monolith disperses', () => {
    expect(cameraFor(0, 0, 0, rest).dist).toBeCloseTo(12.6, 10)
    expect(cameraFor(0, 0, 0, rest).yaw).toBeGreaterThan(cameraFor(1, 0, 0, rest).yaw)
  })

  it('slides the yaw with scroll so the reflections travel across the faces', () => {
    expect(cameraFor(1, 1, 0, rest).yaw - cameraFor(1, 0, 0, rest).yaw).toBeCloseTo(0.5, 10)
  })

  it('moves with the pointer only when it is active (a fine pointer)', () => {
    const off = cameraFor(1, 0, 0, { x: 1, y: 1, active: 0 })
    const on = cameraFor(1, 0, 0, { x: 1, y: 1, active: 1 })
    expect(off.yaw).toBe(cameraFor(1, 0, 0, rest).yaw)
    expect(on.yaw - off.yaw).toBeCloseTo(0.45, 10)
    expect(on.pitch - off.pitch).toBeCloseTo(0.14, 10)
  })
})
