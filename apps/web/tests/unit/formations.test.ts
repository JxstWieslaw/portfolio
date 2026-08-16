import { describe, expect, it } from 'vitest'
import {
  FORMATIONS,
  FORMATION_IDS,
  SCRIMS,
  SECTION_BACKDROPS,
  spreadXFor,
  ULTRAWIDE_ASPECT,
  ULTRAWIDE_SPREAD_X,
  washCss,
  type FormationId,
} from '@/lib/formations/config'
import { createRng, generatePoints, seedFor, type Point } from '@/lib/formations/generators'

/**
 * The generators are the one part of this layer with no visual test to catch it
 * drifting: a reordered `r()` call still produces a plausible-looking cloud from
 * a plausible-looking seed. So each formation is pinned by a checksum over its
 * full point list.
 *
 * A failing checksum means the geometry changed. That is either a bug or a
 * deliberate redesign — and a deliberate redesign updates
 * `docs/design-extraction/design-home.md` first, then this file.
 */

/** FNV-1a over each coordinate at 1e-6 fixed point, so float printing is irrelevant. */
function checksum(points: readonly Point[]): string {
  let h = 2166136261 >>> 0
  for (const point of points) {
    for (const value of point) {
      const fixed = Math.round(value * 1e6) | 0
      for (let shift = 0; shift < 32; shift += 8) {
        h ^= (fixed >>> shift) & 0xff
        h = Math.imul(h, 16777619) >>> 0
      }
    }
  }
  return h.toString(16).padStart(8, '0')
}

function cloud(kind: FormationId, keep = 1): Point[] {
  return generatePoints(kind, FORMATIONS[kind].n, createRng(seedFor(kind)), keep)
}

interface Snapshot {
  readonly seed: number
  readonly count: number
  readonly sum: string
  readonly reducedCount: number
  readonly reducedSum: string
}

/** Captured from the generators themselves; verified against the export's shape. */
const SNAPSHOTS: Readonly<Record<FormationId, Snapshot>> = {
  monolith: { seed: 75697, count: 2756, sum: '020f51a5', reducedCount: 1241, reducedSum: 'a1374712' },
  stream: { seed: 59859, count: 1600, sum: 'b9969443', reducedCount: 720, reducedSum: 'da91b1c7' },
  lattice: { seed: 67778, count: 1157, sum: '457d3d83', reducedCount: 538, reducedSum: '1df17207' },
  orbit: { seed: 51940, count: 1896, sum: 'a403d04e', reducedCount: 852, reducedSum: '33ac04e3' },
  scatter: { seed: 67778, count: 2000, sum: '002d08f2', reducedCount: 900, reducedSum: '28e17795' },
  grid: { seed: 44021, count: 1338, sum: 'c1b4840a', reducedCount: 615, reducedSum: '8a23bf6a' },
  ring: { seed: 44021, count: 2200, sum: '62d4580c', reducedCount: 990, reducedSum: '0084b4d9' },
}

/**
 * The `cfg` table from `Home.dc.html`, retyped by hand. If this and
 * `FORMATIONS` ever disagree, one of them was edited without the extraction.
 */
const EXPORT_CFG: Readonly<Record<FormationId, Record<string, number | string>>> = {
  monolith: { n: 2600, rot: 0.55, tilt: 0.1, scale: 0.3, cx: 0.74, cy: 0.55, bloom: 1.25, wash: '#7C3AED', washA: 0.14, size: 3.4, vig: 0.3 },
  stream: { n: 1600, rot: 0.35, tilt: 0.06, scale: 0.3, cx: 0.5, cy: 0.5, bloom: 0.5, wash: '#22D3EE', washA: 0.07, size: 2.4, vig: 0.45 },
  lattice: { n: 600, rot: 0.42, tilt: 0.55, scale: 0.2, cx: 0.5, cy: 0.3, bloom: 0.35, wash: '#7C3AED', washA: 0.07, size: 2.6, vig: 0.55 },
  orbit: { n: 2400, rot: 0.3, tilt: 0.3, scale: 0.22, cx: 0.5, cy: 0.5, bloom: 0.9, wash: '#7C3AED', washA: 0.12, size: 2.6, vig: 0.5 },
  scatter: { n: 2000, rot: 0.22, tilt: 0.18, scale: 0.26, cx: 0.34, cy: 0.62, bloom: 1.2, wash: '#22D3EE', washA: 0.12, size: 3.2, vig: 0.3 },
  grid: { n: 1, rot: 0.62, tilt: 0.34, scale: 0.22, cx: 0.5, cy: 0.5, bloom: 0.18, wash: '#7C3AED', washA: 0.05, size: 2.4, vig: 0.55 },
  ring: { n: 2200, rot: 0.2, tilt: 0.62, scale: 0.24, cx: 0.5, cy: 0.58, bloom: 0.6, wash: '#22D3EE', washA: 0.08, size: 2.5, vig: 0.45 },
}

