import { describe, expect, it } from 'vitest'
import { SURGE_REST, surgeStep } from '@/lib/hero/surge'

const VH = 800

/** Scrolls at `speed` viewport heights per second for `seconds`, one frame per 16 ms. */
function run(speed: number, seconds: number, from = SURGE_REST) {
  let s = from
  let y = Number.isNaN(from.y) ? 0 : from.y
  let t = Number.isNaN(from.t) ? 0 : from.t
  s = surgeStep(s, y, t, VH)
  for (let i = 0; i < (seconds * 1000) / 16; i += 1) {
    t += 16
    y += speed * VH * 0.016
    s = surgeStep(s, y, t, VH)
  }
  return s
}

describe('surgeStep', () => {
  it('is exactly 0, and stays 0, at rest', () => {
    const s = run(0, 2)
    expect(s.weight).toBe(0)
    expect(s.surge).toBe(0)
  })

  it('ignores a reading speed (inside the dead zone)', () => {
    expect(run(0.1, 1).surge).toBe(0)
  })

  it('rises with scroll speed and integrates into surge', () => {
    const slow = run(1, 0.5)
    const fast = run(3.5, 0.5)
    expect(slow.weight).toBeGreaterThan(0)
    expect(fast.weight).toBeGreaterThan(slow.weight)
    expect(fast.weight).toBeLessThanOrEqual(1)
    expect(fast.surge).toBeGreaterThan(slow.surge)
  })

  it('lets go after the scroll stops, and then stops growing', () => {
    const moving = run(3, 0.5)
    const rested = run(0, 3, { ...moving })
    expect(rested.weight).toBe(0)
    const later = run(0, 1, { ...rested })
    expect(later.surge).toBe(rested.surge)
  })

  it('is symmetric: scrolling up surges like scrolling down', () => {
    expect(run(-2, 0.5).weight).toBeCloseTo(run(2, 0.5).weight, 6)
  })

  it('treats an anchor jump and a stalled frame as a jump, not a speed', () => {
    const at = surgeStep(surgeStep(SURGE_REST, 0, 0, VH), 5000, 16, VH)
    expect(at.weight).toBe(0)
    const stalled = surgeStep(surgeStep(SURGE_REST, 0, 0, VH), 100, 2000, VH)
    expect(stalled.weight).toBe(0)
  })

  it('holds 0 under reduced motion', () => {
    const moving = run(3, 0.5)
    const held = surgeStep(moving, moving.y + 500, moving.t + 16, VH, true)
    expect(held.weight).toBe(0)
    expect(held.surge).toBe(moving.surge)
  })
})
