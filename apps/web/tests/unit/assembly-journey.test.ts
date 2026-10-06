import { describe, expect, it } from 'vitest'
import {
  ARTEFACT_CENTRE,
  ARTEFACT_RADIUS,
  CLEARANCE_RADIUS,
  RINGS,
  checksum,
  createArtefactNoise,
  displaceShell,
  igniteScale,
} from '@/lib/assembly/artefact'
import { assemblyBuilder, createBundleCache } from '@/lib/assembly/bundle-cache'
import { ASSEMBLY_SECONDS, CLOUD_RADIUS, SETTLE_SECONDS, buildCloudBundle, easeOutQuint, resolveAssembly } from '@/lib/assembly/cloud'
import { EMPTY_SLOTS, planSlots } from '@/lib/assembly/slots'
import { INSTANCE_CAPACITY, buildModelBundle, clearArtefact } from '@/lib/assembly/targets'
import { createRng, generatePoints, seedFor } from '@/lib/formations/generators'
import { pointsFor } from '@/lib/formations/render'

/** 12 vertices of a unit icosahedron, enough to exercise the displacement without three. */
function icosahedron(): Float32Array {
  const t = (1 + Math.sqrt(5)) / 2
  const raw = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1]
  return new Float32Array(raw)
}

/** Pinned: a change here means the artefact's silhouette changed. */
const ARTEFACT_CHECKSUM = -340230143

describe('artefact', () => {
  it('is deterministic (checksum pinned) and every vertex fits inside radius 0.42', () => {
    const shell = displaceShell(icosahedron())
    expect(checksum(shell)).toBe(checksum(displaceShell(icosahedron())))
    expect(checksum(shell)).toBe(ARTEFACT_CHECKSUM)
    for (let i = 0; i < shell.length; i += 3) {
      const r = Math.hypot(shell[i] ?? 0, shell[i + 1] ?? 0, shell[i + 2] ?? 0)
      expect(r).toBeLessThanOrEqual(ARTEFACT_RADIUS + 1e-9)
      expect(r).toBeGreaterThan(ARTEFACT_RADIUS * 0.7)
    }
  })

  it('facets the shell: the noise varies across the sphere and stays in [-1, 1]', () => {
    const noise = createArtefactNoise()
    const samples = [noise(1, 0, 0), noise(0, 1, 0), noise(0, 0, 1), noise(-0.577, 0.577, 0.577)]
    for (const s of samples) expect(Math.abs(s)).toBeLessThanOrEqual(1)
    expect(new Set(samples.map((s) => s.toFixed(6))).size).toBeGreaterThan(1)
  })

  it('has two rings at the spec radii and tilts, and ignites at 0.6 s over 0.9 s', () => {
    expect(RINGS.map((r) => r.radius)).toEqual([0.58, 0.72])
    expect(RINGS.map((r) => r.tilt)).toEqual([0.6, -0.9])
    expect(igniteScale(0)).toBe(0)
    expect(igniteScale(0.6)).toBeCloseTo(0, 9)
    expect(igniteScale(1.5)).toBeCloseTo(1, 9)
    expect(igniteScale(1.0)).toBeGreaterThan(0.5)
  })
})

describe('artefact clearance pass', () => {
  it('moves only interior points, out to the clearance radius, and leaves the generator untouched', () => {
    const before = generatePoints('monolith', 2600, createRng(seedFor('monolith')))
    const bundle = buildModelBundle('monolith', INSTANCE_CAPACITY)
    const { bundle: cleared, moved } = clearArtefact(bundle, ARTEFACT_CENTRE, ARTEFACT_RADIUS, CLEARANCE_RADIUS)

    expect(moved).toBeGreaterThan(0)
    // The spec estimated 5–7 % (interior fill only); measured: the 0.42 shell also
    // catches the column's surface cubes in its band (the taper there is 0.38),
    // so the real share is higher. Pinned as an order of magnitude.
    expect(moved / bundle.count).toBeGreaterThan(0.03)
    expect(moved / bundle.count).toBeLessThan(0.25)

    let changed = 0
    for (let i = 0; i < bundle.count; i += 1) {
      const i3 = i * 3
      const dx = (cleared.position[i3] ?? 0) - ARTEFACT_CENTRE[0]
      const dy = (cleared.position[i3 + 1] ?? 0) - ARTEFACT_CENTRE[1]
      const dz = (cleared.position[i3 + 2] ?? 0) - ARTEFACT_CENTRE[2]
      const same =
        cleared.position[i3] === bundle.position[i3] &&
        cleared.position[i3 + 1] === bundle.position[i3 + 1] &&
        cleared.position[i3 + 2] === bundle.position[i3 + 2]
      if (!same) changed += 1
      // Moved cubes sit on the clearance radius; untouched ones were never inside the shell.
      expect(Math.hypot(dx, dy, dz)).toBeGreaterThanOrEqual((same ? ARTEFACT_RADIUS : CLEARANCE_RADIUS) - 1e-5)
    }
    expect(changed).toBe(moved)

    // The source bundle and the generator output are untouched.
    expect(bundle.position).toEqual(buildModelBundle('monolith', INSTANCE_CAPACITY).position)
    expect(generatePoints('monolith', 2600, createRng(seedFor('monolith')))).toEqual(before)
    expect(pointsFor('monolith')).toEqual(before)
  })
})

