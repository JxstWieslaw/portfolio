import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ATTRACT_RADIUS,
  ATTRACT_STRENGTH,
  attractorPoint,
  boxCentre,
  createAttractorStore,
  nearestToCentre,
} from '@/lib/assembly/attractors'
import { CAMERA_DAMP, CAMERA_RIGS, PORTRAIT_DISTANCE_SCALE, cameraPosition, damp, lerpRig, rigFor } from '@/lib/assembly/camera'
import { LCP_CEILING_MS, LCP_IDLE_TIMEOUT_MS, LCP_QUIET_MS, LOAD_FALLBACK_MS, afterLcp } from '@/lib/assembly/lcp'
import {
  BOUNCE,
  CALM_SECONDS,
  FIRST_LANDING,
  GRAVITY,
  GROUND_Y,
  NO_DROP,
  SHIVER_AMPLITUDE,
  SHIVER_SECONDS,
  biasFor,
  calmAt,
  dropTrigger,
  fallHeight,
  lerpMotion,
  motionFor,
  scatterWeight,
  settledFormation,
  shiverAt,
} from '@/lib/assembly/motion'
import { resolveScroll, type SectionBox } from '@/lib/assembly/scroll'
import {
  AIRBORNE_T,
  GRID_RATE,
  ORBIT_CORE_RATE,
  ORBIT_RING_RATES,
  RING_RATE,
  buildModelBundle,
  frameFor,
  groupFor,
  orbitRingAxis,
} from '@/lib/assembly/targets'
import { FORMATIONS, FORMATION_IDS, SECTION_BACKDROPS } from '@/lib/formations/config'
import { REDUCED_KEEP } from '@/lib/formations/fallback'
import { createRng, generatePoints, seedFor } from '@/lib/formations/generators'

describe('camera rigs (§ 3.8)', () => {
  it('carries the table verbatim and gives the cloud the hero rig', () => {
    expect(CAMERA_RIGS.monolith).toEqual({ distance: 10, tiltDeg: 0, parallaxDeg: 3, orbitRate: 0 })
    expect(CAMERA_RIGS.stream).toEqual({ distance: 11.5, tiltDeg: -2, parallaxDeg: 1.5, orbitRate: 0 })
    expect(CAMERA_RIGS.lattice).toEqual({ distance: 10, tiltDeg: 6, parallaxDeg: 2, orbitRate: 0 })
    expect(CAMERA_RIGS.orbit).toEqual({ distance: 9, tiltDeg: 0, parallaxDeg: 3, orbitRate: 0.03 })
    expect(CAMERA_RIGS.scatter).toEqual({ distance: 10.5, tiltDeg: 4, parallaxDeg: 2, orbitRate: 0 })
    expect(CAMERA_RIGS.grid).toEqual({ distance: 11, tiltDeg: 0, parallaxDeg: 1, orbitRate: 0 })
    expect(CAMERA_RIGS.ring).toEqual({ distance: 12, tiltDeg: 8, parallaxDeg: 1, orbitRate: 0 })
    expect(rigFor('cloud')).toEqual(CAMERA_RIGS.monolith)
  })

  it('lerps every field by the mix, clamped, and scales portrait distances by 1.15', () => {
    const mid = lerpRig(CAMERA_RIGS.monolith, CAMERA_RIGS.stream, 0.5)
    expect(mid).toEqual({ distance: 10.75, tiltDeg: -1, parallaxDeg: 2.25, orbitRate: 0 })
    expect(lerpRig(CAMERA_RIGS.grid, CAMERA_RIGS.ring, 2)).toEqual(CAMERA_RIGS.ring)
    expect(lerpRig(CAMERA_RIGS.grid, CAMERA_RIGS.ring, -1)).toEqual(CAMERA_RIGS.grid)
    expect(rigFor('ring', true).distance).toBeCloseTo(12 * PORTRAIT_DISTANCE_SCALE, 9)
    expect(rigFor('ring', true).tiltDeg).toBe(8)
  })

  it('damps at 4/s independent of frame rate: 60 small steps land where 1 big step lands', () => {
    let fine = 0
    for (let i = 0; i < 60; i += 1) fine = damp(fine, 10, CAMERA_DAMP, 1 / 60)
    const coarse = damp(0, 10, CAMERA_DAMP, 1)
    expect(fine).toBeCloseTo(coarse, 9)
    expect(coarse).toBeCloseTo(10 * (1 - Math.exp(-4)), 9)
  })

  it('places the camera at the rig distance, looking down for a positive tilt, orbiting about y', () => {
    expect(cameraPosition(10, 0, 0)).toEqual([0, 0, 10])
    const [x, y, z] = cameraPosition(12, 8, 0)
    expect(Math.hypot(x, y, z)).toBeCloseTo(12, 9)
    expect(y).toBeGreaterThan(0)
    const [ox, , oz] = cameraPosition(9, 0, Math.PI / 2)
    expect(ox).toBeCloseTo(9, 9)
    expect(oz).toBeCloseTo(0, 9)
  })

  it('keeps the anchor on its measured pixel at any dolly: the frame scalars follow the distance', () => {
    const near = frameFor(1440, 900, 9)
    const far = frameFor(1440, 900, 12)
    expect(far.worldPerPx / near.worldPerPx).toBeCloseTo(12 / 9, 9)
  })
})

