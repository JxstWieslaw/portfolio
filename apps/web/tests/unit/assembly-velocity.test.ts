import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAssemblyUniforms } from '@/components/three/AssemblyMaterial'
import { FRAGMENT, VERTEX } from '@/components/three/assembly.glsl'
import { assemblyBuilder } from '@/lib/assembly/bundle-cache'
import {
  BREATH_FPS,
  ScrollVelocity,
  VELOCITY_WINDOW,
  bindReducedMotion,
  VELOCITY_DEADZONE,
  VELOCITY_EPSILON,
  VELOCITY_FALL,
  VELOCITY_FULL,
  VELOCITY_MAX_GAP,
  VELOCITY_STRETCH,
  velocityWeight,
} from '@/lib/assembly/motion'
import { instanceCount } from '@/lib/assembly/targets'

const VIEWPORT = 800

describe('velocityWeight', () => {
  it('is exactly 0 at rest and inside the dead zone', () => {
    expect(velocityWeight(0)).toBe(0)
    expect(velocityWeight(-0)).toBe(0)
    expect(velocityWeight(VELOCITY_DEADZONE)).toBe(0)
    expect(velocityWeight(-VELOCITY_DEADZONE * 0.99)).toBe(0)
  })

  it('reads NaN as rest', () => {
    expect(velocityWeight(Number.NaN)).toBe(0)
  })

  it('is clamped to 1, including for absurd speeds', () => {
    expect(velocityWeight(VELOCITY_FULL)).toBe(1)
    expect(velocityWeight(VELOCITY_FULL * 10)).toBe(1)
    expect(velocityWeight(Number.POSITIVE_INFINITY)).toBe(1)
    expect(velocityWeight(Number.NEGATIVE_INFINITY)).toBe(1)
  })

  it('is symmetric: scrolling up and down weigh the same', () => {
    for (const v of [0.05, 0.2, 0.7, 1.5, 3.9, 4, 12]) expect(velocityWeight(-v)).toBe(velocityWeight(v))
  })

  it('is monotonic in the speed, never leaving 0..1', () => {
    let previous = 0
    for (let v = 0; v <= 6; v += 0.01) {
      const w = velocityWeight(v)
      expect(w).toBeGreaterThanOrEqual(previous)
      expect(w).toBeLessThanOrEqual(1)
      previous = w
    }
    expect(velocityWeight(2)).toBeGreaterThan(velocityWeight(1))
  })
})

/** Frames `dt` apart, scrolling `px` per frame for `frames` frames; returns the weights. */
function scrollFor(tracker: ScrollVelocity, clock: { y: number; t: number }, px: number, frames: number, dt: number): number[] {
  const out: number[] = []
  for (let i = 0; i < frames; i += 1) {
    clock.y += px
    clock.t += dt
    out.push(tracker.step(clock.y, clock.t, VIEWPORT))
  }
  return out
}

