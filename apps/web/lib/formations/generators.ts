/**
 * The seven formation point generators, plus the seeded LCG that drives them.
 *
 * Source of truth: `docs/Portfolio Design/Home.dc.html` — `rng()` and
 * `points(kind, n, r)`. Summarised in `docs/design-extraction/design-home.md`
 * § 13 and `design-foundations.md` § 4.5.
 *
 * PURE. No DOM, no `Math.random`, no time. Given the same seed and the same
 * `keep`, every generator returns byte-identical output on every machine and in
 * every run — that determinism is what makes the visual regression suite stable
 * and what will let M2 hand the same point cloud to WebGL.
 *
 * The RNG call order inside each generator is load-bearing. Reordering two
 * `r()` calls produces a different cloud from the same seed, so the code below
 * keeps the export's statement order even where a tidier expression exists.
 */

/** A point in model space: `[x, y, z, t]` where `t` is the colour-ramp position. */
export type Point = readonly [x: number, y: number, z: number, t: number]

export type Rng = () => number

/** Numerical Recipes LCG, verbatim. */
export function createRng(seed: number): Rng {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

/** `seed = kind.length * 7919 + 12345` — the export's per-formation seed. */
export function seedFor(kind: string): number {
  return kind.length * 7919 + 12345
}

/** Fraction of instances the low-power rung keeps. See `fallback.ts`. */
export const FULL_KEEP = 1

/** `lattice` drops 8% of its 48x26 plane; `grid` drops 42% of its 13³ lattice. */
const LATTICE_DROPOUT = 0.08
const GRID_DROPOUT = 0.42

/**
 * Raises a generator's dropout so that `keep` of the surviving cells remain.
 * One `r()` is consumed per cell either way, so the RNG stream — and therefore
 * the cloud's shape — is unchanged; only its density moves.
 */
function dropoutFor(base: number, keep: number): number {
  return 1 - (1 - base) * keep
}

/**
 * Builds a formation's point cloud.
 *
 * @param kind    which formation
 * @param n       instance count from `FORMATIONS[kind].n`; ignored by `lattice`
 *                and `grid`, which build fixed lattices
 * @param r       a seeded `Rng` — pass `createRng(seedFor(kind))` for the
 *                canonical cloud
 * @param keep    fraction of instances to retain, for fallback rung 2. `1`
 *                reproduces the export exactly.
 */
export function generatePoints(kind: string, n: number, r: Rng, keep: number = FULL_KEEP): Point[] {
  const p: Point[] = []
  const g = (a: number, b: number): number => a + (b - a) * r()
  const count = Math.max(1, Math.round(n * keep))

  if (kind === 'monolith') {
    // A tapering five-face column: base at y = -1.35, top at y = +1.55. Face 4
    // is the interior fill that stops the column reading as a hollow shell.
    for (let i = 0; i < count; i++) {
      const t = r()
      const y = -1.35 + t * 2.9
      const taper = 0.4 - 0.17 * t
      const face = Math.floor(r() * 5)
      const u = g(-1, 1)
      let x: number
      let z: number
      if (face === 0) {
        x = -taper
        z = u * taper
      } else if (face === 1) {
        x = taper
        z = u * taper
      } else if (face === 2) {
        x = u * taper
        z = -taper
      } else if (face === 3) {
        x = u * taper
        z = taper
      } else {
        x = u * taper * 0.9
        z = g(-1, 1) * taper * 0.9
      }
      const j = 0.05
      // Evaluated left to right, as in the export's `p.push([...])`.
      const jx = g(-j, j)
      const jy = g(-j, j)
      const jz = g(-j, j)
      p.push([x + jx, y + jy, z + jz, t])
    }
    // A few detached cubes still arriving — the Assembly, mid-assembly.
    for (let i = 0; i < count * 0.06; i++) {
      const x = g(-2.4, 2.4)
      const y = g(-1.2, 1.9)
      const z = g(-1.6, 1.6)
      p.push([x, y, z, r()])
    }
    return p
  }

  if (kind === 'stream') {
    // A sine/cosine river spanning x = -3.2 … +3.2, bleeding off both edges.
    for (let i = 0; i < count; i++) {
      const t = r()
      const x = -3.2 + t * 6.4
      const y = Math.sin(x * 1.15) * 0.18 + g(-0.12, 0.12)
      const z = Math.cos(x * 0.75) * 0.3 + g(-0.26, 0.26)
      p.push([x, y, z, t])
    }
    return p
  }

  if (kind === 'lattice') {
    // A 48 x 26 plane with a gentle wave. `n` is unused.
    const cols = 48
    const rows = 26
    const dropout = dropoutFor(LATTICE_DROPOUT, keep)
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (r() < dropout) continue
        const x = (i / (cols - 1) - 0.5) * 6.0
        const z = (j / (rows - 1) - 0.5) * 3.8
        const y = Math.sin(x * 0.9 + z * 0.6) * 0.13 + g(-0.05, 0.05)
        p.push([x, y, z, (i / cols) * 0.6 + (1 - j / rows) * 0.4])
      }
    }
    return p
  }

  if (kind === 'orbit') {
    // 22% of the cubes form the core; three tilted rings take 19% each. The
    // ramp value stays inside ~0.05–0.46 so the field never reaches full cyan —
    // this is the "violet-led" poster.
    const core = Math.floor(count * 0.22)
    for (let i = 0; i < core; i++) {
      const rr = Math.pow(r(), 0.75) * 0.55
      const th = r() * Math.PI * 2
      const ph = Math.acos(2 * r() - 1)
      p.push([rr * Math.sin(ph) * Math.cos(th), rr * Math.cos(ph), rr * Math.sin(ph) * Math.sin(th), r() * 0.06])
    }
    const rings = [
      { tiltX: 0.28, tiltY: 0.15, radius: 0.95 },
      { tiltX: -0.55, tiltY: 0.9, radius: 1.25 },
      { tiltX: 0.75, tiltY: -0.6, radius: 1.55 },
    ] as const
    let k = 0
    for (const ring of rings) {
      const cnt = Math.floor(count * 0.19)
      for (let i = 0; i < cnt; i++) {
        const a = r() * Math.PI * 2
        const R = ring.radius + g(-0.05, 0.05)
        const x = Math.cos(a) * R
        const z = Math.sin(a) * R
        const y = g(-0.035, 0.035)
        const y2 = y * Math.cos(ring.tiltX) - z * Math.sin(ring.tiltX)
        let z2 = y * Math.sin(ring.tiltX) + z * Math.cos(ring.tiltX)
        const x2 = x * Math.cos(ring.tiltY) - z2 * Math.sin(ring.tiltY)
        z2 = x * Math.sin(ring.tiltY) + z2 * Math.cos(ring.tiltY)
        const far = (Math.cos(a) + 1) / 2
        p.push([x2, y2, z2, 0.05 + k * 0.07 + far * 0.34 + r() * 0.04])
      }
      k += 1
    }
    return p
  }

  if (kind === 'scatter') {
    // Caught mid-settle: 14% still airborne, the pile thinning with |x|, ground
    // at y = -0.95. Ramp values sit high (0.78+) so the field reads fuchsia to
    // cyan, matching the Craft section's cyan lighting.
    for (let i = 0; i < count; i++) {
      const air = r() < 0.14
      const x = g(-2.4, 2.4)
      const pile = Math.max(0, 0.85 - Math.abs(x) * 0.38)
      const y = air ? g(0.5, 1.9) : -0.95 + Math.pow(r(), 1.6) * (pile + 0.12)
      const z = g(-1.1, 1.1) * (air ? 1 : 0.85)
      p.push([x, y, z, air ? 0.78 : 0.86 + (y + 0.95) * 0.14])
    }
    return p
  }

  if (kind === 'grid') {
    // A 13³ cubic lattice with 42% dropout, ramp mapped to depth. `n` is unused
    // — `FORMATIONS.grid.n` is 1 precisely because nothing reads it.
    const s = 13
    const dropout = dropoutFor(GRID_DROPOUT, keep)
    for (let i = 0; i < s; i++) {
      for (let j = 0; j < s; j++) {
        for (let k = 0; k < s; k++) {
          if (r() < dropout) continue
          p.push([(i / (s - 1) - 0.5) * 3.0, (j / (s - 1) - 0.5) * 3.0, (k / (s - 1) - 0.5) * 3.0, k / (s - 1)])
        }
      }
    }
    return p
  }

  if (kind === 'ring') {
    // A torus, major R = 1.25, minor ~0.30, ramp swept around the circumference
    // so it runs the full violet -> cyan range once.
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2
      const b = r() * Math.PI * 2
      const R = 1.25
      const t2 = 0.3 + g(-0.05, 0.05)
      p.push([(R + t2 * Math.cos(b)) * Math.cos(a), t2 * Math.sin(b), (R + t2 * Math.cos(b)) * Math.sin(a), a / (Math.PI * 2)])
    }
    return p
  }

  return p
}