describe('the seeded LCG', () => {
  it('reproduces the export sequence for a given seed', () => {
    const rng = createRng(75697)
    expect([rng(), rng(), rng()].map((v) => v.toFixed(12))).toEqual([
      '0.572624049149',
      '0.281478467165',
      '0.181625063997',
    ])
  })

  it('stays inside [0, 1)', () => {
    const rng = createRng(1)
    for (let i = 0; i < 5000; i += 1) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('derives each seed as kind.length * 7919 + 12345', () => {
    for (const kind of FORMATION_IDS) {
      expect(seedFor(kind)).toBe(kind.length * 7919 + 12345)
      expect(seedFor(kind)).toBe(SNAPSHOTS[kind].seed)
    }
  })
})

describe('formation generators', () => {
  it.each(FORMATION_IDS)('%s matches its checksum snapshot', (kind) => {
    const points = cloud(kind)
    expect(points).toHaveLength(SNAPSHOTS[kind].count)
    expect(checksum(points)).toBe(SNAPSHOTS[kind].sum)
  })

  it.each(FORMATION_IDS)('%s is byte-identical across runs', (kind) => {
    expect(checksum(cloud(kind))).toBe(checksum(cloud(kind)))
  })

  it.each(FORMATION_IDS)('%s thins to a stable cloud at the reduced-instance rung', (kind) => {
    const reduced = cloud(kind, 0.45)
    expect(reduced).toHaveLength(SNAPSHOTS[kind].reducedCount)
    expect(checksum(reduced)).toBe(SNAPSHOTS[kind].reducedSum)
    expect(reduced.length).toBeLessThan(SNAPSHOTS[kind].count)
  })

  it.each(FORMATION_IDS)('%s keeps every ramp value inside [0, 1]', (kind) => {
    for (const [, , , t] of cloud(kind)) {
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThanOrEqual(1)
    }
  })

  it('leaves orbit violet-led — its ramp never reaches full cyan', () => {
    // `0.05 + k*0.07 + far*0.34 + r()*0.04` tops out at 0.57 on the outer ring.
    // (design-foundations § 4.5 says "≈0.05–0.46"; the arithmetic says 0.57.
    // Either way the point holds: the far arcs tint fuchsia and stop there.)
    const ramp = cloud('orbit').map(([, , , t]) => t)
    expect(Math.max(...ramp)).toBeLessThan(0.6)
    expect(Math.min(...ramp)).toBeLessThan(0.06)
  })

  it('pushes scatter into the fuchsia-to-cyan half of the ramp', () => {
    // design-home § 16.9-E: the retune that matches Craft's cyan lighting.
    const ramp = cloud('scatter').map(([, , , t]) => t)
    expect(Math.min(...ramp)).toBeGreaterThan(0.7)
  })

  it('sweeps ring across the full circumference', () => {
    const ramp = cloud('ring').map(([, , , t]) => t)
    expect(Math.min(...ramp)).toBeLessThan(0.02)
    expect(Math.max(...ramp)).toBeGreaterThan(0.98)
  })

  it('builds grid as a 13-cube lattice regardless of n', () => {
    const withNonsenseN = generatePoints('grid', 999, createRng(seedFor('grid')))
    expect(checksum(withNonsenseN)).toBe(SNAPSHOTS.grid.sum)
    expect(withNonsenseN.length).toBeLessThan(13 ** 3)
  })

  it('builds lattice as a 48x26 plane regardless of n', () => {
    const withNonsenseN = generatePoints('lattice', 999, createRng(seedFor('lattice')))
    expect(checksum(withNonsenseN)).toBe(SNAPSHOTS.lattice.sum)
    expect(withNonsenseN.length).toBeLessThan(48 * 26)
  })

  it('returns nothing for an unknown formation rather than throwing', () => {
    expect(generatePoints('badge', 100, createRng(1))).toEqual([])
  })
})

describe('formation config', () => {
  it.each(FORMATION_IDS)('%s matches the export cfg table', (kind) => {
    expect(FORMATIONS[kind]).toMatchObject(EXPORT_CFG[kind])
  })

  it('scales the hero against viewport height and everything else against min(W, H)', () => {
    expect(FORMATIONS.monolith.fit).toBe('h')
    for (const kind of FORMATION_IDS.filter((id) => id !== 'monolith')) {
      expect(FORMATIONS[kind].fit).toBe('min')
    }
  })

  it('gives the hero the deepest bloom and grid none at all', () => {
    expect(FORMATIONS.monolith.bloom).toBe(Math.max(...FORMATION_IDS.map((id) => FORMATIONS[id].bloom)))
    expect(FORMATIONS.grid.bloom).toBeLessThanOrEqual(0.2)
  })

  it('anchors hero and craft scrims radially and the rest vertically', () => {
    expect(SCRIMS.monolith).toContain('radial-gradient(80% 110% at 2% 50%')
    expect(SCRIMS.scatter).toContain('radial-gradient(70% 100% at 100% 50%')
    for (const kind of FORMATION_IDS.filter((id) => id !== 'monolith' && id !== 'scatter')) {
      expect(SCRIMS[kind]).toContain('linear-gradient(180deg')
    }
  })

  it('maps seven formations onto seven sections and leaves two flat', () => {
    const withCanvas = SECTION_BACKDROPS.filter((entry) => entry.formation !== null)
    expect(withCanvas).toHaveLength(7)
    expect(new Set(withCanvas.map((entry) => entry.formation)).size).toBe(7)

    const flat = SECTION_BACKDROPS.filter((entry) => entry.formation === null)
    expect(flat.map((entry) => entry.section)).toEqual(['timeline', 'writing'])
    expect(flat.map((entry) => entry.flat)).toEqual(['--bg-0', '--bg-1'])
  })

  it('builds the CSS wash from the same anchor and colour the canvas paints', () => {
    // Rung 5 has to look like a dimmer version of rung 1, not a different idea.
    expect(washCss('monolith')).toBe(
      'radial-gradient(75% 75% at 74% 55%, rgba(124, 58, 237, 0.14) 0%, rgba(13, 17, 23, 0) 100%), var(--bg-0)',
    )
    expect(washCss('ring')).toContain('rgba(34, 211, 238, 0.08)')
  })
})

describe('ultrawide spread (reconciliation §3.5)', () => {
  it('leaves the formation alone at ordinary aspects', () => {
    expect(spreadXFor(1440, 900)).toBe(1)
    expect(spreadXFor(2560, 1440)).toBe(1)
    expect(spreadXFor(390, 844)).toBe(1)
  })

  it('spreads x by 1.4 above 2.2 aspect instead of pulling the camera back', () => {
    expect(spreadXFor(3440, 1440)).toBe(ULTRAWIDE_SPREAD_X)
    expect(spreadXFor(5120, 1440)).toBe(ULTRAWIDE_SPREAD_X)
  })

  it('switches exactly at the documented threshold', () => {
    expect(spreadXFor(ULTRAWIDE_ASPECT * 1000, 1000)).toBe(1)
    expect(spreadXFor(ULTRAWIDE_ASPECT * 1000 + 1, 1000)).toBe(ULTRAWIDE_SPREAD_X)
  })

  it('never divides by a zero-height canvas', () => {
    expect(spreadXFor(1440, 0)).toBe(1)
  })
})
