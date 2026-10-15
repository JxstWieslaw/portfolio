/**
 * Scroll-velocity coupling for the hero — hero monolith spec § 4.6. Pure.
 *
 * The page's own scroll-speed weight (`velocityWeight`, 0 at rest) is integrated into one number, `surge`, which the
 * engine adds to the environment's rotation (0.6 rad/s at full speed: the strips surge across the faces while the page
 * moves) and to the dust's spin clock (1.5x at full speed: the shards spin faster). The two gains live in the GLSL. At rest the weight is exactly 0, so `surge` stops growing and the picture is
 * exactly the one without this module. It never touches the slab's geometry, and the H1 is not involved.
 *
 * It imports the weight and the two rates from `lib/assembly/motion`, so the cubes and the hero agree on what "fast"
 * is; only those three bindings are pulled in.
 */

import { VELOCITY_FALL, VELOCITY_MAX_GAP, VELOCITY_RISE, velocityWeight } from '@/lib/assembly/motion'

export interface SurgeState {
  /** Damped speed weight, 0..1. */
  readonly weight: number
  /** The integral of `weight` over time, seconds. The engine's `uSurge`. */
  readonly surge: number
  /** Last sample: scroll position (px) and time (ms); `NaN` before the first. */
  readonly y: number
  readonly t: number
}

export const SURGE_REST: SurgeState = { weight: 0, surge: 0, y: Number.NaN, t: Number.NaN }

/**
 * One frame. `y` is `scrollY`, `now` is the frame time in ms, `vh` the viewport height. A gap longer than
 * `VELOCITY_MAX_GAP` (a hidden tab, a paused layer) is not a speed, and a jump of a whole viewport or more (an anchor
 * link) is a jump, not a speed. `reduced` holds the weight at 0 (the engine never mounts then; this is the belt).
 */
export function surgeStep(s: SurgeState, y: number, now: number, vh: number, reduced = false): SurgeState {
  if (reduced) return s.weight === 0 && s.y === y ? s : { weight: 0, surge: s.surge, y, t: now }
  const dt = (now - s.t) / 1000
  if (!(dt > 0)) return { ...s, y: Number.isNaN(s.t) ? y : s.y, t: Number.isNaN(s.t) ? now : s.t }
  const jump = !(vh > 0) || dt > VELOCITY_MAX_GAP || Math.abs(y - s.y) >= vh
  const target = jump ? 0 : velocityWeight((y - s.y) / vh / dt)
  const ease = 1 - Math.exp(-(target > s.weight ? VELOCITY_RISE : VELOCITY_FALL) * Math.min(dt, 0.1))
  let weight = s.weight + (target - s.weight) * ease
  if (target === 0 && weight < 0.002) weight = 0
  return { weight, surge: s.surge + weight * Math.min(dt, 0.1), y, t: now }
}