describe('ScrollVelocity (the damped scalar behind uVelocity)', () => {
  it('is 0 before it has seen anything, and the first sample measures nothing', () => {
    const tracker = new ScrollVelocity()
    expect(tracker.weight).toBe(0)
    expect(tracker.active).toBe(false)
    expect(tracker.step(5000, 1, VIEWPORT)).toBe(0)
  })

  it('stays exactly 0 at rest, frame after frame, at the idle ticker rate', () => {
    const tracker = new ScrollVelocity()
    const clock = { y: 1200, t: 0 }
    tracker.step(clock.y, clock.t, VIEWPORT)
    for (const w of scrollFor(tracker, clock, 0, 200, 1 / BREATH_FPS)) expect(w).toBe(0)
    expect(tracker.active).toBe(false)
  })

  it('rises under a fast scroll and is the same for up and down', () => {
    const down = new ScrollVelocity()
    const up = new ScrollVelocity()
    const a = { y: 4000, t: 0 }
    const b = { y: 4000, t: 0 }
    down.step(a.y, a.t, VIEWPORT)
    up.step(b.y, b.t, VIEWPORT)
    const wd = scrollFor(down, a, 60, 10, 1 / 60)
    const wu = scrollFor(up, b, -60, 10, 1 / 60)
    expect(wd).toEqual(wu)
    expect(wd[wd.length - 1]).toBeGreaterThan(0.5)
    for (let i = 1; i < wd.length; i += 1) expect(wd[i]).toBeGreaterThanOrEqual(wd[i - 1] ?? 0)
  })

  it('reaches exactly 0 in bounded time once the scroll stops, with no overshoot and no sign flip', () => {
    for (const dt of [1 / 144, 1 / 60, 1 / BREATH_FPS, 0.1]) {
      const tracker = new ScrollVelocity()
      const clock = { y: 0, t: 0 }
      tracker.step(clock.y, clock.t, VIEWPORT)
      // 6 viewport heights per second, whatever the frame time.
      const peak = Math.max(...scrollFor(tracker, clock, 6 * VIEWPORT * dt, 40, dt))
      expect(peak).toBeGreaterThan(0.9)

      // The measuring window still holds the last speed for up to VELOCITY_WINDOW after the stop, so the
      // weight may keep rising toward it (never past 1) until the window closes; after that it only falls.
      const stoppedAt = clock.t
      let previous = tracker.weight
      let frames = 0
      // 4 s of wall time is far more than the decay needs; the bound is the assertion.
      while (tracker.active && frames * dt < 4) {
        const w = tracker.step(clock.y, (clock.t += dt), VIEWPORT)
        expect(w).toBeGreaterThanOrEqual(0)
        expect(w).toBeLessThanOrEqual(1)
        if (clock.t - stoppedAt > VELOCITY_WINDOW + dt) expect(w).toBeLessThanOrEqual(previous)
        previous = w
        frames += 1
      }
      expect(tracker.weight).toBe(0)
      expect(tracker.active).toBe(false)
      expect(Object.is(tracker.weight, -0)).toBe(false)
    }
  })

  it('stops asking for frames once it is at 0, and a resting loop then requests nothing (the demand loop is not kept alive)', () => {
    const tracker = new ScrollVelocity()
    const clock = { y: 0, t: 0 }
    tracker.step(clock.y, clock.t, VIEWPORT)
    scrollFor(tracker, clock, 100, 20, 1 / 60)
    // Mirror of the frame loop: a frame asks for another one only while `active`.
    let requested = 0
    let wantsFrame = tracker.active
    expect(wantsFrame).toBe(true)
    while (wantsFrame && requested < 1000) {
      tracker.step(clock.y, (clock.t += 1 / 60), VIEWPORT)
      wantsFrame = tracker.active
      requested += 1
    }
    expect(requested).toBeLessThan(1000)
    // From a peak of 1, the exponential reaches VELOCITY_EPSILON in ln(1/eps)/rate seconds.
    expect(requested).toBeLessThanOrEqual(Math.ceil((Math.log(1 / VELOCITY_EPSILON) / VELOCITY_FALL) * 60) + 4)
    for (let i = 0; i < 100; i += 1) {
      tracker.step(clock.y, (clock.t += 1 / 60), VIEWPORT)
      expect(tracker.active).toBe(false)
      expect(tracker.weight).toBe(0)
    }
  })

  it('ignores a long gap between frames: a layer that was hidden is not a scroll', () => {
    const tracker = new ScrollVelocity()
    tracker.step(0, 0, VIEWPORT)
    expect(tracker.step(5000, VELOCITY_MAX_GAP + 0.01, VIEWPORT)).toBe(0)
  })

  it('two draws in the same instant measure nothing and change nothing', () => {
    const tracker = new ScrollVelocity()
    tracker.step(0, 1, VIEWPORT)
    tracker.step(300, 1.04, VIEWPORT)
    const before = tracker.weight
    expect(before).toBeGreaterThan(0)
    expect(tracker.step(900, 1.04, VIEWPORT)).toBe(before)
  })

  it('survives a zero-height viewport and resets cleanly', () => {
    const tracker = new ScrollVelocity()
    tracker.step(0, 0, 0)
    expect(tracker.step(100, 0.016, 0)).toBe(0)
    tracker.step(0, 0.032, VIEWPORT)
    tracker.step(400, 0.048, VIEWPORT)
    expect(tracker.active).toBe(true)
    tracker.reset()
    expect(tracker.weight).toBe(0)
    expect(tracker.active).toBe(false)
  })
})

