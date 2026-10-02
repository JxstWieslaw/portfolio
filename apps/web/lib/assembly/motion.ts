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

/**
 * The idle ticker's rate, fps, on every device: breathing, flow, spins and
 * clips advance at this rate while the tab is visible and the layer is shown.
 *
 * It was 30 on pointer devices and 20 on touch; the perf review moved desktop
 * to 20 to match the 2D hero this layer replaces, trading smoothness for
 * power (30 -> 20 fps is a third fewer frames while idle). The cost is that
 * `setInterval(..., 50)` steps visibly on 120 and 144 Hz displays, where the
 * scene advances every 6th or 7th refresh. Raise it here, not in the canvas.
 */
export const BREATH_FPS = 20

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

/** Below this the scroll store is "at rest" on a formation (`resolveScroll` never returns exactly 1). */
export const SETTLE_EPSILON = 0.02

/**
 * The formation the visitor is at rest on, or `null` mid-band. The scroll
 * store's `mix` stays strictly below 1 and `from` is the section the visitor
 * is in, so "settled on X" means `from === X` with a near-zero mix (the last
 * section reports `from === to`, mix 0) or `to === X` with a near-one mix.
 */
export function settledFormation(from: BundleKind, to: BundleKind, mix: number, epsilon: number = SETTLE_EPSILON): BundleKind | null {
  if (from === to) return from
  if (mix < epsilon) return from
  if (mix > 1 - epsilon) return to
  return null
}

/** How much of the scatter is on screen: 1 at rest in Craft, 0 with it in neither slot. */
export function scatterWeight(from: BundleKind, to: BundleKind, mix: number): number {
  if (from === 'scatter' && to === 'scatter') return 1
  return (from === 'scatter' ? 1 - mix : 0) + (to === 'scatter' ? mix : 0)
}

export interface DropState {
  /** `uTime` at which the drop started; `-1` while unarmed, so the slot shows the airborne layout. */
  readonly dropAt: number
  /** Whether the current visit to the scatter has already dropped. */
  readonly armed: boolean
}

export const NO_DROP: DropState = { dropAt: -1, armed: false }

/**
 * Sets `dropAt` once per visit to the scatter: when at least half of it is
 * on screen, from either direction. It disarms only once the scatter has
 * left both slots, so sitting in Craft, nudging up and down, or hovering
 * over its bands never replays the fall; leaving and coming back does.
 */
export function dropTrigger(state: DropState, from: BundleKind, to: BundleKind, mix: number, time: number): DropState {
  const weight = scatterWeight(from, to, mix)
  if (weight <= 0) return state.armed ? NO_DROP : state
  if (!state.armed && weight >= 0.5) return { dropAt: time, armed: true }
  return state
}

// --- The contact ring's calm (§ 3.7) --------------------------------------

export const CALM_SECONDS = 2

/** 0 → 1 over two seconds once the visitor is at rest on the ring (`settledFormation`); 0 anywhere else. */
export function calmAt(settled: BundleKind | null, settledFor: number): number {
  if (settled !== 'ring') return 0
  const u = settledFor / CALM_SECONDS
  return u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u)
}