describe('section motion (§ 3 table)', () => {
  it('biases violet-led sections down and cyan-led sections up by 0.08', () => {
    for (const id of FORMATION_IDS) {
      expect(biasFor(id)).toBe(FORMATIONS[id].wash === '#22D3EE' ? 0.08 : -0.08)
    }
    expect(biasFor('cloud')).toBe(-0.08)
  })

  it('follows the pointer column: no repel on the lattice, 1.5x radius on the craft, attractors on the lattice only', () => {
    expect(motionFor('lattice').repel).toBe(0)
    expect(motionFor('lattice').attract).toBe(1)
    expect(motionFor('stream').repel).toBe(0.4)
    expect(motionFor('orbit').repel).toBe(0.6)
    expect(motionFor('scatter').repel).toBe(1)
    expect(motionFor('scatter').repelRadius).toBe(1.5)
    expect(motionFor('grid').repel).toBe(0.3)
    expect(motionFor('ring').repel).toBe(0.5)
    for (const id of FORMATION_IDS) if (id !== 'lattice') expect(motionFor(id).attract).toBe(0)
    const mid = lerpMotion(motionFor('monolith'), motionFor('stream'), 0.5)
    expect(mid.repel).toBeCloseTo(0.7, 9)
    expect(mid.wobble).toBeCloseTo(0.5, 9)
  })
})