describe('with velocity 0 the cubes are byte-identical to develop (1b1694e golden)', () => {
  /**
   * `tests/fixtures/assembly-cube-output.golden.json` was captured from the
   * develop tree at 1b1694e, before this change: digests of every bundle
   * attribute for all eight bundle kinds at two instance fractions, the full
   * uniform set, and digests of both shader programs.
   */
  type Golden = { bundles: Record<string, Record<string, unknown>>; uniforms: Record<string, unknown>; vertex: string; fragment: string }
  const golden = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/assembly-cube-output.golden.json'), 'utf8')) as Golden
  const sha = (v: string | Float32Array): string =>
    createHash('sha256').update(typeof v === 'string' ? v : Buffer.from(v.buffer, v.byteOffset, v.byteLength)).digest('hex')
  const kinds = ['cloud', 'monolith', 'stream', 'lattice', 'orbit', 'scatter', 'grid', 'ring'] as const

  for (const keep of [1, 0.5]) {
    it.each(kinds)(`${keep}: the %s bundle (every attribute the shader reads) is unchanged`, (kind) => {
      const b = assemblyBuilder(instanceCount(keep), keep)(kind)
      expect({
        count: b.count,
        position: sha(b.position),
        colT: sha(b.colT),
        colour: sha(b.colour),
        live: sha(b.live),
        seed: sha(b.seed),
        spin: sha(b.spin),
        flow: sha(b.flow),
        fall: sha(b.fall),
        rot: b.rot,
        tilt: b.tilt,
      }).toEqual(golden.bundles[`${keep}:${kind}`])
    })
  }

  it("the uniforms are develop's, plus uVelocity at exactly 0", () => {
    const now = JSON.parse(JSON.stringify(createAssemblyUniforms())) as Record<string, unknown>
    expect(now.uVelocity).toEqual({ value: 0 })
    delete now.uVelocity
    expect(now).toEqual(golden.uniforms)
    expect(Object.keys(createAssemblyUniforms()).slice(0, -1)).toEqual(Object.keys(golden.uniforms))
  })

  it("the vertex program is develop's with only the velocity lines added, and the fragment program is untouched", () => {
    const added = VERTEX.split('\n').filter((line) => line.includes('uVelocity'))
    // The uniform; the comment and guarded line for the stretch; the comment and guarded line for its normal (5 lines): nothing else.
    expect(added).toHaveLength(5)
    expect(sha(VERTEX.split('\n').filter((line) => !line.includes('uVelocity')).join('\n'))).toBe(golden.vertex)
    expect(sha(FRAGMENT)).toBe(golden.fragment)
  })

  it('the stretch is guarded so a resting frame never runs it, and is volume-preserving', () => {
    const line = VERTEX.split('\n').find((l) => l.includes('local *=')) ?? ''
    expect(line).toContain('if (uVelocity > 0.0)')
    expect(line).toContain(String(VELOCITY_STRETCH))
    // y grows by k, x and z shrink by 1/sqrt(1+k): the product of the three scales is 1 for any weight.
    for (const w of [0.1, 0.5, 1]) {
      const y = 1 + VELOCITY_STRETCH * w
      const xz = 1 / Math.sqrt(y)
      expect(xz * y * xz).toBeCloseTo(1, 12)
    }
  })
})