describe('cloud pseudo-formation', () => {
  it('puts every point on the 3.0 sphere, seeded, keeping the monolith’s count, colours and seeds', () => {
    const monolith = buildModelBundle('monolith', 200)
    const cloud = buildCloudBundle(monolith)
    expect(cloud.kind).toBe('cloud')
    expect(cloud.count).toBe(monolith.count)
    expect(cloud.colT).toBe(monolith.colT)
    expect(cloud.seed).toBe(monolith.seed)
    for (let i = 0; i < 200; i += 1) {
      const r = Math.hypot(cloud.position[i * 3] ?? 0, cloud.position[i * 3 + 1] ?? 0, cloud.position[i * 3 + 2] ?? 0)
      expect(r).toBeCloseTo(CLOUD_RADIUS, 5)
    }
    expect(buildCloudBundle(monolith).position).toEqual(cloud.position)
    expect(ASSEMBLY_SECONDS).toBe(1.8)
    expect(easeOutQuint(0)).toBe(0)
    expect(easeOutQuint(1)).toBe(1)
    expect(easeOutQuint(0.5)).toBeGreaterThan(0.9)
  })

  it('the scene builder primes cloud and monolith from one cleared monolith', () => {
    let reported = -1
    const cache = createBundleCache(assemblyBuilder(300, 1, (moved) => (reported = moved)))
    cache.get('cloud')
    cache.get('monolith')
    expect(cache.builds).toBe(2)
    expect(reported).toBeGreaterThan(0)
  })
})

describe('on-load assembly resolver', () => {
  const atTop = { from: 'monolith', to: 'stream', mix: 0, opacity: 1 } as const

  it('assembles into the monolith even though the scroll store already names the next section', () => {
    const state = resolveAssembly(atTop, 0.5)
    expect(state.from).toBe('cloud')
    expect(state.to).toBe('monolith')
    expect(state.mix).toBeCloseTo(easeOutQuint(0.5 / ASSEMBLY_SECONDS), 9)
  })

  it('is continuous across the end of the assembly', () => {
    const before = resolveAssembly(atTop, ASSEMBLY_SECONDS - 1e-6)
    const after = resolveAssembly(atTop, ASSEMBLY_SECONDS)
    expect(before).toMatchObject({ from: 'cloud', to: 'monolith' })
    expect(before.mix).toBeCloseTo(1, 6)
    // Landed on the monolith; the scroll's mix starts from zero, not from its current value.
    expect(after).toEqual({ from: 'monolith', to: 'stream', mix: 0 })
    expect(resolveAssembly(atTop, ASSEMBLY_SECONDS + SETTLE_SECONDS)).toEqual(atTop)
  })

  it('a scroll during the assembly produces no discontinuity', () => {
    const scrolled = { ...atTop, mix: 0.4 }
    expect(resolveAssembly(scrolled, 1.0).to).toBe('monolith')
    const landed = resolveAssembly(scrolled, ASSEMBLY_SECONDS)
    expect(landed.mix).toBe(0)
    let previous = landed.mix
    for (let t = ASSEMBLY_SECONDS; t <= ASSEMBLY_SECONDS + SETTLE_SECONDS + 0.1; t += 0.016) {
      const { mix, from, to } = resolveAssembly(scrolled, t)
      expect(from).toBe('monolith')
      expect(to).toBe('stream')
      expect(mix - previous).toBeGreaterThanOrEqual(0)
      expect(mix - previous).toBeLessThan(0.1)
      previous = mix
    }
    expect(previous).toBeCloseTo(0.4, 9)
  })

  it('ramps from the monolith when the visitor is already past the hero', () => {
    const far = { from: 'stream', to: 'lattice', mix: 0.2, opacity: 1 } as const
    const landed = resolveAssembly(far, ASSEMBLY_SECONDS)
    expect(landed).toEqual({ from: 'monolith', to: 'stream', mix: 0 })
    expect(resolveAssembly(far, ASSEMBLY_SECONDS + SETTLE_SECONDS / 2).to).toBe('stream')
  })
})

describe('slot ping-pong', () => {
  it('fills both slots on the first state', () => {
    const plan = planSlots(EMPTY_SLOTS, 'cloud', 'monolith')
    expect(plan.writes).toEqual([
      { slot: 'a', kind: 'cloud' },
      { slot: 'b', kind: 'monolith' },
    ])
    expect(plan.swap).toBe(0)
  })

  it('never rewrites the slot holding from; a new `to` goes into the other slot', () => {
    let state = planSlots(EMPTY_SLOTS, 'monolith', 'monolith').state
    let plan = planSlots(state, 'monolith', 'stream')
    expect(plan.writes).toEqual([{ slot: 'b', kind: 'stream' }])
    expect(plan.swap).toBe(0)
    state = plan.state

    // Arrived: from becomes stream (in B), to becomes lattice -> written into A.
    plan = planSlots(state, 'stream', 'lattice')
    expect(plan.writes).toEqual([{ slot: 'a', kind: 'lattice' }])
    expect(plan.swap).toBe(1)
    state = plan.state

    // Scrolling back up mid-band: from lattice (A) to stream (B) needs no write.
    plan = planSlots(state, 'lattice', 'stream')
    expect(plan.writes).toEqual([])
    expect(plan.swap).toBe(0)

    // Holding still writes nothing.
    expect(planSlots(plan.state, 'lattice', 'stream').writes).toEqual([])
  })
})