describe('the craft drop (§ 3.5)', () => {
  it('falls under g = 2.2, lands on the ground, bounces once at 0.3 and rests', () => {
    expect(fallHeight(1.9, 0)).toBe(1.9)
    expect(fallHeight(1.9, 0.5)).toBeCloseTo(1.9 - 0.5 * GRAVITY * 0.25, 9)
    const land = Math.sqrt((2 * (1.9 - GROUND_Y)) / GRAVITY)
    expect(fallHeight(1.9, land)).toBeCloseTo(GROUND_Y, 9)
    // Bounce apex: (0.3 v)² / 2g above the ground, at land + 0.3 v / g.
    const v = GRAVITY * land * BOUNCE
    const apex = fallHeight(1.9, land + v / GRAVITY)
    expect(apex).toBeCloseTo(GROUND_Y + (v * v) / (2 * GRAVITY), 9)
    expect(apex).toBeGreaterThan(GROUND_Y)
    expect(fallHeight(1.9, land + (2 * v) / GRAVITY)).toBeCloseTo(GROUND_Y, 9)
    expect(fallHeight(1.9, 100)).toBe(GROUND_Y)
    // Never below the ground, never above the start.
    for (let s = 0; s < 5; s += 0.05) {
      const y = fallHeight(1.2, s)
      expect(y).toBeGreaterThanOrEqual(GROUND_Y - 1e-9)
      expect(y).toBeLessThanOrEqual(1.2 + 1e-9)
    }
    expect(fallHeight(GROUND_Y - 1, 3)).toBe(GROUND_Y)
  })

  it('shivers the pile for 1.2 s from the first landing', () => {
    expect(FIRST_LANDING).toBeCloseTo(Math.sqrt((2 * 1.45) / GRAVITY), 9)
    expect(shiverAt(FIRST_LANDING - 0.01)).toBe(0)
    expect(shiverAt(FIRST_LANDING)).toBe(SHIVER_AMPLITUDE)
    expect(shiverAt(FIRST_LANDING + SHIVER_SECONDS - 0.01)).toBe(SHIVER_AMPLITUDE)
    expect(shiverAt(FIRST_LANDING + SHIVER_SECONDS)).toBe(0)
  })

  it('drops once per visit from either direction, never re-arms on a nudge, and replays after leaving', () => {
    // Arriving from above: orbit -> scatter.
    let state = dropTrigger(NO_DROP, 'orbit', 'scatter', 0.2, 10)
    expect(state).toBe(NO_DROP)
    state = dropTrigger(state, 'orbit', 'scatter', 0.5, 11)
    expect(state).toEqual({ dropAt: 11, armed: true })
    // At rest in Craft the store reads from = scatter, to = grid, mix ~ 0; nudges keep the drop.
    state = dropTrigger(state, 'scatter', 'grid', 0, 12)
    state = dropTrigger(state, 'scatter', 'grid', 0.3, 13)
    state = dropTrigger(state, 'scatter', 'grid', 0.95, 14)
    state = dropTrigger(state, 'scatter', 'grid', 0.1, 15)
    expect(state).toEqual({ dropAt: 11, armed: true })
    // Gone from both slots: disarmed, uDropAt back to -1 so the slot shows the airborne layout.
    state = dropTrigger(state, 'grid', 'ring', 0.2, 16)
    expect(state).toEqual(NO_DROP)
    // Returning from below: from = scatter again as the band crosses back.
    state = dropTrigger(state, 'scatter', 'grid', 0.7, 20)
    expect(state).toBe(NO_DROP)
    state = dropTrigger(state, 'scatter', 'grid', 0.5, 21)
    expect(state).toEqual({ dropAt: 21, armed: true })
    expect(scatterWeight('scatter', 'scatter', 0)).toBe(1)
    expect(scatterWeight('orbit', 'grid', 0.5)).toBe(0)
  })

  it('knows when the visitor is at rest on a formation', () => {
    expect(settledFormation('ring', 'ring', 0)).toBe('ring')
    expect(settledFormation('grid', 'ring', 0.01)).toBe('grid')
    expect(settledFormation('grid', 'ring', 0.99)).toBe('ring')
    expect(settledFormation('grid', 'ring', 0.5)).toBeNull()
  })

  it('fires the drop once per visit and calms at rest on Contact across a real scroll sweep', () => {
    // The real section order, 1000 px each, 900 px viewport.
    const boxes: SectionBox[] = SECTION_BACKDROPS.map((entry, i) => ({ id: entry.section, formation: entry.formation, top: i * 1000, height: 1000 }))
    let drop = NO_DROP
    let drops = 0
    let settledAt = -1
    let calm = 0
    let time = 0
    const sweep = (from: number, to: number, step: number): void => {
      for (let y = from; step > 0 ? y <= to : y >= to; y += step) {
        time += 0.05
        const s = resolveScroll(boxes, y, 900)
        const next = dropTrigger(drop, s.from, s.to, s.mix, time)
        if (next.armed && !drop.armed) drops += 1
        drop = next
        const settled = settledFormation(s.from, s.to, s.mix)
        if (settled === 'ring') {
          if (settledAt < 0) settledAt = time
        } else settledAt = -1
        calm = calmAt(settled, settledAt < 0 ? 0 : time - settledAt)
      }
    }
    sweep(0, 8100, 20) // top to the bottom (contact)
    expect(drops).toBe(1)
    expect(drop.armed).toBe(false)
    expect(calm).toBeLessThan(1) // at rest on contact, the calm is still rising
    for (let i = 0; i < 60; i += 1) sweep(8100, 8100, 1)
    expect(calm).toBe(1)
    sweep(8100, 4200, -20) // back up into Craft
    expect(drops).toBe(2)
    expect(calm).toBe(0)
    sweep(4200, 4500, 20) // a nudge inside Craft
    sweep(4500, 4200, -20)
    expect(drops).toBe(2)
    sweep(4200, 0, -20) // up to the hero
    expect(drop.armed).toBe(false)
    sweep(0, 4200, 20) // and down again: a new visit
    expect(drops).toBe(3)
  })
})

