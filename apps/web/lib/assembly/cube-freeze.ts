/**
 * The cubes' freeze seam: pure parsing and types only. PURE, no three, no window.
 *
 * `?cubefreeze=<t>,<from>,<to>,<mix>` (test-seam builds only; see the gate in `AssemblyCanvas`) makes a cube frame a
 * pure function of its inputs, so a pixel test can compare the cubes across a renderer change:
 *   t     seconds on the scene clock. Also the on-load assembly's elapsed time, so `t` under 3.2 s is the intro.
 *   from  formation index (the order of `FORMATION_IDS`): the section the visitor is in.
 *   to    formation index: the section they are heading to.
 *   mix   0..1, the scroll progress between the two.
 * Under a freeze the camera, light bias, drop, calm and scroll speed are set to what they converge to, not damped
 * towards, the idle ticker is off and the scroll listener cannot change the state.
 *
 * Nothing in this file is imported on a production path: the caller folds its own switch to `false`, so the
 * bundler drops this module (CI greps the chunks for `cubefreeze` and `__ASSEMBLY_FREEZE__`).
 */

import { FORMATION_IDS, type FormationId } from '@/lib/formations/config'
import type { ScrollState } from '@/lib/assembly/scroll'

export interface CubeFreeze {
  /** Scene clock, seconds. */
  readonly t: number
  /** What the scroll store would report, opacity 1. */
  readonly scroll: ScrollState
}

/** What the last frozen frame handed the GPU, for state-invariant assertions. */
export interface CubeProbe {
  /** Frames drawn since the page loaded. */
  frames: number
  /** `gl.info.render` of the last drawn frame. */
  calls: number
  triangles: number
  /** `gl.info.programs.length`. */
  programs: number
  geometries: number
  textures: number
}

export interface CubeFreezeHandle {
  /** Replaces the frozen state and asks for a frame. Throws on a state the seam cannot represent. */
  set(t: number, from: number, to: number, mix: number): void
  readonly probe: CubeProbe
}

export function emptyProbe(): CubeProbe {
  return { frames: 0, calls: 0, triangles: 0, programs: 0, geometries: 0, textures: 0 }
}

/** Builds a freeze from numbers; `null` for anything that is not a finite time, two known formations and a mix in 0..1. */
export function makeCubeFreeze(t: number, from: number, to: number, mix: number): CubeFreeze | null {
  const a: FormationId | undefined = FORMATION_IDS[from]
  const b: FormationId | undefined = FORMATION_IDS[to]
  if (!Number.isInteger(from) || !Number.isInteger(to) || a === undefined || b === undefined) return null
  if (!Number.isFinite(t) || t < 0 || !Number.isFinite(mix) || mix < 0 || mix > 1) return null
  return { t, scroll: { from: a, to: b, mix, opacity: 1 } }
}

/** Reads `?cubefreeze=` from a location search string. `null` when absent or malformed. */
export function readCubeFreeze(search: string): CubeFreeze | null {
  const raw = new URLSearchParams(search).get('cubefreeze')
  if (raw === null) return null
  const parts = raw.split(',')
  if (parts.length !== 4 || parts.some((part) => part.trim() === '')) return null
  const [t, from, to, mix] = parts.map(Number) as [number, number, number, number]
  return makeCubeFreeze(t, from, to, mix)
}
