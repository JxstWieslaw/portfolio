import { describe, expect, it } from 'vitest'
import {
  VELOCITY_DEADZONE,
  VELOCITY_EPSILON,
  VELOCITY_FALL,
  VELOCITY_FULL,
  VELOCITY_MAX_GAP,
  VELOCITY_RISE,
  VELOCITY_WINDOW,
  velocityWeight,
} from '@/lib/assembly/motion'
import {
  SURGE_DEADZONE,
  SURGE_EPSILON,
  SURGE_FALL,
  SURGE_FULL,
  SURGE_MAX_GAP,
  SURGE_REST,
  SURGE_RISE,
  SURGE_WINDOW,
  surgeStep,
  surgeWeight,
  type SurgeState,
} from '@/lib/hero/surge'

const VH = 800

/** Scrolls at `speed` viewport heights per second for `seconds` at `hz` frames per second, from a given state. */
function run(speed: number, seconds: number, from: SurgeState = SURGE_REST, hz = 60, y0 = 0, t0 = 0) {
  const dt = 1000 / hz
  let s = surgeStep(from, y0, t0, VH)
  let y = y0
  let t = t0
  for (let i = 0; i < seconds * hz; i += 1) {
    t += dt
    y += speed * VH * (dt / 1000)
    s = surgeStep(s, y, t, VH)
  }
  return { s, y, t }
}

describe('surgeStep', () => {
  it('is exactly 0, and stays 0, at rest', () => {
    const { s } = run(0, 2)
    expect(s.weight).toBe(0)
    expect(s.surge).toBe(0)
  })

  it('ignores a reading speed (inside the dead zone)', () => {
    expect(run(0.1, 1).s.surge).toBe(0)
  })

  it('rises with scroll speed and integrates into surge', () => {
    const slow = run(1, 0.5).s
    const fast = run(3.5, 0.5).s
    expect(slow.weight).toBeGreaterThan(0)
    expect(fast.weight).toBeGreaterThan(slow.weight)
    expect(fast.weight).toBeLessThanOrEqual(1)
    expect(fast.surge).toBeGreaterThan(slow.surge)
  })

  it('lets go after the scroll stops, and then stops growing', () => {
    const moving = run(3, 0.5)
    const rested = run(0, 3, moving.s, 60, moving.y, moving.t)
    expect(rested.s.weight).toBe(0)
    const later = run(0, 1, rested.s, 60, rested.y, rested.t)
    expect(later.s.surge).toBe(rested.s.surge)
  })

  it('is symmetric: scrolling up surges like scrolling down', () => {
    expect(run(-2, 0.5).s.weight).toBeCloseTo(run(2, 0.5).s.weight, 6)
  })

  it('is refresh-rate independent: the same scroll gives the same weight and surge at 60, 90, 120, 144 and 240 Hz', () => {
    for (const speed of [0.5, 1.5, 2.5, 3.5]) {
      const ref = run(speed, 2, SURGE_REST, 60).s
      for (const hz of [90, 120, 144, 240]) {
        const s = run(speed, 2, SURGE_REST, hz).s
        expect(s.weight).toBeCloseTo(ref.weight, 1)
        expect(Math.abs(s.surge - ref.surge) / Math.max(ref.surge, 1e-9)).toBeLessThan(0.1)
      }
      expect(ref.weight).toBeCloseTo(surgeWeight(speed), 1)
    }
  })

  it('does not read a whole-pixel step as a speed at any refresh rate (60 px/s on a 600 px viewport)', () => {
    for (const hz of [60, 144, 240]) {
      let s = surgeStep(SURGE_REST, 0, 0, 600)
      let y = 0
      let next = 1 / 60
      let peak = 0
      for (let i = 1; i <= hz * 3; i += 1) {
        const t = i / hz
        if (t >= next) {
          y += 1
          next += 1 / 60
        }
        s = surgeStep(s, y, t * 1000, 600)
        peak = Math.max(peak, s.weight)
      }
      expect(peak).toBe(0)
    }
    expect(SURGE_WINDOW).toBeLessThan(1 / 30)
  })

  it('treats an anchor jump of a whole viewport inside one window as a jump, not a speed', () => {
    const at = surgeStep(surgeStep(SURGE_REST, 0, 0, VH), VH * 3, 17, VH)
    expect(at.weight).toBe(0)
  })

  it('a stalled gap from a moving state is not a speed', () => {
    const moving = run(3, 0.5)
    expect(moving.s.weight).toBeGreaterThan(0.3)
    const gap = (SURGE_MAX_GAP + 0.1) * 1000
    // 0.9 viewports over 0.6 s would be a real 1.5 vh/s if the gap were read as a speed.
    expect(surgeWeight((VH * 0.9) / VH / (SURGE_MAX_GAP + 0.1))).toBeGreaterThan(0)
    const after = surgeStep(moving.s, moving.y + VH * 0.9, moving.t + gap, VH)
    expect(after.target).toBe(0)
    expect(after.weight).toBeLessThan(moving.s.weight)
  })
})

describe('the copies of the cubes scroll-speed constants', () => {
  it('match lib/assembly/motion, so the cubes and the hero agree on what fast is', () => {
    expect(SURGE_FULL).toBe(VELOCITY_FULL)
    expect(SURGE_DEADZONE).toBe(VELOCITY_DEADZONE)
    expect(SURGE_RISE).toBe(VELOCITY_RISE)
    expect(SURGE_FALL).toBe(VELOCITY_FALL)
    expect(SURGE_MAX_GAP).toBe(VELOCITY_MAX_GAP)
    expect(SURGE_EPSILON).toBe(VELOCITY_EPSILON)
    expect(SURGE_WINDOW).toBe(VELOCITY_WINDOW)
    for (const v of [0, 0.1, 0.15, 0.5, 2, 3.9, 4, 9, -2, Number.NaN]) expect(surgeWeight(v)).toBe(velocityWeight(v))
  })
})