describe('the contact ring calms (§ 3.7)', () => {
  it('eases 0 -> 1 over 2 s only while at rest on the ring', () => {
    expect(calmAt(null, 5)).toBe(0)
    expect(calmAt('grid', 5)).toBe(0)
    expect(calmAt('ring', 0)).toBe(0)
    expect(calmAt('ring', CALM_SECONDS / 2)).toBeCloseTo(0.5, 9)
    expect(calmAt('ring', CALM_SECONDS)).toBe(1)
    expect(calmAt('ring', 10)).toBe(1)
  })
})

describe('attractors (§ 3.3)', () => {
  it('converts the card box centre with the framing maths and keeps the spec radius and strength', () => {
    const frame = frameFor(1440, 900)
    expect(boxCentre({ left: 100, top: 200, width: 300, height: 100 })).toEqual([250, 250])
    expect(attractorPoint(frame, { left: 620, top: 400, width: 200, height: 100 })).toEqual([0, 0, 0])
    const [x, y] = attractorPoint(frame, { left: 1340, top: 0, width: 200, height: 100 })
    expect(x).toBeGreaterThan(0)
    expect(y).toBeGreaterThan(0)
    expect(ATTRACT_RADIUS).toBe(0.9)
    expect(ATTRACT_STRENGTH).toBe(0.35)
  })

  it('picks the card nearest the viewport centre on touch', () => {
    const boxes = [
      { left: 0, top: 0, width: 100, height: 100 },
      { left: 150, top: 400, width: 100, height: 100 },
      { left: 0, top: 800, width: 100, height: 100 },
    ]
    expect(nearestToCentre(boxes, 400, 900)).toBe(1)
    expect(nearestToCentre([], 400, 900)).toBe(-1)
  })

  it('notifies subscribers of a change only, and unsubscribes cleanly', () => {
    const store = createAttractorStore()
    const seen: Array<ReturnType<typeof store.get>> = []
    const off = store.subscribe((element) => seen.push(element))
    const card = { left: 1, top: 2, width: 3, height: 4 }
    store.set(card)
    store.set({ ...card })
    store.set(null)
    off()
    store.set(card)
    expect(seen).toEqual([card, null])
    expect(store.get()).toBe(card)
  })
})