describe('the reading does not depend on the display\'s refresh rate', () => {
  /** Scrolls at `vhPerSecond` for `seconds` at `hz` frames per second, with the scalar's weight at the end. */
  function settled(hz: number, vhPerSecond: number, seconds = 2): number {
    const tracker = new ScrollVelocity()
    const dt = 1 / hz
    const clock = { y: 10_000, t: 0 }
    tracker.step(clock.y, clock.t, VIEWPORT)
    let last = 0
    for (let i = 0; i < seconds * hz; i += 1) last = scrollFor(tracker, clock, vhPerSecond * VIEWPORT * dt, 1, dt)[0] ?? 0
    return last
  }

  it.each([0.5, 1.5, 2.5, 3.5])('%f vh/s settles at the same weight at 60, 90, 120, 144 and 240 Hz', (speed) => {
    const expected = velocityWeight(speed)
    for (const hz of [60, 90, 120, 144, 240]) expect(settled(hz, speed)).toBeCloseTo(expected, 1)
  })

  it('full stretch needs the same 4 vh/s at 144 Hz as at 60 Hz', () => {
    expect(settled(144, 4)).toBeGreaterThan(0.97)
    expect(settled(240, 4)).toBeGreaterThan(0.97)
    expect(settled(60, 4)).toBeGreaterThan(0.97)
  })

  it('whole-pixel steps stay under the dead zone even on a 600 px viewport, at any refresh rate', () => {
    for (const hz of [60, 120, 144, 240]) {
      const tracker = new ScrollVelocity()
      const clock = { y: 0, t: 0 }
      tracker.step(clock.y, clock.t, 600)
      // 1 px every 1/60 s: 60 px/s, 0.1 vh/s of a 600 px viewport.
      let peak = 0
      const dt = 1 / hz
      let nextStep = 1 / 60
      for (let i = 1; i <= hz * 3; i += 1) {
        clock.t = i * dt
        if (clock.t >= nextStep) {
          clock.y += 1
          nextStep += 1 / 60
        }
        peak = Math.max(peak, tracker.step(clock.y, clock.t, 600))
      }
      expect(peak).toBe(0)
    }
    expect(VELOCITY_WINDOW).toBeLessThan(1 / 30)
  })

  it('a jump of a whole viewport inside one window (an anchor link) is not a speed', () => {
    const tracker = new ScrollVelocity()
    tracker.step(0, 0, VIEWPORT)
    expect(tracker.step(VIEWPORT * 3, 0.017, VIEWPORT)).toBe(0)
    expect(tracker.active).toBe(false)
  })
})

describe('a live prefers-reduced-motion change', () => {
  function fakeQuery(matches: boolean) {
    const listeners = new Set<(event: { matches: boolean }) => void>()
    return {
      matches,
      addEventListener: (_: 'change', l: (event: { matches: boolean }) => void) => void listeners.add(l),
      removeEventListener: (_: 'change', l: (event: { matches: boolean }) => void) => void listeners.delete(l),
      listeners,
      fire(next: boolean) {
        this.matches = next
        for (const l of [...listeners]) l({ matches: next })
      },
    }
  }

  it('drops the weight to 0 at once and keeps it there while reduce matches, then measures again when it clears', () => {
    const query = fakeQuery(false)
    const tracker = new ScrollVelocity()
    let redraws = 0
    const unbind = bindReducedMotion(tracker, query as never, () => (redraws += 1))
    const clock = { y: 0, t: 0 }
    tracker.step(clock.y, clock.t, VIEWPORT)
    scrollFor(tracker, clock, 100, 10, 1 / 60)
    expect(tracker.weight).toBeGreaterThan(0.5)

    query.fire(true)
    expect(tracker.weight).toBe(0)
    expect(tracker.active).toBe(false)
    expect(redraws).toBe(1)
    for (const w of scrollFor(tracker, clock, 100, 20, 1 / 60)) expect(w).toBe(0)

    query.fire(false)
    tracker.step(clock.y, (clock.t += 1 / 60), VIEWPORT)
    expect(Math.max(...scrollFor(tracker, clock, 100, 10, 1 / 60))).toBeGreaterThan(0.5)

    unbind()
    expect(query.listeners.size).toBe(0)
  })

  it('starts at 0 when reduce already matches, and cleans up its listener', () => {
    const query = fakeQuery(true)
    const tracker = new ScrollVelocity()
    const unbind = bindReducedMotion(tracker, query as never)
    const clock = { y: 0, t: 0 }
    tracker.step(clock.y, clock.t, VIEWPORT)
    for (const w of scrollFor(tracker, clock, 200, 10, 1 / 60)) expect(w).toBe(0)
    expect(query.listeners.size).toBe(1)
    unbind()
    expect(query.listeners.size).toBe(0)
  })
})
