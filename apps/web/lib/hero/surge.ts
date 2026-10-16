/**
 * Scroll-velocity coupling for the hero — hero monolith spec § 4.6. Pure.
 *
 * The page's own scroll-speed weight (0 at rest) is integrated into one number, `surge`, which the engine adds to the
 * environment's rotation (0.6 rad/s at full speed: the strips surge across the faces while the page moves) and to the
 * dust's spin clock (1.5x at full speed: the shards spin faster). The two gains live in the GLSL.
 * At rest the weight is exactly 0, so `surge` stops growing; the picture is exactly the one without this module only
 * before the first scroll (afterwards the accumulated phase of the reflections and the dust spin is kept). It never
 * touches the slab's geometry, and the H1 is not involved.
 *
 * The constants are copies of `lib/assembly/motion`'s (`VELOCITY_*`), so the cubes and the hero agree on what "fast"
 * is. They are copied, not imported, because `motion.ts` pulls the formation table in with it and that is about 1.5 kB
 * gzipped in the hero chunk, whose whole budget is 14 kB. `hero-surge.test.ts` pins them to the originals.
 */

export const SURGE_FULL = 4
export const SURGE_DEADZONE = 0.15
export const SURGE_RISE = 16
export const SURGE_FALL = 6
export const SURGE_EPSILON = 0.002
/** A gap between two frames longer than this (a hidden layer, a stalled tab) is not a scroll speed. */
export const SURGE_MAX_GAP = 0.5
/** A speed is measured over at least this long, so on a fast display it spans a few frames (refresh-rate independent). */
export const SURGE_WINDOW = 1 / 30 - 0.002

/** 0 at rest, 1 at `SURGE_FULL` viewport heights per second; symmetric, clamped, `NaN` reads as rest. */
export function surgeWeight(speed: number): number {
  const v = Math.abs(speed)
  return v > SURGE_DEADZONE ? Math.min(1, (v - SURGE_DEADZONE) / (SURGE_FULL - SURGE_DEADZONE)) : 0
}

export interface SurgeState {
  /** Damped speed weight, 0..1. */
  readonly weight: number
  /** The integral of `weight` over time, seconds. The engine's `uSurge`. */
  readonly surge: number
  /** The last frame's time, seconds; `NaN` before the first. */
  readonly t: number
  /** The start of the current measuring window: scroll position (px) and time (s). */
  readonly wy: number
  readonly wt: number
  /** The speed weight the last window measured, which `weight` chases. */
  readonly target: number
}

export const SURGE_REST: SurgeState = { weight: 0, surge: 0, t: Number.NaN, wy: Number.NaN, wt: Number.NaN, target: 0 }

/**
 * One frame, a port of `ScrollVelocity.step`: the speed is the distance over the true elapsed time of a measuring
 * window of at least `SURGE_WINDOW`, so it does not depend on the refresh rate, and the damping absorbs the jitter
 * between windows. `y` is `scrollY`, `now` the frame time in ms, `vh` the viewport height. A gap above `SURGE_MAX_GAP`
 * (a hidden tab, a paused layer) is not a speed and starts a fresh window, and a jump of a whole viewport inside one
 * window (an anchor link) is a jump, not a speed. Reduced motion never mounts the engine, so there is no branch for it.
 */
export function surgeStep(s: SurgeState, y: number, now: number, vh: number): SurgeState {
  const t = now / 1000
  const dt = t - s.t
  // The first sample, or two draws in the same instant: nothing to measure yet.
  if (!(dt > 0)) return Number.isNaN(s.t) ? { ...s, t, wy: y, wt: t } : s
  let { target, wy, wt } = s
  if (dt > SURGE_MAX_GAP || !(vh > 0)) {
    target = 0
    wy = y
    wt = t
  } else if (t - wt >= SURGE_WINDOW) {
    const dy = y - wy
    target = Math.abs(dy) >= vh ? 0 : surgeWeight(dy / vh / (t - wt))
    wy = y
    wt = t
  }
  const k = Math.min(dt, 0.1)
  let weight = s.weight + (target - s.weight) * (1 - Math.exp(-(target > s.weight ? SURGE_RISE : SURGE_FALL) * k))
  if (target === 0 && weight < SURGE_EPSILON) weight = 0
  return { weight, surge: s.surge + weight * k, t, wy, wt, target }
}