describe('attribute slots: spin, flow, fall (§ 4.3)', () => {
  it('derives the orbit groups from the push order for every keep', () => {
    for (const keep of [1, REDUCED_KEEP]) {
      const n = FORMATIONS.orbit.n
      const count = Math.max(1, Math.round(n * keep))
      const core = Math.floor(count * 0.22)
      const ring = Math.floor(count * 0.19)
      const points = generatePoints('orbit', n, createRng(seedFor('orbit')), keep)
      expect(points.length).toBe(core + 3 * ring)
      expect(groupFor(0, n, keep)).toBe('core')
      expect(groupFor(core - 1, n, keep)).toBe('core')
      expect(groupFor(core, n, keep)).toBe(0)
      expect(groupFor(core + ring, n, keep)).toBe(1)
      expect(groupFor(core + 2 * ring, n, keep)).toBe(2)
      expect(groupFor(core + 3 * ring - 1, n, keep)).toBe(2)
      expect(groupFor(core + 3 * ring, n, keep)).toBeNull()
      // Ring membership agrees with the generator: ring cubes sit at their ring's radius.
      for (let i = core; i < points.length; i += 1) {
        const k = groupFor(i, n, keep)
        const [x, y, z] = points[i] ?? [0, 0, 0]
        expect(Math.hypot(x, y, z)).toBeCloseTo([0.95, 1.25, 1.55][k as number] ?? -1, 0)
      }
    }
  })

  it('gives orbit rings their tilted axis and rates 0.05 / -0.035 / 0.08, the core 0.02 about y', () => {
    expect(ORBIT_RING_RATES).toEqual([0.05, -0.035, 0.08])
    expect(ORBIT_CORE_RATE).toBe(0.02)
    const bundle = buildModelBundle('orbit', 3000)
    const n = FORMATIONS.orbit.n
    for (let i = 0; i < bundle.count; i += 1) {
      const group = groupFor(i, n)
      const rate = bundle.spin[i * 4 + 3]
      if (group === 'core') {
        expect(rate).toBeCloseTo(ORBIT_CORE_RATE, 9)
        expect([bundle.spin[i * 4], bundle.spin[i * 4 + 1], bundle.spin[i * 4 + 2]]).toEqual([0, 1, 0])
      } else {
        const axis = orbitRingAxis(group as 0 | 1 | 2)
        expect(rate).toBeCloseTo(ORBIT_RING_RATES[group as 0 | 1 | 2], 6)
        expect(Math.hypot(axis[0], axis[1], axis[2])).toBeCloseTo(1, 9)
        // Rotating about the ring's normal keeps the cube on the ring: the position stays
        // perpendicular-distance invariant, i.e. its dot with the axis is tiny (the ring is flat).
        const px = bundle.position[i * 3] ?? 0
        const py = bundle.position[i * 3 + 1] ?? 0
        const pz = bundle.position[i * 3 + 2] ?? 0
        expect(Math.abs(px * axis[0] + py * axis[1] + pz * axis[2])).toBeLessThan(0.04)
      }
    }
    // Surplus instances do not spin.
    expect(bundle.spin[bundle.count * 4 + 3]).toBe(0)
  })

  it('spins the whole grid at 0.05 rad/s about y and the ring at 0.02; everything else is still', () => {
    const grid = buildModelBundle('grid', 3000)
    for (let i = 0; i < grid.count; i += 1) expect(grid.spin[i * 4 + 3]).toBeCloseTo(GRID_RATE, 6)
    const ring = buildModelBundle('ring', 3000)
    expect(ring.spin[3]).toBeCloseTo(RING_RATE, 6)
    for (const id of ['monolith', 'stream', 'lattice', 'scatter'] as const) {
      const bundle = buildModelBundle(id, 3000)
      for (let i = 0; i < bundle.capacity; i += 1) expect(bundle.spin[i * 4 + 3]).toBe(0)
    }
  })

  it('flags the stream for flow and exactly the scatter airborne cubes (t = 0.78) for the fall', () => {
    const stream = buildModelBundle('stream', 3000)
    for (let i = 0; i < stream.count; i += 1) expect(stream.flow[i]).toBe(1)
    for (let i = stream.count; i < stream.capacity; i += 1) expect(stream.flow[i]).toBe(0)
    const scatter = buildModelBundle('scatter', 3000)
    const points = generatePoints('scatter', FORMATIONS.scatter.n, createRng(seedFor('scatter')))
    let airborne = 0
    for (let i = 0; i < scatter.count; i += 1) {
      const expected = points[i]?.[3] === AIRBORNE_T ? 1 : 0
      expect(scatter.fall[i]).toBe(expected)
      airborne += expected
    }
    expect(airborne).toBeGreaterThan(scatter.count * 0.1)
    expect(airborne).toBeLessThan(scatter.count * 0.18)
    for (const id of ['monolith', 'lattice', 'orbit', 'grid', 'ring'] as const) {
      const bundle = buildModelBundle(id, 3000)
      expect(bundle.flow.every((v) => v === 0)).toBe(true)
      expect(bundle.fall.every((v) => v === 0)).toBe(true)
    }
  })
})

