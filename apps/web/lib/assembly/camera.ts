/**
 * Camera choreography — journey spec § 3.8.
 *
 * PURE. Each formation names a rig (distance, tilt, pointer parallax, slow
 * orbit); the scene lerps the two rigs the scroll store is between and damps
 * toward the result at 4/s. The rig never hijacks the scroll: it is a
 * function of `scrollY` through the store, nothing more.
 */

import type { FormationId } from '@/lib/formations/config'
import type { BundleKind } from '@/lib/assembly/targets'

export interface CameraRig {
  /** Camera distance from the origin, world units. */
  readonly distance: number
  /** Camera pitch, degrees; positive looks down on the plane. */
  readonly tiltDeg: number
  /** Pointer parallax amplitude, degrees. */
  readonly parallaxDeg: number
  /** Slow camera orbit about y, rad/s. */
  readonly orbitRate: number
}

/** The table in § 3.8, verbatim. */
export const CAMERA_RIGS: Readonly<Record<FormationId, CameraRig>> = {
  monolith: { distance: 10.0, tiltDeg: 0, parallaxDeg: 3, orbitRate: 0 },
  stream: { distance: 11.5, tiltDeg: -2, parallaxDeg: 1.5, orbitRate: 0 },
  lattice: { distance: 10.0, tiltDeg: 6, parallaxDeg: 2, orbitRate: 0 },
  orbit: { distance: 9.0, tiltDeg: 0, parallaxDeg: 3, orbitRate: 0.03 },
  scatter: { distance: 10.5, tiltDeg: 4, parallaxDeg: 2, orbitRate: 0 },
  grid: { distance: 11.0, tiltDeg: 0, parallaxDeg: 1, orbitRate: 0 },
  ring: { distance: 12.0, tiltDeg: 8, parallaxDeg: 1, orbitRate: 0 },
}

/** Portrait keeps the 45° FOV and gives the formation more room above the panel. */
export const PORTRAIT_DISTANCE_SCALE = 1.15

/** The damping rate toward the lerped rig, per second. */
export const CAMERA_DAMP = 4

/** The `cloud` pseudo-formation shares the hero's rig. */
export function rigFor(kind: BundleKind, portrait: boolean = false): CameraRig {
  const rig = CAMERA_RIGS[kind === 'cloud' ? 'monolith' : kind]
  return portrait ? { ...rig, distance: rig.distance * PORTRAIT_DISTANCE_SCALE } : rig
}

export function lerpRig(a: CameraRig, b: CameraRig, mix: number): CameraRig {
  const m = mix < 0 ? 0 : mix > 1 ? 1 : mix
  return {
    distance: a.distance + (b.distance - a.distance) * m,
    tiltDeg: a.tiltDeg + (b.tiltDeg - a.tiltDeg) * m,
    parallaxDeg: a.parallaxDeg + (b.parallaxDeg - a.parallaxDeg) * m,
    orbitRate: a.orbitRate + (b.orbitRate - a.orbitRate) * m,
  }
}

/** Exponential damping: `current` moves toward `target` by `1 - exp(-rate * dt)`. Frame-rate independent. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

/**
 * Where the camera sits for a rig: `distance` from the origin, pitched up by
 * `tiltDeg` so it looks down on the plane, turned about y by `orbit` radians.
 * It always looks at the origin.
 */
export function cameraPosition(distance: number, tiltDeg: number, orbit: number): readonly [number, number, number] {
  const tilt = (tiltDeg * Math.PI) / 180
  const flat = distance * Math.cos(tilt)
  return [flat * Math.sin(orbit), distance * Math.sin(tilt), flat * Math.cos(orbit)]
}
