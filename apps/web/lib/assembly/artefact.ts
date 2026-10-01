/**
 * The hero artefact's geometry maths — journey spec § 3.1, decision D1.
 *
 * PURE. A faceted crystalline core: an icosahedron whose vertices are
 * displaced along their normals by seeded noise, an inner glow at 0.55 of its
 * radius, and two gyroscopic rings. The three objects are created in
 * `components/three/Artefact.tsx`; everything that is a number lives here so
 * it can be tested without three.
 *
 * Model units are the monolith's: radius 0.42 fits inside the column's taper
 * (0.4 at the base) with the centre at y = +0.1.
 */

import { createRng, seedFor } from '@/lib/formations/generators'

/** Outer shell radius after displacement, model units. */
export const ARTEFACT_RADIUS = 0.42
/** Displacement amplitude as a fraction of the radius. */
export const ARTEFACT_NOISE = 0.12
export const ARTEFACT_OCTAVES = 3
/** Icosahedron detail: 1 gives 80 faces. */
export const ARTEFACT_DETAIL = 1
/** Inner glow radius as a fraction of the shell. */
export const GLOW_SCALE = 0.55
export const GLOW_OPACITY = [0.35, 0.6] as const
/** The glow's point light at full ignition. */
export const ARTEFACT_LIGHT_INTENSITY = 2
/** Artefact centre in monolith model space. */
export const ARTEFACT_CENTRE = [0, 0.1, 0] as const
/** Cubes inside the shell move out to this radius (clearance post-pass). */
export const CLEARANCE_RADIUS = ARTEFACT_RADIUS + 0.06

/** Ignition: starts at 0.6 s into the assembly, scales 0 → 1 over 0.9 s (back-out). */
export const IGNITE_AT = 0.6
export const IGNITE_SECONDS = 0.9

export interface RingSpec {
  readonly radius: number
  readonly tube: number
  readonly tilt: number
  /** rad/s about the ring's own tilted axis. */
  readonly rate: number
}

export const RINGS: readonly RingSpec[] = [
  { radius: 0.58, tube: 0.012, tilt: 0.6, rate: 0.18 },
  { radius: 0.72, tube: 0.012, tilt: -0.9, rate: -0.11 },
]

/** Back-out: overshoots a little and settles, for the ignition. */
export function easeOutBack(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const u = t
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2)
}

/** Artefact scale at `seconds` into the assembly, 0 before ignition. */
export function igniteScale(seconds: number): number {
  return easeOutBack((seconds - IGNITE_AT) / IGNITE_SECONDS)
}

/**
 * Seeded three-octave noise on the unit sphere, in [-1, 1]. A sum of seeded
 * plane waves — enough structure to facet the shell, deterministic on every
 * machine, and no noise table to ship.
 */
export function createArtefactNoise(seed: number = seedFor('artefact')): (x: number, y: number, z: number) => number {
  const r = createRng(seed)
  const waves: Array<readonly [number, number, number, number]> = []
  for (let octave = 0; octave < ARTEFACT_OCTAVES; octave += 1) {
    const frequency = 1.7 * Math.pow(2, octave)
    for (let k = 0; k < 3; k += 1) {
      const a = r() * Math.PI * 2
      const b = r() * Math.PI - Math.PI / 2
      waves.push([Math.cos(b) * Math.cos(a) * frequency, Math.sin(b) * frequency, Math.cos(b) * Math.sin(a) * frequency, r() * Math.PI * 2])
    }
  }
  return (x, y, z) => {
    let value = 0
    let weight = 0
    for (let i = 0; i < waves.length; i += 1) {
      const [wx, wy, wz, phase] = waves[i] as (typeof waves)[number]
      const amplitude = 1 / Math.pow(2, Math.floor(i / 3))
      value += Math.sin(x * wx + y * wy + z * wz + phase) * amplitude
      weight += amplitude
    }
    return value / weight
  }
}

/**
 * Displaces unit-sphere vertices along their normals. `positions` is a flat
 * xyz array on the unit sphere (an icosahedron's vertices); the result is the
 * shell in model units, with every radius within `ARTEFACT_RADIUS`.
 */
export function displaceShell(positions: ArrayLike<number>, noise = createArtefactNoise()): Float32Array {
  const out = new Float32Array(positions.length)
  const base = ARTEFACT_RADIUS / (1 + ARTEFACT_NOISE)
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0
    const y = positions[i + 1] ?? 0
    const z = positions[i + 2] ?? 0
    const length = Math.hypot(x, y, z) || 1
    const nx = x / length
    const ny = y / length
    const nz = z / length
    const radius = base * (1 + ARTEFACT_NOISE * noise(nx, ny, nz))
    out[i] = nx * radius
    out[i + 1] = ny * radius
    out[i + 2] = nz * radius
  }
  return out
}

/** A cheap checksum so the determinism test has one number to pin. */
export function checksum(values: ArrayLike<number>): number {
  let sum = 0
  for (let i = 0; i < values.length; i += 1) sum = (sum * 31 + Math.round((values[i] ?? 0) * 1e5)) % 2147483647
  return sum
}