describe('afterLcp (§ 5.7)', () => {
  interface Stub {
    type: string
    observe: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    fire(): void
  }
  let observers: Stub[]

  beforeEach(() => {
    vi.useFakeTimers()
    observers = []
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  /** One stub per `observe` call; entries are delivered by the test, never inside `observe`. */
  function stubObserver(): void {
    vi.stubGlobal(
      'PerformanceObserver',
      class {
        static supportedEntryTypes = ['largest-contentful-paint', 'first-input']
        type = ''
        observe = vi.fn((options: { type: string }) => {
          this.type = options.type
          observers.push(this)
        })
        disconnect = vi.fn()
        constructor(private readonly callback: () => void) {}
        fire(): void {
          this.callback()
        }
      },
    )
  }
  const lcp = (): Stub | undefined => observers.find((o) => o.type === 'largest-contentful-paint')
  const input = (): Stub | undefined => observers.find((o) => o.type === 'first-input')

  it('resolves once, 500 ms after the last LCP candidate, then an idle period with a 2 s ceiling', () => {
    stubObserver()
    const ric = vi.fn((cb: () => void, options: { timeout: number }) => {
      expect(options.timeout).toBe(LCP_IDLE_TIMEOUT_MS)
      return window.setTimeout(cb, 5)
    })
    vi.stubGlobal('requestIdleCallback', ric)
    const callback = vi.fn()
    afterLcp(callback)
    expect(lcp()?.observe).toHaveBeenCalledWith({ type: 'largest-contentful-paint', buffered: true })
    expect(input()?.observe).toHaveBeenCalledWith({ type: 'first-input', buffered: true })
    lcp()?.fire() // the wordmark at first paint
    vi.advanceTimersByTime(300)
    lcp()?.fire() // the hero lede
    vi.advanceTimersByTime(LCP_QUIET_MS - 1)
    expect(ric).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(ric).toHaveBeenCalledTimes(1)
    expect(lcp()?.disconnect).toHaveBeenCalled()
    expect(input()?.disconnect).toHaveBeenCalled()
    vi.advanceTimersByTime(5)
    expect(callback).toHaveBeenCalledTimes(1)
    lcp()?.fire()
    vi.advanceTimersByTime(LCP_QUIET_MS + 50)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('resolves at once on first input, since Chrome freezes the LCP there', () => {
    stubObserver()
    const callback = vi.fn()
    afterLcp(callback)
    lcp()?.fire()
    vi.advanceTimersByTime(100)
    input()?.fire()
    vi.advanceTimersByTime(1) // the idle macrotask fallback
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('cancels before resolution: both observers disconnected, no timer fires', () => {
    stubObserver()
    const callback = vi.fn()
    const cancel = afterLcp(callback)
    lcp()?.fire()
    cancel()
    expect(lcp()?.disconnect).toHaveBeenCalled()
    expect(input()?.disconnect).toHaveBeenCalled()
    vi.advanceTimersByTime(LCP_CEILING_MS + LCP_IDLE_TIMEOUT_MS)
    expect(callback).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('falls back to load + 1 s without the observer, and a cancel stops it', () => {
    vi.stubGlobal('PerformanceObserver', undefined)
    const callback = vi.fn()
    afterLcp(callback)
    vi.advanceTimersByTime(LOAD_FALLBACK_MS - 1)
    expect(callback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(callback).toHaveBeenCalledTimes(1)

    const cancelled = vi.fn()
    const cancel = afterLcp(cancelled)
    cancel()
    vi.advanceTimersByTime(LOAD_FALLBACK_MS * 2)
    expect(cancelled).not.toHaveBeenCalled()
  })

  it('gives up waiting for an LCP entry after the ceiling so the layer still mounts', () => {
    stubObserver()
    const callback = vi.fn()
    afterLcp(callback)
    vi.advanceTimersByTime(LCP_CEILING_MS - 1)
    expect(callback).not.toHaveBeenCalled()
    // The ceiling, then the idle macrotask fallback (jsdom has no requestIdleCallback).
    vi.advanceTimersByTime(2)
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
