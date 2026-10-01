/**
 * Per-section motion — journey spec § 3 (the table), § 3.5, § 3.7, § 5.1.
 *
 * PURE. The colour bias, the pointer rule and the idle weights of each
 * formation; the craft drop's trigger and its fall-and-bounce curve; the
 * contact ring's calm. The scene lerps the table by the scroll mix and writes
 * the result into uniforms.
 */

import { FORMATIONS, type FormationId } from '@/lib/formations/config'
import type { BundleKind } from '@/lib/assembly/targets'

/** `uBias` magnitude: violet-led sections shift the ramp down, cyan-led up (§ 5.1). */
export const BIAS = 0.08

/** The formation's wash decides its lead colour: violet is leadership, cyan is craft. */
export function biasFor(kind: BundleKind): number {
  const wash = FORMATIONS[kind === 'cloud' ? 'monolith' : kind].wash.toUpperCase()
  return wash === '#22D3EE' ? BIAS : -BIAS
}

export interface SectionMotion {
  /** Pointer repulsion strength multiplier, 0..1. */
  readonly repel: number
  /** Repulsion radius multiplier. */
  readonly repelRadius: number
  /** Idle wobble and breathing weights, 0..1. */
  readonly wobble: number
  readonly breath: number
  /** Per-instance bob weight. */
  readonly bob: number
  /** The hovered-card attractors are active here. */
  readonly attract: number
}

/** The pointer and idle columns of the § 3 table. */
export const SECTION_MOTION: Readonly<Record<FormationId, SectionMotion>> = {
  monolith: { repel: 1, repelRadius: 1, wobble: 1, breath: 1, bob: 1, attract: 0 },
  stream: { repel: 0.4, repelRadius: 1, wobble: 0, breath: 0.3, bob: 0.5, attract: 0 },
  lattice: { repel: 0, repelRadius: 1, wobble: 0, breath: 0, bob: 1, attract: 1 },
  orbit: { repel: 0.6, repelRadius: 1, wobble: 0.4, breath: 0.6, bob: 0.3, attract: 0 },
  scatter: { repel: 1, repelRadius: 1.5, wobble: 0, breath: 0, bob: 0.2, attract: 0 },
  grid: { repel: 0.3, repelRadius: 1, wobble: 0, breath: 0.3, bob: 0, attract: 0 },
  ring: { repel: 0.5, repelRadius: 1, wobble: 0.3, breath: 0.4, bob: 0.4, attract: 0 },
}

export function motionFor(kind: BundleKind): SectionMotion {
  return SECTION_MOTION[kind === 'cloud' ? 'monolith' : kind]
}

export function lerpMotion(a: SectionMotion, b: SectionMotion, mix: number): SectionMotion {
  const m = mix < 0 ? 0 : mix > 1 ? 1 : mix
  const l = (x: number, y: number): number => x + (y - x) * m
  return {
    repel: l(a.repel, b.repel),
    repelRadius: l(a.repelRadius, b.repelRadius),
    wobble: l(a.wobble, b.wobble),
    breath: l(a.breath, b.breath),
    bob: l(a.bob, b.bob),
    attract: l(a.attract, b.attract),
  }
}

// --- The craft drop (§ 3.5) ------------------------------------------------

/** Gravity, model units/s². */
export const GRAVITY = 2.2
/** Restitution of the one bounce. */
export const BOUNCE = 0.3
/** The scatter's ground plane, model units (the generator's `-0.95`). */
export const GROUND_Y = -0.95
/** The pile shivers for this long after the first landing. */
export const SHIVER_SECONDS = 1.2
export const SHIVER_AMPLITUDE = 0.01
/** The lowest airborne cube starts at y = 0.5 (`g(0.5, 1.9)`), so the first landing is at this fall time. */
export const FIRST_LANDING = Math.sqrt((2 * (0.5 - GROUND_Y)) / GRAVITY)

/**
 * Height of a cube released from `y0` at rest, `elapsed` seconds ago: free
 * fall to the ground, one bounce at `BOUNCE` restitution, then rest. The GLSL
 * in `assembly.glsl.ts` is this function; the test here is its oracle.
 */
export function fallHeight(y0: number, elapsed: number, ground: number = GROUND_Y, g: number = GRAVITY): number {
  if (elapsed <= 0 || y0 <= ground) return Math.max(y0, ground)
  const h = y0 - ground
  const land = Math.sqrt((2 * h) / g)
  if (elapsed < land) return y0 - 0.5 * g * elapsed * elapsed
  const v = g * land * BOUNCE
  const u = elapsed - land
  const hop = (2 * v) / g
  if (u < hop) return ground + v * u - 0.5 * g * u * u
  return ground
}

/** Shiver amplitude of the pile at `elapsed` seconds since the drop. */
export function shiverAt(elapsed: number): number {
  const since = elapsed - FIRST_LANDING
  return since >= 0 && since < SHIVER_SECONDS ? SHIVER_AMPLITUDE : 0
}

export interface DropState {
  /** `uTime` at which the drop started; `-1` while nothing has dropped. */
  readonly dropAt: number
  /** Whether the current entry into the scatter has already triggered. */
  readonly armed: boolean
}

export const NO_DROP: DropState = { dropAt: -1, armed: false }

/**
 * Sets `dropAt` once per entry into the scatter: when `to` is `scatter` and
 * the mix passes 0.5. Leaving the section re-arms it, so a return replays
 * the fall. Holding the section does not re-trigger.
 */
export function dropTrigger(state: DropState, to: BundleKind, mix: number, time: number): DropState {
  if (to !== 'scatter') return state.armed ? { ...state, armed: false } : state
  if (!state.armed && mix >= 0.5) return { dropAt: time, armed: true }
  return state
}

// --- The contact ring's calm (§ 3.7) --------------------------------------

export const CALM_SECONDS = 2

/** 0 → 1 over two seconds once the ring has fully landed (`mix >= 1`); 0 anywhere else. */
export function calmAt(to: BundleKind, mix: number, settledFor: number): number {
  if (to !== 'ring' || mix < 1) return 0
  const u = settledFor / CALM_SECONDS
  return u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u)
}
