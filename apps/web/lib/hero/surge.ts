/**
 * Scroll-velocity coupling for the hero — hero monolith spec § 4.6. Pure.
 *
 * The page's own scroll-speed weight (`velocityWeight`, 0 at rest) is integrated into one number, `surge`, which the
 * engine adds to the environment's rotation (0.6 rad/s at full speed: the strips surge across the faces while the page
 * moves) and to the dust's spin clock (1.5x at full speed: the shards spin faster). The two gains live in the GLSL.
 * At rest the weight is exactly 0, so `surge` stops growing and the picture is exactly the one without this module. It never touches the slab's geometry, and the H1 is not involved.
 *
 * The four constants are copies of `lib/assembly/motion`'s (`VELOCITY_*`), so the cubes and the hero agree on what
 * "fast" is. They are copied, not imported, because `motion.ts` pulls the formation table in with it and that is
 * about 1.5 kB gzipped in the hero chunk, whose whole budget is 14 kB. `hero-surge.test.ts` pins them to the originals.
 */

export const SURGE_FULL = 4
export const SURGE_DEADZONE = 0.15
export const SURGE_RISE = 16
export const SURGE_FALL = 6
const MAX_GAP = 0.5

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
  /** Last sample: scroll position (px) and time (ms); `NaN` before the first. */
  readonly y: number
  readonly t: number
}

export const SURGE_REST: SurgeState = { weight: 0, surge: 0, y: Number.NaN, t: Number.NaN }

/**
 * One frame. `y` is `scrollY`, `now` is the frame time in ms, `vh` the viewport height. A gap longer than half a
 * second (a hidden tab, a paused layer) is not a speed, and a jump of a whole viewport or more (an anchor link) is a
 * jump, not a speed. Reduced motion never mounts the engine, so there is no reduced-motion branch here.
 */
export function surgeStep(s: SurgeState, y: number, now: number, vh: number): SurgeState {
  const dt = (now - s.t) / 1000
  // The first sample, or two draws in the same instant: nothing to measure yet.
  if (!(dt > 0)) return { weight: s.weight, surge: s.surge, y, t: now }
  const dy = y - s.y
  const target = dt > MAX_GAP || !(Math.abs(dy) < vh) ? 0 : surgeWeight(dy / vh / dt)
  const k = Math.min(dt, 0.1)
  let weight = s.weight + (target - s.weight) * (1 - Math.exp(-(target > s.weight ? SURGE_RISE : SURGE_FALL) * k))
  if (target === 0 && weight < 0.002) weight = 0
  return { weight, surge: s.surge + weight * k, y, t: now }
}
